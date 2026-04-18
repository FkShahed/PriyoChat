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
const { setupSocket } = require('./src/socket/socketHandler');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const conversationRoutes = require('./src/routes/conversationRoutes');
const mediaRoutes = require('./src/routes/mediaRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

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

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

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
// Render spins down after 15 min of inactivity — ping every 14 min to stay awake
const SELF_URL = process.env.SELF_URL || 'https://priyochat.onrender.com';
const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

function pingServer() {
  https.get(`${SELF_URL}/health`, (res) => {
    console.log(`🏓 Keep-alive ping → ${res.statusCode}`);
  }).on('error', (err) => {
    console.warn(`⚠️  Keep-alive ping failed: ${err.message}`);
  });
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
