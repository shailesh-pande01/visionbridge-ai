const express = require('express');
const http    = require('http');
const cors    = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
require('dotenv').config();

// Route imports
const aiRoutes        = require('./routes/aiRoutes');
const visionRoutes    = require('./routes/visionRoutes');   // AI Camera Assistant
const readingRoutes   = require('./routes/readingRoutes');
const locationRoutes  = require('./routes/locationRoutes');
const volunteerRoutes = require('./routes/volunteerRoutes'); // Volunteer Help
const sosRoutes       = require('./routes/sosRoutes');
const transportRoutes = require('./routes/transportRoutes');
const finderRoutes    = require('./routes/finderRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Database Connection ─────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/visionbridge', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('📦 Connected to MongoDB');
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

// ── HTTP & Socket.io Server Setup ───────────────────────
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Volunteer dashboard joins 'volunteers' room to receive new help request alerts
  socket.on('join_volunteer_room', () => {
    socket.join('volunteers');
    console.log(`[Socket] ${socket.id} joined room: volunteers`);
  });

  // User or Volunteer joins a specific help request room for chat & live location
  socket.on('join_request_room', (helpRequestId) => {
    if (helpRequestId) {
      socket.join(helpRequestId);
      console.log(`[Socket] ${socket.id} joined room: ${helpRequestId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Attach Socket.io instance to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ── Health Check ────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'VisionBridge API is running with Socket.io' });
});

// ── Feature Routes ──────────────────────────────────────
app.use('/api/ai',        aiRoutes);
app.use('/api/vision',    visionRoutes);
app.use('/api/reading',   readingRoutes);
app.use('/api/location',  locationRoutes);
app.use('/api/volunteer', volunteerRoutes);
app.use('/api/sos',       sosRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/object-finder', finderRoutes);

// ── 404 Handler ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ────────────────────────────────
app.use((err, req, res, next) => {
  const status  = err.status  || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const code    = err.code    || 'SERVER_ERROR';

  console.error(`[Error] ${status} [${code}] ${message}`);
  if (status === 500) console.error(err.stack);

  res.status(status).json({ success: false, error: message, code });
});

httpServer.listen(PORT, () => {
  console.log(`✅ VisionBridge server running → http://localhost:${PORT}`);
});
