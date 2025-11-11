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
    console.log('[proxy] Request received:', { storeIds, url: req.query.url, method: req.method });

    if (storeIds) {
      // Multi-ID support
      const storeIdArr = Array.isArray(storeIds) ? storeIds : [storeIds];
      console.log('[proxy] Processing multiple store IDs:', storeIdArr);

      const results = await Promise.all(storeIdArr.map(async id => {
        const url = `https://${TARGET_HOST}/api/stores/${id}/pickups`;
        console.log(`[proxy] Fetching pickups for store ${id}: ${url}`);

        let upstream = await request(url, {
          method: 'GET',
          headers: {
            'accept': req.header('accept') || 'application/json',
            'user-agent': 'fs-watcher-proxy/1.0',
            ...(req.header('x-csrf-token') ? { 'x-csrf-token': req.header('x-csrf-token') } : {}),
          },
          maxRedirections: 0,
        });

        console.log(`[proxy] Store ${id} - Initial response status: ${upstream.statusCode}`);

        // 401 logic — login if needed
        if (upstream.statusCode === 401) {
          console.log(`[proxy] Store ${id} - Got 401, attempting login...`);

          const loginEmail = process.env.FOODWATCH_LOGIN_EMAIL
          const loginPassword = process.env.FOODWATCH_LOGIN_PASSWORD

          console.log(`[proxy] Login credentials check:`, {
            email: loginEmail ? `${loginEmail.substring(0, 3)}***` : 'MISSING',
            password: loginPassword ? '***SET***' : 'MISSING',
            emailLength: loginEmail?.length || 0,
            passwordLength: loginPassword?.length || 0,
            emailHasWhitespace: loginEmail ? /\s/.test(loginEmail) : false,
            passwordHasWhitespace: loginPassword ? /\s/.test(loginPassword) : false
          });

          if (!loginEmail || !loginPassword) {
            console.error(`[proxy] Store ${id} - Missing credentials!`, {
              hasEmail: !!loginEmail,
              hasPassword: !!loginPassword
            });
            return { storeId: id, pickups: [], status: 500, error: 'Missing credentials' };
          }

          // Trim whitespace in case env vars have trailing spaces/newlines
          const trimmedEmail = loginEmail.trim()
          const trimmedPassword = loginPassword.trim()

          if (trimmedEmail !== loginEmail || trimmedPassword !== loginPassword) {
            console.warn(`[proxy] Store ${id} - Credentials had whitespace, trimmed`);
          }

          const loginBody = {
            email: trimmedEmail,
            password: trimmedPassword,
            remember_me: true
          };

          console.log(`[proxy] Store ${id} - Attempting login with email:`, trimmedEmail);

          const loginRes = await request('https://foodsharing.de/api/user/login', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'content-type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(loginBody),
          });

          console.log(`[proxy] Store ${id} - Login response status: ${loginRes.statusCode}`);

          const setCookie = loginRes.headers['set-cookie'];
          console.log(`[proxy] Store ${id} - Login cookies received:`, setCookie ? 'YES' : 'NO');

          if (loginRes.statusCode === 200 && setCookie) {
            console.log(`[proxy] Store ${id} - Retrying request with auth cookie...`);
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
            console.log(`[proxy] Store ${id} - Retry response status: ${upstream.statusCode}`);
          } else {
            console.error(`[proxy] Store ${id} - Login failed!`, {
              status: loginRes.statusCode,
              hasCookies: !!setCookie
            });
            // Try to read error response
            try {
              const errorText = await loginRes.body.text();
              console.error(`[proxy] Store ${id} - Login error response:`, errorText.substring(0, 200));
            } catch {}
          }
        }

        let pickups = [];
        if (upstream.statusCode === 200) {
          try {
            const text = await upstream.body.text();
            const apiRes = JSON.parse(text);
            pickups = Array.isArray(apiRes?.pickups) ? apiRes.pickups : [];
            console.log(`[proxy] Store ${id} - Successfully parsed ${pickups.length} pickups`);
          } catch (parseErr) {
            console.error(`[proxy] Store ${id} - Failed to parse response:`, parseErr.message);
          }
        } else {
          console.error(`[proxy] Store ${id} - Failed with status ${upstream.statusCode}`);
        }

        return { storeId: id, pickups, status: upstream.statusCode };
      }));

      console.log('[proxy] Multi-store request completed:', {
        totalStores: results.length,
        statuses: results.map(r => ({ id: r.storeId, status: r.status }))
      });

      // Aggregate output
      res.status(200).json({ multi: true, results });
      return;
    }

    const url = req.query.url
    if (!url) return res.status(400).json({ error: 'Missing url param' })

    let u
    try { u = new URL(url) } catch { return res.status(400).json({ error: 'Invalid url' }) }

    console.log('[proxy] Single URL request:', url);

    // Restrict target for safety
    if (u.hostname !== TARGET_HOST || !u.pathname.startsWith('/api/')) {
      console.error('[proxy] Invalid URL - not allowed:', { hostname: u.hostname, pathname: u.pathname });
      return res.status(400).json({ error: 'Only foodsharing.de /api/* is allowed' })
    }

    // Build minimal forward headers (do NOT forward cookies by default)
    const fwdHeaders = {
      'accept': req.header('accept') || 'application/json',
      'user-agent': 'fs-watcher-proxy/1.0',
      // Optional pass-through of CSRF or other whitelisted headers:
      ...(req.header('x-csrf-token') ? { 'x-csrf-token': req.header('x-csrf-token') } : {}),
    }

    console.log('[proxy] Making initial request to:', u.toString());
    const upstream = await request(u.toString(), {
      method: 'GET',
      headers: fwdHeaders,
      maxRedirections: 0,
    })

    console.log('[proxy] Initial response status:', upstream.statusCode);

    // === If 401, try to login and retry once ===
    if (upstream.statusCode === 401) {
      console.log('[proxy] Got 401, attempting login...');

      // Perform login using credentials from environment variables
      // In Firebase Functions: these come from Secret Manager
      // In emulator/local: these come from .env files
      const loginEmail = process.env.FOODWATCH_LOGIN_EMAIL
      const loginPassword = process.env.FOODWATCH_LOGIN_PASSWORD

      console.log('[proxy] Login credentials check:', {
        email: loginEmail ? `${loginEmail.substring(0, 3)}***` : 'MISSING',
        password: loginPassword ? '***SET***' : 'MISSING',
        emailLength: loginEmail?.length || 0,
        passwordLength: loginPassword?.length || 0,
        emailHasWhitespace: loginEmail ? /\s/.test(loginEmail) : false,
        passwordHasWhitespace: loginPassword ? /\s/.test(loginPassword) : false
      });

      if (!loginEmail || !loginPassword) {
        console.error('[proxy] Missing credentials!', {
          hasEmail: !!loginEmail,
          hasPassword: !!loginPassword
        });
        return res.status(500).json({ error: 'Missing FOODWATCH_LOGIN_EMAIL or FOODWATCH_LOGIN_PASSWORD in environment variables' })
      }

      // Trim whitespace in case env vars have trailing spaces/newlines
      const trimmedEmail = loginEmail.trim()
      const trimmedPassword = loginPassword.trim()

      if (trimmedEmail !== loginEmail || trimmedPassword !== loginPassword) {
        console.warn('[proxy] Credentials had whitespace, trimmed');
      }

      console.log('[proxy] Attempting login with email:', trimmedEmail);

      const loginRes = await request('https://foodsharing.de/api/user/login', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password: trimmedPassword,
          remember_me: true
        }),
      });

      console.log('[proxy] Login response status:', loginRes.statusCode);
      const setCookie = loginRes.headers['set-cookie'];
      console.log('[proxy] Login cookies received:', setCookie ? 'YES' : 'NO');

      if (loginRes.statusCode === 200 && setCookie) {
        console.log('[proxy] Retrying request with auth cookie...');
        // Re-try the original request with the new cookie
        const upstream2 = await request(u.toString(), {
          method: 'GET',
          headers: {
            ...fwdHeaders,
            'cookie': Array.isArray(setCookie) ? setCookie.join('; ') : setCookie,
          },
          maxRedirections: 0,
        });

        console.log('[proxy] Retry response status:', upstream2.statusCode);

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
      } else {
        console.error('[proxy] Login failed!', {
          status: loginRes.statusCode,
          hasCookies: !!setCookie
        });
        // Try to read error response
        try {
          const errorText = await loginRes.body.text();
          console.error('[proxy] Login error response:', errorText.substring(0, 200));
        } catch {}
      }
    }
    // === End custom 401/login logic ===

    console.log('[proxy] Final response status:', upstream.statusCode);

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
    console.error('[proxy] Error:', err.message, err.stack);
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/notify-email', async (req, res) => {
  const { subject, text } = req.body;
  console.log('[notify-email] Request received:', { subject, textLength: text?.length });

  if (!subject || !text) {
    console.error('[notify-email] Missing subject or text');
    return res.status(400).json({ error: 'Missing subject or text' });
  }

  const {
    FOODWATCH_SMTP_HOST,
    FOODWATCH_SMTP_PORT,
    FOODWATCH_SMTP_USER,
    FOODWATCH_SMTP_PASS,
    FOODWATCH_NOTIFY_FROM,
    FOODWATCH_NOTIFY_TO
  } = process.env;

  console.log('[notify-email] SMTP config check:', {
    host: FOODWATCH_SMTP_HOST ? `${FOODWATCH_SMTP_HOST.substring(0, 5)}***` : 'MISSING',
    port: FOODWATCH_SMTP_PORT || 'MISSING',
    user: FOODWATCH_SMTP_USER ? `${FOODWATCH_SMTP_USER.substring(0, 3)}***` : 'MISSING',
    pass: FOODWATCH_SMTP_PASS ? '***SET***' : 'MISSING',
    from: FOODWATCH_NOTIFY_FROM || 'MISSING',
    to: FOODWATCH_NOTIFY_TO || 'MISSING'
  });

  if (!FOODWATCH_SMTP_HOST || !FOODWATCH_SMTP_PORT || !FOODWATCH_SMTP_USER || !FOODWATCH_SMTP_PASS || !FOODWATCH_NOTIFY_FROM || !FOODWATCH_NOTIFY_TO) {
    console.error('[notify-email] Missing SMTP configuration');
    return res.status(500).json({ error: 'Missing SMTP/email configuration in environment variables.' });
  }

  try {
    console.log('[notify-email] Creating SMTP transporter...');
    const transporter = nodemailer.createTransport({
      host: FOODWATCH_SMTP_HOST,
      port: Number(FOODWATCH_SMTP_PORT),
      secure: Number(FOODWATCH_SMTP_PORT) === 465, // true for 465, false otherwise
      auth: {
        user: FOODWATCH_SMTP_USER,
        pass: FOODWATCH_SMTP_PASS,
      },
    });

    console.log('[notify-email] Sending email...');
    await transporter.sendMail({
      from: FOODWATCH_NOTIFY_FROM,
      to: FOODWATCH_NOTIFY_TO,
      subject,
      text,
    });

    console.log('[notify-email] Email sent successfully');
    res.json({ ok: true });
  } catch (err) {
    console.error('[notify-email] Error sending email:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Explicit preflights (kept for clarity)
app.options('/proxy', cors({ origin: true, credentials: false }))
app.options('/notify-email', cors({ origin: true, credentials: false }))

// Firebase HTTPS Function export
// Note: All secret variables must be declared here, NOT as regular environment variables
// If you see "overlaps non secret environment variable" errors, try:
// 1. Check actual Cloud Run env vars: node scripts/check-env-vars.mjs
// 2. Explicitly set empty environmentVariables to override any cached config
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
  // Explicitly set empty to prevent any cached env vars from causing conflicts
  environmentVariables: {},
}, app)

// Export app for local runner
export default app
