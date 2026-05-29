# Vercel Frontend Deployment

**Production frontend:** https://prinstinemanagementsystem.com

API requests are proxied through Vercel to the Render backend (same-origin `/api`), so login works on all mobile networks including Orange.

## 1) Import project in Vercel

1. Import the GitHub repository in [Vercel](https://vercel.com).
2. Configure the project using **one** of these options:

### Option A (recommended): Root Directory = `client`

| Setting | Value |
|---------|--------|
| Root Directory | `client` |
| Framework Preset | Create React App |
| Build Command | `npm run build` |
| Output Directory | `build` |

### Option B: Repository root (empty Root Directory)

Leave Root Directory blank. The root `vercel.json` builds `client/` and publishes `client/build`.

## 2) Environment variables

Add in Vercel → **Settings → Environment Variables** (Production):

| Variable | Value |
|----------|--------|
| `REACT_APP_API_URL` | `https://prinstine-pms-backend.onrender.com` (optional fallback; production uses `/api` proxy) |
| `REACT_APP_SOCKET_URL` | `https://prinstine-pms-backend.onrender.com` (optional, for real-time) |

**Important:** Create React App reads env vars at **build time**. After changing variables, **Redeploy** (Deployments → Redeploy).

The repo includes `client/.env.production` as a fallback.

## 3) API proxy (Orange / mobile networks)

`vercel.json` rewrites `/api/*` to the Render backend server-to-server. The browser only talks to Vercel; no direct cross-origin calls to `*.onrender.com`.

No extra configuration needed if you deploy from this repo.

## 4) Custom domain

1. Vercel → **Settings → Domains**
2. Add `prinstinemanagementsystem.com`
3. Follow DNS instructions at your registrar until status is **Valid**

## 5) Fix login 405 / empty API URL

If login returns **405** or the console shows an empty API URL:

1. Confirm `vercel.json` includes the `/api/:path*` rewrite to Render.
2. **Redeploy** after any env or config change.
3. Hard refresh the site and try login again.
4. In DevTools → Network, login should hit `https://<your-domain>/api/auth/login`, not a bare `/auth/login` on the frontend host.

## 6) Fix Vercel 404 NOT_FOUND

1. Latest deployment must be **Ready**, not Failed.
2. **Output Directory:**
   - Root Directory = `client` → Output = `build`
   - Root Directory = empty → Output = `client/build` (or use root `vercel.json`)
3. Do not set Root Directory to `server`.
4. Fix custom domain DNS if domain shows **Invalid**.
5. **Redeploy** after fixing settings.

## 7) After code pushes

- **Render** redeploys the API automatically on push (if connected).
- **Vercel** must rebuild for UI changes — check Deployments or trigger **Redeploy**.

## 8) Verification

1. Frontend loads from Vercel URL or custom domain.
2. Login works (student/staff/admin).
3. Refresh deep links (e.g. `/dashboard`) — no 404.
4. API calls go to `/api/...` on the same domain.

See [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) for backend deployment.
