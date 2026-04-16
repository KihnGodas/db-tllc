# 🏗️ Kiến Trúc Hệ Thống Đấu Giá

## 📐 Tổng Quan Kiến Trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Frontend)                   │
│  ┌──────────────────────────────────────────────────────────┐
│  │  HTML/CSS/JavaScript (Responsive Web UI)                 │
│  │  - Auctions listing & search                             │
│  │  - Bid placement                                         │
│  │  - User authentication & profile                         │
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
                            │
                    REST API (HTTP)
                            │
┌─────────────────────────────────────────────────────────────┐
│                  API LAYER (Backend - Node.js)               │
│  ┌──────────────────────────────────────────────────────────┐
│  │  Express Server (Port 5000)                              │
│  │  ├── Auth Routes (Register, Login, JWT)                 │
│  │  ├── Auction Routes (List, Detail, Bid)                │
│  │  ├── Product Routes (List, Create, Categories)         │
│  │  ├── Admin Routes (Stats, User Management)             │
│  │  └── Middleware (Authentication, CORS)                 │
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
                            │
                 Data Access Layer (mssql)
                            │
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE LAYER (SQL Server)                 │
│  ┌──────────────────────────────────────────────────────────┐
│  │  HeThongDauGia5 Database                                 │
│  │  ├── users (authentication, profiles)                    │
│  │  ├── product_categories (product classification)       │
│  │  ├── products (auction items)                            │
│  │  ├── auctions (auction sessions)                        │
│  │  ├── bids_history (bidding records)                     │
│  │  ├── registration (auction participation)              │
│  │  └── invoices (payment tracking)                        │
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Entity Relationship Diagram

```
┌─────────────────┐
│     Users       │
├─────────────────┤
│ user_id (PK)    │◄──┐
│ username        │   │
│ password        │   │
│ role            │   │
│ balance         │   │
│ ... (20 fields) │   │
└─────────────────┘   │
       ▲  ▲           │
       │  │           │
       │  │     ┌──────────────────┐
       │  │     │   Products       │
       │  │     ├──────────────────┤
       │  │     │ product_id (PK)  │
       │  │     │ user_id (FK)─────┼────► User (Seller)
       │  │     │ category_id (FK) │
       │  │     │ ... (6 fields)   │
       │  │     └──────────────────┘
       │  │            │
       │  │            ▼
       │  │     ┌──────────────────┐
       │  │     │    Auctions      │
       │  │     ├──────────────────┤
       │  │     │ auction_id (PK)  │
       │  │     │ product_id (FK)  │
       │  │     │ winner_id (FK)───┼────► User (Buyer)
       │  │     │ current_price    │
       │  │     │ ... (10 fields)  │
       │  │     └──────────────────┘
       │  │            │
       │  │        ┌───┴────┬──────────┐
       │  │        │        │          │
       │  │        ▼        ▼          ▼
       │  │  ┌──────────┐ ┌─────────┐ ┌─────────┐
       │  │  │   Bids   │ │  Regis  │ │Invoices │
       │  │  │  History │ │tration  │ │         │
       │  │  ├──────────┤ ├─────────┤ ├─────────┤
       │  └──┤user_id──┤ │user_id──┤ │winner~~┤
       │     │auction~~┤ │auction~~┤ │auction~~┤
       │     └──────────┘ └─────────┘ └─────────┘
       └────────────────────────────────────────
```

---

## 🔐 Authentication Flow

```
USER                           BACKEND                       DATABASE
  │                              │                              │
  ├──── POST /register ───────────>                             │
  │                              ├─ Validate input             │
  │                              ├─ Hash password              │
  │                              ├─ Create user ───────────────>
  │                              │                              │
  │<────── JWT Token ─────────────|                             │
  │    (localStorage)             │                             │
  │                              │                             │
  ├───── POST /login ────────────>                             │
  │                              ├─ Check user ────────────────>
  │                              │                        Check ok
  │                              │<────────────────────────────┤
  │                              ├─ Verify password           │
  │                              ├─ Generate JWT              │
  │                              │                             │
  │<────── JWT Token ─────────────|                             │
  │                              │                             │
  ├─ GET /auctions ────────────────>                             │
  │ Authorization: Bearer JWT     ├─ Verify token              │
  │                              ├─ Query data ────────────────>
  │                              │                    Return data
  │                              │<────────────────────────────┤
  │<────── Auction List ──────────|                             │
  │                              │                             │
```

---

## 🔄 Auction Flow

```
1. CREATION
   Seller creates auction
   └─ Create Product → Create Auction with status "upcoming"

2. REGISTRATION PHASE (registration_start → registration_end)
   Buyer registers to join auction
   └─ Payment entry fee & deposit → Add to registration table

3. BIDDING PHASE (start_time → end_time)
   Buyers place bids
   └─ Each bid → Update current_price, winner_id → Insert in bids_history

4. COMPLETION
   Auction ends
   ├─ Status → "ended"
   ├─ Winner determined
   └─ Create invoice for winner

5. PAYMENT
   winner_id pays current_price
   └─ Update invoice status → "paid"
```

---

## 🔌 API Endpoints Map

```
PUBLIC ENDPOINTS:
├── GET  /health                      (Server status)
├── GET  /api/auctions                (List all auctions)
├── GET  /api/auctions/:id            (Auction details)
├── GET  /api/auctions/:id/bids       (Bidding history)
├── GET  /api/products                (List products)
├── GET  /api/products/categories     (Categories)
└── POST /api/auth/register          (User registration)
    POST /api/auth/login             (User login)

AUTHENTICATED ENDPOINTS (require JWT token):
├── POST /api/auctions/:id/bid           (Place bid)
├── POST /api/auctions/:id/register      (Register for auction)
├── POST /api/products                   (Create product - seller)
└── GET  /api/invoices                   (User invoices)

ADMIN ENDPOINTS (require admin role):
├── GET  /api/admin/users              (All users)
├── GET  /api/admin/auctions/stats     (Auction statistics)
├── PUT  /api/admin/users/:id/deactivate (Deactivate user)
└── GET  /api/admin/dashboard          (Dashboard stats)
```

---

## 🔧 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JS | User interface |
| **Backend** | Node.js, Express.js | REST API server |
| **Database** | SQL Server / Azure SQL | Data persistence |
| **Authentication** | JWT, bcryptjs | Security |
| **HTTP Client** | Fetch API | Frontend-Backend communication |
| **ORM/Query** | mssql native | Database queries |

---

## 📦 File Structure

```
auction-website/
├── backend/
│   ├── config/
│   │   └── db.js                 # Database connection
│   ├── middleware/
│   │   └── auth.js               # JWT verification
│   ├── routes/
│   │   ├── authRoutes.js         # Auth endpoints
│   │   ├── auctionRoutes.js      # Auction endpoints
│   │   ├── productRoutes.js      # Product endpoints
│   │   └── adminRoutes.js        # Admin endpoints
│   ├── server.js                 # Express app init
│   ├── package.json              # Dependencies
│   └── .env                      # Configuration
│
├── frontend/
│   ├── index.html                # Main page
│   ├── styles.css                # Styling
│   └── script.js                 # Client logic
│
├── db/
│   └── HeThongDauGia2.sql       # Database schema
│
└── docs/
    ├── README.md                 # Main documentation
    ├── SETUP.md                  # Setup guide
    ├── DATABASE-CONNECTION.md    # DB connection guide
    └── ARCHITECTURE.md           # This file
```

---

## 🚀 Deployment Architecture

### Development
```
Local Machine
├── Backend (Node.js) → Port 5000
├── Frontend (Browser) → localhost:8000
└── Database (Local SQL Server)
```

### Production
```
┌─────────────────────────────────────┐
│         Client Browser              │
└──────────────────┬──────────────────┘
                   │ HTTPS
                   ▼
        ┌──────────────────────┐
        │  CDN / Load Balancer │
        └──────────┬───────────┘
                   │
        ┌──────────┴────────────┐
        │                       │
        ▼                       ▼
    ┌────────┐            ┌────────┐
    │Backend │            │Backend │
    │Server1 │            │Server2 │
    │(Node)  │            │(Node)  │
    └────┬───┘            └────┬───┘
         │                    │
         └────────┬───────────┘
                  │
            ┌─────▼──────┐
            │  Azure SQL │
            │  Database  │
            └────────────┘
```

---

## 🔐 Security Measures

1. **Authentication**
   - JWT tokens with expiration
   - Password hashing (bcryptjs)
   - Role-based access control

2. **Database**
   - SQL injection prevention (parameterized queries)
   - Connection encryption
   - Limited user privileges

3. **API**
   - CORS configuration
   - Rate limiting (recommended)
   - Input validation

4. **Transport**
   - HTTPS only (in production)
   - Secure headers

---

## 📈 Scalability Considerations

1. **Database**
   - Indexing on frequently queried fields
   - Connection pooling
   - Partitioning for large tables

2. **Backend**
   - Horizontal scaling with load balancer
   - Caching layer (Redis)
   - Message queues for async tasks

3. **Frontend**
   - CDN for static files
   - Lazy loading
   - Service workers

---

## 🎯 Future Enhancements

- [ ] Real-time updates with WebSockets
- [ ] Admin dashboard
- [ ] Payment gateway integration (Stripe, PayPal)
- [ ] Email notifications
- [ ] User ratings & reviews
- [ ] Advanced search & filtering
- [ ] Mobile app (React Native)
- [ ] Analytics & reporting
- [ ] Multi-language support

