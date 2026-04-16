# 📑 Tổng Quan Dự Án Đấu Giá

## 🎯 Mô Tả Dự Án

Một **hệ thống đấu giá trực tuyến hoàn chỉnh** cho phép người dùng đăng ký, tạo phiên đấu giá, đặt giá, và mua bán sản phẩm thông qua hình thức đấu giá. Hệ thống được xây dựng với **Node.js** backend, **SQL Server** database, và **JavaScript** frontend.

---

## 📂 Cấu Trúc Thư Mục

```
auction-website/
├── 📄 README.md                    ← Bắt đầu từ đây!
├── 📄 SETUP.md                     ← Hướng dẫn cài đặt
├── 📄 ARCHITECTURE.md              ← Kiến trúc hệ thống
├── 📄 DATABASE-CONNECTION.md       ← Cấu hình database
├── 📄 DEPLOYMENT.md                ← Triển khai (production)
├── 📄 quick-start.bat              ← Auto setup (Windows)
├── 📄 quick-start.sh               ← Auto setup (Mac/Linux)
├── 📄 sample-data.sql              ← Dữ liệu mẫu
│
├── backend/                        ← Node.js API Server
│   ├── config/
│   │   └── db.js                   ← Database configuration
│   ├── middleware/
│   │   └── auth.js                 ← JWT authentication
│   ├── routes/
│   │   ├── authRoutes.js           ← Auth endpoints
│   │   ├── auctionRoutes.js        ← Auction endpoints
│   │   ├── productRoutes.js        ← Product endpoints
│   │   └── adminRoutes.js          ← Admin endpoints
│   ├── server.js                   ← Express app entry
│   ├── package.json                ← Dependencies
│   ├── .env.example                ← Config template
│   ├── .gitignore
│   └── .env                        ← Your actual config
│
├── frontend/                       ← Web UI
│   ├── index.html                  ← Main page
│   ├── styles.css                  ← Styling
│   └── script.js                   ← Client logic
│
└── db/
    └── HeThongDauGia2.sql         ← Database schema
```

---

## 🚀 Bắt Đầu Nhanh (5 phút)

### 1️⃣ Clone/Mở Project
```bash
cd c:\Users\khang\OneDrive\Desktop\code\auction-website
```

### 2️⃣ Setup Database
```sql
# Mở SQL Server Management Studio
# File > Open > HeThongDauGia2.sql
# F5 chạy
```

### 3️⃣ Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Sửa .env với database info
npm run dev
```

### 4️⃣ Setup Frontend
```bash
cd frontend
npx http-server
# Hoặc dùng Live Server extension
```

### 5️⃣ Truy Cập
```
Frontend: http://localhost:8000
Backend API: http://localhost:5000
```

---

## 📚 Tài Liệu

| File | Nội Dung |
|------|---------|
| **README.md** | Tổng quan, API docs, feature list |
| **SETUP.md** | Hướng dẫn cài đặt chi tiết |
| **ARCHITECTURE.md** | Kiến trúc, DB schema, API map |
| **DATABASE-CONNECTION.md** | 4 cách kết nối database |
| **DEPLOYMENT.md** | Deploy lên Heroku, AWS, Azure... |

---

## ✨ Các Tính Năng Chính

### 👤 Quản Lý Người Dùng
- ✅ Đăng ký / Đăng nhập an toàn (JWT + bcrypt)
- ✅ 2 vai trò: Người Mua & Người Bán
- ✅ Profile quản lý
- ✅ Theo dõi số dư tài khoản

### 🏆 Hệ Thống Đấu Giá
- ✅ Tạo phiên đấu giá
- ✅ Đặt giá trực tiếp
- ✅ Lịch sử trả giá real-time
- ✅ Tự động xác định người thắng

### 📦 Quản Lý Sản Phẩm
- ✅ Phân loại sản phẩm
- ✅ Tải ảnh sản phẩm
- ✅ Mô tả chi tiết

### 💳 Thanh Toán & Hóa Đơn
- ✅ Quản lý phí tham gia & ký cọc
- ✅ Theo dõi trạng thái thanh toán
- ✅ Lịch sử giao dịch

### 🔐 Bảo Mật
- ✅ JWT token authentication
- ✅ Password hashing
- ✅ CORS protection
- ✅ Parameterized SQL queries

---

## 🛠️ Tech Stack

| Lớp | Công Nghệ |
|------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js, Express.js |
| **Database** | SQL Server / Azure SQL |
| **Auth** | JWT + bcryptjs |
| **APIs** | RESTful Architecture |

---

## 📊 Database Schema

**7 Bảng Chính:**
1. `users` - Người dùng (Buyer/Seller)
2. `product_categories` - Danh mục sản phẩm
3. `products` - Sản phẩm đấu giá
4. `auctions` - Phiên đấu giá
5. `bids_history` - Lịch sử trả giá
6. `registration` - Đăng ký tham gia phiên
7. `invoices` - Hóa đơn thanh toán

---

## 🔌 API Endpoints (Chính)

### Public
```
GET    /api/auctions              → Danh sách đấu giá
GET    /api/auctions/:id          → Chi tiết đấu giá
GET    /api/auctions/:id/bids     → Lịch sử trả giá
GET    /api/products              → Danh sách sản phẩm
POST   /api/auth/register         → Đăng ký
POST   /api/auth/login            → Đăng nhập
```

### Authenticated (Cần JWT)
```
POST   /api/auctions/:id/bid      → Đặt giá
POST   /api/auctions/:id/register → Đăng ký phiên
POST   /api/products              → Tạo sản phẩm (Seller)
```

---

## 🔐 Default Login Credentials (Mẫu)

Chạy `sample-data.sql` để có dữ liệu mẫu:

```
Seller:
  Username: seller1
  Password: test123
  Role: seller
  Balance: 1,000,000,000 VND

Buyer:
  Username: buyer1
  Password: test123
  Role: buyer
  Balance: 500,000,000 VND
```

---

## 🐛 Troubleshooting

### Backend không kết nối DB
```bash
# 1. Kiểm tra SQL Server chạy
# 2. Kiểm tra .env credentials
# 3. Test connection:
sqlcmd -S localhost -U sa -P "password"
```

### Frontend CORS error
```
Backend CORS đã được enable.
Check API URL trong script.js đúng.
```

### Port 5000 đang dùng
```bash
# Tìm process chiếm port
netstat -ano | findstr :5000

# Đổi port trong backend/.env
PORT=3000
```

---

## 📈 Performance Tips

1. **Database**
   - Thêm indexes trên frequently queried fields
   - Connection pooling
   - Pagination cho large result sets

2. **Backend**
   - Caching với Redis
   - Gzip compression
   - Rate limiting

3. **Frontend**
   - Lazy loading images
   - Minimize CSS/JS
   - CDN for static files

---

## 🚢 Deployment Options

- **Heroku** (Easy, free tier available)
- **Azure** (Integrated with SQL Server)
- **AWS** (EC2 + RDS)
- **DigitalOcean** (Simple + affordable)
- **Docker** (Container-based)
- **Kubernetes** (Advanced scaling)

👉 Xem [DEPLOYMENT.md](DEPLOYMENT.md) cho chi tiết

---

## 📋 Checklist Deploy

```
[ ] Database migrations successful
[ ] API tested locally
[ ] Environment variables configured
[ ] HTTPS/SSL enabled
[ ] Database backups set up
[ ] Error monitoring enabled
[ ] Load testing passed
[ ] Security audit done
[ ] API rate limiting enabled
[ ] CORS properly set
[ ] .env not in git
[ ] Dependencies updated
```

---

## 🎓 Học Thêm

### Tài Liệu Liên Quan
- [Node.js Docs](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/)
- [SQL Server Docs](https://docs.microsoft.com/sql/)
- [JWT Explanation](https://jwt.io/introduction)

### Best Practices
- [12 Factor App](https://12factor.net/)
- [Node.js Security](https://nodejs.org/en/docs/guides/nodejs-web-app-security-checklist/)
- [REST API Design](https://restfulapi.net/)

---

## 📞 Support & Contact

- **Issues?** Kiểm tra README.md
- **Setup Help?** Xem SETUP.md
- **Architecture Questions?** Xem ARCHITECTURE.md
- **Deployment?** Xem DEPLOYMENT.md

---

## 📝 Changelog

### v1.0.0 (April 2024)
- ✅ Initial release
- ✅ Core auction system
- ✅ User authentication
- ✅ Bidding system
- ✅ Frontend UI

### v1.1.0 (Planned)
- [ ] WebSocket real-time updates
- [ ] Admin dashboard
- [ ] Payment gateway
- [ ] Email notifications
- [ ] Mobile app

---

## 📄 License

Open Source - Educational Purpose

---

## 🎉 Cảm ơn!

Chúc bạn xây dựng thành công hệ thống đấu giá! Nếu thích project này, vui lòng share cho bạn bè. 

**Happy Coding!** 🚀

---

**Last Updated:** April 2024 | **Version:** 1.0.0

