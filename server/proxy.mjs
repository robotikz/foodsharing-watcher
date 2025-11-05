import express from 'express'
import cors from 'cors'
import { request } from 'undici'
import { URL } from 'node:url'
import nodemailer from 'nodemailer'
import { onRequest } from 'firebase-functions/v2/https'

const app = express()
const PORT = process.env.PORT || 8787
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '*')
const TARGET_HOST = 'foodsharing.de'

app.use(express.json()); // for parsing JSON body on POST

// Global CORS headers (explicit) and preflight handler
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Accept')
  res.set('Access-Control-Max-Age', '3600')
  if (req.method === 'OPTIONS') {
    return res.status(204).send('')
  }
  next()
})

// CORS: allow all origins and handle preflight
app.use(cors({ origin: true, credentials: false }))
app.options('*', cors({ origin: true, credentials: false }))

app.get('/healthz', (req, res) => res.json({ ok: true }))
app.get('/', (req, res) => res.json({ ok: true, path: '/' }))

// GET-only proxy: /proxy?url=https://foodsharing.de/api/stores/29441/pickups
app.get('/proxy', async (req, res) => {
  try {
    const storeIds = req.query.store_id;
    if (storeIds) {
      // Multi-ID support
      const storeIdArr = Array.isArray(storeIds) ? storeIds : [storeIds];
      const results = await Promise.all(storeIdArr.map(async id => {
        const url = `https://${TARGET_HOST}/api/stores/${id}/pickups`;
        let upstream = await request(url, {
          method: 'GET',
          headers: {
            'accept': req.header('accept') || 'application/json',
            'user-agent': 'fs-watcher-proxy/1.0',
            ...(req.header('x-csrf-token') ? { 'x-csrf-token': req.header('x-csrf-token') } : {}),
          },
          maxRedirections: 0,
        });
        // 401 logic — login if needed
        if (upstream.statusCode === 401) {
          const loginRes = await request('https://foodsharing.de/api/user/login', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'content-type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify({
              email: process.env.FOODWATCH_LOGIN_EMAIL,
              password: process.env.FOODWATCH_LOGIN_PASSWORD,
              remember_me: true
            }),
          });
          const setCookie = loginRes.headers['set-cookie'];
          if (loginRes.statusCode === 200 && setCookie) {
            upstream = await request(url, {
              method: 'GET',
              headers: {
                'accept': req.header('accept') || 'application/json',
                'user-agent': 'fs-watcher-proxy/1.0',
                ...(req.header('x-csrf-token') ? { 'x-csrf-token': req.header('x-csrf-token') } : {}),
                'cookie': Array.isArray(setCookie) ? setCookie.join('; ') : setCookie,
              },
              maxRedirections: 0,
            });
          }
        }
        let pickups = [];
        if (upstream.statusCode === 200) {
          try {
            const text = await upstream.body.text();
            const apiRes = JSON.parse(text);
            pickups = Array.isArray(apiRes?.pickups) ? apiRes.pickups : [];
          } catch {}
        }
        return { storeId: id, pickups, status: upstream.statusCode };
      }));
      // Aggregate output
      res.status(200).json({ multi: true, results });
      return;
    }

    const url = req.query.url
    if (!url) return res.status(400).json({ error: 'Missing url param' })

    let u
    try { u = new URL(url) } catch { return res.status(400).json({ error: 'Invalid url' }) }

    // Restrict target for safety
    if (u.hostname !== TARGET_HOST || !u.pathname.startsWith('/api/')) {
      return res.status(400).json({ error: 'Only foodsharing.de /api/* is allowed' })
    }

    // Build minimal forward headers (do NOT forward cookies by default)
    const fwdHeaders = {
      'accept': req.header('accept') || 'application/json',
      'user-agent': 'fs-watcher-proxy/1.0',
      // Optional pass-through of CSRF or other whitelisted headers:
      ...(req.header('x-csrf-token') ? { 'x-csrf-token': req.header('x-csrf-token') } : {}),
    }

    const upstream = await request(u.toString(), {
      method: 'GET',
      headers: fwdHeaders,
      maxRedirections: 0,
    })

    // === If 401, try to login and retry once ===
    if (upstream.statusCode === 401) {
      // Perform login
      const loginRes = await request('https://foodsharing.de/api/user/login', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          email: "alexandr.stoian@gmail.com",
          password: "niggazz3200",
          remember_me: true
        }),
      });

      const setCookie = loginRes.headers['set-cookie'];
      if (loginRes.statusCode === 200 && setCookie) {
        // Re-try the original request with the new cookie
        const upstream2 = await request(u.toString(), {
          method: 'GET',
          headers: {
            ...fwdHeaders,
            'cookie': Array.isArray(setCookie) ? setCookie.join('; ') : setCookie,
          },
          maxRedirections: 0,
        });

        res.status(upstream2.statusCode);
        const ct = upstream2.headers['content-type'] || 'application/json; charset=utf-8'
        res.setHeader('content-type', Array.isArray(ct) ? ct[0] : ct)
        res.setHeader('cache-control', 'no-store')
        res.removeHeader('set-cookie')
        for await (const chunk of upstream2.body) {
          res.write(chunk)
        }
        res.end()
        return;
      }
    }
    // === End custom 401/login logic ===

    res.status(upstream.statusCode)
    // Copy content-type only
    const ct = upstream.headers['content-type'] || 'application/json; charset=utf-8'
    res.setHeader('content-type', Array.isArray(ct) ? ct[0] : ct)
    // Prevent caching
    res.setHeader('cache-control', 'no-store')
    // Never expose upstream cookies
    res.removeHeader('set-cookie')

    for await (const chunk of upstream.body) {
      res.write(chunk)
    }
    res.end()
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/notify-email', async (req, res) => {
  const { subject, text } = req.body;
  if (!subject || !text) return res.status(400).json({ error: 'Missing subject or text' });
  const {
    FOODWATCH_SMTP_HOST,
    FOODWATCH_SMTP_PORT,
    FOODWATCH_SMTP_USER,
    FOODWATCH_SMTP_PASS,
    FOODWATCH_NOTIFY_FROM,
    FOODWATCH_NOTIFY_TO
  } = process.env;
  if (!FOODWATCH_SMTP_HOST || !FOODWATCH_SMTP_PORT || !FOODWATCH_SMTP_USER || !FOODWATCH_SMTP_PASS || !FOODWATCH_NOTIFY_FROM || !FOODWATCH_NOTIFY_TO) {
    return res.status(500).json({ error: 'Missing SMTP/email configuration in environment variables.' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host: FOODWATCH_SMTP_HOST,
      port: Number(FOODWATCH_SMTP_PORT),
      secure: Number(FOODWATCH_SMTP_PORT) === 465, // true for 465, false otherwise
      auth: {
        user: FOODWATCH_SMTP_USER,
        pass: FOODWATCH_SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: FOODWATCH_NOTIFY_FROM,
      to: FOODWATCH_NOTIFY_TO,
      subject,
      text,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit preflights (kept for clarity)
app.options('/proxy', cors({ origin: true, credentials: false }))
app.options('/notify-email', cors({ origin: true, credentials: false }))

// Firebase HTTPS Function export
export const proxy = onRequest({
  region: 'europe-west3',
  secrets: [
    'FOODWATCH_LOGIN_EMAIL',
    'FOODWATCH_LOGIN_PASSWORD',
    'FOODWATCH_SMTP_HOST',
    'FOODWATCH_SMTP_PORT',
    'FOODWATCH_SMTP_USER',
    'FOODWATCH_SMTP_PASS',
    'FOODWATCH_NOTIFY_FROM',
    'FOODWATCH_NOTIFY_TO',
  ],
}, app)

// Export app for local runner
export default app
