// routes/adminRoutes.js - Routes cho Admin (tùy chọn)
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Admin verification (tùy chọn)
function adminOnly(req, res, next) {
  // Implement role checking here
  next();
}

// Get all users
router.get('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .query('SELECT user_id, username, email, role, status, balance FROM dbo.users');
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all auctions with stats
router.get('/auctions/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .query(`
        SELECT 
          COUNT(*) as total_auctions,
          SUM(CASE WHEN auction_status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
          SUM(CASE WHEN auction_status = 'ended' THEN 1 ELSE 0 END) as ended,
          SUM(CASE WHEN auction_status = 'upcomming' THEN 1 ELSE 0 END) as upcoming
        FROM dbo.auctions
      `);
    res.json(result.recordset[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deactivate user
router.put('/users/:user_id/deactivate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { user_id } = req.params;
    const pool = getPool();
    
    await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query('UPDATE dbo.users SET status = "inactive" WHERE user_id = @user_id');
    
    res.json({ message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
