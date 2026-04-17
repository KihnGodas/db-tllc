const API_HOST = window.location.hostname || 'localhost';
const AUCTION_CONFIG = window.AUCTION_CONFIG || {};

// Tự detect: nếu chạy local thì dùng port 8080, nếu deploy thì dùng cùng domain
const isLocal = API_HOST === 'localhost' || API_HOST === '127.0.0.1';
const defaultApiUrl = isLocal
  ? `http://${API_HOST}:8080/api`
  : `${window.location.protocol}//${API_HOST}/api`;
const defaultSocketUrl = isLocal
  ? `http://${API_HOST}:8080`
  : `${window.location.protocol}//${API_HOST}`;

const API_URL = AUCTION_CONFIG.apiUrl || defaultApiUrl;
const SOCKET_URL = AUCTION_CONFIG.socketUrl || (AUCTION_CONFIG.apiUrl ? AUCTION_CONFIG.apiUrl.replace(/\/api\/?$/, '') : defaultSocketUrl);
let currentAuction = null;
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let lastWinnerAnnouncedAuctionId = null;

// WebSocket (socket.io) for real-time bidding updates
let socket = null;
let activeAuctionId = null;
let statusRefreshInterval = null; // Auto-refresh auction status every 30 seconds

// Cache invoices of the logged-in user (used in "won" UI)
let myInvoices = [];
let myInvoicesLoaded = false;
let myInvoicesLoadingPromise = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadAuctions();
  loadCategories();
  updateUserMenu();
  initSocket();
});

// ===== AUTH FUNCTIONS =====

function showLoginForm() {
  document.getElementById('loginModal').classList.add('show');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('show');
}

function showRegisterForm() {
  document.getElementById('registerModal').classList.add('show');
}

function closeRegisterModal() {
  document.getElementById('registerModal').classList.remove('show');
}

async function login(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Login failed', 'error');
      return;
    }

    token = data.token;
    currentUser = data.user;

    localStorage.setItem('token', token);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    closeLoginModal();
    updateUserMenu();
    showAlert('Đăng nhập thành công!', 'success');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  } catch (error) {
    showAlert(`Không thể kết nối tới server API (${API_URL}). Kiểm tra backend đang chạy.`, 'error');
  }
}

async function register(event) {
  event.preventDefault();
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const phone_num = document.getElementById('regPhone').value;
  const citizen_id = document.getElementById('regCitizenId').value;
  const address = document.getElementById('regAddress').value;
  const role = document.getElementById('regRole').value;
  const balance = parseInt(document.getElementById('regBalance').value) || 0;

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        name,
        email,
        phone_num,
        citizen_id,
        address,
        role,
        balance,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Registration failed', 'error');
      return;
    }

    token = data.token;
    currentUser = data.user;

    localStorage.setItem('token', token);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    closeRegisterModal();
    updateUserMenu();
    showAlert(`Đăng ký thành công! Số dư tài khoản: ${formatCurrency(currentUser.balance)}`, 'success');

    // Reset form
    document.getElementById('regUsername').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regName').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regPhone').value = '';
    document.getElementById('regCitizenId').value = '';
    document.getElementById('regAddress').value = '';
    document.getElementById('regBalance').value = '0';
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  token = null;
  currentUser = null;
  updateUserMenu();
  showAlert('Đã đăng xuất', 'success');
}

function updateUserMenu() {
  const userMenu = document.getElementById('user-menu');
  const authMenu = document.getElementById('auth-menu');
  const userButton = userMenu.querySelector('button');

  if (token && currentUser) {
    userMenu.classList.remove('hidden');
    authMenu.classList.add('hidden');
    // Hiển thị username hoặc tên người dùng
    userButton.textContent = currentUser.username + ' ▼';
  } else {
    userMenu.classList.add('hidden');
    authMenu.classList.remove('hidden');
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('show');
}

// ===== AUCTION FUNCTIONS =====

let allAuctions = []; // Cache toàn bộ danh sách để filter client-side

async function loadAuctions() {
  try {
    const response = await fetch(`${API_URL}/auctions`);
    allAuctions = await response.json();
    renderAuctions(allAuctions);
  } catch (error) {
    console.error('Error loading auctions:', error);
  }
}

function renderAuctions(auctions) {
  const auctionsList = document.getElementById('auctionsList');
  auctionsList.innerHTML = '';
  if (auctions.length === 0) {
    auctionsList.innerHTML = '<p style="text-align:center; color:#999; grid-column:1/-1;">Không tìm thấy phiên đấu giá nào.</p>';
    return;
  }
  auctions.forEach(auction => {
    const card = createAuctionCard(auction);
    auctionsList.appendChild(card);
  });
}

function filterAuctions() {
  const categoryId = document.getElementById('categoryFilter').value;
  const search = document.getElementById('searchInput').value.trim().toLowerCase();

  const filtered = allAuctions.filter(a => {
    const matchCategory = !categoryId || String(a.category_id) === String(categoryId);
    const matchSearch = !search ||
      (a.product_name && a.product_name.toLowerCase().includes(search)) ||
      (a.seller_name && a.seller_name.toLowerCase().includes(search));
    return matchCategory && matchSearch;
  });

  renderAuctions(filtered);
}

function createAuctionCard(auction) {
  const card = document.createElement('div');
  card.className = 'auction-card';
  card.onclick = () => showAuctionDetail(auction.auction_id);

  const statusClass = `status-${auction.auction_status}`;
  const endTime = new Date(auction.end_time);
  const timeLeft = formatTimeLeft(endTime);

  // Hiển thị thông tin người thắng nếu phiên đã kết thúc
  let winnerInfo = '';
  if (auction.auction_status === 'ended' && auction.winner_name) {
    const isCurrentUserWinner = currentUser && auction.winner_id === currentUser.user_id;
    const winnerStyle = isCurrentUserWinner 
      ? 'background:#d4edda; color:#155724; border:2px solid #28a745;' 
      : 'background:#d4edda; color:#155724;';
    
    winnerInfo = `
      <div class="winner-info" style="${winnerStyle} padding:0.5rem; border-radius:4px; margin:0.5rem 0; font-size:0.9rem; text-align:center;">
        ${isCurrentUserWinner ? '🎉 BẠN ĐÃ THẮNG!' : `🏆 ${auction.winner_name}`}<br>
        ${formatCurrency(auction.current_price)}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="auction-image">
      <img src="${auction.picture_url || 'https://via.placeholder.com/280x200?text=No+Image'}" alt="${auction.product_name}">
    </div>
    <div class="auction-info">
      <h3>${auction.product_name}</h3>
      <p class="seller-info">Người bán: ${auction.seller_name}</p>
      <div class="price-display">${formatCurrency(auction.current_price || auction.opening_bid)}</div>
      ${winnerInfo}
      <div class="auction-meta">
        <span>📍 ${auction.participant_count || 0} người</span>
        <span>⏱️ ${timeLeft}</span>
      </div>
      <div class="status-badge ${statusClass}">${translateStatus(auction.auction_status)}</div>
    </div>
  `;

  return card;
}

function initSocket() {
  if (socket) return;
  if (typeof window.io === 'undefined') {
    console.warn('Socket.io client not found; real-time updates disabled.');
    return;
  }
  if (!SOCKET_URL) return;

  socket = window.io(SOCKET_URL, {
    transports: ['websocket'],
  });

  socket.on('auction:bidsUpdated', async (payload) => {
    if (!payload || payload.auction_id !== activeAuctionId) return;

    try {
      if (payload.current_price !== undefined) {
        const el = document.getElementById('detailCurrentPrice');
        if (el) el.textContent = formatCurrency(payload.current_price);
      }

      // Cập nhật end_time nếu được gia hạn
      if (payload.end_time) {
        const endEl = document.getElementById('detailEndTime');
        if (endEl) endEl.textContent = formatDateTime(payload.end_time);
        startCountdown(payload.end_time);
        // Hiện thông báo gia hạn
        const extEl = document.getElementById('extensionNotice');
        if (extEl) {
          extEl.textContent = `⏰ Gia hạn! Kết thúc lúc: ${formatDateTime(payload.end_time)}`;
          extEl.style.display = 'block';
          setTimeout(() => { extEl.style.display = 'none'; }, 5000);
        }
      }

      // Refresh bids list
      const bidsResponse = await fetch(`${API_URL}/auctions/${payload.auction_id}/bids`);
      const bids = await bidsResponse.json();
      const bidsList = document.getElementById('bidsList');
      if (!bidsList) return;
      bidsList.innerHTML = '';
      if (bids.length === 0) {
        bidsList.innerHTML = '<p style="text-align: center; color: #999;">Chưa có lịch sử trả giá</p>';
      } else {
        bids.forEach(bid => {
          const bidItem = document.createElement('div');
          bidItem.className = 'bid-item';
          bidItem.innerHTML = `
            <div>
              <div class="bid-user">${bid.name || bid.username}</div>
              <div class="bid-time">${formatDateTime(bid.bid_time)}</div>
            </div>
            <div class="bid-price">${formatCurrency(bid.bid_price)}</div>
          `;
          bidsList.appendChild(bidItem);
        });
      }
    } catch (error) {
      console.error('Real-time update error:', error);
    }
  });

  socket.on('auction:ended', (payload) => {
    if (!payload) return;
    if (payload.auction_id === activeAuctionId) {
      if (countdownInterval) clearInterval(countdownInterval);
      const el = document.getElementById('detailCountdown');
      if (el) { el.textContent = '⏰ Đã kết thúc'; el.style.color = '#999'; }
    }
    
    // Hiển thị thông báo người thắng nếu có thông tin và đang xem chi tiết
    if (payload.winner_id && payload.auction_id === activeAuctionId) {
      const winnerAnnouncement = document.getElementById('winnerAnnouncement');
      if (winnerAnnouncement) {
        const isCurrentUserWinner = currentUser && payload.winner_id === currentUser.user_id;
        const winnerText = isCurrentUserWinner ? '🎉 BẠN LÀ NGƯỜI CHIẾN THẮNG!' : `🏆 NGƯỜI CHIẾN THẮNG: ${payload.winner_name || payload.winner_id}`;
        const bgColor = isCurrentUserWinner ? '#d4edda' : '#d4edda';
        
        winnerAnnouncement.innerHTML = `
          ${winnerText}<br>
          💰 <strong>GIÁ TRÚNG THẦU:</strong> ${formatCurrency(payload.final_price)}
        `;
        winnerAnnouncement.style.backgroundColor = bgColor;
        winnerAnnouncement.style.display = 'block';
        
        if (isCurrentUserWinner) {
          setTimeout(() => {
            showAlert('🎉 Chúc mừng! Bạn đã thắng phiên đấu giá này!', 'success');
          }, 1000);
        }
      }
    }

    // Reload chi tiết nếu đang mở phiên này
    if (payload.auction_id === activeAuctionId) {
      showAuctionDetail(payload.auction_id);
    }

    // Refresh toàn bộ danh sách auctions để cập nhật trạng thái badge
    loadAuctions();
  });

  socket.on('auction:statusChanged', (payload) => {
    if (!payload) return;
    console.log(`🔄 Phiên ${payload.auction_id} chuyển sang trạng thái: ${payload.new_status}`);

    // Nếu người dùng đang xem chi tiết phiên đó, reload chi tiết
    if (payload.auction_id === activeAuctionId) {
      showAuctionDetail(payload.auction_id);
    }

    // Refresh toàn bộ danh sách auctions để cập nhật trạng thái badge
    loadAuctions();
  });
}

function joinAuctionRoom(auctionId) {
  if (!auctionId) return;
  initSocket();
  if (!socket) return;
  socket.emit('auction:join', { auction_id: auctionId });
}

function leaveAuctionRoom(auctionId) {
  if (!auctionId || !socket) return;
  socket.emit('auction:leave', { auction_id: auctionId });
}

async function showAuctionDetail(auctionId) {
  try {
    const response = await fetch(`${API_URL}/auctions/${auctionId}`);
    const auction = await response.json();
    currentAuction = auction;
    activeAuctionId = auctionId;
    joinAuctionRoom(auctionId);

    const bidsResponse = await fetch(`${API_URL}/auctions/${auctionId}/bids`);
    const bids = await bidsResponse.json();

    // Kiểm tra trạng thái đăng ký nếu người dùng đã đăng nhập
    let isRegistered = false;
    if (token) {
      try {
        const regResponse = await fetch(`${API_URL}/auctions/${auctionId}/registration-status`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const regData = await regResponse.json();
        isRegistered = regData.isRegistered;
      } catch (error) {
        console.error('Error checking registration status:', error);
      }
    }

    document.getElementById('detailName').textContent = auction.product_name;
    document.getElementById('detailDescription').textContent = auction.description || '';
    document.getElementById('detailImage').src = auction.picture_url || 'https://via.placeholder.com/400x300?text=No+Image';
    document.getElementById('detailSeller').textContent = auction.seller_name;
    document.getElementById('detailOpeningBid').textContent = formatCurrency(auction.opening_bid);
    document.getElementById('detailCurrentPrice').textContent = formatCurrency(auction.current_price || auction.opening_bid);
    document.getElementById('detailBidIncrement').textContent = formatCurrency(auction.bid_increment);
    document.getElementById('detailEntryFee').textContent = formatCurrency(auction.entry_fee || 0);
    document.getElementById('detailDeposit').textContent = formatCurrency(auction.deposit || 0);
    document.getElementById('detailStatus').textContent = translateStatus(auction.auction_status);
    
    // Hiển thị người thắng nếu phiên đã kết thúc
    const winnerAnnouncement = document.getElementById('winnerAnnouncement');
    if (auction.auction_status === 'ended' && auction.winner_name) {
      const isCurrentUserWinner = currentUser && auction.winner_id === currentUser.user_id;
      const winnerText = isCurrentUserWinner ? '🎉 BẠN LÀ NGƯỜI CHIẾN THẮNG!' : `🏆 NGƯỜI CHIẾN THẮNG: ${auction.winner_name}`;
      const bgColor = isCurrentUserWinner ? '#d4edda' : '#d4edda'; // Có thể đổi màu khác nhau
      
      winnerAnnouncement.innerHTML = `
        ${winnerText}<br>
        💰 <strong>GIÁ TRÚNG THẦU:</strong> ${formatCurrency(auction.current_price)}
      `;
      winnerAnnouncement.style.backgroundColor = bgColor;
      winnerAnnouncement.style.display = 'block';
    } else {
      winnerAnnouncement.style.display = 'none';
    }
    document.getElementById('detailRegStartTime').textContent = auction.registration_start_time ? formatDateTime(auction.registration_start_time) : 'N/A';
    document.getElementById('detailRegEndTime').textContent = auction.registration_end_time ? formatDateTime(auction.registration_end_time) : 'N/A';
    document.getElementById('detailStartTime').textContent = formatDateTime(auction.start_time);
    document.getElementById('detailEndTime').textContent = formatDateTime(auction.end_time);
    document.getElementById('detailParticipants').textContent = auction.participant_count || 0;

    // Hiện giá tối thiểu hợp lệ
    const minNext = Number(auction.current_price || auction.opening_bid) + Number(auction.bid_increment);
    const minEl = document.getElementById('detailMinBid');
    if (minEl) minEl.textContent = formatCurrency(minNext);

    // Khởi động đồng hồ đếm ngược
    if (auction.auction_status === 'ongoing') {
      startCountdown(auction.end_time);
    } else {
      if (countdownInterval) clearInterval(countdownInterval);
      const el = document.getElementById('detailCountdown');
      if (el) { el.textContent = auction.auction_status === 'ended' ? '⏰ Đã kết thúc' : ''; }
    }

    const registerBtn = document.getElementById('registerBtn');
    const bidBtn = document.getElementById('bidBtn');

    // Logic hiển thị nút dựa trên trạng thái phiên và đăng ký
    if (auction.auction_status === 'upcomming') {
      // Phiên sắp bắt đầu: cho đăng ký nếu chưa đăng ký
      registerBtn.classList.toggle('hidden', isRegistered);
      bidBtn.classList.add('hidden');
    } else if (auction.auction_status === 'ongoing') {
      // Phiên đang diễn ra: chỉ cho đặt giá nếu đã đăng ký
      registerBtn.classList.add('hidden');
      bidBtn.classList.toggle('hidden', !isRegistered);
    } else {
      // Phiên đã kết thúc hoặc bị hủy: ẩn cả hai nút
      registerBtn.classList.add('hidden');
      bidBtn.classList.add('hidden');
    }

    const bidsList = document.getElementById('bidsList');
    bidsList.innerHTML = '';

    if (bids.length === 0) {
      bidsList.innerHTML = '<p style="text-align: center; color: #999;">Chưa có lịch sử trả giá</p>';
    } else {
      bids.forEach(bid => {
        const bidItem = document.createElement('div');
        bidItem.className = 'bid-item';
        bidItem.innerHTML = `
          <div>
            <div class="bid-user">${bid.name || bid.username}</div>
            <div class="bid-time">${formatDateTime(bid.bid_time)}</div>
          </div>
          <div class="bid-price">${formatCurrency(bid.bid_price)}</div>
        `;
        bidsList.appendChild(bidItem);
      });
    }

    document.getElementById('auctionModal').classList.add('show');

    // 🔄 Auto-refresh auction status every 30 seconds to catch transitions
    // (e.g., upcomming → ongoing)
    if (statusRefreshInterval) clearInterval(statusRefreshInterval);
    statusRefreshInterval = setInterval(() => {
      fetch(`${API_URL}/auctions/${auctionId}`)
        .then(res => res.json())
        .then(updatedAuction => {
          if (updatedAuction.auction_status !== currentAuction.auction_status) {
            console.log(`⏱️ Status change detected: ${currentAuction.auction_status} → ${updatedAuction.auction_status}`);
            // Re-load auction details to update UI
            showAuctionDetail(auctionId);
          }
        })
        .catch(err => console.error('Auto-refresh error:', err));
    }, 30000); // Every 30 seconds
  } catch (error) {
    showAlert('Error loading auction details', 'error');
    console.error(error);
  }
}

function closeAuctionModal() {
  document.getElementById('auctionModal').classList.remove('show');
  leaveAuctionRoom(activeAuctionId);
  activeAuctionId = null;
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  if (statusRefreshInterval) { clearInterval(statusRefreshInterval); statusRefreshInterval = null; }
}

function showBidForm() {
  if (!token) {
    showAlert('Vui lòng đăng nhập để đặt giá', 'error');
    showLoginForm();
    return;
  }

  const minBidPrice = Number(currentAuction.current_price || currentAuction.opening_bid) + Number(currentAuction.bid_increment);

  if (currentUser.balance < minBidPrice) {
    showAlert(`⚠️ Số dư không đủ! Bạn có ${formatCurrency(currentUser.balance)}, nhưng cần tối thiểu ${formatCurrency(minBidPrice)} để đặt giá`, 'error');
    return;
  }

  document.getElementById('currentBidDisplay').value = currentAuction.current_price || currentAuction.opening_bid;
  document.getElementById('bidIncrement').value = currentAuction.bid_increment;
  document.getElementById('bidBalance').value = formatCurrency(currentUser.balance);
  document.getElementById('bidAmount').min = minBidPrice;
  document.getElementById('bidModal').classList.add('show');
}

function closeBidModal() {
  document.getElementById('bidModal').classList.remove('show');
}

async function placeBid(event) {
  event.preventDefault();

  if (!token) {
    showAlert('Vui lòng đăng nhập', 'error');
    return;
  }

  const bidAmount = parseFloat(document.getElementById('bidAmount').value);

  // Validate balance before placing bid
  if (currentUser.balance < bidAmount) {
    showAlert(`❌ Số dư không đủ! Bạn chỉ có ${formatCurrency(currentUser.balance)} nhưng cần ${formatCurrency(bidAmount)}`, 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auctions/${currentAuction.auction_id}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ bid_price: bidAmount }),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Failed to place bid', 'error');
      return;
    }

    showAlert('✅ Đặt giá thành công! Số dư chỉ bị trừ khi bạn là người thắng khi phiên kết thúc.', 'success');
    closeBidModal();
    showAuctionDetail(currentAuction.auction_id);
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

async function registerAuction() {
  if (!token) {
    showAlert('Vui lòng đăng nhập để đăng ký', 'error');
    showLoginForm();
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auctions/${currentAuction.auction_id}/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Failed to register', 'error');
      return;
    }

    // Update user balance in localStorage
    if (data.newBalance !== undefined) {
      currentUser.balance = data.newBalance;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      
      // Update balance display if profile modal is open
      if (document.getElementById('profileModal').classList.contains('show')) {
        document.getElementById('profileBalance').textContent = formatCurrency(data.newBalance);
      }
    }

    showAlert(`✅ Đăng ký thành công!\nPhí tham gia: ${formatCurrency(data.entry_fee)}\nKý cọc: ${formatCurrency(data.deposit)}\nSố dư còn lại: ${formatCurrency(data.newBalance || 0)}`, 'success');
    showAuctionDetail(currentAuction.auction_id);
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_URL}/products/categories`);
    const categories = await response.json();

    const select = document.getElementById('categoryFilter');
    select.innerHTML = '<option value="">Tất Cả Danh Mục</option>';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.category_id;
      option.textContent = cat.category_name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// ===== UTILITY FUNCTIONS =====

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(value);
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('vi-VN');
}

function formatTimeLeft(endDate) {
  const now = new Date();
  const diff = endDate - now;

  if (diff <= 0) return 'Đã kết thúc';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} ngày`;
  }

  return `${hours}h ${minutes}m`;
}

function translateStatus(status) {
  const translations = {
    'ongoing': '🔴 Đang diễn ra',
    'upcomming': '🟡 Sắp bắt đầu',
    'ended': '⚫ Đã kết thúc',
    'cancelled': '❌ Đã hủy',
  };
  return translations[status] || status;
}

function showAlert(message, type = 'info') {
  // Simple alert using browser alert
  // In production, use a toast notification library
  if (type === 'success') {
    console.log('✅', message);
  } else if (type === 'error') {
    console.error('❌', message);
  } else {
    console.log('ℹ️', message);
  }
  alert(message);
}

// Countdown timer cho phiên đang xem
let countdownInterval = null;

function startCountdown(endTime) {
  if (countdownInterval) clearInterval(countdownInterval);
  const el = document.getElementById('detailCountdown');
  if (!el) return;

  function tick() {
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) {
      el.textContent = '⏰ Đã kết thúc';
      el.style.color = '#999';
      clearInterval(countdownInterval);
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = n => String(n).padStart(2, '0');
    el.textContent = `⏱ ${pad(h)}:${pad(m)}:${pad(s)}`;
    // Đổi màu đỏ khi còn dưới 30 giây
    el.style.color = diff <= 30000 ? '#e74c3c' : '#333';
    el.style.fontWeight = diff <= 30000 ? 'bold' : 'normal';
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function scrollToAuctions() {
  document.getElementById('auctions').scrollIntoView({ behavior: 'smooth' });
}

let selectedTopupAmount = null;

function showProfileModal() {
  if (!token) {
    showAlert('Vui lòng đăng nhập', 'error');
    return;
  }

  // Load user profile from backend
  loadUserProfile();
  document.getElementById('profileModal').classList.add('show');
  selectedTopupAmount = null;
  document.getElementById('customTopupAmount').value = '';
}

async function loadUserProfile() {
  try {
    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      showAlert('Lỗi tải hồ sơ', 'error');
      return;
    }

    const user = await response.json();

    // Update localStorage with latest user data
    currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    // Display user info
    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileName').textContent = user.name || 'N/A';
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profilePhone').textContent = user.phone_num || 'N/A';
    document.getElementById('profileCitizenId').textContent = user.citizen_id || 'Chưa cập nhật';
    document.getElementById('profileAddress').textContent = user.address || 'Chưa cập nhật';
    document.getElementById('profileBalance').textContent = formatCurrency(user.balance || 0);
    document.getElementById('profileRoleSelect').value = user.role;
    document.getElementById('profileStatus').textContent = user.status === 'active' ? '✓ Hoạt động' : 'Tạm khóa';
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

async function updateUserRole() {
  if (!token) {
    showAlert('Vui lòng đăng nhập', 'error');
    return;
  }

  const newRole = document.getElementById('profileRoleSelect').value;

  if (!newRole) {
    showAlert('Vui lòng chọn vai trò', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ newRole }),
    });

    if (!response.ok) {
      const error = await response.json();
      showAlert(error.error || 'Cập nhật vai trò thất bại', 'error');
      return;
    }

    const data = await response.json();
    
    // Update localStorage
    currentUser = data.user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    const roleDisplay = newRole === 'buyer' ? '👤 Người Mua' : '📦 Người Bán';
    showAlert(`✅ Cập nhật vai trò thành công! Bạn là ${roleDisplay}`, 'success');
    
    // Update navbar
    updateUserMenu();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

function selectTopupAmount(amount) {
  selectedTopupAmount = amount;
  document.getElementById('customTopupAmount').value = '';

  // Update button styles
  document.querySelectorAll('.btn-topup').forEach(btn => {
    btn.classList.remove('active');
  });
  
  event.target.classList.add('active');
}

async function confirmTopupBalance() {
  let amount = selectedTopupAmount;

  const customAmount = document.getElementById('customTopupAmount').value;
  if (customAmount && customAmount > 0) {
    amount = parseFloat(customAmount);
    document.querySelectorAll('.btn-topup').forEach(btn => btn.classList.remove('active'));
  }

  if (!amount || amount <= 0) {
    showAlert('Vui lòng chọn hoặc nhập số tiền', 'error');
    return;
  }
  if (amount < 10000) {
    showAlert('Số tiền nạp tối thiểu là 10.000 VND', 'error');
    return;
  }
  if (amount > 100000000) {
    showAlert('Số tiền nạp tối đa là 100.000.000 VND', 'error');
    return;
  }

  // Hiện QR để thanh toán nạp tiền
  showTopupQR(amount);
}

function showTopupQR(amount) {
  const bank = 'MB';            // ĐỔI thành mã ngân hàng của bạn
  const account = '0123456789'; // ĐỔI thành số tài khoản của bạn
  const addInfo = `Nap tien AuctionHub ${currentUser?.username || ''}`;
  const qrUrl = `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}&accountName=AUCTION HUB`;

  document.getElementById('topupQRAmount').textContent = formatCurrency(amount);
  document.getElementById('topupQRImage').src = qrUrl;
  document.getElementById('topupQRModal').dataset.amount = amount;
  document.getElementById('profileModal').classList.remove('show');
  document.getElementById('topupQRModal').classList.add('show');
}

function closeTopupQRModal() {
  document.getElementById('topupQRModal').classList.remove('show');
}

async function confirmTopupQR() {
  const amount = parseFloat(document.getElementById('topupQRModal').dataset.amount);
  if (!amount || !token) return;

  try {
    const response = await fetch(`${API_URL}/auth/add-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      const error = await response.json();
      showAlert(error.error || 'Nạp tiền thất bại', 'error');
      return;
    }

    const data = await response.json();
    currentUser.balance = data.newBalance;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    closeTopupQRModal();
    showAlert(`✅ Nạp tiền thành công! +${formatCurrency(amount)}`, 'success');

    // Reset form và cập nhật số dư trong profile
    selectedTopupAmount = null;
    document.getElementById('customTopupAmount').value = '';
    document.querySelectorAll('.btn-topup').forEach(btn => btn.classList.remove('active'));
    document.getElementById('profileBalance').textContent = formatCurrency(data.newBalance);
    document.getElementById('profileModal').classList.add('show');
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('show');
}

// ===== MY AUCTIONS FUNCTIONS =====

async function ensureMyInvoicesLoaded(force = false) {
  if (!force && myInvoicesLoaded) return;
  if (myInvoicesLoadingPromise) return myInvoicesLoadingPromise;
  if (force) {
    myInvoicesLoaded = false;
    myInvoices = [];
  }

  myInvoicesLoadingPromise = (async () => {
    if (!token) {
      myInvoices = [];
      myInvoicesLoaded = true;
      return;
    }

    try {
      const response = await fetch(`${API_URL}/invoices`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        showAlert(err.error || 'Lỗi tải hóa đơn', 'error');
        myInvoices = [];
        return;
      }

      const invoices = await response.json();
      myInvoices = Array.isArray(invoices) ? invoices : [];
    } catch (error) {
      console.error('Error loading invoices:', error);
      showAlert('Lỗi tải hóa đơn', 'error');
      myInvoices = [];
    } finally {
      myInvoicesLoaded = true;
      myInvoicesLoadingPromise = null;
    }
  })();

  return myInvoicesLoadingPromise;
}

function getInvoiceForAuction(auction_id) {
  return myInvoices.find(inv => inv.auction_id === auction_id) || null;
}

function openInvoiceModal(invoice) {
  document.getElementById('invoiceId').textContent = invoice.invoice_id ?? '';
  document.getElementById('invoiceWinnerName').textContent = invoice.winner_name || invoice.winner_id || '';
  document.getElementById('invoiceProductName').textContent = invoice.product_name || '';
  document.getElementById('invoiceAuctionId').textContent = invoice.auction_id ?? '';
  document.getElementById('invoiceAmount').textContent = formatCurrency(invoice.current_price || 0);

  const deposit = invoice.deposit || 0;
  const remaining = Math.max(0, (invoice.current_price || 0) - deposit);
  document.getElementById('invoiceDeposit').textContent = formatCurrency(deposit);
  document.getElementById('invoiceRemaining').textContent = formatCurrency(remaining);

  document.getElementById('invoiceCreatedAt').textContent = invoice.created_at ? formatDateTime(invoice.created_at) : '';
  document.getElementById('invoiceDueDate').textContent = invoice.due_date ? formatDateTime(invoice.due_date) : '';

  const isPaid = invoice.payment_status === 'paid';
  const isOverdue = invoice.payment_status === 'overdue';
  const statusEl = document.getElementById('invoicePaymentStatus');
  if (isPaid) {
    statusEl.textContent = '✅ Đã thanh toán';
    statusEl.style.color = '#28a745';
  } else if (isOverdue) {
    statusEl.textContent = '❌ Quá hạn — Đã mất cọc';
    statusEl.style.color = '#dc3545';
  } else {
    statusEl.textContent = '⏳ Chưa thanh toán';
    statusEl.style.color = '#e74c3c';
  }
  statusEl.style.fontWeight = 'bold';

  document.getElementById('payBalanceBtn').style.display = (isPaid || isOverdue) ? 'none' : 'inline-block';
  document.getElementById('payQRBtn').style.display = (isPaid || isOverdue) ? 'none' : 'inline-block';

  document.getElementById('invoiceModal').dataset.invoiceId = invoice.invoice_id;
  document.getElementById('invoiceModal').dataset.amount = remaining; // Chỉ thanh toán phần còn lại

  document.getElementById('invoiceModal').classList.add('show');
}

async function openInvoiceModalByAuctionId(auction_id) {
  await ensureMyInvoicesLoaded(true);
  const invoice = getInvoiceForAuction(auction_id);

  if (!invoice) {
    showAlert('Không tìm thấy hóa đơn cho phiên này', 'error');
    return;
  }

  openInvoiceModal(invoice);
}

function closeInvoiceModal() {
  document.getElementById('invoiceModal').classList.remove('show');
}

async function printInvoice() {
  const invoiceId = document.getElementById('invoiceModal').dataset.invoiceId;
  if (!invoiceId || !token) return;

  try {
    showAlert('⏳ Đang tải hóa đơn...', 'info');
    const printUrl = `${API_URL}/invoices/${invoiceId}/print-html`;
    
    // Fetch the HTML invoice
    const response = await fetch(printUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/html'
      }
    });

    if (!response.ok) {
      showAlert('❌ Không thể tải hóa đơn', 'error');
      return;
    }

    const html = await response.text();
    
    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      
      // Optional: auto-trigger print dialog after content loads
      printWindow.addEventListener('load', function() {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      });
    } else {
      showAlert('❌ Không thể mở cửa sổ in (kiểm tra popup blocker)', 'error');
    }
  } catch (error) {
    console.error('Print invoice error:', error);
    showAlert(`❌ Lỗi in hóa đơn: ${error.message}`, 'error');
  }
}

async function payInvoiceByBalance() {
  const invoiceId = document.getElementById('invoiceModal').dataset.invoiceId;
  if (!invoiceId || !token) return;

  if (!confirm('Xác nhận thanh toán bằng số dư tài khoản?')) return;

  try {
    const response = await fetch(`${API_URL}/invoices/${invoiceId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ method: 'balance' }),
    });
    const data = await response.json();
    if (!response.ok) {
      showAlert(data.error || 'Thanh toán thất bại', 'error');
      return;
    }
    showAlert('✅ Thanh toán thành công!', 'success');
    if (data.newBalance !== undefined) {
      currentUser.balance = data.newBalance;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    }
    // Reload invoice
    await ensureMyInvoicesLoaded(true);
    const updated = myInvoices.find(i => i.invoice_id == invoiceId);
    if (updated) openInvoiceModal(updated);
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

function showQRPayment() {
  const invoiceId = document.getElementById('invoiceModal').dataset.invoiceId;
  const amount = document.getElementById('invoiceModal').dataset.amount;

  // Dùng VietQR API để tạo QR thanh toán (ngân hàng mẫu: MB Bank)
  // Format: https://img.vietqr.io/image/{bank}-{account}-{template}.png?amount={amount}&addInfo={info}
  const bank = 'MB';           // Mã ngân hàng
  const account = '0123456789'; // Số tài khoản của bạn - ĐỔI LẠI
  const addInfo = `Thanh toan hoa don ${invoiceId}`;
  const qrUrl = `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}&accountName=AUCTION HUB`;

  document.getElementById('qrAmount').textContent = formatCurrency(Number(amount));
  document.getElementById('qrImage').src = qrUrl;
  document.getElementById('qrModal').dataset.invoiceId = invoiceId;

  document.getElementById('invoiceModal').classList.remove('show');
  document.getElementById('qrModal').classList.add('show');
}

function closeQRModal() {
  document.getElementById('qrModal').classList.remove('show');
}

async function confirmQRPayment() {
  const invoiceId = document.getElementById('qrModal').dataset.invoiceId;
  if (!invoiceId || !token) return;

  try {
    const response = await fetch(`${API_URL}/invoices/${invoiceId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ method: 'qr' }),
    });
    const data = await response.json();
    if (!response.ok) {
      showAlert(data.error || 'Xác nhận thất bại', 'error');
      return;
    }
    showAlert('✅ Xác nhận thanh toán QR thành công!', 'success');
    closeQRModal();
    await ensureMyInvoicesLoaded(true);
    const updated = myInvoices.find(i => i.invoice_id == invoiceId);
    if (updated) openInvoiceModal(updated);
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

function showMyAuctionsModal() {
  if (!token) {
    showAlert('Vui lòng đăng nhập', 'error');
    return;
  }

  document.getElementById('myAuctionsModal').classList.add('show');
  loadMyAuctions('participating');
  ensureMyInvoicesLoaded();
}

function closeMyAuctionsModal() {
  document.getElementById('myAuctionsModal').classList.remove('show');
}

async function switchTab(tab) {
  const participatingTab = document.getElementById('participatingTab');
  const wonTab = document.getElementById('wonTab');

  if (tab === 'participating') {
    participatingTab.style.display = 'block';
    wonTab.style.display = 'none';
  } else {
    participatingTab.style.display = 'none';
    wonTab.style.display = 'block';
  }

  if (tab === 'won') {
    await ensureMyInvoicesLoaded(true);
  }
  loadMyAuctions(tab);
}

async function loadMyAuctions(type) {
  try {
    const response = await fetch(`${API_URL}/auctions`);
    const auctions = await response.json();

    let filteredAuctions;

    if (type === 'participating') {
      // Các phiên đang diễn ra
      filteredAuctions = auctions.filter(a => a.auction_status === 'ongoing');
      const list = document.getElementById('participatingList');
      list.innerHTML = '';

      if (filteredAuctions.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999;">Bạn chưa tham gia phiên nào</p>';
      } else {
        filteredAuctions.forEach(auction => {
          const item = document.createElement('div');
          item.className = 'bid-item';
          item.innerHTML = `
            <div>
              <div class="bid-user">${auction.product_name}</div>
              <div class="bid-time">Trạng thái: ${translateStatus(auction.auction_status)}</div>
            </div>
            <div class="bid-price">${formatCurrency(auction.current_price || auction.opening_bid)}</div>
          `;
          list.appendChild(item);
        });
      }
    } else {
      // Các phiên đã thắng
      filteredAuctions = auctions.filter(a => a.winner_id === currentUser.user_id);
      const list = document.getElementById('wonList');
      list.innerHTML = '';

      if (filteredAuctions.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999;">Bạn chưa thắng phiên nào</p>';
      } else {
        filteredAuctions.forEach(auction => {
          const item = document.createElement('div');
          item.className = 'bid-item';

          const invoice = getInvoiceForAuction(auction.auction_id);
          const isPaid = invoice && invoice.payment_status === 'paid';
          const invoiceStatus = invoice
            ? (isPaid ? '✅ Đã thanh toán' : '⏳ Chưa thanh toán')
            : 'Chưa có hóa đơn';
          const statusColor = isPaid ? '#28a745' : '#e74c3c';

          item.innerHTML = `
            <div>
              <div class="bid-user">${auction.product_name}</div>
              <div class="bid-time">Kết thúc: ${formatDateTime(auction.end_time)}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
              <div class="bid-price">${formatCurrency(auction.current_price)}</div>
              <div style="color:${statusColor}; font-size: 0.9rem; font-weight:bold;">${invoiceStatus}</div>
              ${invoice ? `<button class="btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.9rem;" onclick="openInvoiceModalByAuctionId('${auction.auction_id}')">
                ${isPaid ? '📄 Xem hóa đơn' : '💳 Thanh toán'}
              </button>` : ''}
            </div>
          `;
          list.appendChild(item);
        });
      }
    }
  } catch (error) {
    showAlert('Lỗi tải dữ liệu', 'error');
    console.error(error);
  }
}

// ===== REGISTER AUCTION FUNCTIONS =====

async function showRegisterAuctionModal() {
  if (!token) {
    showAlert('Vui lòng đăng nhập để đăng ký', 'error');
    showLoginForm();
    return;
  }

  document.getElementById('registerAuctionModal').classList.add('show');
  await loadAvailableAuctions();
}

function closeRegisterAuctionModal() {
  document.getElementById('registerAuctionModal').classList.remove('show');
}

async function loadAvailableAuctions() {
  try {
    const response = await fetch(`${API_URL}/auctions`);
    const auctions = await response.json();

    // Chỉ hiển thị phiên sắp bắt đầu hoặc đang diễn ra
    const available = auctions.filter(a => 
      a.auction_status === 'upcomming' || a.auction_status === 'ongoing'
    );

    const list = document.getElementById('availableAuctionsList');
    list.innerHTML = '';

    if (available.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: #999;">Không có phiên đấu giá nào</p>';
    } else {
      available.forEach(auction => {
        const card = document.createElement('div');
        card.className = 'auction-card';
        card.style.cursor = 'pointer';
        card.onclick = () => selectAuction(auction);
        card.innerHTML = `
          <div class="auction-image">
            <img src="${auction.picture_url || 'https://via.placeholder.com/280x200?text=No+Image'}" alt="${auction.product_name}">
          </div>
          <div class="auction-info">
            <h3>${auction.product_name}</h3>
            <div class="price-display">${formatCurrency(auction.opening_bid)}</div>
            <div class="status-badge status-${auction.auction_status}">${translateStatus(auction.auction_status)}</div>
          </div>
        `;
        list.appendChild(card);
      });
    }
  } catch (error) {
    showAlert('Lỗi tải phiên đấu giá', 'error');
    console.error(error);
  }
}

let selectedAuctionForRegister = null;

function selectAuction(auction) {
  selectedAuctionForRegister = auction;
  
  document.getElementById('selectedAuctionName').textContent = auction.product_name;
  document.getElementById('selectedAuctionPrice').textContent = formatCurrency(auction.opening_bid);
  document.getElementById('selectedAuctionFee').textContent = formatCurrency(auction.entry_fee || 0);
  document.getElementById('selectedAuctionDeposit').textContent = formatCurrency(auction.deposit || 0);
  document.getElementById('selectedAuctionInfo').style.display = 'block';
}

async function confirmRegisterAuction() {
  if (!selectedAuctionForRegister) {
    showAlert('Vui lòng chọn phiên đấu giá', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auctions/${selectedAuctionForRegister.auction_id}/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Đăng ký thất bại', 'error');
      return;
    }

    showAlert('Đăng ký thành công!', 'success');
    closeRegisterAuctionModal();
    selectedAuctionForRegister = null;
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

// ===== SELL PRODUCT FUNCTIONS =====

function showSellProductModal() {
  if (!token) {
    showAlert('Vui lòng đăng nhập để đăng bán sản phẩm', 'error');
    showLoginForm();
    return;
  }

  if (currentUser.role !== 'seller') {
    showAlert('Chỉ người bán mới có thể đăng sản phẩm', 'error');
    return;
  }

  // Reset form trước khi mở
  const form = document.getElementById('sellProductModal').querySelector('form');
  if (form) form.reset();

  loadCategoriesForProduct();
  document.getElementById('sellProductModal').classList.add('show');
  
  // Set default times
  const now = new Date();
  const regStart = new Date(now.getTime() + 60000);
  const regEnd = new Date(now.getTime() + 24 * 3600000);
  const startTime = new Date(regEnd.getTime());
  const endTime = new Date(startTime.getTime() + 24 * 3600000);

  document.getElementById('productRegStartTime').value = regStart.toISOString().slice(0, 16);
  document.getElementById('productRegEndTime').value = regEnd.toISOString().slice(0, 16);
  document.getElementById('productStartTime').value = startTime.toISOString().slice(0, 16);
  document.getElementById('productEndTime').value = endTime.toISOString().slice(0, 16);
}

function closeSellProductModal() {
  document.getElementById('sellProductModal').classList.remove('show');
}

async function loadCategoriesForProduct() {
  try {
    const response = await fetch(`${API_URL}/products/categories`);
    const categories = await response.json();

    const select = document.getElementById('productCategory');
    select.innerHTML = '<option value="">-- Chọn Danh Mục --</option>';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.category_id;
      option.textContent = cat.category_name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

async function submitProduct(event) {
  event.preventDefault();

  if (!token) {
    showAlert('Vui lòng đăng nhập', 'error');
    return;
  }

  const productName = document.getElementById('productName').value;
  const productCategory = document.getElementById('productCategory').value;
  const productDescription = document.getElementById('productDescription').value;
  const productImage = document.getElementById('productImage').value;
  const productOpeningBid = parseFloat(document.getElementById('productOpeningBid').value);
  const productBidIncrement = parseFloat(document.getElementById('productBidIncrement').value);
  const productEntryFee = parseFloat(document.getElementById('productEntryFee').value) || 0;
  const productDeposit = parseFloat(document.getElementById('productDeposit').value) || 0;
  const productStartTime = document.getElementById('productStartTime').value;
  const productEndTime = document.getElementById('productEndTime').value;
  const productRegStartTime = document.getElementById('productRegStartTime').value;
  const productRegEndTime = document.getElementById('productRegEndTime').value;

  if (!productName || !productCategory || !productOpeningBid || !productBidIncrement
      || !productRegStartTime || !productRegEndTime || !productStartTime || !productEndTime) {
    showAlert('Vui lòng điền đầy đủ các trường bắt buộc', 'error');
    return;
  }

  if (new Date(productRegStartTime) >= new Date(productRegEndTime)) {
    showAlert('Thời gian kết thúc đăng ký phải sau thời gian mở đăng ký', 'error');
    return;
  }
  if (new Date(productRegEndTime) > new Date(productStartTime)) {
    showAlert('Thời gian kết thúc đăng ký phải trước hoặc bằng thời gian bắt đầu đấu giá', 'error');
    return;
  }
  if (new Date(productStartTime) >= new Date(productEndTime)) {
    showAlert('Thời gian kết thúc đấu giá phải sau thời gian bắt đầu', 'error');
    return;
  }

  const durationMs = new Date(productEndTime) - new Date(productStartTime);
  if (durationMs < 30 * 60 * 1000) {
    showAlert('Thời gian đấu giá tối thiểu là 30 phút', 'error');
    return;
  }
  if (durationMs > 24 * 60 * 60 * 1000) {
    showAlert('Thời gian đấu giá tối đa là 1 ngày (24 giờ)', 'error');
    return;
  }

  if (productOpeningBid < 10000) {
    showAlert('Giá khởi điểm tối thiểu là 10.000 VND', 'error');
    return;
  }

  try {
    // 1. Create product first
    const productResponse = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        product_name: productName,
        category_id: productCategory,
        description: productDescription,
        picture_url: productImage || 'https://via.placeholder.com/400x300?text=No+Image',
      }),
    });

    if (!productResponse.ok) {
      const error = await productResponse.json();
      showAlert(error.error || 'Tạo sản phẩm thất bại', 'error');
      return;
    }

    const productData = await productResponse.json();
    const productId = productData.product.product_id;

    // 2. Create auction
    const auctionResponse = await fetch(`${API_URL}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        product_id: productId,
        opening_bid: productOpeningBid,
        bid_increment: productBidIncrement,
        entry_fee: productEntryFee,
        deposit: productDeposit,
        registration_start_time: new Date(productRegStartTime).toISOString(),
        registration_end_time: new Date(productRegEndTime).toISOString(),
        start_time: new Date(productStartTime).toISOString(),
        end_time: new Date(productEndTime).toISOString(),
        auction_status: 'upcomming'
      }),
    });

    if (!auctionResponse.ok) {
      const error = await auctionResponse.json();
      showAlert(error.error || 'Tạo phiên đấu giá thất bại', 'error');
      return;
    }

    showAlert('✅ Đăng bán sản phẩm thành công! Phiên đấu giá sẽ sắp bắt đầu.', 'success');

    // Reset form trước khi đóng
    document.getElementById('sellProductModal').querySelector('form').reset();
    closeSellProductModal();
    loadAuctions();
  } catch (error) {
    showAlert(error.message, 'error');
    console.error(error);
  }
}

// Close modals when clicking outside
window.onclick = function(event) {
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const auctionModal = document.getElementById('auctionModal');
  const bidModal = document.getElementById('bidModal');
  const profileModal = document.getElementById('profileModal');
  const myAuctionsModal = document.getElementById('myAuctionsModal');
  const invoiceModal = document.getElementById('invoiceModal');
  const registerAuctionModal = document.getElementById('registerAuctionModal');
  const sellProductModal = document.getElementById('sellProductModal');
  const qrModal = document.getElementById('qrModal');

  if (event.target == loginModal) loginModal.classList.remove('show');
  if (event.target == registerModal) registerModal.classList.remove('show');
  if (event.target == auctionModal) closeAuctionModal();
  if (event.target == bidModal) bidModal.classList.remove('show');
  if (event.target == profileModal) profileModal.classList.remove('show');
  if (event.target == myAuctionsModal) myAuctionsModal.classList.remove('show');
  if (event.target == invoiceModal) invoiceModal.classList.remove('show');
  if (event.target == registerAuctionModal) registerAuctionModal.classList.remove('show');
  if (event.target == sellProductModal) sellProductModal.classList.remove('show');
  if (event.target == qrModal) qrModal.classList.remove('show');
  const topupQRModal = document.getElementById('topupQRModal');
  if (event.target == topupQRModal) topupQRModal.classList.remove('show');
};

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('userDropdown');
  const userMenu = document.getElementById('user-menu');
  if (!userMenu.contains(event.target)) {
    dropdown.classList.remove('show');
  }
});
