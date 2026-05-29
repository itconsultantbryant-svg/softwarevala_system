# prinstine-group-office-system

Prinstine Management System (PMS) — office management platform for Prinstine Group of Companies.

Enterprise web application with role-based access control, real-time notifications, academy management, finance modules, and responsive UI.

## Quick start (local)

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

npm run dev
```

**Default admin login (change after first login):**

- Email: `admin@prinstine.com`
- Password: `Admin@123`

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
├── vercel.json      # Vercel build + API proxy to Render
└── render.yaml      # Render backend blueprint
```

## Production deployment

| Service | Platform | Documentation |
|---------|----------|----------------|
| Frontend | Vercel | [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) |
| Backend | Render | [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) |

**Live URLs:**

- Frontend: https://prinstinemanagementsystem.com
- Backend: https://prinstine-group-system.onrender.com

## Environment

- Backend: copy `server/.env.example` to `server/.env` for local development.
- Frontend: `client/.env.production` for production API URL fallback.

## License

ISC

**Prinstine Group of Companies**
