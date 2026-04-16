# 🔗 Hướng Dẫn Kết Nối SQL Server

## 📌 Phương Pháp 1: SQL Server Express (Local)

### Windows
1. **Cài đặt SQL Server Express**
   - Tải: https://www.microsoft.com/sql-server/sql-server-downloads
   - Chọn "Express" edition
   - Cài đặt complete

2. **Cài SQL Server Management Studio (SSMS)**
   - https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms

3. **Tạo Database**
   ```
   - Mở SSMS
   - Kết nối tới: (local) hoặc localhost
   - File > Open > File > HeThongDauGia2.sql
   - Click F5 hoặc chạy
   ```

4. **Cập nhật .env**
   ```env
   DB_SERVER=localhost
   DB_USER=sa
   DB_PASSWORD=your_password
   DB_NAME=HeThongDauGia5
   DB_PORT=1433
   ```

---

## 📌 Phương Pháp 2: Docker (Nhanh nhất)

### Yêu cầu: Cài Docker Desktop

**Windows/Mac/Linux:**
```bash
# Pull SQL Server image
docker pull mcr.microsoft.com/mssql/server:2019-latest

# Chạy container
docker run -e "ACCEPT_EULA=Y" \
           -e "SA_PASSWORD=YourPassword@123" \
           -p 1433:1433 \
           -d \
           --name sql-server \
           mcr.microsoft.com/mssql/server:2019-latest

# Kiểm tra container chạy
docker ps

# Kết nối database từ SSMS:
# Server: localhost
# User: sa
# Password: YourPassword@123
```

**Tạo database từ file SQL:**
```bash
# Copy file vào container
docker cp HeThongDauGia2.sql sql-server:/

# Chạy SQL script
docker exec -i sql-server /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "YourPassword@123" -i HeThongDauGia2.sql
```

---

## 📌 Phương Pháp 3: Azure SQL Database

### Tạo Azure SQL DB
1. Đăng nhập: https://portal.azure.com
2. "Create a resource" > "SQL Database"
3. Nhập thông tin:
   - Resource group: Tạo mới hoặc chọn có sẵn
   - Database name: `HeThongDauGia5`
   - Server: Tạo mới
   - Chọn tier: Basic, Standard, hoặc Premium

4. Trong "Networking":
   - Firewall rules: Cho phép IP máy của bạn
   - Hoặc đặt lựa chọn "Add current client IP"

5. Tạo xong, lấy connection string

6. **SQL Script trên Azure:**
   ```
   - Mở SSMS
   - Kết nối tới: your-server.database.windows.net
   - Admin user: [email protected]
   - Password: password bạn đặt
   - Database: HeThongDauGia5
   - Run SQL script
   ```

7. **Cập nhật .env**
   ```env
   DB_SERVER=your-server.database.windows.net
   DB_USER=adminuser@your-server
   DB_PASSWORD=YourPassword@123
   DB_NAME=HeThongDauGia5
   ```

---

## 📌 Phương Pháp 4: Instance SQL Server (Network)

Nếu SQL Server chạy trên máy khác:

```env
DB_SERVER=192.168.1.100,1433  # IP:Port
DB_USER=sa
DB_PASSWORD=password
DB_NAME=HeThongDauGia5

# Hoặc dùng tên máy
DB_SERVER=COMPUTER_NAME\SQLEXPRESS
```

---

## ✅ Kiểm Tra Kết Nối

### Dùng SSMS
```
1. Mở Object Explorer
2. Nhập credentials
3. Nếu kết nối được > xanh lá
4. Expand "Databases" > Xem "HeThongDauGia5"
```

### Dùng Command Line
```bash
sqlcmd -S localhost -U sa -P "password" -Q "SELECT @@VERSION"
```

### Dùng Node.js
```bash
cd backend
npm install mssql

# Chạy test connection script:
# Sẽ in "✅ Connected to SQL Server successfully"
```

---

## 🔐 Bảo Mật

### Cho Production
```env
# Không để mật khẩu trong .env
# Dùng:
# - Azure Key Vault
# - AWS Secrets Manager
# - Environment variables từ CI/CD

# Connection encryption
DB_ENCRYPT=true
DB_TRUST_CERT=false
```

---

## 🆘 Gỡ Lỗi

| Lỗi | Nguyên Nhân | Giải Pháp |
|-----|-----------|---------|
| "Login failed" | Sai password | Kiểm tra .env |
| "Cannot connect" | SQL Server offline | `services.msc` > SQL Server bật |
| "network or instance-specific error" | Firewall/port | Kiểm tra port 1433 mở |
| "timeout expired" | Server quá tải | Tăng timeout trong .env |

---

## 📞 Tài Nguyên Thêm

- [SQL Server Docs](https://docs.microsoft.com/sql/)
- [Azure SQL](https://learn.microsoft.com/azure/azure-sql/)
- [mssql npm package](https://github.com/tediousjs/node-mssql)

