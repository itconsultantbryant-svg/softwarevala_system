# Deploy on Render — Software Vala Liberia

## Prerequisites

- GitHub repo: `https://github.com/itconsultantbryant-svg/softwarevala_system`
- `render.yaml` at the repository root (required for Blueprint deploy)

## 1. Create the backend (Blueprint)

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect `itconsultantbryant-svg/softwarevala_system` and select branch **main**.
3. Render reads `render.yaml` and creates **softwarevala-backend** with a 10GB persistent disk.
4. After the blueprint is created, set these in the service **Environment** (if not already set):
   - `FRONTEND_URL` — your frontend URL (Vercel or Render static site), e.g. `https://your-app.vercel.app`
   - `JWT_SECRET` — long random string (auto-generated if using Blueprint)
   - `ENCRYPTION_KEY` — 32+ character secret (auto-generated if using Blueprint)
   - `EMAIL_*` — optional, for password reset / notifications
   - `DATABASE_URL` — optional; leave unset to use SQLite on `/var/data/pms.db`

5. Deploy. When finished, note the backend URL, e.g. `https://softwarevala-backend.onrender.com`.

## 2. Verify backend

```text
GET https://softwarevala-backend.onrender.com/api/health
```

Expected: `{ "status": "ok" }`

Default admin (created on first boot):

- Email: `admin@softwarevalalib.app`
- Password: `Admin@123!`

## 3. Connect the frontend

### Option A — Vercel (recommended)

1. Deploy `client/` on Vercel.
2. Set environment variable:
   - `REACT_APP_API_URL=https://softwarevala-backend.onrender.com`
3. Update `client/vercel.json` API proxy `destination` to the same Render URL if you use `/api` rewrites.
4. Set `FRONTEND_URL` on Render to your Vercel URL and redeploy the backend.

### Option B — Same Render service (full stack)

The blueprint build also runs `client` build; if `client/build` exists, the API serves the React app from the same URL.

## 4. Persistent data (SQLite)

- Database file: `/var/data/pms.db`
- Uploads: `/var/data/uploads`

To restore an existing database, use Render Shell and copy your `pms.db` to `/var/data/pms.db`, then restart the service.

## 5. PostgreSQL (optional)

1. Create a Render PostgreSQL instance.
2. Copy the **Internal Database URL** into `DATABASE_URL` on **softwarevala-backend**.
3. Redeploy — the server runs migrations on startup.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blueprint file not found | Ensure `render.yaml` is on branch `main` at repo root |
| Health check fails | Check logs; confirm `PORT` is set and service listens on `0.0.0.0` |
| CORS errors | Set `FRONTEND_URL` to exact frontend origin (no trailing slash) |
| Login fails | Run `node scripts/create-admin.js` via Render Shell or redeploy fresh |
