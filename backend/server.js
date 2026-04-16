const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();
const { connectDB, closeDB } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

const { Server } = require('socket.io');

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

// Cho phép tất cả nếu không set ALLOWED_ORIGINS, hoặc kiểm tra danh sách
const corsOrigin = allowedOrigins.length === 0
  ? '*'
  : (origin, callback) => {
      // Cho phép requests không có origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    };

const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Xử lý preflight cho tất cả routes
app.use(express.json());

// HTTP + WebSocket server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length === 0 ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  // Client joins a room for a specific auction to receive real-time bid updates.
  socket.on('auction:join', (data) => {
    const auction_id = data?.auction_id;
    if (!auction_id) return;
    socket.join(`auction:${auction_id}`);
  });

  socket.on('auction:leave', (data) => {
    const auction_id = data?.auction_id;
    if (!auction_id) return;
    socket.leave(`auction:${auction_id}`);
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', auctionRoutes);
app.use('/api', productRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server (HTTP + WebSocket) running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await closeDB();
  process.exit(0);
});

startServer();

module.exports = app;
