# Thiết Lập Dự Án Đấu Giá

## 🚀 Bắt Đầu Nhanh (10 phút)

### Bước 1: Chuẩn Bị SQL Server

**Windows:**
```powershell
# Nếu dùng SQL Server Express đã cài sẵn
# Mở SQL Server Management Studio (SSMS)
# Kết nối tới (local) hoặc tên server của bạn
```

**Hoặc Dùng Docker (Nếu có):**
```bash
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourPassword@123" -p 1433:1433 mcr.microsoft.com/mssql/server:2019-latest
```

### Bước 2: Nhập Database

```bash
# Mở SSMS
# File > Open > Query File
# Chọn: HeThongDauGia2.sql
# F5 để chạy
```

Hoặc dùng command line:
```bash
sqlcmd -S localhost -U sa -P "YourPassword@123" -i HeThongDauGia2.sql
```

### Bước 3: Cài & Chạy Backend

```bash
cd backend
npm install
cp .env.example .env

# Sửa .env với database credentials của bạn
# Sau đó chạy:
npm run dev   # Hoặc: npm start
```

### Bước 4: Chạy Frontend

```bash
cd frontend
# Cách 1: Dùng http-server
npx http-server

# Cách 2: Dùng Python
python -m http.server 8000

# Cách 3: Dùng Live Server (VS Code)
# Click chuột phải > Open with Live Server
```

Truy cập: `http://localhost:8000`

---

## 🔧 Cấu Hình Chi Tiết

### .env Backend

```env
# Kết nối Local SQL Server
DB_SERVER=localhost
DB_USER=sa
DB_PASSWORD=your_password
DB_NAME=HeThongDauGia5

# Hoặc Azure SQL
DB_SERVER=your-server.database.windows.net
DB_USER=username@server
DB_PASSWORD=your_password

JWT_SECRET=jhsdfjkshdfkjshdfkjshdfjkshdf
JWT_EXPIRE=7d
PORT=5000
NODE_ENV=development
```

---

## 🧪 Test API

### Dùng Postman hoặc curl

```bash
# Đăng Ký
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "pass123",
    "name": "Test User",
    "email": "test@example.com",
    "role": "buyer"
  }'

# Đăng Nhập
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "pass123"
  }'

# Xem Auctions
curl http://localhost:5000/api/auctions
```

---

## 📱 Tính Năng Frontend

### 🏠 Trang Chủ
- Hero banner với call-to-action
- Dễ dàng điều hướng

### 🏆 Danh Sách Đấu Giá
- Grid layout responsive
- Tìm kiếm & lọc theo danh mục
- Xem chi tiết sản phẩm
- Trạng thái live

### 💰 Chi Tiết Phiên Đấu Giá
- Ảnh sản phẩm
- Giá hiện tại & giá khởi điểm
- Lịch sử trả giá real-time
- Nút đặt giá / đăng ký

### 👤 Quản Lý Tài Khoản
- Đăng ký / Đăng nhập
- Dropdown menu người dùng
- Profile & lịch sử giao dịch

---

## 🐛 Gỡ Lỗi

| Lỗi | Giải Pháp |
|-----|---------|
| Cannot connect to DB | Kiểm tra SQL Server chạy, .env đúng |
| CORS error | Backend CORS enabled, check API URL |
| Frontend không load | Check port 8000 hoặc http-server running |
| 401 Unauthorized | Token hết hạn, đăng nhập lại |

---

## 📦 Dependencies

### Backend
- `express` - Web framework
- `mssql` - SQL Server driver
- `jsonwebtoken` - JWT auth
- `bcryptjs` - Password hashing
- `cors` - CORS middleware

### Frontend
- Vanilla HTML/CSS/JS
- Không cần build tools

---

## 🎯 Next Steps

1. ✅ Thêm thêm validator dữ liệu
2. ✅ Implement socket.io cho real-time updates
3. ✅ Thêm avatar user
4. ✅ Dashboard admin
5. ✅ Payment gateway integration

---

**Giờ bạn đã sẵn sàng để start! 🚀**

