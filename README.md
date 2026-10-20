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
| Backend | Node.js, Express, Neon Functions, PostgreSQL, JWT, bcryptjs, Socket.io |

## Project structure

```
├── client/          # React frontend (Vercel)
├── server/          # Express API + Neon Function bundle
├── server/neon/     # Function handler, build script, deployable dist/
└── database/        # SQL migrations
```

## Production

The React app is on Vercel. The API runs as a Neon Function on the `main` branch of the Neon project `softwarevala-management` (database `softwarevala`). API calls are proxied by Vercel from `/api/*` to the function, and Socket.IO connects to the function directly.

The function reads `DATABASE_URL` injected by Neon. Never put that URL in the Vercel frontend.

See [DEPLOY_NEON.md](./DEPLOY_NEON.md) for the Neon Function, database, and Vercel connection steps.

## Environment

- Backend: copy `server/.env.example` to `server/.env` for local development.
- Frontend: `client/.env.production` for production API URL fallback.

## License

ISC

**Software Vala Liberia — The Name of Trust**
