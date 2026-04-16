CREATE DATABASE HeThongDauGia5;

USE HeThongDauGia5;

-- 1. Bảng Người dùng
CREATE TABLE dbo.users(
    stt INT IDENTITY(1,1) NOT NULL,
    user_id AS CAST(CONCAT('U', RIGHT('0000' + CAST(stt AS VARCHAR(4)), 4)) AS VARCHAR(5)) PERSISTED PRIMARY KEY,
    role VARCHAR(20) CONSTRAINT chk_role CHECK (role IN ('seller', 'buyer')),
    name NVARCHAR(50) NOT NULL,
    phone_num VARCHAR(20) NOT NULL,
    citizen_id VARCHAR (20) NOT NULL,
    email VARCHAR (50) NOT NULL,
    address NVARCHAR(100) NOT NULL,
    balance DECIMAL(18, 0) NOT NULL,
    username VARCHAR (50) NOT NULL,
    password VARCHAR (50) NOT NULL,
    status VARCHAR(20) CONSTRAINT chk_status CHECK (status IN('active', 'inactive', 'locked')) NOT NULL
);

-- 2. Bảng Danh mục
CREATE TABLE dbo.product_categories(
    stt INT IDENTITY(1,1) NOT NULL,
    category_id AS CAST(CONCAT('C', RIGHT('0000' + CAST(stt AS VARCHAR(4)), 4)) AS VARCHAR(5)) PERSISTED PRIMARY KEY,
    category_name NVARCHAR(50) NOT NULL
);

-- 3. Bảng Sản phẩm
CREATE TABLE dbo.products(
    stt INT IDENTITY(1,1) NOT NULL,
    product_id AS CAST(CONCAT('P', RIGHT('0000' + CAST(stt AS VARCHAR(4)), 4)) AS VARCHAR(5)) PERSISTED PRIMARY KEY,
    user_id VARCHAR(5) NOT NULL, -- Khóa ngoại kiểu chuỗi
    category_id VARCHAR(5) NOT NULL, -- Khóa ngoại kiểu chuỗi
    product_name NVARCHAR(50) NOT NULL,
    description NVARCHAR(MAX) NOT NULL,
    picture_url VARCHAR (200) NOT NULL,
    product_status VARCHAR (20) CONSTRAINT chk_product_status CHECK (product_status IN ('cancelled','in auction','sold','pending')) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
    FOREIGN KEY (category_id) REFERENCES dbo.product_categories(category_id)
);

-- 4. Bảng Phiên đấu giá
CREATE TABLE dbo.auctions(
    stt INT IDENTITY(1,1) NOT NULL,
    auction_id AS CAST(CONCAT('A', RIGHT('0000' + CAST(stt AS VARCHAR(4)), 4)) AS VARCHAR(5)) PERSISTED PRIMARY KEY,
    product_id VARCHAR(5) NOT NULL,
    winner_id VARCHAR(5) NULL, 
    opening_bid DECIMAL(18, 0) NOT NULL,
    bid_increment DECIMAL(18, 0) NOT NULL,
    entry_fee DECIMAL(18, 0) NOT NULL,
    deposit DECIMAL(18, 0) NOT NULL,
    current_price DECIMAL(18, 0) NOT NULL DEFAULT 0,
    registration_start_time DATETIME NOT NULL,
    registration_end_time DATETIME NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    auction_status VARCHAR (20) CONSTRAINT chk_auction_status CHECK (auction_status IN ('upcomming', 'ongoing', 'ended', 'cancelled')) NOT NULL,
    participant_count INT NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES dbo.products(product_id),
    FOREIGN KEY (winner_id) REFERENCES dbo.users(user_id)
);

-- 5. Bảng Lịch sử trả giá
CREATE TABLE dbo.bids_history(
    stt INT IDENTITY(1,1) NOT NULL,
    bid_id AS CAST(CONCAT('B', RIGHT('0000' + CAST(stt AS VARCHAR(4)), 4)) AS VARCHAR(5)) PERSISTED PRIMARY KEY,
    auction_id VARCHAR(5) NOT NULL,
    user_id VARCHAR(5) NOT NULL,
    bid_price DECIMAL(18, 0) NOT NULL,
    bid_time DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (auction_id) REFERENCES dbo.auctions(auction_id),
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id)
);

-- 6. Bảng Hóa đơn
CREATE TABLE dbo.invoices(
    stt INT IDENTITY(1,1) NOT NULL,
    invoice_id AS CAST(CONCAT('I', RIGHT('0000' + CAST(stt AS VARCHAR(4)), 4)) AS VARCHAR(5)) PERSISTED PRIMARY KEY,
    winner_id VARCHAR(5) NOT NULL,
    auction_id VARCHAR(5) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    due_date DATETIME NOT NULL,
    payment_status VARCHAR (20) CONSTRAINT chk_payment_status CHECK (payment_status IN ('unpaid', 'paid', 'overdue')) NOT NULL,
    FOREIGN KEY (winner_id) REFERENCES dbo.users(user_id),
    FOREIGN KEY (auction_id) REFERENCES dbo.auctions(auction_id)
);

-- 7. Bảng Đăng ký (Quan hệ N-N)
CREATE TABLE dbo.registration (
    auction_id VARCHAR(5) NOT NULL,
    user_id VARCHAR(5) NOT NULL,
    regis_date DATETIME NOT NULL DEFAULT GETDATE(),
    payment_status VARCHAR (20) CONSTRAINT nhk_payment_status CHECK (payment_status IN ('awaiting payment', 'paid', 'refunded')) NOT NULL,
    PRIMARY KEY (auction_id, user_id),
    FOREIGN KEY (auction_id) REFERENCES dbo.auctions(auction_id),
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id)
);

SELECT * FROM dbo.users;
SELECT * FROM dbo.product_categories;

ALTER TABLE dbo.users ALTER COLUMN password VARCHAR(255) NOT NULL;

SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'password';