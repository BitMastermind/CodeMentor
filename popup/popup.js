// LC Helper - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSettings();
  loadContests();
  initFilters();
  loadStreakData();
});

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

  // Settings button opens settings tab
  document.getElementById('settingsBtn').addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.getElementById('settings-tab').classList.add('active');
  });
}

// Settings Management
function initSettings() {
  // Load saved settings
  chrome.storage.sync.get([
    'apiKey', 'apiProvider', 'notifyContests', 'reminderTime', 'autoShowPanel',
    'leetcodeUsername', 'codeforcesUsername', 'codechefUsername'
  ], (result) => {
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
    
    document.getElementById('notifyContests').checked = result.notifyContests !== false;
    document.getElementById('reminderTime').value = result.reminderTime || '30';
    document.getElementById('autoShowPanel').checked = result.autoShowPanel || false;
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
    const settings = {
      leetcodeUsername: document.getElementById('leetcodeUsername').value.trim(),
      codeforcesUsername: document.getElementById('codeforcesUsername').value.trim(),
      codechefUsername: document.getElementById('codechefUsername').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      apiProvider: document.getElementById('apiProvider').value,
      notifyContests: document.getElementById('notifyContests').checked,
      reminderTime: document.getElementById('reminderTime').value,
      autoShowPanel: document.getElementById('autoShowPanel').checked
    };

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
  if (provider === 'openai') {
    link.href = 'https://platform.openai.com/api-keys';
    link.textContent = 'Get OpenAI API key →';
  } else if (provider === 'gemini') {
    link.href = 'https://aistudio.google.com/app/apikey';
    link.textContent = 'Get Gemini API key →';
  }
}

// Unified Streak Data Management (API-based backend, classic UI)
async function loadStreakData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STREAK_DATA' });
    const streakData = response.streakData;
    
    if (!streakData) {
      // Show default state
      document.getElementById('currentStreak').textContent = '0';
      document.getElementById('longestStreak').textContent = '0';
      document.getElementById('totalDays').textContent = '0';
      document.getElementById('freezeTokens').textContent = '1';
      document.getElementById('progressLabel').textContent = 'Configure usernames in settings';
      return;
    }
    
    // Ensure values are valid numbers
    const currentStreak = Number(streakData.currentStreak) || 0;
    const longestStreak = Number(streakData.longestStreak) || 0;
    const totalDays = Number(streakData.totalActiveDays) || 0;
    
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
    
    // Update stats
    document.getElementById('longestStreak').textContent = longestStreak;
    document.getElementById('totalDays').textContent = totalDays;
    document.getElementById('freezeTokens').textContent = '1'; // Placeholder for now
    
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

