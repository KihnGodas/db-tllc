const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// ─── Hằng số nghiệp vụ ───────────────────────────────────────────────────────
const EXTENSION_WINDOW_MS = 30 * 1000;   // 30 giây cuối → gia hạn
const EXTENSION_AMOUNT_MS = 2 * 60 * 1000; // gia hạn thêm 2 phút
const OVERDUE_DAYS        = 7;            // quá hạn sau 7 ngày

// ─── syncAuctionStatuses ─────────────────────────────────────────────────────
async function syncAuctionStatuses(pool, io) {
  const now = new Date();
  console.log(`🔄 Starting auction status sync at ${now.toISOString()} (local: ${now.toLocaleString()})`);
  
  // 1. upcomming → ongoing: Lấy danh sách trước khi update để broadcast thay đổi
  const statusChangeResult = await pool.request().query(`
    SELECT auction_id, start_time, end_time
    FROM dbo.auctions
    WHERE auction_status = 'upcomming'
      AND start_time <= GETDATE()
      AND end_time > GETDATE()
  `);

  const transitioningAuctions = statusChangeResult.recordset.map(r => r.auction_id);
  console.log(`📅 Found ${transitioningAuctions.length} auctions to transition from upcomming to ongoing:`, transitioningAuctions);
  
  if (statusChangeResult.recordset.length > 0) {
    console.log('📋 Auction details:', statusChangeResult.recordset.map(r => ({
      id: r.auction_id,
      start: r.start_time,
      end: r.end_time
    })));
  }

  if (transitioningAuctions.length > 0) {
    await pool.request().query(`
      UPDATE dbo.auctions
      SET auction_status = 'ongoing'
      WHERE auction_status = 'upcomming'
        AND start_time <= GETDATE()
        AND end_time > GETDATE()
    `);
    console.log('✅ Updated auctions to ongoing status');
  }

  // Broadcast status change to all clients watching these auctions
  if (io && transitioningAuctions.length > 0) {
    transitioningAuctions.forEach(auctionId => {
      io.emit('auction:statusChanged', {
        auction_id: auctionId,
        new_status: 'ongoing',
        timestamp: new Date().toISOString()
      });
      console.log(`📡 Broadcasted status change for auction ${auctionId} to ongoing`);
    });
  }

  // 2. Xử lý quá hạn thanh toán: mất cọc + đấu giá lại
  const overdueResult = await pool.request().query(`
    SELECT i.invoice_id, i.winner_id, i.auction_id, a.deposit
    FROM dbo.invoices i
    JOIN dbo.auctions a ON i.auction_id = a.auction_id
    WHERE i.payment_status = 'unpaid'
      AND i.due_date < GETDATE()
  `);

  for (const inv of overdueResult.recordset) {
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      // Đánh dấu hóa đơn overdue
      await new sql.Request(t)
        .input('invoice_id', sql.VarChar, inv.invoice_id)
        .query("UPDATE dbo.invoices SET payment_status = 'overdue' WHERE invoice_id = @invoice_id");

      // Cọc đã bị trừ khi đăng ký → không hoàn lại (chế tài)
      // Reset phiên để đấu giá lại
      await new sql.Request(t)
        .input('auction_id', sql.VarChar, inv.auction_id)
        .query(`
          UPDATE dbo.auctions
          SET auction_status = 'upcomming',
              winner_id = NULL,
              current_price = opening_bid,
              start_time = DATEADD(HOUR, 1, GETDATE()),
              end_time   = DATEADD(HOUR, 25, GETDATE())
          WHERE auction_id = @auction_id
        `);

      await t.commit();
    } catch (err) {
      await t.rollback();
      console.error('Overdue processing error:', err.message);
    }
  }

  // 3. Hoàn cọc cho người thua (phiên đã ended, có invoice paid/overdue)
  const refundResult = await pool.request().query(`
    SELECT r.user_id, r.auction_id, a.deposit
    FROM dbo.registration r
    JOIN dbo.auctions a ON r.auction_id = a.auction_id
    WHERE a.auction_status = 'ended'
      AND r.payment_status = 'paid'
      AND a.deposit > 0
      AND a.winner_id IS NOT NULL
      AND r.user_id <> a.winner_id
  `);

  for (const reg of refundResult.recordset) {
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      // Đánh dấu đã hoàn để không hoàn lại lần 2
      await new sql.Request(t)
        .input('auction_id', sql.VarChar, reg.auction_id)
        .input('user_id', sql.VarChar, reg.user_id)
        .query("UPDATE dbo.registration SET payment_status = 'refunded' WHERE auction_id = @auction_id AND user_id = @user_id");

      // Cộng lại tiền cọc
      await new sql.Request(t)
        .input('user_id', sql.VarChar, reg.user_id)
        .input('deposit', sql.Decimal(18, 0), reg.deposit)
        .query('UPDATE dbo.users SET balance = balance + @deposit WHERE user_id = @user_id');

      await t.commit();
    } catch (err) {
      await t.rollback();
      console.error('Refund deposit error:', err.message);
    }
  }

  // 4. Kết thúc phiên (end_time đã qua)
  const endedAuctionsResult = await pool.request().query(`
    SELECT auction_id
    FROM dbo.auctions
    WHERE auction_status = 'ongoing'
      AND end_time <= GETDATE()
  `);

  console.log(`⏰ Found ${endedAuctionsResult.recordset.length} auctions to end:`, endedAuctionsResult.recordset.map(r => r.auction_id));

  for (const row of endedAuctionsResult.recordset) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Step 1: Get auction details
      const auctionRequest = new sql.Request(transaction);
      auctionRequest.input('auction_id', sql.VarChar, row.auction_id);
      const auctionResult = await auctionRequest.query(`
        SELECT auction_id, current_price, winner_id, auction_status, deposit
        FROM dbo.auctions
        WHERE auction_id = @auction_id
      `);

      if (auctionResult.recordset.length === 0) { await transaction.rollback(); continue; }
      const auction = auctionResult.recordset[0];
      if (auction.auction_status !== 'ongoing') { await transaction.rollback(); continue; }

      // Step 2: Get winner from bids
      const winnerRequest = new sql.Request(transaction);
      winnerRequest.input('auction_id', sql.VarChar, row.auction_id);
      const winnerResult = await winnerRequest.query(`
        SELECT TOP 1 user_id, bid_price
        FROM dbo.bids_history
        WHERE auction_id = @auction_id
        ORDER BY bid_price DESC, bid_time ASC
      `);

      let winnerId = winnerResult.recordset.length > 0 ? winnerResult.recordset[0].user_id : (auction.winner_id || null);
      let winningPrice = winnerResult.recordset.length > 0 ? winnerResult.recordset[0].bid_price : (auction.current_price || 0);

      // Step 3: Update auction as ended
      await new sql.Request(transaction)
        .input('auction_id', sql.VarChar, row.auction_id)
        .input('winner_id', sql.VarChar, winnerId)
        .input('winning_price', sql.Decimal(18, 0), winningPrice)
        .query(`
          UPDATE dbo.auctions
          SET auction_status = 'ended', winner_id = @winner_id, current_price = @winning_price
          WHERE auction_id = @auction_id
        `);

      if (winnerId) {
        const invoiceCheck = await new sql.Request(transaction)
          .input('auction_id', sql.VarChar, row.auction_id)
          .query('SELECT invoice_id FROM dbo.invoices WHERE auction_id = @auction_id');

        if (invoiceCheck.recordset.length === 0) {
          const balanceResult = await new sql.Request(transaction)
            .input('winner_id', sql.VarChar, winnerId)
            .query('SELECT balance FROM dbo.users WHERE user_id = @winner_id');

          if (balanceResult.recordset.length > 0) {
            const winnerBalance = balanceResult.recordset[0].balance;
            // Người thắng đã nộp cọc khi đăng ký → chỉ cần trả phần còn lại
            const deposit = auction.deposit || 0;
            const remaining = Math.max(0, winningPrice - deposit);
            const canPay = winnerBalance >= remaining;
            const invoiceStatus = canPay ? 'paid' : 'unpaid';

            if (canPay && remaining > 0) {
              await new sql.Request(transaction)
                .input('winner_id', sql.VarChar, winnerId)
                .input('remaining', sql.Decimal(18, 0), remaining)
                .query('UPDATE dbo.users SET balance = balance - @remaining WHERE user_id = @winner_id');
            }

            await new sql.Request(transaction)
              .input('winner_id', sql.VarChar, winnerId)
              .input('auction_id', sql.VarChar, row.auction_id)
              .input('payment_status', sql.VarChar, invoiceStatus)
              .query(`
                INSERT INTO dbo.invoices (winner_id, auction_id, due_date, payment_status)
                VALUES (@winner_id, @auction_id, DATEADD(DAY, ${OVERDUE_DAYS}, GETDATE()), @payment_status)
              `);
          }
        }
      }

      await transaction.commit();

      // Emit socket event khi phiên kết thúc
      if (io) {
        io.to(`auction:${row.auction_id}`).emit('auction:ended', {
          auction_id: row.auction_id,
          winner_id: winnerId,
          final_price: winningPrice,
        });
      }
    } catch (error) {
      await transaction.rollback();
      console.error('End auction error:', error.message);
    }
  }
}

// Get all auctions
router.get('/auctions', async (req, res) => {
  try {
    const pool = getPool();
    const io = req.app.get('io');
    await syncAuctionStatuses(pool, io);
    const result = await pool.request()
      .query(`
        SELECT a.*, p.product_name, p.picture_url, p.category_id, c.category_name, u.name as seller_name, wu.name as winner_name
        FROM dbo.auctions a
        JOIN dbo.products p ON a.product_id = p.product_id
        LEFT JOIN dbo.product_categories c ON p.category_id = c.category_id
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
    const io = req.app.get('io');
    await syncAuctionStatuses(pool, io);

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

// Get invoices for current user (winner)
router.get('/invoices', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const pool = getPool();

    // Ensure ended auctions have invoices created/updated.
    const io = req.app.get('io');
    await syncAuctionStatuses(pool, io);

    const result = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query(`
        SELECT
          i.*,
          a.current_price,
          a.winner_id,
          a.deposit,
          p.product_name,
          p.picture_url
        FROM dbo.invoices i
        JOIN dbo.auctions a ON i.auction_id = a.auction_id
        JOIN dbo.products p ON a.product_id = p.product_id
        WHERE i.winner_id = @user_id
        ORDER BY i.created_at DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get invoices error:', error);
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
    const io = req.app.get('io');
    await syncAuctionStatuses(pool, io);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    // Step 1: Lock and get auction
    const auctionReq = new sql.Request(transaction);
    auctionReq.input('auction_id', sql.VarChar, auction_id);
    const checkAuction = await auctionReq.query(`
      SELECT *
      FROM dbo.auctions WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
      WHERE auction_id = @auction_id
    `);

    if (checkAuction.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Auction not found' });
    }

    const auction = checkAuction.recordset[0];

    // ✅ Verify auction status is 'ongoing'
    if (auction.auction_status !== 'ongoing') {
      await transaction.rollback();
      return res.status(400).json({ 
        error: `Trạng thái phiên không hợp lệ để đặt giá. Phiên hiện tại: ${auction.auction_status === 'upcomming' ? 'Sắp bắt đầu' : auction.auction_status === 'ended' ? 'Đã kết thúc' : 'Đã hủy'}`,
        currentStatus: auction.auction_status
      });
    }

    // Step 2: Check registration
    const regReq = new sql.Request(transaction);
    regReq.input('auction_id', sql.VarChar, auction_id);
    regReq.input('user_id', sql.VarChar, user_id);
    const checkReg = await regReq.query('SELECT * FROM dbo.registration WHERE auction_id = @auction_id AND user_id = @user_id');

    if (checkReg.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Bạn phải đăng ký tham gia phiên đấu giá trước khi có thể đặt giá' });
    }

    // Validate bước giá
    const minBid = Number(auction.current_price) + Number(auction.bid_increment);
    if (bid_price < minBid) {
      await transaction.rollback();
      return res.status(400).json({
        error: `Giá đặt tối thiểu là ${minBid.toLocaleString('vi-VN')} VND (giá hiện tại + bước giá ${Number(auction.bid_increment).toLocaleString('vi-VN')} VND)`
      });
    }

    // Step 3: Check user balance
    const userReq = new sql.Request(transaction);
    userReq.input('user_id', sql.VarChar, user_id);
    const userResult = await userReq.query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    if (userResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const userBalance = userResult.recordset[0].balance;
    if (userBalance < bid_price) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Insufficient balance. Please top up your account.' });
    }

    // Step 4: Insert bid
    const bidReq = new sql.Request(transaction);
    bidReq.input('auction_id', sql.VarChar, auction_id);
    bidReq.input('user_id', sql.VarChar, user_id);
    bidReq.input('bid_price', sql.Decimal(18, 0), bid_price);
    await bidReq.query(`INSERT INTO dbo.bids_history (auction_id, user_id, bid_price)
      VALUES (@auction_id, @user_id, @bid_price)`);

    // Step 5: Update auction with new winning bid
    const updateReq = new sql.Request(transaction);
    updateReq.input('auction_id', sql.VarChar, auction_id);
    updateReq.input('bid_price', sql.Decimal(18, 0), bid_price);
    updateReq.input('user_id', sql.VarChar, user_id);
    await updateReq.query(`UPDATE dbo.auctions 
      SET current_price = @bid_price, winner_id = @user_id
      WHERE auction_id = @auction_id`);
    
    await transaction.commit();
    transaction = null;

    // ── Gia hạn 2 phút nếu bid trong 30 giây cuối ──────────────────────────
    const poolAfter = getPool();
    const auctionNow = await poolAfter.request()
      .input('auction_id', sql.VarChar, auction_id)
      .query('SELECT auction_id, current_price, winner_id, end_time FROM dbo.auctions WHERE auction_id = @auction_id');

    const updated = auctionNow.recordset[0];
    let newEndTime = updated.end_time;

    const msLeft = new Date(updated.end_time).getTime() - Date.now();
    if (msLeft > 0 && msLeft <= EXTENSION_WINDOW_MS) {
      newEndTime = new Date(new Date(updated.end_time).getTime() + EXTENSION_AMOUNT_MS);
      await poolAfter.request()
        .input('auction_id', sql.VarChar, auction_id)
        .input('new_end_time', sql.DateTime, newEndTime)
        .query('UPDATE dbo.auctions SET end_time = @new_end_time WHERE auction_id = @auction_id');
    }

    // Emit real-time update
    if (io && updated) {
      io.to(`auction:${auction_id}`).emit('auction:bidsUpdated', {
        auction_id,
        current_price: updated.current_price,
        winner_id: updated.winner_id,
        end_time: newEndTime,
      });
    }

    res.json({ message: 'Đặt giá thành công', bid_price, end_time: newEndTime });
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
    await syncAuctionStatuses(pool, req.app.get('io'));

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

    // Chỉ cho đăng ký khi phiên sắp bắt đầu (upcomming)
    // Phiên đang diễn ra (ongoing) chỉ cho đặt giá, không cho đăng ký thêm
    if (auction.auction_status === 'ongoing') {
      return res.status(400).json({ error: 'Phiên đấu giá đang diễn ra, không thể đăng ký mới.' });
    }

    if (auction.auction_status === 'ended' || auction.auction_status === 'cancelled') {
      return res.status(400).json({ error: 'Phiên đấu giá đã kết thúc, không thể đăng ký.' });
    }

    // Kiểm tra thời gian đăng ký
    const now = new Date();
    if (auction.registration_start_time && now < new Date(auction.registration_start_time)) {
      return res.status(400).json({ error: `Chưa đến thời gian mở đăng ký. Đăng ký mở lúc: ${new Date(auction.registration_start_time).toLocaleString('vi-VN')}` });
    }
    if (auction.registration_end_time && now > new Date(auction.registration_end_time)) {
      return res.status(400).json({ error: `Đã hết thời gian đăng ký (kết thúc lúc: ${new Date(auction.registration_end_time).toLocaleString('vi-VN')})` });
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
    const registeredAt = new Date();

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
      newBalance: newBalance,
      registered_at: registeredAt,
      auction_start: auction.start_time,
      auction_end: auction.end_time,
    });
  } catch (error) {
    console.error('Register auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create auction (seller only)
router.post('/auctions', authMiddleware, async (req, res) => {
  try {
    const { product_id, opening_bid, bid_increment, entry_fee, deposit,
            registration_start_time, registration_end_time,
            start_time, end_time, auction_status } = req.body;
    const user_id = req.user.user_id;

    if (!product_id || !opening_bid || !bid_increment || !start_time || !end_time
        || !registration_start_time || !registration_end_time) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bao gồm thời gian đăng ký' });
    }

    const pool = getPool();

    const checkProduct = await pool.request()
      .input('product_id', sql.VarChar, product_id)
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT * FROM dbo.products WHERE product_id = @product_id AND user_id = @user_id');

    if (checkProduct.recordset.length === 0) {
      return res.status(403).json({ error: 'Sản phẩm không tồn tại hoặc không thuộc về bạn' });
    }

    const regStartDate  = new Date(registration_start_time);
    const regEndDate    = new Date(registration_end_time);
    const startDate     = new Date(start_time);
    const endDate       = new Date(end_time);

    if (regStartDate >= regEndDate) {
      return res.status(400).json({ error: 'Thời gian kết thúc đăng ký phải sau thời gian mở đăng ký' });
    }
    if (regEndDate > startDate) {
      return res.status(400).json({ error: 'Thời gian kết thúc đăng ký phải trước hoặc bằng thời gian bắt đầu đấu giá' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ error: 'Thời gian kết thúc đấu giá phải sau thời gian bắt đầu' });
    }

    const durationMs = endDate - startDate;
    const minMs = 30 * 60 * 1000;       // 30 phút
    const maxMs = 24 * 60 * 60 * 1000;  // 1 ngày
    if (durationMs < minMs) {
      return res.status(400).json({ error: 'Thời gian đấu giá tối thiểu là 30 phút' });
    }
    if (durationMs > maxMs) {
      return res.status(400).json({ error: 'Thời gian đấu giá tối đa là 1 ngày (24 giờ)' });
    }

    const result = await pool.request()
      .input('product_id', sql.VarChar, product_id)
      .input('opening_bid', sql.Decimal(18, 0), opening_bid)
      .input('current_price', sql.Decimal(18, 0), opening_bid)
      .input('bid_increment', sql.Decimal(18, 0), bid_increment)
      .input('entry_fee', sql.Decimal(18, 0), entry_fee || 0)
      .input('deposit', sql.Decimal(18, 0), deposit || 0)
      .input('registration_start_time', sql.DateTime, regStartDate)
      .input('registration_end_time', sql.DateTime, regEndDate)
      .input('start_time', sql.DateTime, startDate)
      .input('end_time', sql.DateTime, endDate)
      .input('auction_status', sql.VarChar, auction_status || 'upcomming')
      .input('participant_count', sql.Int, 0)
      .query(`
        INSERT INTO dbo.auctions
          (product_id, opening_bid, current_price, bid_increment, entry_fee, deposit,
           registration_start_time, registration_end_time, start_time, end_time,
           auction_status, participant_count)
        VALUES
          (@product_id, @opening_bid, @current_price, @bid_increment, @entry_fee, @deposit,
           @registration_start_time, @registration_end_time, @start_time, @end_time,
           @auction_status, @participant_count);
        SELECT TOP 1 * FROM dbo.auctions WHERE stt = SCOPE_IDENTITY()
      `);

    res.status(201).json({ message: 'Tạo phiên đấu giá thành công', auction: result.recordset[0] });
  } catch (error) {
    console.error('Create auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pay invoice using balance
router.post('/invoices/:invoice_id/pay', authMiddleware, async (req, res) => {
  let transaction;
  try {
    const { invoice_id } = req.params;
    const { method } = req.body; // 'balance' hoặc 'qr'
    const user_id = req.user.user_id;
    const pool = getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const invoiceResult = await new sql.Request(transaction)
      .input('invoice_id', sql.VarChar, invoice_id)
      .input('user_id', sql.VarChar, user_id)
      .query(`
        SELECT i.*, a.current_price, a.deposit
        FROM dbo.invoices i
        JOIN dbo.auctions a ON i.auction_id = a.auction_id
        WHERE i.invoice_id = @invoice_id AND i.winner_id = @user_id
      `);

    if (invoiceResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    }

    const invoice = invoiceResult.recordset[0];

    if (invoice.payment_status === 'paid') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Hóa đơn đã được thanh toán' });
    }
    if (invoice.payment_status === 'overdue') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Hóa đơn đã quá hạn, không thể thanh toán' });
    }

    // Chỉ thanh toán phần còn lại (tổng giá - cọc đã nộp)
    const deposit = invoice.deposit || 0;
    const amount = Math.max(0, invoice.current_price - deposit);

    if (method === 'qr') {
      // Thanh toán QR: chỉ đánh dấu paid, không trừ số dư (đã thanh toán ngoài)
      await new sql.Request(transaction)
        .input('invoice_id', sql.VarChar, invoice_id)
        .query("UPDATE dbo.invoices SET payment_status = 'paid' WHERE invoice_id = @invoice_id");
      await transaction.commit();
      return res.json({ message: 'Xác nhận thanh toán QR thành công', method: 'qr' });
    }

    // Thanh toán bằng số dư
    const userResult = await new sql.Request(transaction)
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    if (userResult.recordset[0].balance < amount) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Số dư không đủ để thanh toán' });
    }

    await new sql.Request(transaction)
      .input('user_id', sql.VarChar, user_id)
      .input('amount', sql.Decimal(18, 0), amount)
      .query('UPDATE dbo.users SET balance = balance - @amount WHERE user_id = @user_id');

    await new sql.Request(transaction)
      .input('invoice_id', sql.VarChar, invoice_id)
      .query("UPDATE dbo.invoices SET payment_status = 'paid' WHERE invoice_id = @invoice_id");

    await transaction.commit();

    const newBalanceResult = await pool.request()
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT balance FROM dbo.users WHERE user_id = @user_id');

    res.json({ message: 'Thanh toán thành công', newBalance: newBalanceResult.recordset[0].balance, method: 'balance' });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('Pay invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all auction history (tất cả phiên từng tồn tại)
router.get('/auctions/history/all', async (req, res) => {
  try {
    const pool = getPool();
    await syncAuctionStatuses(pool);
    const result = await pool.request()
      .query(`
        SELECT a.*, p.product_name, p.picture_url, u.name as seller_name, wu.name as winner_name,
               i.payment_status as invoice_status, i.invoice_id
        FROM dbo.auctions a
        JOIN dbo.products p ON a.product_id = p.product_id
        JOIN dbo.users u ON p.user_id = u.user_id
        LEFT JOIN dbo.users wu ON a.winner_id = wu.user_id
        LEFT JOIN dbo.invoices i ON a.auction_id = i.auction_id
        ORDER BY a.created_at DESC
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Get auction history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check registration status for current user
router.get('/auctions/:auction_id/registration-status', authMiddleware, async (req, res) => {
  try {
    const { auction_id } = req.params;
    const user_id = req.user.user_id;
    const pool = getPool();

    const result = await pool.request()
      .input('auction_id', sql.VarChar, auction_id)
      .input('user_id', sql.VarChar, user_id)
      .query('SELECT * FROM dbo.registration WHERE auction_id = @auction_id AND user_id = @user_id');

    const isRegistered = result.recordset.length > 0;
    res.json({ isRegistered });
  } catch (error) {
    console.error('Check registration status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get invoice details for printing
router.get('/invoices/:invoice_id/details', authMiddleware, async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const user_id = req.user.user_id;
    const pool = getPool();

    const result = await pool.request()
      .input('invoice_id', sql.VarChar, invoice_id)
      .input('user_id', sql.VarChar, user_id)
      .query(`
        SELECT 
          i.invoice_id,
          i.winner_id,
          i.created_at,
          i.due_date,
          i.payment_status,
          a.auction_id,
          a.current_price,
          a.deposit,
          a.start_time,
          a.end_time,
          p.product_id,
          p.product_name,
          p.picture_url,
          p.description,
          wu.name as winner_name,
          wu.email as winner_email,
          wu.phone_num as winner_phone,
          wu.address as winner_address,
          su.name as seller_name,
          su.email as seller_email,
          su.phone_num as seller_phone,
          su.address as seller_address,
          c.category_name
        FROM dbo.invoices i
        JOIN dbo.auctions a ON i.auction_id = a.auction_id
        JOIN dbo.products p ON a.product_id = p.product_id
        JOIN dbo.users wu ON i.winner_id = wu.user_id
        JOIN dbo.users su ON p.user_id = su.user_id
        LEFT JOIN dbo.product_categories c ON p.category_id = c.category_id
        WHERE i.invoice_id = @invoice_id AND i.winner_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = result.recordset[0];
    
    // Calculate remaining amount (total price - deposit already paid)
    const totalAmount = Number(invoice.current_price);
    const depositPaid = Number(invoice.deposit);
    const remainingAmount = Math.max(0, totalAmount - depositPaid);

    res.json({
      invoice_id: invoice.invoice_id,
      invoice_date: invoice.created_at,
      due_date: invoice.due_date,
      payment_status: invoice.payment_status,
      product: {
        product_id: invoice.product_id,
        product_name: invoice.product_name,
        category: invoice.category_name,
        description: invoice.description,
        picture_url: invoice.picture_url
      },
      auction: {
        auction_id: invoice.auction_id,
        start_time: invoice.start_time,
        end_time: invoice.end_time,
        final_price: totalAmount
      },
      buyer: {
        name: invoice.winner_name,
        email: invoice.winner_email,
        phone: invoice.winner_phone,
        address: invoice.winner_address
      },
      seller: {
        name: invoice.seller_name,
        email: invoice.seller_email,
        phone: invoice.seller_phone,
        address: invoice.seller_address
      },
      amounts: {
        final_price: totalAmount,
        deposit_paid: depositPaid,
        remaining_due: remainingAmount
      }
    });
  } catch (error) {
    console.error('Get invoice details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Print invoice as HTML
router.get('/invoices/:invoice_id/print-html', authMiddleware, async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const user_id = req.user.user_id;
    const pool = getPool();

    const result = await pool.request()
      .input('invoice_id', sql.VarChar, invoice_id)
      .input('user_id', sql.VarChar, user_id)
      .query(`
        SELECT 
          i.invoice_id,
          i.winner_id,
          i.created_at,
          i.due_date,
          i.payment_status,
          a.auction_id,
          a.current_price,
          a.deposit,
          a.start_time,
          a.end_time,
          p.product_id,
          p.product_name,
          p.picture_url,
          wu.name as winner_name,
          wu.email as winner_email,
          wu.phone_num as winner_phone,
          wu.address as winner_address,
          su.name as seller_name,
          su.email as seller_email,
          su.phone_num as seller_phone,
          su.address as seller_address
        FROM dbo.invoices i
        JOIN dbo.auctions a ON i.auction_id = a.auction_id
        JOIN dbo.products p ON a.product_id = p.product_id
        JOIN dbo.users wu ON i.winner_id = wu.user_id
        JOIN dbo.users su ON p.user_id = su.user_id
        WHERE i.invoice_id = @invoice_id AND i.winner_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).send('Invoice not found');
    }

    const inv = result.recordset[0];
    const totalAmount = Number(inv.current_price);
    const depositPaid = Number(inv.deposit);
    const remainingAmount = Math.max(0, totalAmount - depositPaid);
    const invoiceDate = new Date(inv.created_at).toLocaleDateString('vi-VN');
    const dueDate = new Date(inv.due_date).toLocaleDateString('vi-VN');
    const auctionEndDate = new Date(inv.end_time).toLocaleString('vi-VN');

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hóa Đơn ${inv.invoice_id}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', 'Segoe UI', sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    .invoice-container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #2c3e50;
    }
    .company-info h1 {
      font-size: 28px;
      color: #2c3e50;
      margin-bottom: 5px;
    }
    .company-info p {
      color: #666;
      font-size: 13px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-meta h2 {
      font-size: 24px;
      color: #e74c3c;
      margin-bottom: 10px;
    }
    .meta-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 5px;
      font-size: 14px;
    }
    .meta-label {
      font-weight: bold;
      margin-right: 10px;
      color: #2c3e50;
      min-width: 130px;
      text-align: right;
    }
    .meta-value {
      color: #333;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #2c3e50;
      background: #ecf0f1;
      padding: 10px 15px;
      margin-bottom: 15px;
      border-left: 4px solid #3498db;
    }
    .section-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    .info-column h3 {
      font-size: 13px;
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 8px;
    }
    .info-column p {
      font-size: 13px;
      color: #555;
      margin-bottom: 5px;
    }
    .product-section {
      margin-bottom: 30px;
    }
    .product-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .product-table th {
      background: #2c3e50;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 13px;
      font-weight: bold;
    }
    .product-table td {
      padding: 15px 12px;
      border-bottom: 1px solid #ddd;
      font-size: 13px;
    }
    .product-table tr:hover {
      background: #f9f9f9;
    }
    .product-image {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 4px;
    }
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-top: 30px;
    }
    .summary-box {
      width: 350px;
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 20px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .summary-row.total {
      border-top: 2px solid #2c3e50;
      padding-top: 12px;
      font-weight: bold;
      font-size: 16px;
      color: #2c3e50;
    }
    .label {
      color: #666;
    }
    .value {
      color: #333;
      font-weight: bold;
    }
    .status-paid {
      color: #27ae60;
      font-weight: bold;
    }
    .status-unpaid {
      color: #e74c3c;
      font-weight: bold;
    }
    .status-overdue {
      color: #c0392b;
      font-weight: bold;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    .print-button {
      text-align: center;
      margin-bottom: 30px;
    }
    .print-button button {
      background: #3498db;
      color: white;
      border: none;
      padding: 10px 30px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      transition: background 0.3s;
    }
    .print-button button:hover {
      background: #2980b9;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .invoice-container {
        box-shadow: none;
        padding: 0;
      }
      .print-button {
        display: none;
      }
      .footer {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-button">
    <button onclick="window.print()">🖨️ In Hóa Đơn (Ctrl+P hoặc Cmd+P)</button>
  </div>

  <div class="invoice-container">
    <!-- Header -->
    <div class="invoice-header">
      <div class="company-info">
        <h1>🏆 AuctionHub</h1>
        <p>Hệ Thống Đấu Giá Trực Tuyến</p>
      </div>
      <div class="invoice-meta">
        <h2>HÓA ĐƠN</h2>
        <div class="meta-row">
          <span class="meta-label">Mã hóa đơn:</span>
          <span class="meta-value"><strong>${inv.invoice_id}</strong></span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Ngày tạo:</span>
          <span class="meta-value">${invoiceDate}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Ngày đáo hạn:</span>
          <span class="meta-value">${dueDate}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Trạng thái:</span>
          <span class="meta-value status-${inv.payment_status}">
            ${inv.payment_status === 'paid' ? '✓ Đã thanh toán' : inv.payment_status === 'unpaid' ? '⏳ Chưa thanh toán' : '⚠️ Quá hạn'}
          </span>
        </div>
      </div>
    </div>

    <!-- Buyer & Seller Info -->
    <div class="section">
      <div class="section-title">THÔNG TIN BÊN LIÊN QUAN</div>
      <div class="section-content">
        <div class="info-column">
          <h3>👤 NGƯỜI MUA (NGƯỜI THẮNG)</h3>
          <p><strong>${inv.winner_name}</strong></p>
          <p>📧 ${inv.winner_email}</p>
          <p>📱 ${inv.winner_phone}</p>
          <p>📍 ${inv.winner_address}</p>
        </div>
        <div class="info-column">
          <h3>🏬 NGƯỜI BÁN</h3>
          <p><strong>${inv.seller_name}</strong></p>
          <p>📧 ${inv.seller_email}</p>
          <p>📱 ${inv.seller_phone}</p>
          <p>📍 ${inv.seller_address}</p>
        </div>
      </div>
    </div>

    <!-- Product Details -->
    <div class="section product-section">
      <div class="section-title">CHI TIẾT SẢN PHẨM ĐẤU GIÁ</div>
      <table class="product-table">
        <thead>
          <tr>
            <th style="width: 100px">Hình Ảnh</th>
            <th style="flex: 1">Sản Phẩm</th>
            <th style="width: 120px">Mã Đấu Giá</th>
            <th style="width: 120px">Giá Khởi Điểm</th>
            <th style="width: 120px">Giá Cuối (Thắng)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <img src="${inv.picture_url}" alt="${inv.product_name}" class="product-image" onerror="this.style.display='none'">
            </td>
            <td><strong>${inv.product_name}</strong></td>
            <td>#${inv.auction_id}</td>
            <td>N/A</td>
            <td style="font-weight: bold; color: #e74c3c">${totalAmount.toLocaleString('vi-VN')} VND</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title" style="margin-top: 30px;">THỜI GIAN ĐẤU GIÁ</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px;">
        <div>
          <p style="color: #666; font-size: 13px; margin-bottom: 5px;">🕐 Thời gian kết thúc:</p>
          <p style="font-weight: bold; font-size: 14px;">${auctionEndDate}</p>
        </div>
        <div>
          <p style="color: #666; font-size: 13px; margin-bottom: 5px;">🔑 Mã đấu giá:</p>
          <p style="font-weight: bold; font-size: 14px;">${inv.auction_id}</p>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <div class="summary-section">
      <div class="summary-box">
        <div class="summary-row">
          <span class="label">Giá sản phẩm:</span>
          <span class="value">${totalAmount.toLocaleString('vi-VN')} VND</span>
        </div>
        <div class="summary-row">
          <span class="label">Cọc đã nộp:</span>
          <span class="value">${depositPaid.toLocaleString('vi-VN')} VND</span>
        </div>
        <div class="summary-row total">
          <span class="label">Còn phải trả:</span>
          <span class="value">${remainingAmount.toLocaleString('vi-VN')} VND</span>
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div class="section" style="margin-top: 30px;">
      <div class="section-title">GHI CHÚ</div>
      <p style="font-size: 13px; color: #555; line-height: 1.8;">
        • Hóa đơn này là bằng chứng xác nhận kết quả đấu giá của bạn.<br>
        • Vui lòng thanh toán đầy đủ số tiền còn lại trước ngày ${dueDate}.<br>
        • Nếu quá hạn thanh toán, bạn sẽ mất quyền nhận sản phẩm và cọc không được hoàn lại.<br>
        • Liên hệ người bán để sắp xếp nhận hàng sau khi thanh toán hoàn thành.
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Hệ Thống Đấu Giá Trực Tuyến AuctionHub | Được phát hành vào ${invoiceDate}</p>
    </div>
  </div>
</body>
</html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Print invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// Export syncAuctionStatuses for background job
module.exports.syncAuctionStatuses = syncAuctionStatuses;

// ─── Manual sync endpoint for debugging/admin purposes ──────────────────────
router.post('/auctions/sync-statuses', async (req, res) => {
  try {
    const pool = getPool();
    const io = req.app.get('io');
    await syncAuctionStatuses(pool, io);
    res.json({ message: 'Auction statuses synced successfully' });
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Debug endpoint to check auction statuses ───────────────────────────────
router.get('/auctions/status-summary', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        auction_status,
        COUNT(*) as count,
        STRING_AGG(CAST(auction_id AS VARCHAR(10)), ', ') as auction_ids
      FROM dbo.auctions
      GROUP BY auction_status
    `);
    
    const now = new Date();
    const summary = {
      current_time: now.toISOString(),
      local_time: now.toLocaleString(),
      statuses: result.recordset
    };
    
    res.json(summary);
  } catch (error) {
    console.error('Status summary error:', error);
    res.status(500).json({ error: error.message });
  }
});
