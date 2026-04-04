import { io } from 'socket.io-client';
import { getSocketBaseUrl } from '../utils/apiUrl';

let socket = null;

export const initSocket = (userId) => {
  if (!socket) {
    const socketUrl = getSocketBaseUrl() || 'http://localhost:3006';
    socket = io(socketUrl, {
      // Polling first: many mobile carriers (e.g. Orange Liberia) block or break WebSocket
      // upgrades; long-polling over HTTPS works reliably, then upgrade when possible.
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      reconnectionAttempts: 25,
      timeout: 45000,
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      if (userId) {
        socket.emit('authenticate', userId);
        console.log('Socket authentication sent for user:', userId);
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('reconnect', () => {
      console.log('Socket reconnected');
      if (userId) {
        socket.emit('authenticate', userId);
      }
    });
  } else if (userId) {
    // If socket exists but user changed, authenticate
    if (socket.connected) {
      socket.emit('authenticate', userId);
      console.log('Socket re-authenticated for user:', userId);
    } else {
      // Wait for connection then authenticate
      socket.once('connect', () => {
        socket.emit('authenticate', userId);
      });
    }
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

