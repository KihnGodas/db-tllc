# 🌍 Hướng Dẫn Triển Khai (Deployment)

## 🎯 Mục Đích
Hướng dẫn triển khai ứng dụng đấu giá lên các nền tảng khác nhau.

---

## 📌 1️⃣ Heroku (Free/Paid)

### Chuẩn Bị
```bash
# Cài Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login
```

### Deploy
```bash
# Tạo Procfile trong root
echo "web: npm start --prefix backend" > Procfile

# Tạo app trên Heroku
heroku create your-app-name

# Set environment variables
heroku config:set DB_SERVER=your-server.database.windows.net
heroku config:set DB_USER=username@server
heroku config:set DB_PASSWORD=your_password
heroku config:set DB_NAME=HeThongDauGia5
heroku config:set JWT_SECRET=your_secret_key

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

---

## 📌 2️⃣ Azure

### A. Tạo Web App
```bash
# Login
az login

# Tạo resource group
az group create -n auction-rg -l eastus

# Tạo App Service Plan
az appservice plan create -n auction-plan -g auction-rg --sku B1 --is-linux

# Tạo Web App (Node.js)
az webapp create -g auction-rg -p auction-plan -n auction-app --runtime "node|18-lts"

# Deploy từ local
az webapp deployment user set --user-name yourusername --user-password yourpassword

# Kết nối git (nếu dùng Github)
# Hoặc upload code trực tiếp
```

### B. Database (Azure SQL)
```bash
# Query string cho backend
DB_SERVER=your-server.database.windows.net
DB_USER=adminuser@your-server
DB_PASSWORD=YourPassword@123
```

### C. Set Environment Variables
```bash
az webapp config appsettings set -g auction-rg -n auction-app \
  --settings DB_SERVER=your-server.database.windows.net \
             DB_USER=adminuser \
             DB_PASSWORD=yourpassword \
             DB_NAME=HeThongDauGia5 \
             JWT_SECRET=secret_key
```

---

## 📌 3️⃣ AWS (EC2 + RDS)

### A. Tạo EC2 Instance
```bash
# Chọn Ubuntu 20.04 LTS
# Security Group: Open port 5000
# Tạo key pair, download .pem file

# SSH vào instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Cài Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone project
git clone your-repo-url
cd auction-website/backend
npm install
```

### B. Setup RDS (Managed SQL Server)
```bash
# Tạo RDS SQL Server từ AWS Console
# Copy endpoint: your-db.c9akciq32.us-east-1.rds.amazonaws.com
```

### C. Chạy Backend (PM2)
```bash
# Cài PM2 (process manager)
sudo npm install -g pm2

# Copy .env
cp .env.example .env
# Sửa DB credentials

# Chạy app
pm2 start server.js --name "auction-api"
pm2 startup
pm2 save

# View logs
pm2 logs auction-api
```

### D. Deploy Frontend (S3 + CloudFront)
```bash
# Tạo S3 bucket
aws s3 mb s3://auction-hub-frontend

# Upload files
aws s3 sync frontend/ s3://auction-hub-frontend --delete

# Tạo CloudFront distribution
# Origin: S3 bucket
# Custom domain: auction.example.com
```

---

## 📌 4️⃣ DigitalOcean (App Platform)

### A. Chuẩn Bị
```bash
# Tạo DigitalOcean account
# Tạo database cluster (Managed SQL Server)
```

### B. Deploy App
```bash
# Đẩy code lên GitHub
git push origin main

# Trong DigitalOcean Console:
# 1. "Create App"
# 2. Chọn GitHub repository
# 3. Chọn "Node.js" service
# 4. Thêm environment variables
# 5. Deploy
```

### C. Cấu Hình .env
```env
DB_SERVER=db-cluster-host.ondigitalocean.com
DB_USER=dbauser
DB_PASSWORD=dbpassword
DB_NAME=HeThongDauGia5
```

---

## 📌 5️⃣ Docker + Docker Compose

### A. Dockerfile (Backend)
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY backend/package.json .
RUN npm install

COPY backend .

EXPOSE 5000

CMD ["npm", "start"]
```

### B. docker-compose.yml
```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      DB_SERVER: sql-server
      DB_USER: sa
      DB_PASSWORD: YourPassword@123
      DB_NAME: HeThongDauGia5
    depends_on:
      - sql-server

  sql-server:
    image: mcr.microsoft.com/mssql/server:2019-latest
    environment:
      ACCEPT_EULA: Y
      SA_PASSWORD: YourPassword@123
    ports:
      - "1433:1433"
    volumes:
      - sql-data:/var/opt/mssql

volumes:
  sql-data:
```

### C. Deploy
```bash
docker-compose up -d

# Kiểm tra logs
docker-compose logs -f backend
```

---

## 📌 6️⃣ Kubernetes (K8s)

### A. Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY backend/package.json .
RUN npm install --production
COPY backend .
EXPOSE 5000
CMD ["npm", "start"]
```

### B. deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auction-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auction-backend
  template:
    metadata:
      labels:
        app: auction-backend
    spec:
      containers:
      - name: backend
        image: your-registry/auction-backend:latest
        ports:
        - containerPort: 5000
        env:
        - name: DB_SERVER
          value: sql-server-host
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
```

### C. Deploy
```bash
kubectl apply -f deployment.yaml

# Expose service
kubectl expose deployment auction-backend --type=LoadBalancer --port=5000
```

---

## 🔐 Công Tác Bảo Mật Trước Deploy

- [ ] ✅ Tắt debug mode: `NODE_ENV=production`
- [ ] ✅ Sử dụng biến môi trường cho tất cả secrets
- [ ] ✅ Cấu hình HTTPS/SSL
- [ ] ✅ Bật CORS chỉ cho domain của bạn
- [ ] ✅ Rate limiting trên API
- [ ] ✅ Kiểm tra SQL injection vulnerabilities
- [ ] ✅ Cập nhật dependencies
- [ ] ✅ Bật firewall
- [ ] ✅ Backup database

---

## 📊 Monitoring & Logging

### Công Ngoài
- **New Relic** - Application performance monitoring
- **Datadog** - Infrastructure monitoring
- **Sentry** - Error tracking
- **LogRocket** - Frontend debugging

### Setup Sentry (Nếu dùng)
```javascript
// server.js
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

---

## 🔄 Continuous Deployment (CI/CD)

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - run: cd backend && npm install
      - run: cd backend && npm test
      - run: echo "Deploying..."
        # Add your deploy command here
```

---

## ✅ Checklist Trước Deploy

```
[ ] Database migrations chạy thành công
[ ] Environment variables đúng
[ ] HTTPS/SSL certificate
[ ] Database backups
[ ] Error logging configured
[ ] Load testing passed
[ ] Security audit completed
[ ] API rate limiting
[ ] CORS properly configured
[ ] .env không commit vào git
[ ] package-lock.json up to date
[ ] Node version specified
[ ] Healthcheck endpoint working
```

---

## 📞 Troubleshooting

| Vấn đề | Giải Pháp |
|-------|---------|
| "Cannot connect to DB" | Check connection string, firewall |
| "Out of memory" | Increase instance size, check for leaks |
| "CORS error" | Update CORS config with correct origin |
| "High latency" | Check database indexes, add caching |
| "SSL certificate error" | Renew certificate, check DNS |

---

## 📚 Resources

- [Node.js Production Checklist](https://nodejs.org/en/docs/guides/nodejs-web-app-security-checklist/)
- [12 Factor App](https://12factor.net/)
- [OWASP Security](https://owasp.org/)

