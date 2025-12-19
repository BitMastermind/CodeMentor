// CodeMentor - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSettings();
  // Backend authentication removed - Extension is now fully client-side
  initFeedbackModal();
  loadContests();
  initFilters();
  loadStreakData();
  loadFavorites();
  initRefreshButton();
  
  // Initialize analytics and error tracking
  if (typeof LCAnalytics !== 'undefined') {
    LCAnalytics.init();
    LCAnalytics.trackPageView('popup', 'CodeMentor Popup');
  }
  
  // Track popup open
  if (typeof LCAnalytics !== 'undefined') {
    LCAnalytics.trackEvent('popup_opened');
  }
});

// Clean up when popup closes (though this may not always fire)
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
  stopContestCountdown();
});

// Auto-refresh interval for today's count (while popup is open)
let todayCountRefreshInterval = null;

// Auto-refresh interval for contest countdown (while popup is open)
let contestCountdownInterval = null;

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
  } else if (provider === 'openrouter') {
    // OpenRouter keys start with 'sk-or-'
    if (trimmedKey && !trimmedKey.startsWith('sk-or-')) {
      return { valid: false, error: 'Invalid OpenRouter API key format. Keys should start with "sk-or-"' };
    }
    if (trimmedKey && trimmedKey.length < 20) {
      return { valid: false, error: 'Invalid OpenRouter API key length' };
    }
  } else if (provider === 'custom') {
    // Custom endpoint - validate URL format
    const customEndpoint = document.getElementById('customEndpoint')?.value.trim();
    const customModel = document.getElementById('customModel')?.value.trim();
    
    if (!customEndpoint) {
      return { valid: false, error: 'Custom endpoint URL is required' };
    }
    if (!customEndpoint.startsWith('http://') && !customEndpoint.startsWith('https://')) {
      return { valid: false, error: 'Custom endpoint must be a valid HTTP/HTTPS URL' };
    }
    if (!customModel) {
      return { valid: false, error: 'Model name is required for custom endpoint' };
    }
    // API key is optional for custom endpoints
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

// Show username errors
function showUsernameErrors(errors) {
  // Clear previous errors first
  clearUsernameErrors();
  
  errors.forEach(error => {
    let inputId;
    if (error.platform === 'LeetCode') {
      inputId = 'leetcodeUsername';
    } else if (error.platform === 'Codeforces') {
      inputId = 'codeforcesUsername';
    } else if (error.platform === 'CodeChef') {
      inputId = 'codechefUsername';
    } else {
      // System error - show in a general location
      const settingsGroup = document.querySelector('#settings-tab .settings-group');
      if (settingsGroup) {
        let errorEl = settingsGroup.querySelector('.username-error-message');
        if (!errorEl) {
          errorEl = document.createElement('div');
          errorEl.className = 'error-message username-error-message';
          errorEl.style.marginTop = '8px';
          settingsGroup.insertBefore(errorEl, settingsGroup.firstChild);
        }
        errorEl.textContent = `⚠️ ${error.message}`;
        errorEl.style.display = 'block';
      }
      return;
    }
    
    const input = document.getElementById(inputId);
    if (input) {
      const inputGroup = input.closest('.input-group');
      let errorEl = inputGroup.querySelector('.error-message');
      
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        inputGroup.appendChild(errorEl);
      }
      
      errorEl.textContent = `⚠️ ${error.message}`;
      errorEl.style.display = 'block';
      
      // Highlight the input field
      input.style.borderColor = 'var(--danger)';
      
      // Remove highlight after 5 seconds
      setTimeout(() => {
        input.style.borderColor = '';
      }, 5000);
    }
  });
}

// Clear username errors
function clearUsernameErrors() {
  // Clear errors from all username fields
  ['leetcodeUsername', 'codeforcesUsername', 'codechefUsername'].forEach(inputId => {
    const input = document.getElementById(inputId);
    if (input) {
      const inputGroup = input.closest('.input-group');
      const errorEl = inputGroup.querySelector('.error-message');
      if (errorEl) {
        errorEl.style.display = 'none';
      }
      input.style.borderColor = '';
    }
  });
  
  // Clear general error message
  const generalError = document.querySelector('.username-error-message');
  if (generalError) {
    generalError.style.display = 'none';
  }
}

// Backend removed - Extension is now fully client-side (BYOK only)

// Settings Management
function initSettings() {
  // Load saved settings
  chrome.storage.sync.get([
    'apiKey', 'apiProvider', 'notifyContests', 'reminderTime', 'autoShowPanel',
    'leetcodeUsername', 'codeforcesUsername', 'codechefUsername'
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
    
    // API settings
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    const provider = result.apiProvider || 'gemini';
    document.getElementById('apiProvider').value = provider;
    updateApiKeyLink(provider);
    updateCustomFields(provider);
    
    // Load custom endpoint settings
    chrome.storage.sync.get(['customEndpoint', 'customModel'], (customResult) => {
      if (customResult.customEndpoint) {
        document.getElementById('customEndpoint').value = customResult.customEndpoint;
      }
      if (customResult.customModel) {
        document.getElementById('customModel').value = customResult.customModel;
      }
    });
    
    document.getElementById('notifyContests').checked = result.notifyContests !== false;
    document.getElementById('reminderTime').value = result.reminderTime || '30';
    document.getElementById('autoShowPanel').checked = result.autoShowPanel || false;
    
  });
  
  // Update link when provider changes
  document.getElementById('apiProvider').addEventListener('change', (e) => {
    updateApiKeyLink(e.target.value);
    updateCustomFields(e.target.value);
  });
  
  // Show/hide custom endpoint fields
  function updateCustomFields(provider) {
    const customEndpointGroup = document.getElementById('customEndpointGroup');
    const customModelGroup = document.getElementById('customModelGroup');
    const apiKeyGroup = document.getElementById('apiKey').closest('.input-group');
    
    if (provider === 'custom') {
      customEndpointGroup.style.display = 'block';
      customModelGroup.style.display = 'block';
      apiKeyGroup.querySelector('label').textContent = 'API Key (Optional)';
    } else {
      customEndpointGroup.style.display = 'none';
      customModelGroup.style.display = 'none';
      apiKeyGroup.querySelector('label').textContent = 'API Key';
    }
  }
  
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
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiProvider = document.getElementById('apiProvider').value;
    
    // Prevent multiple clicks
    if (saveBtn.disabled || saveBtn.classList.contains('loading')) {
      return;
    }
    
    // Validate API key
    if (apiKey || apiProvider === 'custom') {
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
    clearUsernameErrors();
    
    const settings = {
      leetcodeUsername: document.getElementById('leetcodeUsername').value.trim(),
      codeforcesUsername: document.getElementById('codeforcesUsername').value.trim(),
      codechefUsername: document.getElementById('codechefUsername').value.trim(),
      apiKey: apiKey,
      apiProvider: apiProvider,
      notifyContests: document.getElementById('notifyContests').checked,
      reminderTime: document.getElementById('reminderTime').value,
      autoShowPanel: document.getElementById('autoShowPanel').checked
    };
    
    // Add custom endpoint settings if using custom provider
    if (apiProvider === 'custom') {
      settings.customEndpoint = document.getElementById('customEndpoint').value.trim();
      settings.customModel = document.getElementById('customModel').value.trim();
    }

    // Never log the API key - only log that it was saved
    // SECURITY: Never log actual API key - only log sanitized version
    const sanitized = apiKey && apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` 
      : '***';
    console.log('CodeMentor: Settings saved (API key format: ' + sanitized + ')');
    
    // Check if usernames are being saved (will need to fetch data)
    const hasUsernames = settings.leetcodeUsername || settings.codeforcesUsername || settings.codechefUsername;
    
    try {
      // Save settings immediately
      await chrome.storage.sync.set(settings);

      // Update alarms if notifications are enabled
      if (settings.notifyContests) {
        chrome.runtime.sendMessage({ type: 'UPDATE_ALARMS' });
      }

      // Show success state immediately
      saveBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Saved!
      `;
      saveBtn.classList.add('success');

      // Fetch streak data in the background if usernames were changed
      if (hasUsernames) {
        // Don't await - let it happen in the background
        chrome.runtime.sendMessage({ type: 'REFRESH_UNIFIED_STREAK' })
          .then((response) => {
            // Check for errors and display them
            if (response && response.errors && response.errors.length > 0) {
              showUsernameErrors(response.errors);
            } else {
              clearUsernameErrors();
            }
            // Reload streak data when fetch completes
            loadStreakData();
            refreshTodayCount(null, true);
          })
          .catch((error) => {
            console.error('CodeMentor: Failed to refresh streak after saving usernames:', error);
            showUsernameErrors([{ platform: 'System', message: 'Failed to fetch streak data. Please try again.' }]);
            // Still try to reload streak data even if refresh failed
            loadStreakData();
          });
      } else {
        // Clear any existing errors if no usernames
        clearUsernameErrors();
      }

      setTimeout(() => {
        saveBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Save Settings
        `;
        saveBtn.classList.remove('success');
      }, 2000);
    } catch (error) {
      // Ensure button is re-enabled even on error
      console.error('CodeMentor: Error saving settings:', error);
      saveBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Save Settings
      `;
    }
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
  
  // Start/restart countdown auto-refresh
  startContestCountdown();
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
  // Parse the start time (assumed to be in UTC/ISO format)
  // JavaScript Date automatically converts ISO strings to user's local timezone
  const start = new Date(startTime);
  // Get current time in user's local timezone
  const now = new Date();
  
  // Calculate difference in milliseconds (timezone-independent)
  const diff = start.getTime() - now.getTime();

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
  if (!dateStr) return 'Invalid Date';
  
  try {
    // Parse the date string (should be ISO 8601 UTC format)
    // When an ISO string ends with 'Z' or is in UTC, JavaScript Date correctly parses it as UTC
    const date = new Date(dateStr);
    
    // Validate the date
    if (isNaN(date.getTime())) {
      console.warn('CodeMentor: Invalid date string:', dateStr);
      return 'Invalid Date';
    }
    
    // Get user's timezone from browser
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Create formatter that uses the user's local timezone
    // The Date object represents a moment in UTC, and the formatter converts it to user's timezone
    // No timeZoneName option - we just show the time without timezone label for cleaner UI
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone // Format according to user's actual timezone
    });
    
    // Format the date - this automatically converts from UTC to user's local timezone
    return formatter.format(date);
  } catch (error) {
    console.error('CodeMentor: Error formatting date:', dateStr, error);
    return 'Invalid Date';
  }
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

// Start auto-refresh for contest countdown
function startContestCountdown() {
  // Clear existing interval
  if (contestCountdownInterval) {
    clearInterval(contestCountdownInterval);
  }
  
  // Update countdown every minute to show accurate time remaining
  contestCountdownInterval = setInterval(() => {
    renderContests();
  }, 60000); // 60 seconds
}

// Stop auto-refresh for contest countdown
function stopContestCountdown() {
  if (contestCountdownInterval) {
    clearInterval(contestCountdownInterval);
    contestCountdownInterval = null;
  }
}

function updateApiKeyLink(provider) {
  const link = document.getElementById('apiKeyLink');
  const links = {
    'openai': { url: 'https://platform.openai.com', text: 'Get OpenAI API key →' },
    'claude': { url: 'https://console.anthropic.com', text: 'Get Claude API key →' },
    'gemini': { url: 'https://aistudio.google.com', text: 'Get Gemini API key →' },
    'groq': { url: 'https://console.groq.com', text: 'Get Groq API key (Free) →' },
    'together': { url: 'https://api.together.ai', text: 'Get Together AI API key (Free) →' },
    'huggingface': { url: 'https://huggingface.co/settings/tokens', text: 'Get Hugging Face API key (Free) →' },
    'openrouter': { url: 'https://openrouter.ai', text: 'Get OpenRouter API key →' },
    'custom': { url: '#', text: 'Configure custom endpoint below →' }
  };
  
  const linkInfo = links[provider] || links['openai'];
  link.href = linkInfo.url;
  link.textContent = linkInfo.text;
  
  // Hide link for custom provider
  if (provider === 'custom') {
    link.style.display = 'none';
  } else {
    link.style.display = 'block';
  }
}

// Backend authentication and subscription removed - Extension is now fully client-side

// Initialize feedback modal
function initFeedbackModal() {
  const feedbackModal = document.getElementById('feedbackModal');
  const openFeedbackBtn = document.getElementById('openFeedbackBtn');
  const closeFeedbackModal = document.getElementById('closeFeedbackModal');
  const submitFeedback = document.getElementById('submitFeedback');
  
  if (!feedbackModal || !openFeedbackBtn) return;
  
  openFeedbackBtn.addEventListener('click', () => {
    feedbackModal.style.display = 'flex';
    if (typeof LCAnalytics !== 'undefined') {
      LCAnalytics.trackEvent('feedback_modal_opened');
    }
  });
  
  closeFeedbackModal.addEventListener('click', () => {
    feedbackModal.style.display = 'none';
    resetFeedbackForm();
  });
  
  submitFeedback.addEventListener('click', async () => {
    const type = document.getElementById('feedbackType').value;
    const email = document.getElementById('feedbackEmail').value.trim();
    const message = document.getElementById('feedbackMessage').value.trim();
    const errorEl = document.getElementById('feedbackError');
    const successEl = document.getElementById('feedbackSuccess');
    
    // Hide previous messages
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    if (!message) {
      errorEl.textContent = 'Please enter your feedback message';
      errorEl.style.display = 'block';
      return;
    }
    
    if (message.length < 10) {
      errorEl.textContent = 'Please provide more details (at least 10 characters)';
      errorEl.style.display = 'block';
      return;
    }
    
    try {
      submitFeedback.disabled = true;
      submitFeedback.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        Sending...
      `;
      
      // Get extension version and user info
      const extensionVersion = chrome.runtime.getManifest().version;
      // Send feedback to background script
      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_FEEDBACK',
        feedback: {
          type,
          email: email || 'anonymous',
          message,
          extensionVersion,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        }
      });
      
      if (response && response.success) {
        // Track successful feedback submission
        if (typeof LCAnalytics !== 'undefined') {
          LCAnalytics.trackEvent('feedback_submitted', {
            feedback_type: type,
            has_email: !!email
          });
        }
        
        // Update success message with GitHub link
        if (response.githubIssueUrl) {
          successEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              style="margin-right: 8px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <div>
              <div style="margin-bottom: 8px;">Thank you for your feedback!</div>
              <a href="${response.githubIssueUrl}" target="_blank" style="color: var(--accent); text-decoration: underline; font-size: 13px;">
                Open GitHub Issue →
              </a>
            </div>
          `;
        }
        
        successEl.style.display = 'flex';
        resetFeedbackForm();
        
        // Close modal after 5 seconds (longer to allow clicking GitHub link)
        setTimeout(() => {
          feedbackModal.style.display = 'none';
          resetFeedbackForm();
        }, 5000);
      } else {
        throw new Error(response?.error || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      if (typeof LCHErrorTracking !== 'undefined') {
        LCHErrorTracking.trackError(error, {
          tags: { type: 'feedback_submission' }
        });
      }
      errorEl.textContent = error.message || 'Failed to submit feedback. Please try again.';
      errorEl.style.display = 'block';
    } finally {
      submitFeedback.disabled = false;
      submitFeedback.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Send Feedback
      `;
    }
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === feedbackModal) {
      feedbackModal.style.display = 'none';
      resetFeedbackForm();
    }
  });
  
  function resetFeedbackForm() {
    document.getElementById('feedbackType').value = 'bug';
    document.getElementById('feedbackEmail').value = '';
    document.getElementById('feedbackMessage').value = '';
    document.getElementById('feedbackError').style.display = 'none';
    document.getElementById('feedbackSuccess').style.display = 'none';
  }
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
    
    // Backend removed - favorites are local-only, no limits
    
    renderFavorites(favorites);
  } catch (error) {
    console.error('Error loading favorites:', error);
  }
}

function renderFavorites(favorites) {
  const favoritesList = document.getElementById('favoritesList');
  const favoritesCount = document.getElementById('favoritesCount');
  
  // Show count
  favoritesCount.textContent = `${favorites.length} saved`;
  
  if (favorites.length === 0) {
    favoritesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❤️</div>
        <p>No favorites yet. Add problems from any platform!</p>
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

