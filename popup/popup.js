// LC Helper - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSettings();
  initAuthModals();
  loadContests();
  initFilters();
  loadStreakData();
  loadFavorites();
  initRefreshButton();
});

// Clean up when popup closes (though this may not always fire)
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
});

// Auto-refresh interval for today's count (while popup is open)
let todayCountRefreshInterval = null;

// Initialize refresh button for today's count
function initRefreshButton() {
  const refreshBtn = document.getElementById('refreshTodayBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await refreshTodayCount(refreshBtn);
    });
  }
  
  // Start auto-refresh interval
  startAutoRefresh();
}

// Start auto-refresh for today's count
function startAutoRefresh() {
  // Clear any existing interval
  if (todayCountRefreshInterval) {
    clearInterval(todayCountRefreshInterval);
  }
  
  // Check when last refresh happened and refresh if needed
  chrome.storage.local.get('dailyStats', async (result) => {
    const dailyStats = result.dailyStats;
    const lastRefresh = dailyStats?.lastApiSync || 0;
    const timeSinceRefresh = Date.now() - lastRefresh;
    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    // Refresh if it's been more than 5 minutes since last refresh
    if (timeSinceRefresh > REFRESH_THRESHOLD) {
      await refreshTodayCount(null, true);
    }
  });
  
  // Also refresh every 2 minutes while popup is open (for immediate feedback)
  todayCountRefreshInterval = setInterval(() => {
    refreshTodayCount(null, true);
  }, 2 * 60 * 1000); // 2 minutes while popup is open
}

// Stop auto-refresh (when popup closes)
function stopAutoRefresh() {
  if (todayCountRefreshInterval) {
    clearInterval(todayCountRefreshInterval);
    todayCountRefreshInterval = null;
  }
}

// Refresh today's count from APIs
async function refreshTodayCount(button, silent = false) {
  const refreshBtn = button || document.getElementById('refreshTodayBtn');
  
  if (refreshBtn && !silent) {
    refreshBtn.style.opacity = '0.5';
    refreshBtn.style.pointerEvents = 'none';
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SYNC_TODAY_COUNT_FROM_APIS' });
    if (response && response.dailyStats) {
      const todayCountEl = document.getElementById('todayCount');
      if (todayCountEl) {
        const newCount = response.dailyStats.count || 0;
        const oldCount = parseInt(todayCountEl.textContent) || 0;
        
        // Update count
        todayCountEl.textContent = newCount;
        
        // Show visual feedback if count increased (only if not silent)
        if (!silent && newCount > oldCount) {
          todayCountEl.style.transform = 'scale(1.2)';
          todayCountEl.style.color = 'var(--success)';
          setTimeout(() => {
            todayCountEl.style.transform = 'scale(1)';
            todayCountEl.style.color = '';
          }, 500);
        }
      }
    }
  } catch (error) {
    console.error('Error refreshing today count:', error);
  } finally {
    if (refreshBtn && !silent) {
      setTimeout(() => {
        refreshBtn.style.opacity = '1';
        refreshBtn.style.pointerEvents = 'auto';
      }, 1000);
    }
  }
}

// Tab Navigation
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });

}

// API Key Validation
function validateApiKey(key, provider) {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }
  
  const trimmedKey = key.trim();
  
  if (provider === 'openai') {
    // OpenAI keys start with 'sk-' and are typically 51 characters
    if (!trimmedKey.startsWith('sk-')) {
      return { valid: false, error: 'Invalid OpenAI API key format. Keys should start with "sk-"' };
    }
    if (trimmedKey.length < 20 || trimmedKey.length > 100) {
      return { valid: false, error: 'Invalid OpenAI API key length' };
    }
  } else if (provider === 'claude') {
    // Anthropic Claude keys start with 'sk-ant-' 
    if (!trimmedKey.startsWith('sk-ant-')) {
      return { valid: false, error: 'Invalid Claude API key format. Keys should start with "sk-ant-"' };
    }
    if (trimmedKey.length < 30) {
      return { valid: false, error: 'Invalid Claude API key length' };
    }
  } else if (provider === 'gemini') {
    // Gemini keys are typically longer alphanumeric strings (usually 39+ characters)
    if (trimmedKey.length < 20) {
      return { valid: false, error: 'Invalid Gemini API key length. Keys should be at least 20 characters' };
    }
    // Basic format check - should be alphanumeric with possible dashes/underscores
    if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
      return { valid: false, error: 'Invalid Gemini API key format' };
    }
  } else if (provider === 'groq') {
    // Groq keys start with 'gsk_'
    if (!trimmedKey.startsWith('gsk_')) {
      return { valid: false, error: 'Invalid Groq API key format. Keys should start with "gsk_"' };
    }
    if (trimmedKey.length < 20) {
      return { valid: false, error: 'Invalid Groq API key length' };
    }
  } else if (provider === 'together') {
    // Together AI keys are alphanumeric, typically 40+ characters
    if (trimmedKey.length < 20) {
      return { valid: false, error: 'Invalid Together AI API key length. Keys should be at least 20 characters' };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
      return { valid: false, error: 'Invalid Together AI API key format' };
    }
  } else if (provider === 'huggingface') {
    // Hugging Face keys start with 'hf_'
    if (!trimmedKey.startsWith('hf_')) {
      return { valid: false, error: 'Invalid Hugging Face API key format. Keys should start with "hf_"' };
    }
    if (trimmedKey.length < 20) {
      return { valid: false, error: 'Invalid Hugging Face API key length' };
    }
  }
  
  return { valid: true };
}

// Show error message in UI
function showApiKeyError(message) {
  const apiKeyGroup = document.getElementById('apiKey').closest('.input-group');
  let errorEl = apiKeyGroup.querySelector('.error-message');
  
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    apiKeyGroup.appendChild(errorEl);
  }
  
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  
  // Remove error after 5 seconds
  setTimeout(() => {
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  }, 5000);
}

// Clear error message
function clearApiKeyError() {
  const apiKeyGroup = document.getElementById('apiKey').closest('.input-group');
  const errorEl = apiKeyGroup.querySelector('.error-message');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}

// Backend API Configuration
// Update this to your production backend URL when deploying
const API_BASE_URL = 'http://localhost:3000/api/v1'; // Change to https://api.lchelper.com/api/v1 for production

// Authentication Functions
async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }
    
    // Store token
    await chrome.storage.sync.set({ authToken: data.token, userEmail: email });
    
    // Sync local favorites to backend
    await syncFavoritesToBackend();
    
    return data;
  } catch (error) {
    throw error;
  }
}

async function register(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }
    
    // Store token
    await chrome.storage.sync.set({ authToken: data.token, userEmail: email });
    
    // Sync local favorites to backend
    await syncFavoritesToBackend();
    
    return data;
  } catch (error) {
    throw error;
  }
}

// Sync local favorites to backend after login/register
async function syncFavoritesToBackend() {
  const { authToken } = await chrome.storage.sync.get('authToken');
  if (!authToken) return;
  
  try {
    const { favorites = [] } = await chrome.storage.local.get('favorites');
    
    if (favorites.length === 0) {
      // No local favorites, just fetch from backend
      const response = await fetch(`${API_BASE_URL}/favorites`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        await chrome.storage.local.set({ favorites: data.favorites || [] });
      }
      return;
    }
    
    // Upload local favorites to backend (skip duplicates)
    for (const fav of favorites) {
      try {
        const response = await fetch(`${API_BASE_URL}/favorites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            url: fav.url,
            title: fav.title,
            platform: fav.platform,
            difficulty: fav.difficulty
          })
        });
        
        // Ignore errors for duplicates or limit exceeded
        if (!response.ok && response.status !== 409 && response.status !== 403) {
          console.log('LC Helper: Failed to sync favorite:', fav.title);
        }
      } catch (error) {
        console.log('LC Helper: Error syncing favorite:', error.message);
      }
    }
    
    // Fetch updated list from backend
    const response = await fetch(`${API_BASE_URL}/favorites`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      await chrome.storage.local.set({ favorites: data.favorites || [] });
    }
  } catch (error) {
    console.log('LC Helper: Failed to sync favorites:', error.message);
  }
}

async function getSubscriptionStatus() {
  try {
    const { authToken } = await chrome.storage.sync.get('authToken');
    if (!authToken) return null;
    
    const response = await fetch(`${API_BASE_URL}/subscription/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.status === 401) {
      // Token expired, clear it
      await chrome.storage.sync.remove('authToken');
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return null;
  }
}

async function createCheckoutSession(tier = 'premium') {
  try {
    const { authToken } = await chrome.storage.sync.get('authToken');
    if (!authToken) throw new Error('Not authenticated');
    
    const response = await fetch(`${API_BASE_URL}/subscription/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ tier })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create checkout session');
    }
    
    // Open Stripe checkout
    if (data.url) {
      chrome.tabs.create({ url: data.url });
    }
    
    return data;
  } catch (error) {
    throw error;
  }
}

// Settings Management
function initSettings() {
  // Load saved settings
  chrome.storage.sync.get([
    'apiKey', 'apiProvider', 'notifyContests', 'reminderTime', 'autoShowPanel',
    'leetcodeUsername', 'codeforcesUsername', 'codechefUsername',
    'serviceMode', 'authToken', 'userEmail'
  ], async (result) => {
    // Platform usernames
    if (result.leetcodeUsername) {
      document.getElementById('leetcodeUsername').value = result.leetcodeUsername;
    }
    if (result.codeforcesUsername) {
      document.getElementById('codeforcesUsername').value = result.codeforcesUsername;
    }
    if (result.codechefUsername) {
      document.getElementById('codechefUsername').value = result.codechefUsername;
    }
    
    // Service mode
    const serviceMode = result.serviceMode || 'byok';
    document.getElementById('serviceMode').value = serviceMode;
    toggleServiceConfig(serviceMode);
    
    // API settings (for BYOK mode)
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    const provider = result.apiProvider || 'gemini';
    document.getElementById('apiProvider').value = provider;
    updateApiKeyLink(provider);
    
    document.getElementById('notifyContests').checked = result.notifyContests !== false;
    document.getElementById('reminderTime').value = result.reminderTime || '30';
    document.getElementById('autoShowPanel').checked = result.autoShowPanel || false;
    
    // Load subscription status if using service mode
    if (serviceMode === 'lch-service') {
      await loadSubscriptionStatus();
    }
  });
  
  // Service mode toggle
  document.getElementById('serviceMode').addEventListener('change', (e) => {
    toggleServiceConfig(e.target.value);
    if (e.target.value === 'lch-service') {
      loadSubscriptionStatus();
    }
  });
  
  // Update link when provider changes
  document.getElementById('apiProvider').addEventListener('change', (e) => {
    updateApiKeyLink(e.target.value);
  });

  // Toggle API key visibility
  const toggleBtn = document.getElementById('toggleApiKey');
  const apiKeyInput = document.getElementById('apiKey');

  toggleBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveSettings');
    const serviceMode = document.getElementById('serviceMode').value;
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiProvider = document.getElementById('apiProvider').value;
    
    // Validate API key if using BYOK mode
    if (serviceMode === 'byok' && apiKey) {
      const validation = validateApiKey(apiKey, apiProvider);
      if (!validation.valid) {
        showApiKeyError(validation.error);
        saveBtn.style.animation = 'shake 0.5s';
        setTimeout(() => {
          saveBtn.style.animation = '';
        }, 500);
        return;
      }
    }
    
    // Clear any previous errors
    clearApiKeyError();
    
    const settings = {
      leetcodeUsername: document.getElementById('leetcodeUsername').value.trim(),
      codeforcesUsername: document.getElementById('codeforcesUsername').value.trim(),
      codechefUsername: document.getElementById('codechefUsername').value.trim(),
      serviceMode: serviceMode,
      apiKey: serviceMode === 'byok' ? apiKey : '',
      apiProvider: apiProvider,
      notifyContests: document.getElementById('notifyContests').checked,
      reminderTime: document.getElementById('reminderTime').value,
      autoShowPanel: document.getElementById('autoShowPanel').checked
    };

    // Never log the API key - only log that it was saved
    console.log('LC Helper: Settings saved (service mode: ' + serviceMode + ', API key length: ' + (apiKey ? apiKey.length : 0) + ')');
    
    await chrome.storage.sync.set(settings);

    // Update alarms if notifications are enabled
    if (settings.notifyContests) {
      chrome.runtime.sendMessage({ type: 'UPDATE_ALARMS' });
    }
    
    // Trigger immediate streak sync if usernames were changed
    if (settings.leetcodeUsername || settings.codeforcesUsername || settings.codechefUsername) {
      chrome.runtime.sendMessage({ type: 'REFRESH_UNIFIED_STREAK' });
    }

    // Show success state
    saveBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Saved!
    `;
    saveBtn.classList.add('success');

    setTimeout(() => {
      saveBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Save Settings
      `;
      saveBtn.classList.remove('success');
    }, 2000);
  });
}

// Contest Management
let allContests = [];
let currentFilter = 'all';

async function loadContests() {
  const contestList = document.getElementById('contestList');
  contestList.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading contests...</span>
    </div>
  `;

  try {
    // Request contests from background script
    const response = await chrome.runtime.sendMessage({ type: 'GET_CONTESTS' });
    
    if (response && response.contests) {
      allContests = response.contests;
      renderContests();
    } else {
      throw new Error('Failed to load contests');
    }
  } catch (error) {
    console.error('Error loading contests:', error);
    contestList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">😕</div>
        <p>Failed to load contests. Please try again.</p>
      </div>
    `;
  }
}

function renderContests() {
  const contestList = document.getElementById('contestList');
  let filteredContests = allContests;

  if (currentFilter !== 'all') {
    filteredContests = allContests.filter(c => c.platform === currentFilter);
  }

  if (filteredContests.length === 0) {
    contestList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>No upcoming contests found.</p>
      </div>
    `;
    return;
  }

  contestList.innerHTML = filteredContests.map(contest => {
    const countdown = getCountdown(contest.startTime);
    const countdownClass = countdown.hours < 1 ? 'live' : countdown.hours < 24 ? 'soon' : '';

    return `
      <div class="contest-card" data-url="${contest.url}">
        <div class="contest-header">
          <div class="contest-platform ${contest.platform}">
            ${getPlatformIcon(contest.platform)}
          </div>
          <div class="contest-info">
            <div class="contest-name" title="${contest.name}">${contest.name}</div>
            <div class="contest-platform-name">${getPlatformName(contest.platform)}</div>
          </div>
        </div>
        <div class="contest-details">
          <div class="contest-detail">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${formatDate(contest.startTime)}
          </div>
          <div class="contest-detail">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${formatDuration(contest.duration)}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
          <span class="contest-countdown ${countdownClass}">
            ${countdown.text}
          </span>
          <button class="notify-btn ${contest.notified ? 'active' : ''}" data-contest-id="${contest.id}">
            ${contest.notified ? '🔔 Reminder Set' : '🔕 Remind Me'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  contestList.querySelectorAll('.contest-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('notify-btn')) {
        chrome.tabs.create({ url: card.dataset.url });
      }
    });
  });

  contestList.querySelectorAll('.notify-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const contestId = btn.dataset.contestId;
      const isActive = btn.classList.contains('active');

      // Toggle notification
      await chrome.runtime.sendMessage({
        type: 'TOGGLE_CONTEST_NOTIFICATION',
        contestId,
        enabled: !isActive
      });

      btn.classList.toggle('active');
      btn.textContent = !isActive ? '🔔 Reminder Set' : '🔕 Remind Me';
    });
  });
}

function initFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.platform;
      renderContests();
    });
  });

  // Refresh button
  document.getElementById('refreshContests').addEventListener('click', async () => {
    const btn = document.getElementById('refreshContests');
    btn.classList.add('spinning');

    await chrome.runtime.sendMessage({ type: 'REFRESH_CONTESTS' });
    await loadContests();

    btn.classList.remove('spinning');
  });
}

// Helper Functions
function getPlatformIcon(platform) {
  switch (platform) {
    case 'leetcode': return 'LC';
    case 'codeforces': return 'CF';
    case 'codechef': return 'CC';
    default: return '?';
  }
}

function getPlatformName(platform) {
  switch (platform) {
    case 'leetcode': return 'LeetCode';
    case 'codeforces': return 'Codeforces';
    case 'codechef': return 'CodeChef';
    default: return platform;
  }
}

function getCountdown(startTime) {
  const now = new Date();
  const start = new Date(startTime);
  const diff = start - now;

  if (diff < 0) {
    return { text: '🔴 Live Now!', hours: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let text = '';
  if (days > 0) {
    text = `${days}d ${hours}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m`;
  } else {
    text = `${minutes}m`;
  }

  return { text: `⏰ ${text}`, hours: days * 24 + hours };
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(minutes) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

function updateApiKeyLink(provider) {
  const link = document.getElementById('apiKeyLink');
  const links = {
    'openai': { url: 'https://platform.openai.com/api-keys', text: 'Get OpenAI API key →' },
    'claude': { url: 'https://console.anthropic.com/settings/keys', text: 'Get Claude API key →' },
    'gemini': { url: 'https://aistudio.google.com/app/apikey', text: 'Get Gemini API key →' },
    'groq': { url: 'https://console.groq.com/keys', text: 'Get Groq API key (Free) →' },
    'together': { url: 'https://api.together.xyz/settings/api-keys', text: 'Get Together AI API key (Free) →' },
    'huggingface': { url: 'https://huggingface.co/settings/tokens', text: 'Get Hugging Face API key (Free) →' }
  };
  
  const linkInfo = links[provider] || links['openai'];
  link.href = linkInfo.url;
  link.textContent = linkInfo.text;
}

// Toggle service configuration visibility
function toggleServiceConfig(serviceMode) {
  const byokConfig = document.getElementById('byokConfig');
  const serviceConfig = document.getElementById('serviceConfig');
  
  if (serviceMode === 'byok') {
    byokConfig.style.display = 'block';
    serviceConfig.style.display = 'none';
  } else {
    byokConfig.style.display = 'none';
    serviceConfig.style.display = 'block';
  }
}

// Load and display subscription status
async function loadSubscriptionStatus() {
  const statusEl = document.getElementById('subscriptionStatus');
  const tierEl = document.getElementById('subscriptionTier');
  const infoEl = document.getElementById('subscriptionInfo');
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const subscribeBtn = document.getElementById('subscribeBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  
  const { authToken, userEmail } = await chrome.storage.sync.get(['authToken', 'userEmail']);
  
  if (!authToken) {
    statusEl.textContent = 'Not logged in';
    tierEl.textContent = '';
    tierEl.className = 'tier-badge';
    infoEl.innerHTML = '<p>Login or register to subscribe to premium service.</p>';
    loginBtn.style.display = 'inline-block';
    registerBtn.style.display = 'inline-block';
    subscribeBtn.style.display = 'none';
    logoutBtn.style.display = 'none';
    return;
  }
  
  // User is logged in
  loginBtn.style.display = 'none';
  registerBtn.style.display = 'none';
  logoutBtn.style.display = 'inline-block';
  
  const subscription = await getSubscriptionStatus();
  
  if (!subscription || !subscription.hasSubscription) {
    statusEl.textContent = 'No active subscription';
    tierEl.textContent = '';
    tierEl.className = 'tier-badge';
    infoEl.innerHTML = '<p>Subscribe to unlock unlimited hints!</p>';
    subscribeBtn.style.display = 'inline-block';
    subscribeBtn.textContent = 'Subscribe ($9.99/month)';
  } else {
    statusEl.textContent = subscription.isActive ? 'Active' : 'Inactive';
    tierEl.textContent = subscription.tier.toUpperCase();
    tierEl.className = `tier-badge tier-${subscription.tier}`;
    
    if (subscription.isActive) {
      const periodEnd = subscription.currentPeriodEnd 
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
        : 'N/A';
      infoEl.innerHTML = `<p>Subscription active until ${periodEnd}</p>`;
      subscribeBtn.style.display = 'none';
    } else {
      infoEl.innerHTML = '<p>Your subscription has expired. Renew to continue using the service.</p>';
      subscribeBtn.style.display = 'inline-block';
      subscribeBtn.textContent = 'Renew Subscription';
    }
  }
}

// Initialize authentication modals
function initAuthModals() {
  // Login modal
  const loginModal = document.getElementById('loginModal');
  const loginBtn = document.getElementById('loginBtn');
  const closeLoginModal = document.getElementById('closeLoginModal');
  const submitLogin = document.getElementById('submitLogin');
  const showRegister = document.getElementById('showRegister');
  
  loginBtn.addEventListener('click', () => {
    loginModal.style.display = 'flex';
  });
  
  closeLoginModal.addEventListener('click', () => {
    loginModal.style.display = 'none';
  });
  
  showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.style.display = 'none';
    document.getElementById('registerModal').style.display = 'flex';
  });
  
  submitLogin.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    if (!email || !password) {
      errorEl.textContent = 'Please enter email and password';
      errorEl.style.display = 'block';
      return;
    }
    
    try {
      submitLogin.disabled = true;
      submitLogin.textContent = 'Logging in...';
      await login(email, password);
      loginModal.style.display = 'none';
      await loadSubscriptionStatus();
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    } finally {
      submitLogin.disabled = false;
      submitLogin.textContent = 'Login';
    }
  });
  
  // Register modal
  const registerModal = document.getElementById('registerModal');
  const registerBtn = document.getElementById('registerBtn');
  const closeRegisterModal = document.getElementById('closeRegisterModal');
  const submitRegister = document.getElementById('submitRegister');
  const showLogin = document.getElementById('showLogin');
  
  registerBtn.addEventListener('click', () => {
    registerModal.style.display = 'flex';
  });
  
  closeRegisterModal.addEventListener('click', () => {
    registerModal.style.display = 'none';
  });
  
  showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
  });
  
  submitRegister.addEventListener('click', async () => {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const errorEl = document.getElementById('registerError');
    
    if (!email || !password || !passwordConfirm) {
      errorEl.textContent = 'Please fill in all fields';
      errorEl.style.display = 'block';
      return;
    }
    
    if (password.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters';
      errorEl.style.display = 'block';
      return;
    }
    
    if (password !== passwordConfirm) {
      errorEl.textContent = 'Passwords do not match';
      errorEl.style.display = 'block';
      return;
    }
    
    try {
      submitRegister.disabled = true;
      submitRegister.textContent = 'Registering...';
      await register(email, password);
      registerModal.style.display = 'none';
      await loadSubscriptionStatus();
      document.getElementById('registerEmail').value = '';
      document.getElementById('registerPassword').value = '';
      document.getElementById('registerPasswordConfirm').value = '';
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    } finally {
      submitRegister.disabled = false;
      submitRegister.textContent = 'Register';
    }
  });
  
  // Subscribe button
  document.getElementById('subscribeBtn').addEventListener('click', async () => {
    try {
      await createCheckoutSession('premium');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });
  
  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await chrome.storage.sync.remove(['authToken', 'userEmail']);
    await loadSubscriptionStatus();
  });
  
  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === loginModal) {
      loginModal.style.display = 'none';
    }
    if (e.target === registerModal) {
      registerModal.style.display = 'none';
    }
  });
}

// Unified Streak Data Management (API-based backend, classic UI)
async function loadStreakData() {
  try {
    // Fetch streak data and daily stats in parallel
    const [streakResponse, dailyResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_STREAK_DATA' }),
      chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' })
    ]);
    
    const streakData = streakResponse.streakData;
    const dailyStats = dailyResponse.dailyStats;
    
    // Update today's problem count
    const todayCount = dailyStats?.count || 0;
    document.getElementById('todayCount').textContent = todayCount;
    
    // Auto-refresh will be handled by initRefreshButton() which calls refreshTodayCount()
    
    if (!streakData) {
      // Show default state
      document.getElementById('currentStreak').textContent = '0';
      document.getElementById('longestStreak').textContent = '0';
      document.getElementById('progressLabel').textContent = 'Configure usernames in settings';
      return;
    }
    
    // Ensure values are valid numbers
    const currentStreak = Number(streakData.currentStreak) || 0;
    
    // Update current streak
    document.getElementById('currentStreak').textContent = currentStreak;
    
    // Update flame emoji based on streak
    const flameEl = document.querySelector('.streak-flame');
    if (flameEl) {
      if (currentStreak === 0) {
        flameEl.textContent = '❄️'; // Freezing cold for 0 days
        flameEl.classList.add('cold');
        flameEl.classList.remove('hot');
      } else {
        flameEl.textContent = '🔥'; // Fire emoji
        flameEl.classList.remove('cold');
        flameEl.classList.add('hot');
      }
    }
    
    // Update status with motivational messages
    const statusEl = document.getElementById('streakStatus');
    const statusDot = statusEl.querySelector('.status-dot');
    const statusText = statusEl.querySelector('.status-text');
    
    // Check if active today (lastActiveDate is today)
    const today = new Date().toISOString().split('T')[0];
    const lastActive = streakData.lastActiveDate;
    const solvedToday = lastActive === today;
    
    if (solvedToday) {
      statusDot.classList.add('active');
      statusText.textContent = getMotivationalMessage(currentStreak, true);
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = getMotivationalMessage(currentStreak, false);
    }
    
    // Update progress to next milestone
    const milestones = [7, 30, 50, 100, 365];
    const nextMilestone = milestones.find(m => m > currentStreak) || 365;
    const progress = (currentStreak / nextMilestone) * 100;
    
    document.getElementById('streakProgress').style.width = `${Math.min(progress, 100)}%`;
    
    // Get milestone name
    const milestoneName = getMilestoneName(nextMilestone);
    document.getElementById('progressLabel').textContent = 
      `${currentStreak}/${nextMilestone} to ${milestoneName}`;
    
    // Update longest streak
    const longestStreak = Number(streakData.longestStreak) || 0;
    document.getElementById('longestStreak').textContent = longestStreak;
    
  } catch (error) {
    console.error('Error loading streak data:', error);
  }
}

function getMotivationalMessage(streak, solvedToday) {
  // Ensure streak is a number
  const streakNum = Number(streak) || 0;
  
  if (solvedToday) {
    if (streakNum === 0) return "🌟 Great start! Come back tomorrow!";
    if (streakNum === 1) return "🌟 Great start! Come back tomorrow!";
    if (streakNum < 7) return `✨ ${streakNum} days! You're building momentum!`;
    if (streakNum < 30) return `🔥 On fire! ${streakNum} days strong!`;
    if (streakNum < 50) return `💪 Unstoppable! ${streakNum} days!`;
    if (streakNum < 100) return `🏆 Legendary! ${streakNum} days!`;
    return `👑 Master! ${streakNum} days of dedication!`;
  } else {
    if (streakNum === 0) return "🚀 Start your journey today!";
    if (streakNum === 1) return "💪 Keep your new streak alive!";
    if (streakNum < 7) return `🔥 Don't break your ${streakNum}-day streak!`;
    if (streakNum < 30) return `⚡ Keep the fire burning! ${streakNum} days!`;
    if (streakNum < 100) return `💎 Your ${streakNum}-day streak is precious!`;
    return `👑 Protect your legendary ${streakNum}-day streak!`;
  }
}


function getMilestoneName(milestone) {
  const names = {
    7: "Week Warrior 🏅",
    30: "Month Master 🏆",
    50: "Elite Solver 💎",
    100: "Century Club 👑",
    365: "Legend Status 🌟"
  };
  return names[Number(milestone)] || "Next Level";
}

// ============================================
// FAVORITES MANAGEMENT
// ============================================

async function loadFavorites() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_FAVORITES' });
    const favorites = response.favorites || [];
    
    // Check if user is logged in to show limit info
    const { authToken } = await chrome.storage.sync.get('authToken');
    if (authToken) {
      try {
        const apiResponse = await fetch(`${API_BASE_URL}/favorites`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (apiResponse.ok) {
          const data = await apiResponse.json();
          renderFavorites(data.favorites || [], data.limit, data.count, data.tier);
          return;
        }
      } catch (error) {
        console.log('LC Helper: Failed to get favorites limit info:', error);
      }
    }
    
    renderFavorites(favorites);
  } catch (error) {
    console.error('Error loading favorites:', error);
  }
}

function renderFavorites(favorites, limit = null, count = null, tier = null) {
  const favoritesList = document.getElementById('favoritesList');
  const favoritesCount = document.getElementById('favoritesCount');
  
  // Show count with limit info if available
  if (limit !== null && count !== null) {
    if (tier === 'free') {
      favoritesCount.textContent = `${count}/${limit} saved (Free)`;
      favoritesCount.title = 'Upgrade to premium for unlimited favorites!';
    } else {
      favoritesCount.textContent = `${count} saved (Premium)`;
    }
  } else {
    favoritesCount.textContent = `${favorites.length} saved`;
  }
  
  if (favorites.length === 0) {
    favoritesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❤️</div>
        <p>No favorites yet. Add problems from any platform!</p>
        ${tier === 'free' ? '<p class="favorites-limit-hint">Free tier: Up to 50 favorites</p>' : ''}
      </div>
    `;
    return;
  }
  
  // Sort by most recently added
  const sortedFavorites = [...favorites].sort((a, b) => b.addedAt - a.addedAt);
  
  favoritesList.innerHTML = sortedFavorites.map(fav => {
    const platformIcon = getPlatformIcon(fav.platform);
    const difficultyClass = (fav.difficulty || 'unknown').toLowerCase();
    
    return `
      <div class="favorite-card" data-url="${fav.url}">
        <div class="favorite-platform ${fav.platform}">${platformIcon}</div>
        <div class="favorite-info">
          <div class="favorite-title" title="${escapeHtml(fav.title)}">${escapeHtml(fav.title)}</div>
          <div class="favorite-meta">
            <span class="favorite-difficulty ${difficultyClass}">${fav.difficulty || 'Unknown'}</span>
            <span>${getPlatformName(fav.platform)}</span>
          </div>
        </div>
        <button class="favorite-remove-btn" data-id="${fav.id}" title="Remove from favorites">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');
  
  // Add click handlers for opening problems
  favoritesList.querySelectorAll('.favorite-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.favorite-remove-btn')) {
        chrome.tabs.create({ url: card.dataset.url });
      }
    });
  });
  
  // Add click handlers for remove buttons
  favoritesList.querySelectorAll('.favorite-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      
      try {
        const removeResponse = await chrome.runtime.sendMessage({
          type: 'REMOVE_FAVORITE',
          id
        });
        
        if (removeResponse && !removeResponse.success) {
          alert(removeResponse.error || 'Failed to remove favorite');
        }
      } catch (error) {
        console.error('Error removing favorite:', error);
      }
      
      // Reload favorites
      loadFavorites();
    });
  });
  
  // Initialize pick one button after rendering
  initPickOneButton(favorites);
}

// Pick one random favorite functionality
let pickOneHandler = null;

function initPickOneButton(favorites) {
  const pickOneBtn = document.getElementById('pickOneBtn');
  if (!pickOneBtn) return;
  
  // Remove old event listener if it exists
  if (pickOneHandler) {
    pickOneBtn.removeEventListener('click', pickOneHandler);
  }
  
  // Hide button if no favorites
  if (favorites.length === 0) {
    pickOneBtn.style.display = 'none';
    return;
  }
  
  pickOneBtn.style.display = 'flex';
  
  // Create new handler
  pickOneHandler = () => {
    if (favorites.length === 0) {
      return;
    }
    
    // Pick a random favorite
    const randomIndex = Math.floor(Math.random() * favorites.length);
    const randomFavorite = favorites[randomIndex];
    
    // Open in new tab
    if (randomFavorite && randomFavorite.url) {
      chrome.tabs.create({ url: randomFavorite.url });
    }
  };
  
  pickOneBtn.addEventListener('click', pickOneHandler);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

