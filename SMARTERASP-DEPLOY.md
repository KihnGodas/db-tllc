# 🚀 Hướng Dẫn Deploy: Render (Backend) + SmarterASP (SQL Server)

## Kiến Trúc
```
Frontend (HTML/CSS/JS)  →  Backend API + WebSocket (Render)  →  SQL Server DB (SmarterASP)
```

---

## PHẦN 1: Tạo Database trên SmarterASP.NET

### Bước 1: Đăng nhập Control Panel
1. Vào https://www.smarterasp.net → Login
2. Vào **Control Panel** của hosting

### Bước 2: Tạo MS SQL Database
1. Control Panel → **MS SQL** → **Create New Database**
2. Đặt tên database, tạo SQL user và password
3. Ghi lại thông tin (cần cho Bước sau):
   ```
   Server:   mssqlXX.smarterasp.net   ← xem trong control panel
   Database: your_db_name
   User:     your_db_user
   Password: your_db_password
   ```

### Bước 3: Import Schema và Dữ Liệu qua SSMS
1. Mở **SQL Server Management Studio (SSMS)**
2. Kết nối:
   - Server name: `mssqlXX.smarterasp.net`
   - Authentication: **SQL Server Authentication**
   - Login / Password: thông tin vừa tạo
3. Mở file `HeThongDauGia2.sql`
4. Nếu script có dòng `USE [HeThongDauGia5]`, đổi thành tên DB bạn tạo:
   ```sql
   USE [your_db_name]
   ```
5. Nhấn **F5** để chạy — schema và dữ liệu sẽ được tạo

### Bước 4: Mở Firewall cho Render
SmarterASP mặc định chặn kết nối từ ngoài. Cần whitelist IP của Render:
1. Control Panel → **MS SQL** → **Remote Access** hoặc **Firewall**
2. Thêm IP: `0.0.0.0/0` (cho phép tất cả) **hoặc** lấy IP tĩnh của Render service và thêm vào

> ⚠️ Render free tier dùng IP động. Nếu SmarterASP yêu cầu IP cố định, cần nâng cấp Render lên paid plan để có static IP, hoặc dùng `0.0.0.0/0` (kém bảo mật hơn nhưng đơn giản cho bài tập).

---

## PHẦN 2: Deploy Backend lên Render

### Bước 1: Push code lên GitHub
```bash
git add .
git commit -m "prepare for render deployment"
git push origin main
```

### Bước 2: Tạo Web Service trên Render
1. Vào https://render.com → **New** → **Web Service**
2. Kết nối GitHub repository của bạn
3. Cấu hình:
   | Field | Giá trị |
   |-------|---------|
   | Name | `auction-backend` |
   | Root Directory | `backend` |
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |

### Bước 3: Thêm Environment Variables
Trong Render dashboard → **Environment** → thêm từng biến:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DB_SERVER` | `mssqlXX.smarterasp.net` |
| `DB_NAME` | tên database SmarterASP |
| `DB_USER` | db username SmarterASP |
| `DB_PASSWORD` | db password SmarterASP |
| `DB_ENCRYPT` | `true` |
| `DB_TRUST_CERT` | `false` |
| `JWT_SECRET` | chuỗi bí mật dài (ít nhất 32 ký tự) |
| `ALLOWED_ORIGINS` | URL frontend của bạn |

### Bước 4: Deploy
- Click **Create Web Service** → Render sẽ tự build và deploy
- Sau vài phút, bạn sẽ có URL dạng: `https://auction-backend-xxxx.onrender.com`

### Bước 5: Kiểm tra
Truy cập: `https://auction-backend-xxxx.onrender.com/health`

Kết quả mong đợi:
```json
{"status": "Server is running"}
```

---

## PHẦN 3: Cập Nhật Frontend

### Sửa file `frontend/index.html`
Tìm đoạn `AUCTION_CONFIG` và cập nhật URL Render thực tế:

```html
<script>
  window.AUCTION_CONFIG = {
    apiUrl: 'https://auction-backend-xxxx.onrender.com/api',
    socketUrl: 'https://auction-backend-xxxx.onrender.com'
  };
</script>
```

### Deploy Frontend
Frontend là HTML/CSS/JS thuần — có thể host ở nhiều nơi:

**Cách 1: GitHub Pages (miễn phí)**
```bash
# Tạo branch gh-pages
git subtree push --prefix frontend origin gh-pages
# Hoặc dùng GitHub Actions
```

**Cách 2: Render Static Site (miễn phí)**
1. Render → **New** → **Static Site**
2. Root Directory: `frontend`
3. Build Command: *(để trống)*
4. Publish Directory: `.`

**Cách 3: Netlify / Vercel**
- Kéo thả thư mục `frontend/` vào netlify.com

---

## PHẦN 4: Cập Nhật ALLOWED_ORIGINS

Sau khi có URL frontend, quay lại Render → Environment:
```
ALLOWED_ORIGINS=https://your-frontend-url.com
```

Render sẽ tự restart service.

---

## Lưu Ý Quan Trọng

### Render Free Tier
- Service sẽ **sleep sau 15 phút** không có request
- Request đầu tiên sau khi sleep sẽ chậm ~30 giây (cold start)
- Để tránh: dùng uptime monitor như https://uptimerobot.com ping `/health` mỗi 10 phút

### SmarterASP SQL Server
- Đảm bảo **Remote Access** được bật trong Control Panel
- Nếu kết nối bị từ chối, kiểm tra firewall rules trong SmarterASP

---

## Xử Lý Lỗi Thường Gặp

| Lỗi | Nguyên Nhân | Giải Pháp |
|-----|-------------|-----------|
| `Cannot connect to DB` | Firewall SmarterASP chặn | Bật Remote Access, whitelist IP |
| `Login failed for user` | Sai DB_USER/DB_PASSWORD | Kiểm tra lại trong Render env vars |
| `CORS error` | ALLOWED_ORIGINS sai | Cập nhật đúng URL frontend |
| `WebSocket connection failed` | socketUrl sai trong index.html | Cập nhật AUCTION_CONFIG |
| Service sleep (cold start) | Render free tier | Dùng UptimeRobot ping /health |
| `SSL certificate error` | DB_TRUST_CERT sai | Thử đặt `DB_TRUST_CERT=true` |
