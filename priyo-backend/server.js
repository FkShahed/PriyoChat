require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
const { initFirebase } = require('./src/config/firebase');
const { setupSocket, onlineUsers } = require('./src/socket/socketHandler');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const conversationRoutes = require('./src/routes/conversationRoutes');
const mediaRoutes = require('./src/routes/mediaRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const callRoutes = require('./src/routes/callRoutes');
const configRoutes = require('./src/routes/configRoutes');

// Initialize
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
});

// Make io accessible in controllers
app.set('io', io);

// Trust reverse proxy (Render, Heroku, Cloudflare) for rate limiting & IP detection
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/status' || req.path === '/telemetry' || req.path === '/health',
});
app.use('/api', limiter);

// Auth rate limit (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many requests, please try again later' },
});
app.use('/api/auth', authLimiter);

// ─── Welcome page (served at root /) ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'src/public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'src/public/index.html')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/config', configRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── Live Telemetry & Status API ───────────────────────────────────────────────
const os = require('os');
const mongoose = require('mongoose');

// Rolling in-memory metrics history (last 20 sample points, stored on server)
const metricsHistory = [];
const MAX_HISTORY = 20;

setInterval(async () => {
  try {
    let dbLatencyMs = -1;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const dbStart = Date.now();
      await mongoose.connection.db.admin().ping();
      dbLatencyMs = Date.now() - dbStart;
    }
    const mem = process.memoryUsage();
    metricsHistory.push({
      time: new Date().toLocaleTimeString(),
      dbLatencyMs: dbLatencyMs >= 0 ? dbLatencyMs : 60,
      memoryRssMB: Math.round(mem.rss / (1024 * 1024)),
      activeConnections: onlineUsers ? onlineUsers.size : 0,
    });
    if (metricsHistory.length > MAX_HISTORY) {
      metricsHistory.shift();
    }
  } catch (e) {}
}, 3000);

app.get('/api/status', async (req, res) => {
  const startTime = Date.now();
  let dbLatencyMs = -1;
  let dbStatus = 'disconnected';

  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const dbStart = Date.now();
      await mongoose.connection.db.admin().ping();
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'connected';
    }
  } catch (err) {
    dbStatus = 'error';
  }

  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  res.json({
    status: 'operational',
    service: 'PriyoChat Core Backend',
    version: '1.0.9',
    timestamp: new Date().toISOString(),
    apiLatencyMs: Date.now() - startTime,
    history: metricsHistory,
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      name: mongoose.connection.name || 'PriyoChat',
    },
    sockets: {
      activeConnections: onlineUsers ? onlineUsers.size : 0,
      protocol: 'WebSockets (Socket.IO v4)',
    },
    system: {
      uptimeSeconds,
      uptimeFormatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
      memoryRssMB: Math.round(memory.rss / (1024 * 1024)),
      memoryHeapUsedMB: Math.round(memory.heapUsed / (1024 * 1024)),
      totalSystemMemMB: Math.round(os.totalmem() / (1024 * 1024)),
      freeSystemMemMB: Math.round(os.freemem() / (1024 * 1024)),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Cloud vCPU',
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version,
    },
  });
});

// 404
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// ─── Keep-alive ping (prevents Render free tier from sleeping) ───────────────
// Ping every 45 seconds to stay awake and log activity
const SELF_URL = process.env.SELF_URL || 'https://priyochat.onrender.com';
const PING_INTERVAL_MS = 45 * 1000; // 45 seconds

function pingServer() {
  try {
    const client = SELF_URL.startsWith('https') ? https : http;
    client.get(`${SELF_URL}/health`, (res) => {
      console.log(`🟢 Running server - ${new Date().toLocaleTimeString()} (Status: ${res.statusCode})`);
    }).on('error', (err) => {
      console.warn(`⚠️ Running server ping: ${err.message}`);
    });
  } catch (err) {
    console.warn(`⚠️ Ping error: ${err.message}`);
  }
}

connectDB().then(() => {
  initFirebase();
  setupSocket(io);
  server.listen(PORT, () => {
    console.log(`🚀 PriyoChat Server running on port ${PORT}`);
    // Start keep-alive after server is up
    setInterval(pingServer, PING_INTERVAL_MS);
    console.log(`⏰ Keep-alive ping scheduled every ${PING_INTERVAL_MS / 60000} minutes`);
  });
});
