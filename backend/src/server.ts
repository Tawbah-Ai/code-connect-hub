import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/authRoutes';
import deviceRoutes from './routes/deviceRoutes';
import pairingRoutes from './routes/pairingRoutes';
import { WSServer } from './websocket/wsServer';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API Routes (both prefixes: direct and via dashboard proxy path)
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/pairing', pairingRoutes);
app.use('/backend-api/api/auth', authRoutes);
app.use('/backend-api/api/devices', deviceRoutes);
app.use('/backend-api/api/pairing', pairingRoutes);

// API docs
app.get('/api', (_req, res) => {
  res.json({
    name: 'Hybrid Remote Control API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register a new user with device',
        'POST /api/auth/login': 'Login with email/password',
      },
      devices: {
        'GET /api/devices': 'List all user devices',
        'GET /api/devices/:deviceId': 'Get device details',
        'POST /api/devices/:deviceId/command': 'Send command to device',
        'DELETE /api/devices/:deviceId': 'Remove a device',
      },
      websocket: {
        'WS /ws': 'WebSocket connection (pass token as Bearer header or ?token= query)',
      },
    },
  });
});

// Serve dashboard static files in production
const dashboardDist = path.resolve(__dirname, '../../dashboard/dist');
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
  console.log(`[Server] Serving dashboard from ${dashboardDist}`);
}

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
new WSServer(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Hybrid Control Backend running on port ${PORT}`);
  console.log(`[Server] REST API: http://localhost:${PORT}/api`);
  console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
});

export default app;
