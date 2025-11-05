# Foodsharing Pickup Watcher (Vite + React + Express proxy)

A small SPA that polls the Foodsharing API every hour and highlights free pickup slots.
Includes a secure GET-only proxy that allows the browser to bypass CORS while *restricting*
requests strictly to `https://foodsharing.de/api/*`.

## Setup

1. Copy `.env.example` to create environment files:
   - `.env.local` - for local development
   - `.env.emulator` - for Firebase Functions emulator
   - `.env.firebase` - for Firebase Functions production

2. Fill in the required environment variables in each file.

3. For Firebase Functions Emulator, create `.secret.local` (copy from `.secret.local.example`):
   - This file provides local overrides for Firebase secrets when running the emulator
   - Contains credentials that shouldn't be committed to git (already in `.gitignore`)
   - Required secrets: `FOODWATCH_LOGIN_EMAIL`, `FOODWATCH_LOGIN_PASSWORD`, `FOODWATCH_SMTP_*`, `FOODWATCH_NOTIFY_*`

## Development Modes

### Local Development

Runs a local Express proxy server alongside the Vite dev server.

```bash
npm run start
# or explicitly:
npm run start:local
```

- Proxy server: `http://localhost:8787`
- Vite dev server: `http://localhost:5173`
- Uses `.env.local` for frontend configuration
- Uses `.env.local` for proxy server environment variables

### Firebase Functions Emulator

Runs Firebase emulators with the proxy function (via `index.mjs`), plus Vite dev server.

**Prerequisites**: Create `.secret.local` file with all required secrets (see Setup section above).

```bash
npm run start:emulator
# or separately:
npm run emulate        # Start Firebase emulators only (proxy function runs here)
npm run dev:emulator   # Start Vite dev server only (mode: emulator)
```

- Firebase Functions emulator: `http://localhost:5001`
- Proxy function: `http://localhost:5001/foodsharing-watcher/europe-west3/proxy`
- Vite dev server: `http://localhost:5173`
- Uses `.env.emulator` for frontend configuration
- Uses `.secret.local` for Firebase Function secrets (local overrides)
- **Note**: The proxy runs as a Firebase Function in the emulator (not via `local.mjs`)

### Firebase Functions Production

Build and deploy to Firebase.

```bash
npm run build:firebase  # Build frontend with firebase mode
npm run deploy          # Deploy both functions and hosting
# or separately:
npm run deploy:functions  # Deploy functions only
npm run deploy:hosting    # Deploy hosting only
```

- Uses `.env.firebase` for frontend configuration
- Proxy function is available at `/proxy` (handled by Firebase hosting rewrites)

## Build Scripts

- `npm run build:local` - Build for local testing (mode: local)
- `npm run build:emulator` - Build for emulator testing (mode: emulator)
- `npm run build:firebase` - Build for Firebase production (mode: firebase)

## Architecture

The proxy server has a dual-mode architecture:

- **Local Development**: Uses `server/local.mjs` to run the Express app directly
  - Entry point: `server/local.mjs` → imports Express app from `server/proxy.mjs`
  - Started via: `npm run proxy:local`

- **Firebase Functions (Emulator & Production)**: Uses `index.mjs` to export the Firebase Function
  - Entry point: `index.mjs` → exports Firebase Function from `server/proxy.mjs`
  - The Express app (`server/proxy.mjs`) exports both:
    - `export default app` - for local use
    - `export const proxy` - Firebase Function wrapper

## Proxy Endpoint Usage

The proxy endpoint accepts:
- `GET /proxy?url=https://foodsharing.de/api/stores/{id}/pickups` - Single store
- `GET /proxy?store_id={id}` - Single store (shortcut)
- `GET /proxy?store_id={id1}&store_id={id2}` - Multiple stores

The proxy handles authentication automatically if credentials are provided in environment variables.

## Notes

- The proxy deliberately does **not** forward cookies and only whitelists minimal headers.
- If you require authenticated endpoints, extend the proxy to add necessary headers from the server side (never from the browser).
- The SPA saves settings in `localStorage` and checks at the top of each hour (plus manual "Check now").
- Notifications: allow them in your browser to be pinged when a free slot appears.
