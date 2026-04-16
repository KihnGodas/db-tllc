const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Register - kiểm tra trùng username, email, citizen_id
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, email, phone_num, citizen_id, address, role, balance } = req.body;

    if (!username || !password || !name || !email || !role) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
    }

    const pool = getPool();

    // Kiểm tra trùng username
    const checkUsername = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT user_id FROM dbo.users WHERE username = @username');
    if (checkUsername.recordset.length > 0) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    // Kiểm tra trùng email
    const checkEmail = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT user_id FROM dbo.users WHERE email = @email');
    if (checkEmail.recordset.length > 0) {
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    }

    // Kiểm tra trùng CCCD (nếu có nhập)
    if (citizen_id && citizen_id.trim()) {
      const checkCitizenId = await pool.request()
        .input('citizen_id', sql.VarChar, citizen_id)
        .query("SELECT user_id FROM dbo.users WHERE citizen_id = @citizen_id AND citizen_id != ''");
      if (checkCitizenId.recordset.length > 0) {
        return res.status(400).json({ error: 'Số CMND/CCCD đã được sử dụng' });
      }
    }

    const initialBalance = balance && balance > 0 ? balance : 0;

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
    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Đăng ký thành công',
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
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const pool = getPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT * FROM dbo.users WHERE username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const user = result.recordset[0];

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    }

    if (password !== user.password) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: { user_id: user.user_id, username: user.username, role: user.role, email: user.email, balance: user.balance, name: user.name },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .input('user_id', sql.VarChar, req.user.user_id)
      .query('SELECT user_id, username, name, email, phone_num, citizen_id, address, role, balance, status FROM dbo.users WHERE user_id = @user_id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
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
    const { newRole } = req.body;
    if (!newRole || !['buyer', 'seller'].includes(newRole)) {
      return res.status(400).json({ error: 'Vai trò không hợp lệ' });
    }

    const pool = getPool();
    await pool.request()
      .input('user_id', sql.VarChar, req.user.user_id)
      .input('role', sql.VarChar, newRole)
      .query('UPDATE dbo.users SET role = @role WHERE user_id = @user_id');

    const result = await pool.request()
      .input('user_id', sql.VarChar, req.user.user_id)
      .query('SELECT user_id, username, name, email, role, balance FROM dbo.users WHERE user_id = @user_id');

    res.json({ message: 'Cập nhật vai trò thành công', user: result.recordset[0] });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add balance (nạp tiền bằng số dư - tức là cộng thẳng)
router.post('/add-balance', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    const pool = getPool();
    await pool.request()
      .input('user_id', sql.VarChar, req.user.user_id)
      .input('amount', sql.Decimal(18, 0), amount)
      .query('UPDATE dbo.users SET balance = balance + @amount WHERE user_id = @user_id');

    const result = await pool.request()
      .input('user_id', sql.VarChar, req.user.user_id)
      .query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    res.json({ message: 'Nạp tiền thành công', newBalance: result.recordset[0].balance });
  } catch (error) {
    console.error('Add balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
