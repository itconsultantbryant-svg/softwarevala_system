#!/bin/bash

# Software Vala Liberia Management System - Start Both Servers

echo "Starting Software Vala Liberia Management System..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$(dirname "$0")"

if [ ! -d "server/node_modules" ]; then
    echo "Installing server dependencies..."
    (cd server && npm install)
    echo ""
fi

if [ ! -d "client/node_modules" ]; then
    echo "Installing client dependencies..."
    (cd client && npm install)
    echo ""
fi

echo "Starting backend (http://localhost:3006) and frontend (http://127.0.0.1:3000)..."
echo ""
echo "Admin login: admin@softwarevalalib.app / Admin@123!"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

trap 'kill 0' EXIT INT TERM

(cd server && npm run dev) &
(cd client && npm start) &

wait
