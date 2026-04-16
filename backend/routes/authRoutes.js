const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, email, phone_num, citizen_id, address, role, balance } = req.body;

    if (!username || !password || !name || !email || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const initialBalance = balance && balance > 0 ? balance : 0;

    const pool = getPool();
    
    // Check if user exists
    const checkUser = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT * FROM dbo.users WHERE username = @username');

    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Insert new user
    const result = await pool.request()
      .input('role', sql.VarChar, role)
      .input('name', sql.NVarChar, name)
      .input('phone_num', sql.VarChar, phone_num || '')
      .input('citizen_id', sql.VarChar, citizen_id || '')
      .input('email', sql.VarChar, email)
      .input('address', sql.NVarChar, address || '')
      .input('balance', sql.Decimal(18, 0), initialBalance)
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar(255), password)
      .input('status', sql.VarChar, 'active')
      .query(`
        INSERT INTO dbo.users (role, name, phone_num, citizen_id, email, address, balance, username, password, status)
        VALUES (@role, @name, @phone_num, @citizen_id, @email, @address, @balance, @username, @password, @status);
        SELECT * FROM dbo.users WHERE username = @username
      `);

    const user = result.recordset[0];
    const token = jwt.sign({ user_id: user.user_id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { user_id: user.user_id, username: user.username, role: user.role, email: user.email, balance: user.balance, name: user.name },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const pool = getPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT * FROM dbo.users WHERE username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.recordset[0];

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    if (password !== user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ user_id: user.user_id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    res.json({
      message: 'Login successful',
      token,
      user: { user_id: user.user_id, username: user.username, role: user.role, email: user.email, balance: user.balance },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const pool = getPool();

    const result = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT user_id, username, name, email, phone_num, citizen_id, address, role, balance, status FROM dbo.users WHERE user_id = @user_id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update role
router.post('/update-role', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { newRole } = req.body;

    if (!newRole || !['buyer', 'seller'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const pool = getPool();
    await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .input('role', sql.VarChar, newRole)
      .query('UPDATE dbo.users SET role = @role WHERE user_id = @user_id');

    const result = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT user_id, username, name, email, role, balance FROM dbo.users WHERE user_id = @user_id');

    res.json({ message: 'Role updated', user: result.recordset[0] });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add balance
router.post('/add-balance', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const pool = getPool();
    await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .input('amount', sql.Decimal(18, 0), amount)
      .query('UPDATE dbo.users SET balance = balance + @amount WHERE user_id = @user_id');

    const result = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    res.json({ message: 'Balance updated', newBalance: result.recordset[0].balance });
  } catch (error) {
    console.error('Add balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
