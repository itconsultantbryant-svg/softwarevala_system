# Deploying on Neon + Vercel

Production uses **Neon only** for the database and the API. The React frontend is hosted on Vercel.

```
Browser
  ├─ HTTPS /api/*  ──► Vercel rewrite ──► Neon Function (softwarevalaapi)
  └─ WSS /socket.io ─────────────────────► Neon Function (softwarevalaapi)
                                                │
                                                ▼
                                      Neon Postgres (main branch)
```

## Resources

| Resource | Value |
|----------|-------|
| Neon project | `softwarevala-management` (`cold-hall-48525485`) |
| Branch | `main` (`br-ancient-poetry-b7duxng3`) |
| Database | `softwarevala` |
| Function | `softwarevalaapi` (runtime `nodejs24`, 2048 MiB) |
| Function URL | `https://br-ancient-poetry-b7duxng3-softwarevalaapi.compute.c-13.us-east-1.aws.neon.tech` |
| Frontend | Vercel project, root directory `client` |

Neon injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` into the function. Do not pass your own `DATABASE_URL` during deploy, and never expose it to Vercel.

## Function environment variables

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `NEON_FUNCTIONS` | `true` |
| `SKIP_STARTUP_MIGRATIONS` | `true` (schema is already initialized) |
| `JWT_SECRET` | long random string (from `server/.env`) |
| `ENCRYPTION_KEY` | random string (from `server/.env`) |
| `MARKETING_SYNC_SECRET` | long random string for marketing sync endpoints |
| `FRONTEND_URL` | `https://softwarevalalib.app` |
| `PUBLIC_SITE_URL` | `https://softwarevalalib.app` |
| `UPLOADS_DIR` | `/tmp/uploads` (ephemeral, see Uploads below) |
| `JWT_EXPIRES_IN` | `24h` |
| `API_BODY_LIMIT_MB` | `50` |
| `CERTIFICATE_MAX_FILE_SIZE_MB` | `15` |

Generate secrets with:

```bash
openssl rand -hex 32
```

## First-time database setup

The Neon database is already initialized with the application schema and the admin account. For a brand-new Neon database, initialize it once from your machine:

```bash
cd server
cp .env.example .env
# Set DATABASE_URL to the Neon pooled connection string and add JWT_SECRET / ENCRYPTION_KEY
node server.js
# Wait for the schema/migration messages, then press Ctrl+C
node scripts/create-admin.js
```

Do not set `SKIP_STARTUP_MIGRATIONS` for this one-time run.

## Build and deploy the function

```bash
cd server
npm install
node neon/build.mjs
```

`neon/build.mjs` produces:

- `neon/dist/server.cjs` — the Express server bundled as CommonJS
- `neon/dist/index.mjs` — the ESM handler that boots the server once per isolate and proxies HTTP + WebSocket traffic

Deploy the prebuilt directory with `--no-bundle` (the ESM handler relies on a CJS bundle):

```bash
npx -y neon@latest functions deploy softwarevalaapi \
  --src neon/dist \
  --no-bundle \
  --project-id cold-hall-48525485 \
  --branch main \
  --env NODE_ENV=production \
  --env NEON_FUNCTIONS=true \
  --env SKIP_STARTUP_MIGRATIONS=true \
  --env JWT_SECRET="$JWT_SECRET" \
  --env ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  --env MARKETING_SYNC_SECRET="$MARKETING_SYNC_SECRET" \
  --env FRONTEND_URL=https://softwarevalalib.app \
  --env PUBLIC_SITE_URL=https://softwarevalalib.app \
  --env UPLOADS_DIR=/tmp/uploads \
  --env JWT_EXPIRES_IN=24h \
  --env API_BODY_LIMIT_MB=50 \
  --env CERTIFICATE_MAX_FILE_SIZE_MB=15 \
  --wait
```

The CLI prints the function URL. If it changes, update:

- `client/vercel.json` → `rewrites[0].destination`
- `client/src/utils/apiUrl.js` → `NEON_FUNCTION_ORIGIN`
- `client/.env.production` and `client/.env.production.example`

## Connect the Vercel frontend

`client/vercel.json` rewrites `/api/:path*` to the function URL, so browser API calls stay same-origin and avoid CORS. Socket.IO connects directly to the function URL because Vercel rewrites cannot proxy WebSocket upgrades.

1. Commit the updated function URL configuration.
2. Deploy the `client` project on Vercel (or let it redeploy from `main`).
3. Optional: set `REACT_APP_API_URL` and `REACT_APP_SOCKET_URL` in Vercel → Settings → Environment Variables to the function URL, then redeploy.

## Verify

```bash
curl https://br-ancient-poetry-b7duxng3-softwarevalaapi.compute.c-13.us-east-1.aws.neon.tech/api/health
```

Expected: `{"status":"ok","database":"up",...}` with HTTP 200.

Also verify:

- Login at `/api/auth/login`
- Dashboard at `/api/dashboard/stats`
- Marketing overview at `/api/marketing-agents/reports/overview`
- Live notifications (Socket.IO) in the browser

## Uploads

Neon Functions has a writable but ephemeral `/tmp`. Files written to `/tmp/uploads` survive while the isolate is warm and are served at `/uploads/*`, but they are lost when the isolate is recycled. Profile images are stored as data URLs in Postgres, so they persist.

For long-lived documents, use Neon Object Storage (or Vercel Blob) and store only the object key/URL in Postgres.

## Operations

- Deploy again with the same `functions deploy` command after rebuilding.
- `SKIP_STARTUP_MIGRATIONS=true` keeps cold starts fast. To apply schema changes, either run the server once locally against the Neon database with that flag removed, or temporarily deploy with it unset.
- Function logs and deployment history are available in the Neon Console under the `main` branch → Functions.
- Rotate `JWT_SECRET`, `ENCRYPTION_KEY`, and `MARKETING_SYNC_SECRET` periodically; redeploy with the new values.
