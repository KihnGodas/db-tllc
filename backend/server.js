const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();
const { connectDB, closeDB } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const productRoutes = require('./routes/productRoutes');

// ─── Import syncAuctionStatuses function for background job ──────────────────
const { syncAuctionStatuses } = require('./routes/auctionRoutes');

const app = express();

const { Server } = require('socket.io');

// Middleware - cho phép tất cả origins
app.use(cors());
app.options('*', cors());
app.use(express.json());

// HTTP + WebSocket server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
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

    // ─── Background job: Auto-sync auction statuses every 30 seconds ────────
    console.log('⏰ Starting background job: Auto-sync auction statuses every 30 seconds');
    setInterval(async () => {
      try {
        const { getPool } = require('./config/db');
        const pool = getPool();
        await syncAuctionStatuses(pool, io);
        console.log('✅ Auction statuses synced automatically');
      } catch (error) {
        console.error('❌ Background sync error:', error.message);
      }
    }, 30 * 1000); // Every 30 seconds

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
