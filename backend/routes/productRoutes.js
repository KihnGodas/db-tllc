const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Get all products
router.get('/products', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .query(`
        SELECT p.*, c.category_name, u.name as seller_name
        FROM dbo.products p
        JOIN dbo.product_categories c ON p.category_id = c.category_id
        JOIN dbo.users u ON p.user_id = u.user_id
        WHERE p.product_status != 'cancelled'
        ORDER BY p.stt DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get categories
router.get('/products/categories', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .query('SELECT * FROM dbo.product_categories ORDER BY category_name');

    res.json(result.recordset);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create product (seller only)
router.post('/products', authMiddleware, async (req, res) => {
  try {
    const { product_name, description, category_id, picture_url } = req.body;
    const user_id = req.user.user_id;

    if (!product_name || !category_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pool = getPool();

    const result = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .input('category_id', sql.VarChar, category_id)
      .input('product_name', sql.NVarChar, product_name)
      .input('description', sql.NVarChar, description || '')
      .input('picture_url', sql.VarChar, picture_url || '')
      .input('product_status', sql.VarChar, 'pending')
      .query(`
        INSERT INTO dbo.products (user_id, category_id, product_name, description, picture_url, product_status)
        VALUES (@user_id, @category_id, @product_name, @description, @picture_url, @product_status);
        SELECT * FROM dbo.products WHERE user_id = @user_id ORDER BY stt DESC
      `);

    const product = result.recordset[result.recordset.length - 1];

    res.status(201).json({
      message: 'Product created successfully',
      product,
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
