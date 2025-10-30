# Foodsharing Pickup Watcher (Vite + React + Express proxy)

A small SPA that polls the Foodsharing API every hour and highlights free pickup slots.
Includes a secure GET-only proxy that allows the browser to bypass CORS while *restricting*
requests strictly to `https://foodsharing.de/api/*`.

## Quick start

```bash
cd foodsharing-watcher
npm i
npm run start
```

- The proxy runs at `http://localhost:8787` (GET `/proxy?url=...`).
- The Vite dev server runs at `http://localhost:5173`.
- In the app, set **Proxy URL** to `http://localhost:8787/proxy`.
- Store ID defaults to `29441` (change as needed).

## Production build

```bash
npm run build
npm run preview
# run your proxy on your server (node server/proxy.mjs)
```

## Notes

- The proxy deliberately does **not** forward cookies and only whitelists minimal headers.
- If you require authenticated endpoints, extend the proxy to add necessary headers from the server side (never from the browser).
- The SPA saves settings in `localStorage` and checks at the top of each hour (plus manual "Check now").
- Notifications: allow them in your browser to be pinged when a free slot appears.
