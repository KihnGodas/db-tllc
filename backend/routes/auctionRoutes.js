const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const authMiddleware = require('../middleware/auth');

async function syncAuctionStatuses(pool) {
  // Promote auctions that reached start time.
  await pool.request().query(`
    UPDATE dbo.auctions
    SET auction_status = 'ongoing'
    WHERE auction_status = 'upcomming'
      AND start_time <= GETDATE()
      AND end_time > GETDATE()
  `);

  const endedAuctionsResult = await pool.request().query(`
    SELECT auction_id
    FROM dbo.auctions
    WHERE auction_status = 'ongoing'
      AND end_time <= GETDATE()
  `);

  for (const row of endedAuctionsResult.recordset) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const txRequest = new sql.Request(transaction);
      txRequest.input('auction_id', sql.VarChar, row.auction_id);

      const auctionResult = await txRequest.query(`
        SELECT auction_id, current_price, winner_id, auction_status
        FROM dbo.auctions
        WHERE auction_id = @auction_id
      `);

      if (auctionResult.recordset.length === 0) {
        await transaction.rollback();
        continue;
      }

      const auction = auctionResult.recordset[0];
      if (auction.auction_status !== 'ongoing') {
        await transaction.rollback();
        continue;
      }

      const winnerResult = await txRequest.query(`
        SELECT TOP 1 user_id, bid_price
        FROM dbo.bids_history
        WHERE auction_id = @auction_id
        ORDER BY bid_price DESC, bid_time ASC
      `);

      let winnerId = null;
      let winningPrice = auction.current_price;
      if (winnerResult.recordset.length > 0) {
        winnerId = winnerResult.recordset[0].user_id;
        winningPrice = winnerResult.recordset[0].bid_price;
      }

      if (!winnerId && auction.winner_id) {
        winnerId = auction.winner_id;
      }

      const finishRequest = new sql.Request(transaction);
      finishRequest.input('auction_id', sql.VarChar, row.auction_id);
      finishRequest.input('winner_id', sql.VarChar, winnerId);
      finishRequest.input('winning_price', sql.Decimal(18, 0), winningPrice || 0);

      await finishRequest.query(`
        UPDATE dbo.auctions
        SET auction_status = 'ended',
            winner_id = @winner_id,
            current_price = @winning_price
        WHERE auction_id = @auction_id
      `);

      if (winnerId) {
        const invoiceCheckRequest = new sql.Request(transaction);
        invoiceCheckRequest.input('auction_id', sql.VarChar, row.auction_id);
        const invoiceCheck = await invoiceCheckRequest.query(`
          SELECT invoice_id FROM dbo.invoices WHERE auction_id = @auction_id
        `);

        if (invoiceCheck.recordset.length === 0) {
          const balanceRequest = new sql.Request(transaction);
          balanceRequest.input('winner_id', sql.VarChar, winnerId);
          const balanceResult = await balanceRequest.query(`
            SELECT balance FROM dbo.users WHERE user_id = @winner_id
          `);

          if (balanceResult.recordset.length > 0) {
            const winnerBalance = balanceResult.recordset[0].balance;
            const invoiceStatus = winnerBalance >= winningPrice ? 'paid' : 'unpaid';

            if (winnerBalance >= winningPrice) {
              const deductRequest = new sql.Request(transaction);
              deductRequest
                .input('winner_id', sql.VarChar, winnerId)
                .input('winning_price', sql.Decimal(18, 0), winningPrice);
              await deductRequest.query(`
                UPDATE dbo.users
                SET balance = balance - @winning_price
                WHERE user_id = @winner_id
              `);
            }

            const invoiceRequest = new sql.Request(transaction);
            invoiceRequest
              .input('winner_id', sql.VarChar, winnerId)
              .input('auction_id', sql.VarChar, row.auction_id)
              .input('payment_status', sql.VarChar, invoiceStatus);
            await invoiceRequest.query(`
              INSERT INTO dbo.invoices (winner_id, auction_id, due_date, payment_status)
              VALUES (@winner_id, @auction_id, DATEADD(DAY, 3, GETDATE()), @payment_status)
            `);
          }
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

// Get all auctions
router.get('/auctions', async (req, res) => {
  try {
    const pool = getPool();
    await syncAuctionStatuses(pool);
    const result = await pool.request()
      .query(`
        SELECT a.*, p.product_name, p.picture_url, u.name as seller_name, wu.name as winner_name
        FROM dbo.auctions a
        JOIN dbo.products p ON a.product_id = p.product_id
        JOIN dbo.users u ON p.user_id = u.user_id
        LEFT JOIN dbo.users wu ON a.winner_id = wu.user_id
        ORDER BY a.created_at DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get auctions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get auction details
router.get('/auctions/:auction_id', async (req, res) => {
  try {
    const { auction_id } = req.params;
    const pool = getPool();
    await syncAuctionStatuses(pool);

    const result = await pool.request()
      .input('auction_id', sql.VarChar, auction_id)
      .query(`
        SELECT a.*, p.product_name, p.description, p.picture_url, u.name as seller_name, u.email as seller_email,
               wu.name as winner_name,
               (SELECT COUNT(*) FROM dbo.bids_history WHERE auction_id = @auction_id) as total_bids
        FROM dbo.auctions a
        JOIN dbo.products p ON a.product_id = p.product_id
        JOIN dbo.users u ON p.user_id = u.user_id
        LEFT JOIN dbo.users wu ON a.winner_id = wu.user_id
        WHERE a.auction_id = @auction_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Get auction details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get bidding history
router.get('/auctions/:auction_id/bids', async (req, res) => {
  try {
    const { auction_id } = req.params;
    const pool = getPool();

    const result = await pool.request()
      .input('auction_id', sql.VarChar, auction_id)
      .query(`
        SELECT bh.*, u.username, u.name
        FROM dbo.bids_history bh
        JOIN dbo.users u ON bh.user_id = u.user_id
        WHERE bh.auction_id = @auction_id
        ORDER BY bh.bid_time DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get bids error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Place a bid (requires authentication)
router.post('/auctions/:auction_id/bid', authMiddleware, async (req, res) => {
  let transaction;
  try {
    const { auction_id } = req.params;
    const { bid_price } = req.body;
    const user_id = req.user.user_id;

    if (!bid_price || bid_price <= 0) {
      return res.status(400).json({ error: 'Invalid bid price' });
    }

    const pool = getPool();
    await syncAuctionStatuses(pool);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const txRequest = new sql.Request(transaction);

    // Lock this auction row to prevent concurrent bid race conditions.
    const checkAuction = await txRequest
      .input('auction_id', sql.VarChar, auction_id)
      .query(`
        SELECT *
        FROM dbo.auctions WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
        WHERE auction_id = @auction_id
      `);

    if (checkAuction.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Auction not found' });
    }

    const auction = checkAuction.recordset[0];

    if (auction.auction_status !== 'ongoing') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Auction is not ongoing' });
    }

    if (bid_price <= auction.current_price) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Bid price must be higher than current price' });
    }

    // Check user balance
    const userResult = await txRequest
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    if (userResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const userBalance = userResult.recordset[0].balance;

    if (userBalance < bid_price) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Insufficient balance. Please top up your account.' });
    }

    // Insert bid and update current leading winner.
    const req1 = new sql.Request(transaction)
      .input('auction_id', sql.VarChar, auction_id)
      .input('user_id', sql.VarChar, user_id)
      .input('bid_price', sql.Decimal(18, 0), bid_price);
    
    await req1.query(`INSERT INTO dbo.bids_history (auction_id, user_id, bid_price)
        VALUES (@auction_id, @user_id, @bid_price)`);

    const req2 = new sql.Request(transaction)
      .input('auction_id', sql.VarChar, auction_id)
      .input('bid_price', sql.Decimal(18, 0), bid_price)
      .input('user_id', sql.VarChar, user_id);
    
    await req2.query(`UPDATE dbo.auctions 
        SET current_price = @bid_price, winner_id = @user_id
        WHERE auction_id = @auction_id`);
    
    await transaction.commit();
    transaction = null;

    res.json({ 
      message: 'Bid placed successfully', 
      bid_price
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Rollback bid transaction error:', rollbackError);
      }
    }
    console.error('Place bid error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Register for auction
router.post('/auctions/:auction_id/register', authMiddleware, async (req, res) => {
  try {
    const { auction_id } = req.params;
    const user_id = req.user.user_id;
    const pool = getPool();
    await syncAuctionStatuses(pool);

    // Check if already registered
    const checkReg = await pool.request()
      .input('auction_id', sql.VarChar, auction_id)
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT * FROM dbo.registration WHERE auction_id = @auction_id AND user_id = @user_id');

    if (checkReg.recordset.length > 0) {
      return res.status(400).json({ error: 'Already registered' });
    }

    // Get auction details
    const auctionData = await pool.request()
      .input('auction_id', sql.VarChar, auction_id)
      .query('SELECT * FROM dbo.auctions WHERE auction_id = @auction_id');

    if (auctionData.recordset.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    const auction = auctionData.recordset[0];

    if (auction.auction_status === 'ended' || auction.auction_status === 'cancelled') {
      return res.status(400).json({ error: 'Auction has ended. Registration is closed.' });
    }

    if (auction.winner_id) {
      return res.status(400).json({ error: 'Auction already has a winner. Registration is closed.' });
    }

    const totalFee = (auction.entry_fee || 0) + (auction.deposit || 0);

    // Check user balance
    const userResult = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userBalance = userResult.recordset[0].balance;

    if (userBalance < totalFee) {
      return res.status(400).json({ error: 'Insufficient balance for registration fee. Please top up your account.' });
    }

    // Deduct registration fee from balance
    const newBalance = userBalance - totalFee;

    // Insert registration and update balance in sequence
    const req1 = pool.request()
      .input('auction_id', sql.VarChar, auction_id)
      .input('user_id', sql.VarChar, user_id)
      .input('payment_status', sql.VarChar, 'paid');
    
    await req1.query(`INSERT INTO dbo.registration (auction_id, user_id, payment_status)
        VALUES (@auction_id, @user_id, @payment_status)`);

    const req2 = pool.request()
      .input('auction_id', sql.VarChar, auction_id);
    
    await req2.query(`UPDATE dbo.auctions 
        SET participant_count = participant_count + 1
        WHERE auction_id = @auction_id`);

    const req3 = pool.request()
      .input('user_id', sql.VarChar, user_id)
      .input('new_balance', sql.Decimal(18, 0), newBalance);
    
    await req3.query(`UPDATE dbo.users 
        SET balance = @new_balance
        WHERE user_id = @user_id`);

    res.json({ 
      message: 'Registration successful', 
      entry_fee: auction.entry_fee,
      deposit: auction.deposit,
      totalFee: totalFee,
      newBalance: newBalance
    });
  } catch (error) {
    console.error('Register auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create auction (seller only)
router.post('/auctions', authMiddleware, async (req, res) => {
  try {
    const { product_id, opening_bid, bid_increment, entry_fee, deposit, start_time, end_time, auction_status } = req.body;
    const user_id = req.user.user_id;

    if (!product_id || !opening_bid || !bid_increment || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pool = getPool();

    // Check if product belongs to seller
    const checkProduct = await pool.request()
      .input('product_id', sql.VarChar, product_id)
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT * FROM dbo.products WHERE product_id = @product_id AND user_id = @user_id');

    if (checkProduct.recordset.length === 0) {
      return res.status(403).json({ error: 'Product not found or does not belong to you' });
    }

    const startDate = new Date(start_time);
    const endDate = new Date(end_time);

    if (startDate >= endDate) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Create auction
    const result = await pool.request()
      .input('product_id', sql.VarChar, product_id)
      .input('opening_bid', sql.Decimal(18, 0), opening_bid)
      .input('current_price', sql.Decimal(18, 0), opening_bid)
      .input('bid_increment', sql.Decimal(18, 0), bid_increment)
      .input('entry_fee', sql.Decimal(18, 0), entry_fee || 0)
      .input('deposit', sql.Decimal(18, 0), deposit || 0)
      .input('start_time', sql.DateTime, startDate)
      .input('end_time', sql.DateTime, endDate)
      .input('auction_status', sql.VarChar, auction_status || 'upcomming')
      .input('participant_count', sql.Int, 0)
      .query(`
        INSERT INTO dbo.auctions (product_id, opening_bid, current_price, bid_increment, entry_fee, deposit, start_time, end_time, auction_status, participant_count)
        VALUES (@product_id, @opening_bid, @current_price, @bid_increment, @entry_fee, @deposit, @start_time, @end_time, @auction_status, @participant_count);
        SELECT * FROM dbo.auctions WHERE product_id = @product_id ORDER BY created_at DESC
      `);

    const auction = result.recordset[result.recordset.length - 1];

    res.status(201).json({
      message: 'Auction created successfully',
      auction,
    });
  } catch (error) {
    console.error('Create auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
