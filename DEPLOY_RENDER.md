# Vercel and Neon connection

The React app stays on Vercel. Office data is stored in Neon, not in a SQLite file.

| Piece | Where it lives |
| --- | --- |
| Frontend | Vercel project for `client/` |
| API | Node server. It reads `DATABASE_URL` and is the only process that talks to Neon. |
| Database | Neon project `softwarevala-management` |

Neon project:

- Project ID: `cold-hall-48525485`
- Branch: `main` (`br-ancient-poetry-b7duxng3`)
- Database: `softwarevala`
- Role: `softwarevala_app`
- Region: `aws-us-east-1`
- Direct host: `ep-cool-term-b7rbppkd.c-13.us-east-1.aws.neon.tech`
- Pooled host: `ep-cool-term-b7rbppkd-pooler.c-13.us-east-1.aws.neon.tech`

The website and academy database is a different Neon project, `softwarevalalib-web`. Do not point this API at that project.

## 1. Copy the connection string

1. Open [Neon](https://console.neon.tech) → **softwarevala-management** → **Connect**.
2. Choose the `softwarevala` database and the `softwarevala_app` role.
3. For this long-running API, copy the **direct** connection string (the host does not contain `-pooler`).
4. Keep `sslmode=require`.

The string looks like:

```text
postgresql://softwarevala_app:PASSWORD@ep-cool-term-b7rbppkd.c-13.us-east-1.aws.neon.tech/softwarevala?sslmode=require
```

Do not commit it, and do not create `REACT_APP_DATABASE_URL` or any `VITE_` / `NEXT_PUBLIC_` copy.

## 2. Give the string to the API only

On the API host environment:

- `DATABASE_URL` = the Neon connection string
- `FRONTEND_URL` = the Vercel site origin, with no trailing slash
- `JWT_SECRET` and `ENCRYPTION_KEY` = the existing production secrets
- `MARKETING_SYNC_SECRET` = the same server-only key used by the application portal

Local development uses `server/.env`. If `DATABASE_URL` is unset, the API falls back to SQLite for local work only.

The first boot against an empty Neon database runs the SQL migrations and creates `admin@softwarevalalib.app`.

## 3. Vercel frontend

The frontend is already deployed. It does not receive `DATABASE_URL`.

`client/vercel.json` proxies `/api/*` to the API host:

```text
https://softwarevala-backend.onrender.com/api/:path*
```

Leave that rewrite pointed at the API. Vercel cannot open a Postgres connection for the browser, and a rewrite cannot carry the WebSocket used for live notifications. `REACT_APP_SOCKET_URL` may be set to the same API origin if the default host changes.

After the API is using Neon, redeploy the API so the new `DATABASE_URL` is loaded. The Vercel site does not need a new database setting.

## 4. Confirm

```text
GET https://softwarevala-backend.onrender.com/api/health
```

Then sign in on the Vercel site. New records are written to Neon project `softwarevala-management`.
