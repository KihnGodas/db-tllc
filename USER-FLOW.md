# 🎯 User Journey & Feature Map

## User Flows

### 👤 Buyer Journey
```
┌─────────────────┐
│   New User      │
└────────┬────────┘
         │
  ┌──────▼──────┐
  │  Register   │
  └──────┬──────┘
         │
  ┌──────▼──────────────┐
  │  Browse Auctions    │
  │  (No login needed)  │
  └──────┬──────────────┘
         │
  ┌──────▼──────────────┐
  │  Login to Account   │
  └──────┬──────────────┘
         │
    ┌────┴─────────────────┬──────────────────┐
    │                      │                  │
┌───▼────┐            ┌───▼───┐      ┌──────▼──────┐
│ View   │            │View   │      │ View Invoice│
│ Auction│            │Profile│      │& Payment    │
│Details │            │       │      │Status       │
└───┬────┘            └───────┘      └──────▲──────┘
    │                                       │
┌───▼───────┐                          ┌────┴─────┐
│Register   │                          │Pay for   │
│for Auction│                          │Invoice   │
└───┬───────┘                          └────▲─────┘
    │                                       │
┌───▼──────┐                          ┌────┴────┐
│Place Bid │◄─────────────────────────┤Win Item │
└───┬──────┘                          └─────────┘
    │
└───► (Repeat bidding until auction ends)
```

---

### 🛍️ Seller Journey
```
┌─────────────────┐
│  New Seller     │
└────────┬────────┘
         │
  ┌──────▼──────┐
  │  Register   │
  └──────┬──────┘
         │
  ┌──────▼──────────────┐
  │  Login & Profile    │
  └──────┬──────────────┘
         │
┌────────▼────────────┐
│ Create Product      │
│ (Upload Image)      │
└────────┬────────────┘
         │
┌────────▼────────────┐
│ Create Auction      │
│ (Set Price/Time)    │
└────────┬────────────┘
         │
┌────────▼────────────┐
│ Monitor Bids        │
│ in Real-time        │
└────────┬────────────┘
         │
┌────────▼────────────┐
│ Auction Ends        │
│ Winner Declared     │
└────────┬────────────┘
         │
┌────────▼────────────┐
│ Payment Received    │
└─────────────────────┘
```

---

## 🎨 UI Screens

### 1. Homepage
```
┌─────────────────────────────────────────┐
│  [LOGO]  [Home] [Auctions] [Account ▼] │
├─────────────────────────────────────────┤
│  🏆 Đấu Giá Trực Tuyến Hàng Đầu           │
│  Mua bán sản phẩm giá rẻ                  │
│  [Khám Phá Ngay]                         │
├─────────────────────────────────────────┤
│ 🔍 Tìm kiếm | [Danh mục ▼]               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │ iPhone  │ │MacBook  │ │Gucci    │    │
│ │$25.5M   │ │$0       │ │Pending  │    │
│ │🔴 5h30m │ │🟡 5d2h  │ │         │    │
│ └─────────┘ └─────────┘ └─────────┘    │
└─────────────────────────────────────────┘
```

### 2. Auction Detail
```
┌─────────────────────────────────────────┐
│ [←] Auction Details                  [×]│
├─────────────────────────────────────────┤
│ ┌───────────────┐  │ iPhone 15 Pro Max  │
│ │               │  │ Seller: Shop Thai  │
│ │   [iPhone]    │  │                    │
│ │   Picture     │  │ Giá Khởi Điểm: 20M│
│ │               │  │ Giá Hiện Tại: 25.5M
│ └───────────────┘  │ Mức Tăng: 500K    │
│                    │ Số Người: 5       │
│                    │ Kết Thúc: 2h30m   │
│                    │                    │
│                    │ [🔘 Đặt Giá]      │
├─────────────────────────────────────────┤
│ Lịch Sử Trả Giá:                        │
│ buyer1     $25.5M  14:05              │
│ buyer2     $24M    14:02              │
│ buyer1     $23M    13:55              │
└─────────────────────────────────────────┘
```

### 3. Bid Modal
```
┌──────────────────────────┐
│ Đặt Giá              [×] │
├──────────────────────────┤
│ Giá Hiện Tại:           │
│ [   25,500,000   ]       │
│                          │
│ Mức Tăng Tối Thiểu:     │
│ [      500,000   ]       │
│                          │
│ Giá Đặt Của Bạn:        │
│ [________________] VND   │
│                          │
│  [Đặt Giá]  [Hủy]       │
└──────────────────────────┘
```

### 4. Login Modal
```
┌──────────────────────────┐
│ Đăng Nhập            [×] │
├──────────────────────────┤
│ Tên Đăng Nhập:          │
│ [________________]       │
│                          │
│ Mật Khẩu:               │
│ [________________]       │
│                          │
│  [Đăng Nhập]            │
│  Chưa có tài khoản?      │
│  [Đăng ký]              │
└──────────────────────────┘
```

---

## 🔄 Data Flow

### Placing a Bid
```
Frontend (User clicks "Đặt Giá")
    │
    ├─ Validate bid amount (> current price)
    │
    ├─ Show bid modal
    │
    └─ User submits bid
       │
       ├─ POST /api/auctions/:id/bid
       │  (with JWT token)
       │   
       ├─ Backend validates
       │  ├─ Check auction is "ongoing"
       │  ├─ Check bid > current price
       │  └─ Check user has funds
       │
       ├─ Update database
       │  ├─ INSERT bids_history
       │  └─ UPDATE auctions (current_price, winner_id)
       │
       └─ Response success
          │
          └─ Frontend refreshes bid list
```

### Creating Auction
```
Seller submits form
    │
    ├─ Product created first
    │  └─ POST /api/products
    │
    ├─ Then auction created
    │  └─ POST /api/auctions
    │
    ├─ Status: "upcoming"
    │
    ├─ At start_time → "ongoing"
    │
    └─ At end_time → "ended"
       └─ Winner declared, invoice created
```

---

## 📊 Feature Comparison

| Feature | Buyer | Seller | Admin |
|---------|-------|--------|-------|
| Browse Auctions | ✅ | ✅ | ✅ |
| Place Bid | ✅ | ✅ | ✅ |
| Create Auction | ❌ | ✅ | ✅ |
| View Profile | ✅ | ✅ | ✅ |
| Manage Payments | ✅ | ✅ | ✅ |
| View All Users | ❌ | ❌ | ✅ |
| View Statistics | ❌ | ❌ | ✅ |
| Deactivate Users | ❌ | ❌ | ✅ |

---

## 🎮 Interactive Features

### Real-time Updates (Future Enhancement)
```
WebSocket Connection
├─ Live bid updates
├─ User count changes
├─ Auction status changes
└─ Chat/notifications
```

### Smart Features
```
✨ Price Suggestions
   └─ Suggest next bid = current + minimum increment

✨ Auto Calculation
   └─ Total cost = bid price + fees

✨ Time Countdown
   └─ Real-time auction timer

✨ Responsive Bid History
   └─ New bids appear immediately
```

---

## 🎯 Key Metrics

```
Dashboard Shows:
├─ Total Auctions: 143
├─ Active Auctions: 12
├─ Total Users: 256
│  ├─ Buyers: 198
│  └─ Sellers: 58
├─ Revenue This Month: ₹ 45,632
├─ Avg. Bid Per Auction: ₹ 2,156
└─ User Satisfaction: 4.8/5
```

---

## 🔐 Security Checkpoints

```
Registration
    ↓
[Hash Password] ✅
    ↓
Login
    ↓
[Verify Password] ✅
    ↓
[Generate JWT] ✅
    ↓
Protected Routes
    ↓
[Verify JWT Token] ✅
    ↓
[Check User Role] ✅
    ↓
Execute Action
```

---

## 🚀 Performance Indicators

```
Response Times:
├─ Get Auctions: < 200ms
├─ Place Bid: < 500ms
├─ Login: < 300ms
└─ Search: < 400ms

Database:
├─ Queries/sec: 1000+
├─ Connection Pool: 10
└─ Max Connections: 100

Frontend:
├─ Load Time: < 2s
├─ Lighthouse Score: 90+
└─ Mobile Responsive: 100%
```

---

## 📱 Responsive Design

```
Desktop (1200px+)
├─ 3-column auction grid
├─ Sidebar navigation
└─ Full details view

Tablet (768px - 1199px)
├─ 2-column auction grid
├─ Hamburger menu
└─ Compact details

Mobile (< 768px)
├─ 1-column auction grid
├─ Bottom navigation
└─ Modal dialogs
```

---

## 🎓 Learning Path

1. **Understand the Concept**
   └─ Read ARCHITECTURE.md

2. **Setup Environment**
   └─ Follow SETUP.md

3. **Explore Code**
   ├─ Read backend routes
   ├─ Understand frontend logic
   └─ Check database schema

4. **Test Features**
   ├─ Create users
   ├─ Create auctions
   ├─ Place bids
   └─ Test edge cases

5. **Enhance Features**
   ├─ Add new endpoints
   ├─ Improve UI
   └─ Add validations

6. **Deploy**
   └─ Follow DEPLOYMENT.md

---

**End of Flow Documentation** ✨

