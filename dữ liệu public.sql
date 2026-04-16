INSERT INTO dbo.product_categories (category_name) VALUES 
  (N'Trang sức'),
  (N'Mô hình');

INSERT INTO dbo.users (role, name, phone_num, citizen_id, email, address, balance, username, password, status) VALUES
  ('seller', N'Shop Trang Sức Kim Tiền', '0945678901', '123456789005', 'seller3@example.com', N'111 Lê Duẩn, Đà Nẵng', 2000000000, 'seller3', 'qwerqwerqwer', 'active'),
  ('buyer', N'Lê Thị C', '0956789012', '123456789006', 'buyer3@example.com', N'222 Kim Mã, Hà Nội', 150000000, 'buyer3', 'zxcvzxcvzxcv', 'active'),
  ('buyer', N'Hoàng Văn D', '0967890123', '123456789007', 'buyer4@example.com', N'333 Trần Phú, Hải Phòng', 450000000, 'buyer4', 'tyuityuityui', 'active');

INSERT INTO dbo.products (user_id, category_id, product_name, description, picture_url, product_status) VALUES
  ('U0005', 'C0006', N'Dây chuyền vàng 18K', N'Dây chuyền vàng 18K nguyên khối đính kim cương nhân tạo', 'https://via.placeholder.com/400x300?text=Gold+Necklace', 'sold'),
  ('U0005', 'C0005', N'Tai nghe AirPods Pro 2', N'Tai nghe không dây Apple AirPods Pro 2 nguyên seal', 'https://via.placeholder.com/400x300?text=AirPods+Pro+2', 'in auction'),
  ('U0001', 'C0007', N'Mô hình Gundam RX-78-2', N'Mô hình lắp ráp Gundam tỉ lệ 1/60 Perfect Grade', 'https://via.placeholder.com/400x300?text=Gundam+PG', 'pending');

INSERT INTO dbo.auctions (product_id, winner_id, opening_bid, bid_increment, entry_fee, deposit, current_price, registration_start_time, registration_end_time, start_time, end_time, auction_status, participant_count) VALUES
  ('P0006', 'U0006', 15000000, 500000, 200000, 2000000, 18000000, DATEADD(DAY, -10, GETDATE()), DATEADD(DAY, -5, GETDATE()), DATEADD(DAY, -4, GETDATE()), DATEADD(DAY, -1, GETDATE()), 'ended', 2),
  ('P0007', NULL, 4000000, 100000, 50000, 500000, 4300000, DATEADD(DAY, -2, GETDATE()), DATEADD(HOUR, -2, GETDATE()), DATEADD(HOUR, -1, GETDATE()), DATEADD(DAY, 2, GETDATE()), 'ongoing', 2);

INSERT INTO dbo.registration (auction_id, user_id, payment_status) VALUES
  ('A0005', 'U0002', 'paid'),
  ('A0005', 'U0006', 'paid'),
  ('A0005', 'U0007', 'refunded'),
  ('A0006', 'U0003', 'paid'),
  ('A0006', 'U0007', 'paid');

INSERT INTO dbo.bids_history (auction_id, user_id, bid_price) VALUES
  ('A0005', 'U0002', 15500000),
  ('A0005', 'U0006', 16000000),
  ('A0005', 'U0002', 17000000),
  ('A0005', 'U0006', 18000000),
  ('A0006', 'U0003', 4100000),
  ('A0006', 'U0007', 4200000),
  ('A0006', 'U0003', 4300000);

INSERT INTO dbo.invoices (winner_id, auction_id, due_date, payment_status) VALUES
  ('U0006', 'A0005', DATEADD(DAY, 5, GETDATE()), 'paid');