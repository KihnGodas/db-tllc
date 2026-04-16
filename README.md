# 🏆 Hệ Thống Đấu Giá Trực Tuyến - AuctionHub

Một hệ thống đấu giá trực tuyến hiện đại được xây dựng bằng **Node.js**, **SQL Server**, và **JavaScript** frontend.

## 📋 Yêu Cầu Hệ Thống

- **Node.js** >= 14.0
- **SQL Server** 2019+ hoặc **Azure SQL Database**
- **npm** >= 6.0

## 🏗️ Cấu Trúc Dự Án

```
auction-website/
├── backend/                 # Node.js API Server
│   ├── config/
│   │   └── db.js           # Database configuration
│   ├── middleware/
│   │   └── auth.js         # JWT Authentication middleware
│   ├── routes/
│   │   ├── authRoutes.js   # User registration & login
│   │   ├── auctionRoutes.js # Auction management
│   │   └── productRoutes.js # Product management
│   ├── server.js           # Main server file
│   ├── package.json        # Dependencies
│   └── .env.example        # Environment variables template
└── frontend/               # Web Interface
    ├── index.html          # Main HTML page
    ├── styles.css          # Styling
    └── script.js           # Frontend JavaScript
```

## 📁 Database Setup

### 1️⃣ Tạo Database từ SQL Script

Chạy file `HeThongDauGia2.sql` từ folder `db`:

```sql
-- Kết nối tới SQL Server
sqlcmd -S localhost -U sa -P your_password -i HeThongDauGia2.sql
```

Hoặc sử dụng **SQL Server Management Studio** (SSMS):
- Mở SSMS
- Kết nối tới SQL Server của bạn
- Mở file `HeThongDauGia2.sql`
- Nhấn F5 để thực thi

### 2️⃣ Kết nối tới Azure SQL (Tùy Chọn)

Nếu dùng Azure SQL Database, sửa `.env`:

```env
DB_SERVER=your-server.database.windows.net
DB_USER=your-username@your-server
DB_PASSWORD=your-password
DB_NAME=HeThongDauGia5
```

## 🚀 Cài Đặt & Chạy Backend

### 1️⃣ Cài Đặt Dependencies

```bash
cd backend
npm install
```

### 2️⃣ Cấu Hình Environment

Sao chép `.env.example` thành `.env` và sửa cấu hình:

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
# SQL Server Configuration
DB_SERVER=localhost
DB_USER=sa
DB_PASSWORD=your_password
DB_NAME=HeThongDauGia5
DB_PORT=1433

# JWT Configuration
JWT_SECRET=your_secret_key_here_12345
JWT_EXPIRE=7d

# Server Configuration
PORT=5000
NODE_ENV=development
```

### 3️⃣ Chạy Server

**Development Mode** (với auto-reload):
```bash
npm run dev
```

**Production Mode**:
```bash
npm start
```

Server sẽ chạy tại: `http://localhost:5000`

## 🌐 Chạy Frontend

### 1️⃣ Cách Đơn Giản - Dùng Python HTTP Server

```bash
cd frontend
python -m http.server 8000
```

Hoặc dùng Node.js:
```bash
npx http-server
```

Mở trình duyệt: `http://localhost:8000`

### 2️⃣ Cách Nâng Cao - Dùng Live Server

Cài đặt extension **Live Server** trong VS Code, rồi click chuột phải > "Open with Live Server"

## 📚 API Documentation

### Authentication

#### Đăng Ký
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "user123",
  "password": "password123",
  "name": "Nguyễn Văn A",
  "email": "user@example.com",
  "phone_num": "0123456789",
  "citizen_id": "123456789",
  "address": "123 Đường ABC, Thành phố",
  "role": "buyer" // hoặc "seller"
}

Response:
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": "U0001",
    "username": "user123",
    "role": "buyer",
    "email": "user@example.com"
  }
}
```

#### Đăng Nhập
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "user123",
  "password": "password123"
}

Response:
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": "U0001",
    "username": "user123",
    "role": "buyer",
    "email": "user@example.com",
    "balance": 50000000
  }
}
```

### Auctions

#### Lấy Danh Sách Phiên Đấu Giá
```http
GET /api/auctions

Response:
[
  {
    "auction_id": "A0001",
    "product_id": "P0001",
    "product_name": "iPad Pro 2024",
    "picture_url": "...",
    "seller_name": "Bán Hàng",
    "current_price": 15000000,
    "opening_bid": 10000000,
    "bid_increment": 100000,
    "auction_status": "ongoing",
    "end_time": "2024-04-20T18:00:00Z",
    "participant_count": 5
  }
]
```

#### Lấy Chi Tiết Phiên Đấu Giá
```http
GET /api/auctions/:auction_id

Response:
{
  "auction_id": "A0001",
  "product_name": "iPad Pro 2024",
  "description": "...",
  "seller_name": "Bán Hàng",
  "seller_email": "seller@example.com",
  "current_price": 15000000,
  "opening_bid": 10000000,
  "bid_increment": 100000,
  "total_bids": 12,
  ...
}
```

#### Đặt Giá
```http
POST /api/auctions/:auction_id/bid
Authorization: Bearer {token}
Content-Type: application/json

{
  "bid_price": 15500000
}

Response:
{
  "message": "Bid placed successfully",
  "bid_price": 15500000
}
```

#### Lịch Sử Trả Giá
```http
GET /api/auctions/:auction_id/bids

Response:
[
  {
    "bid_id": "B0001",
    "user_id": "U0001",
    "username": "buyer123",
    "name": "Nguyễn Văn B",
    "bid_price": 15500000,
    "bid_time": "2024-04-15T14:30:00Z"
  }
]
```

#### Đăng Ký Tham Gia Phiên Đấu Giá
```http
POST /api/auctions/:auction_id/register
Authorization: Bearer {token}

Response:
{
  "message": "Registration successful",
  "entry_fee": 500000,
  "deposit": 5000000
}
```

### Products

#### Lấy Danh Sách Sản Phẩm
```http
GET /api/products

Response:
[
  {
    "product_id": "P0001",
    "product_name": "iPad Pro 2024",
    "description": "...",
    "category_name": "Điện tử",
    "seller_name": "Bán Hàng",
    "picture_url": "...",
    "product_status": "in auction"
  }
]
```

#### Lấy Danh Mục
```http
GET /api/products/categories

Response:
[
  {
    "category_id": "C0001",
    "category_name": "Điện tử"
  },
  {
    "category_id": "C0002",
    "category_name": "Thời trang"
  }
]
```

#### Tạo Sản Phẩm
```http
POST /api/products
Authorization: Bearer {token}
Content-Type: application/json

{
  "product_name": "Samsung Galaxy S24",
  "description": "Điện thoại flagship mới nhất",
  "category_id": "C0001",
  "picture_url": "https://example.com/image.jpg"
}

Response:
{
  "message": "Product created successfully",
  "product": {
    "product_id": "P0005",
    "product_name": "Samsung Galaxy S24",
    ...
  }
}
```

## 🔐 Bảo Mật

- ✅ Mật khẩu được hash bằng **bcryptjs**
- ✅ Authentication dùng **JWT (JSON Web Tokens)**
- ✅ CORS được cấu hình để bảo vệ API
- ✅ Kết nối SQL Server mã hóa

## 🛠️ Troubleshooting

### "Cannot connect to database"
- Kiểm tra SQL Server đang chạy
- Kiểm tra tên server, username, password trong `.env`
- Kiểm tra database `HeThongDauGia5` đã được tạo

### "CORS error in browser"
- Backend CORS đã được enable
- Kiểm tra frontend URL kết nối đúng `http://localhost:5000`

### "Token expired"
- Đăng nhập lại
- Tăng `JWT_EXPIRE` trong `.env` nếu cần

## 📝 Các Tính Năng

### ✅ Người Dùng
- Đăng ký / Đăng nhập
- 2 vai trò: Người Mua (Buyer), Người Bán (Seller)
- Quản lý tài khoản & số dư

### ✅ Phiên Đấu Giá
- Tạo & quản lý phiên đấu giá
- Đặt giá trực tiếp
- Theo dõi lịch sử trả giá
- Đăng ký tham gia với phí tham gia & tiền ký cọc

### ✅ Sản Phẩm
- Phân loại sản phẩm
- Tải ảnh sản phẩm
- Mô tả chi tiết sản phẩm

### ✅ Thanh Toán
- Quản lý hóa đơn
- Theo dõi trạng thái thanh toán
- Lịch sử giao dịch

## 📞 Liên Hệ & Hỗ Trợ

Nếu có vấn đề, vui lòng tạo issue hoặc liên hệ team phát triển.

---

**Phiên Bản**: 1.0.0 | **Cập Nhật**: Tháng 4, 2024

