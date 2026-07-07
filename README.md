# Software Vala Liberia Office System

Software Vala Liberia Management System — office management platform for Software Vala Liberia.

Enterprise web application with role-based access control, real-time notifications, finance modules, and responsive UI.

## Quick start (local)

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

npm run dev
```

**Default admin login (change after first login):**

- Email: `admin@softwarevalalib.app`
- Password: `Admin@123!`

To reset the admin account manually:

```bash
cd server && node scripts/create-admin.js
```

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Bootstrap 5, Axios, React Router, Socket.io client |
| Backend | Node.js, Express, SQLite / PostgreSQL, JWT, bcrypt, Socket.io |

## Project structure

```
├── client/          # React frontend
├── server/          # Express API
├── database/        # SQLite DB and migrations
└── render.yaml      # Render backend blueprint
```

## Production deployment (Render)

| Step | Action |
|------|--------|
| 1 | Push `render.yaml` on branch `main` |
| 2 | Render → **New** → **Blueprint** → connect this repo |
| 3 | Set `FRONTEND_URL` to your frontend URL after deploy |
| 4 | Health check: `https://softwarevala-backend.onrender.com/api/health` |

See [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) for full instructions.

## Environment

- Backend: copy `server/.env.example` to `server/.env` for local development.
- Frontend: `client/.env.production` for production API URL fallback.

## License

ISC

**Software Vala Liberia — The Name of Trust**
