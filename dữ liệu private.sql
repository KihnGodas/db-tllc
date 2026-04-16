-- Insert sample data (Tùy chọn - Chạy sau khi tạo database)


USE HeThongDauGia5;
GO
-- Insert danh mục
INSERT INTO dbo.product_categories (category_name) VALUES 
  (N'Điện tử'),
  (N'Thời trang'),
  (N'Nội thất'),
  (N'Đồ cổ'),
  (N'Phụ kiện');

-- Insert người dùng mẫu
-- Password được hash (bcryptjs): test123
INSERT INTO dbo.users (role, name, phone_num, citizen_id, email, address, balance, username, password, status) VALUES
  ('seller', N'Shop Điện Tử', '0901234567', '123456789001', 'seller@example.com', N'456 Nguyễn Huệ, TP. Hồ Chí Minh', 1000000000, 'seller1', 'ádfasdfasdf', 'active'),
  ('buyer', N'Nguyễn Văn A', '0912345678', '123456789002', 'buyer1@example.com', N'123 Lê Lợi, TP. Hồ Chí Minh', 500000000, 'buyer1', 'ádgasdfasdfa', 'active'),
  ('buyer', N'Trần Thị B', '0923456789', '123456789003', 'buyer2@example.com', N'789 Võ Văn Kiệt, TP. Hồ Chí Minh', 300000000, 'buyer2', 'ávasdfasdfasdfasd', 'active'),
  ('seller', N'Shop Quần Áo', '0934567890', '123456789004', 'seller2@example.com', N'321 Nguyễn Thái Học, Hà Nội', 800000000, 'seller2', 'ádcasdcasdc', 'active');

-- Insert sản phẩm
INSERT INTO dbo.products (user_id, category_id, product_name, description, picture_url, product_status) VALUES
  ('U0001', 'C0001', N'iPhone 15 Pro Max', N'Điện thoại Apple iPhone 15 Pro Max 256GB màu xanh đen, mới 100%, full box, bảo hành 12 tháng', 'https://via.placeholder.com/400x300?text=iPhone+15', 'in auction'),
  ('U0001', 'C0001', N'MacBook Pro M3', N'Laptop Apple MacBook Pro 14 inch M3 Pro 8GB RAM 512GB SSD, mới nguyên seal box, bảo hành 12 tháng', 'https://via.placeholder.com/400x300?text=MacBook+Pro', 'in auction'),
  ('U0004', 'C0002', N'Áo Khoác Gucci Auth', N'Áo khoác Gucci chính hãng, hàng hiệu cao cấp, size L, màu đen', 'https://via.placeholder.com/400x300?text=Gucci+Jacket', 'pending'),
  ('U0004', 'C0003', N'Bàn Học Gỗ Sồi', N'Bàn học gỗ sồi nguyên khối, size 1.2m x 0.6m, thiết kế hiện đại', 'https://via.placeholder.com/400x300?text=Wooden+Desk', 'in auction'),
  ('U0004', 'C0004', N'Đồng Hồ Omega cổ', N'Đồng hồ Omega Speedmaster hãng cổ năm 1960, còn hoạt động tốt', 'https://via.placeholder.com/400x300?text=Omega+Watch', 'in auction');

-- Insert phiên đấu giá
INSERT INTO dbo.auctions (product_id, opening_bid, bid_increment, entry_fee, deposit, current_price, registration_start_time, registration_end_time, start_time, end_time, auction_status, participant_count) VALUES
  ('P0001', 20000000, 500000, 500000, 5000000, 25500000, GETDATE(), DATEADD(HOUR, 2, GETDATE()), DATEADD(HOUR, 2, GETDATE()), DATEADD(DAY, 3, GETDATE()), 'ongoing', 5),
  ('P0002', 30000000, 1000000, 1000000, 10000000, 0, GETDATE(), DATEADD(HOUR, 1, GETDATE()), DATEADD(HOUR, 3, GETDATE()), DATEADD(DAY, 5, GETDATE()), 'upcomming', 0),
  ('P0004', 5000000, 200000, 300000, 1000000, 5800000, GETDATE(), DATEADD(HOUR, 1, GETDATE()), GETDATE(), DATEADD(HOUR, 2, GETDATE()), 'ongoing', 3),
  ('P0005', 15000000, 500000, 500000, 3000000, 0, DATEADD(DAY, -1, GETDATE()), DATEADD(DAY, 6, GETDATE()), DATEADD(DAY, 7, GETDATE()), DATEADD(DAY, 10, GETDATE()), 'upcomming', 0);

-- Insert lịch sử trả giá
INSERT INTO dbo.bids_history (auction_id, user_id, bid_price) VALUES
  ('A0001', 'U0002', 21000000),
  ('A0001', 'U0003', 22000000),
  ('A0001', 'U0002', 23000000),
  ('A0001', 'U0003', 24000000),
  ('A0001', 'U0002', 25500000),
  ('A0003', 'U0002', 5200000),
  ('A0003', 'U0003', 5500000),
  ('A0003', 'U0002', 5800000);

-- Insert đăng ký tham gia
INSERT INTO dbo.registration (auction_id, user_id, payment_status) VALUES
  ('A0001', 'U0002', 'paid'),
  ('A0001', 'U0003', 'paid'),
  ('A0003', 'U0002', 'paid'),
  ('A0003', 'U0003', 'awaiting payment');

-- Insert hóa đơn
INSERT INTO dbo.invoices (winner_id, auction_id, due_date, payment_status) VALUES
  ('U0002', 'A0001', DATEADD(DAY, 3, GETDATE()), 'unpaid'),
  ('U0002', 'A0003', DATEADD(DAY, 2, GETDATE()), 'paid');

