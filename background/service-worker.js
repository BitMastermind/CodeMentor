// LC Helper - Background Service Worker

// Import error tracking and analytics utilities
// Note: importScripts paths are relative to extension root, not this file
importScripts('/utils/errorTracking.js');
importScripts('/utils/analytics.js');
importScripts('/utils/apiKeySecurity.js');

// Initialize on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('LC Helper installed/updated:', details.reason);

  // Track installation/update
  if (typeof LCAnalytics !== 'undefined') {
    LCAnalytics.trackEvent('extension_installed', {
      reason: details.reason,
      version: chrome.runtime.getManifest().version
    });
  }

  fetchAndCacheContests();

  // Set up periodic contest refresh (every 6 hours)
  chrome.alarms.create('refreshContests', { periodInMinutes: 360 });

  // Always initialize streak system on install/update
  await initializeStreakSystem();
});

// Handle browser startup - reinitialize alarms and sync streak data
chrome.runtime.onStartup.addListener(async () => {
  console.log('LC Helper: Browser started, reinitializing systems...');
  
  // Re-fetch contests on browser startup
  fetchAndCacheContests();
  
  // Re-create the contest refresh alarm
  chrome.alarms.create('refreshContests', { periodInMinutes: 360 });
  
  // Reinitialize the streak system (recreates alarms and syncs data)
  await initializeStreakSystem();
  
  console.log('LC Helper: Browser startup initialization complete');
});

// Also initialize on service worker startup (in case it was sleeping)
(async () => {
  console.log('Service worker starting...');
  await ensureStreakDataExists();
  
  // Check if streak alarms exist, if not recreate them
  // This handles cases where alarms were lost (e.g., service worker terminated)
  await ensureStreakAlarmsExist();
  
  // Restore contest alarms if contests are already cached
  const { contests } = await chrome.storage.local.get('contests');
  if (contests && contests.length > 0) {
    await updateContestAlarms();
  }
})();

// Ensure streak-related alarms exist (called on service worker wakeup)
async function ensureStreakAlarmsExist() {
  try {
    const alarms = await chrome.alarms.getAll();
    const alarmNames = alarms.map(a => a.name);
    
    // Check for critical streak alarms
    const requiredAlarms = ['unifiedStreakSync', 'dailyStreakReminder', 'dailyStatsReset', 'refreshTodayCount'];
    const missingAlarms = requiredAlarms.filter(name => !alarmNames.includes(name));
    
    if (missingAlarms.length > 0) {
      console.log('LC Helper: Missing alarms detected, reinitializing streak system:', missingAlarms);
      await initializeStreakSystem();
    } else {
      // Alarms exist, but check if we should sync based on last sync time
      const { lastSyncTime } = await chrome.storage.local.get('lastSyncTime');
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      
      if (!lastSyncTime || lastSyncTime < sixHoursAgo) {
        console.log('LC Helper: Last sync was over 6 hours ago, syncing now...');
        syncUnifiedStreak().catch(err => console.log('Auto sync failed:', err));
      }
    }
  } catch (error) {
    console.error('LC Helper: Error checking alarms:', error);
  }
}

// Handle tab close - stop timer when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Find all active timers and stop the one matching this tab ID
  const allStorage = await chrome.storage.local.get(null);
  const timerEntries = Object.entries(allStorage).filter(([key]) => key.startsWith('timer_'));

  for (const [timerKey, timerData] of timerEntries) {
    if (timerData.tabId === tabId) {
      // Stop the timer for this tab
      await stopProblemTimer(timerData.url);
      console.log('Timer stopped because tab was closed:', timerData.title);
      break;
    }
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refreshContests') {
    await fetchAndCacheContests();
  } else if (alarm.name.startsWith('contest_')) {
    // Contest reminder notification
    const contestId = alarm.name.replace('contest_', '');

    // Check if notifications are enabled
    const { notifyContests } = await chrome.storage.sync.get('notifyContests');
    if (notifyContests === false) {
      console.log('LC Helper: Contest notifications are disabled');
      return;
    }

    const { contests } = await chrome.storage.local.get('contests');
    const contest = contests?.find(c => c.id === contestId);

    if (contest) {
      const reminderMinutes = await getReminderTime();
      chrome.notifications.create(contestId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon128.png'),
        title: '🏁 Contest Starting Soon!',
        message: `${contest.name} starts in ${reminderMinutes} minutes!`,
        buttons: [{ title: 'Open Contest' }],
        priority: 2
      }).catch((error) => {
        console.error('LC Helper: Failed to create contest notification:', error);
        if (typeof LCHErrorTracking !== 'undefined') {
          LCHErrorTracking.trackError(error, {
            tags: { type: 'notification_creation' }
          });
        }
      });
      console.log('LC Helper: Contest reminder sent for:', contest.name);
    } else {
      console.log('LC Helper: Contest not found for reminder:', contestId);
    }
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // Handle timer reminder notifications
  if (notificationId.startsWith('timerReminder_')) {
    // Find active timer from storage
    const allStorage = await chrome.storage.local.get(null);
    const timerEntries = Object.entries(allStorage).filter(([key]) => key.startsWith('timer_'));

    if (timerEntries.length > 0) {
      const [timerKey, timerData] = timerEntries[0];

      // Find tab with problem URL
      const tabs = await chrome.tabs.query({ url: timerData.url });
      if (tabs.length > 0) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true });
        // Try to open hints panel
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_HINTS_PANEL'
          }).catch(() => {
            // If message fails, tab might not have content script loaded
          });
        }, 500);
      } else {
        // Try URL pattern matching
        const urlPattern = timerData.url.split('?')[0] + '*';
        const matchingTabs = await chrome.tabs.query({ url: urlPattern });
        if (matchingTabs.length > 0) {
          const tab = matchingTabs[0];
          chrome.tabs.update(tab.id, { active: true });
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SHOW_HINTS_PANEL'
            }).catch(() => { });
          }, 500);
        }
      }
    }
    chrome.notifications.clear(notificationId);
    return;
  }

  // Handle contest notifications
  const { contests } = await chrome.storage.local.get('contests');
  const contest = contests?.find(c => c.id === notificationId);

  if (contest) {
    chrome.tabs.create({ url: contest.url });
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  // Handle timer reminder notifications
  if (notificationId.startsWith('timerReminder_')) {
    // Find active timer from storage
    const allStorage = await chrome.storage.local.get(null);
    const timerEntries = Object.entries(allStorage).filter(([key]) => key.startsWith('timer_'));

    if (timerEntries.length > 0) {
      const [timerKey, timerData] = timerEntries[0];

      if (buttonIndex === 0) {
        // "Take a Hint" button - find tab with problem URL and open hints panel
        const tabs = await chrome.tabs.query({ url: timerData.url });
        if (tabs.length > 0) {
          // Use the first matching tab
          const tab = tabs[0];
          chrome.tabs.update(tab.id, { active: true });
          // Wait a bit for tab to activate, then send message
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SHOW_HINTS_PANEL'
            }).catch(() => {
              // If message fails, tab might not have content script loaded
              console.log('LC Helper: Could not send message to tab');
            });
          }, 500);
        } else {
          // Tab not found, try to find by URL pattern
          const urlPattern = timerData.url.split('?')[0] + '*';
          const matchingTabs = await chrome.tabs.query({ url: urlPattern });
          if (matchingTabs.length > 0) {
            const tab = matchingTabs[0];
            chrome.tabs.update(tab.id, { active: true });
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_HINTS_PANEL'
              }).catch(() => { });
            }, 500);
          }
        }
      } else if (buttonIndex === 1) {
        // "Watch Solution" button - open solution/discussion
        const solutionUrl = getSolutionUrl(timerData.url, timerData.platform);
        chrome.tabs.create({ url: solutionUrl });
      }
    }
    // Close notification
    chrome.notifications.clear(notificationId);
    return;
  }

  // Handle contest notifications
  if (buttonIndex === 0) {
    const { contests } = await chrome.storage.local.get('contests');
    const contest = contests?.find(c => c.id === notificationId);

    if (contest) {
      chrome.tabs.create({ url: contest.url });
    }
  }
});

// Helper to get active tab
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// Helper to get solution URL based on platform
function getSolutionUrl(problemUrl, platform) {
  if (platform === 'leetcode') {
    // LeetCode discussions
    const problemSlug = problemUrl.match(/\/problems\/([^\/]+)/)?.[1];
    if (problemSlug) {
      return `https://leetcode.com/problems/${problemSlug}/discuss/`;
    }
    return 'https://leetcode.com/discuss/';
  } else if (platform === 'codeforces') {
    // Codeforces editorial
    return problemUrl.replace(/\/problem\//, '/problem/') + '#comment';
  } else if (platform === 'codechef') {
    // CodeChef editorial
    return problemUrl + '/editorial';
  }
  return problemUrl;
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.type) {
      case 'GET_CONTESTS':
        const contests = await getContests();
        sendResponse({ contests });
        break;

      case 'REFRESH_CONTESTS':
        await fetchAndCacheContests();
        sendResponse({ success: true });
        break;

      case 'TOGGLE_CONTEST_NOTIFICATION':
        await toggleContestNotification(message.contestId, message.enabled);
        sendResponse({ success: true });
        break;

      case 'UPDATE_ALARMS':
        await updateContestAlarms();
        sendResponse({ success: true });
        break;

      case 'GET_HINTS':
        const hints = await generateHints(message.problem);
        sendResponse(hints);
        break;

      case 'EXPLAIN_PROBLEM':
        const explanation = await explainProblem(message.problem);
        sendResponse(explanation);
        break;

      case 'GET_API_KEY':
        // Never return the actual API key - only indicate if it exists
        const { key: apiKeyCheck, error: apiKeyError } = await getApiKeySafely();
        sendResponse({
          hasApiKey: !!apiKeyCheck,
          error: apiKeyError || null
        });
        break;

      case 'GET_STREAK_DATA':
        const { streakData, lastSyncTime } = await chrome.storage.local.get(['streakData', 'lastSyncTime']);
        sendResponse({ streakData: streakData?.unified || {} });
        
        // Trigger background sync if data is stale (more than 1 hour old)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        if (!lastSyncTime || lastSyncTime < oneHourAgo) {
          console.log('LC Helper: Streak data is stale, triggering background sync...');
          syncUnifiedStreak().catch(err => console.log('Background sync failed:', err));
        }
        break;

      case 'REFRESH_UNIFIED_STREAK':
        const refreshResult = await refreshUnifiedStreak();
        sendResponse(refreshResult);
        break;

      // Daily Stats
      case 'GET_DAILY_STATS':
        const dailyStats = await getDailyStats();
        sendResponse({ dailyStats });
        break;

      case 'SYNC_TODAY_COUNT_FROM_APIS':
        const syncResult = await syncTodayCountFromAPIs();
        sendResponse({ success: true, dailyStats: syncResult });
        break;

      // Favorites
      case 'GET_FAVORITES':
        const favorites = await getFavorites();
        sendResponse({ favorites });
        break;

      case 'ADD_FAVORITE':
        const addResult = await addFavorite(message.problem);
        sendResponse(addResult);
        break;

      case 'REMOVE_FAVORITE':
        const removeResult = await removeFavorite(message.id);
        sendResponse(removeResult);
        break;

      case 'IS_FAVORITE':
        const isFav = await isFavorite(message.url);
        sendResponse({ isFavorite: isFav });
        break;

      // Timer
      case 'START_TIMER':
        const tabId = sender?.tab?.id;
        const timerResult = await startProblemTimer(message.problem, tabId);
        sendResponse(timerResult);
        break;

      case 'GET_TIMER':
        const timerData = await getActiveTimer(message.url);
        sendResponse({ timer: timerData });
        break;

      case 'STOP_TIMER':
        await stopProblemTimer(message.url);
        sendResponse({ success: true });
        break;

      case 'TEST_TIMER_NOTIFICATION':
        // Test handler to manually trigger 30-minute notification
        const testTimerResult = await testTimerNotification(message.url);
        sendResponse(testTimerResult);
        break;

      case 'TEST_SCRAPING_ACCURACY':
        // Test handler to verify scraping accuracy by asking LLM to reconstruct the problem
        const testResult = await testScrapingAccuracy(message.problem);
        sendResponse(testResult);
        break;

      case 'OPEN_POPUP':
        // Open extension popup/settings
        // Since we don't have an options page defined, open the popup HTML in a new tab
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
        sendResponse({ success: true });
        break;

      case 'SUBMIT_FEEDBACK':
        const feedbackResult = await submitFeedback(message.feedback);
        sendResponse(feedbackResult);
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('LC Helper Background Error:', error);
    sendResponse({ error: error.message || 'Unknown background error' });

    if (typeof LCHErrorTracking !== 'undefined') {
      LCHErrorTracking.trackError(error, {
        tags: { type: 'background_message_handler', messageType: message.type }
      });
    }
  }
}

// Contest fetching and caching
async function fetchAndCacheContests() {
  try {
    const contests = await fetchAllContests();
    await chrome.storage.local.set({
      contests,
      lastFetch: Date.now()
    });
    await updateContestAlarms();
    return contests;
  } catch (error) {
    console.error('Error fetching contests:', error);
    if (typeof LCHErrorTracking !== 'undefined') {
      LCHErrorTracking.trackError(error, {
        tags: { type: 'contest_fetch' }
      });
    }
    if (typeof LCAnalytics !== 'undefined') {
      LCAnalytics.trackError('contest_fetch', error.message);
    }
    return [];
  }
}

async function getContests() {
  const { contests, lastFetch } = await chrome.storage.local.get(['contests', 'lastFetch']);

  // Refresh if cache is older than 1 hour
  if (!contests || !lastFetch || Date.now() - lastFetch > 3600000) {
    return await fetchAndCacheContests();
  }

  return contests;
}

async function fetchAllContests() {
  console.log('Fetching contests from all platforms...');

  const [codeforces, leetcode, codechef] = await Promise.allSettled([
    fetchCodeforcesContests(),
    fetchLeetCodeContests(),
    fetchCodeChefContests()
  ]);

  const allContests = [
    ...(codeforces.status === 'fulfilled' ? codeforces.value : []),
    ...(leetcode.status === 'fulfilled' ? leetcode.value : []),
    ...(codechef.status === 'fulfilled' ? codechef.value : [])
  ];

  console.log('Total contests fetched:', allContests.length, {
    codeforces: codeforces.status === 'fulfilled' ? codeforces.value.length : 0,
    leetcode: leetcode.status === 'fulfilled' ? leetcode.value.length : 0,
    codechef: codechef.status === 'fulfilled' ? codechef.value.length : 0
  });

  // Sort by start time
  allContests.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  // Get notified contests from storage
  const { notifiedContests = [] } = await chrome.storage.local.get('notifiedContests');

  // Add notified status
  return allContests.map(c => ({
    ...c,
    notified: notifiedContests.includes(c.id)
  }));
}

async function fetchCodeforcesContests() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch('https://codeforces.com/api/contest.list', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.status !== 'OK') {
      console.log('LC Helper: Codeforces API returned error');
      return [];
    }

    const contests = data.result
      .filter(c => c.phase === 'BEFORE')
      .slice(0, 10)
      .map(c => ({
        id: `cf_${c.id}`,
        name: c.name,
        platform: 'codeforces',
        url: `https://codeforces.com/contest/${c.id}`,
        startTime: normalizeToISO(new Date(c.startTimeSeconds * 1000)),
        duration: c.durationSeconds / 60
      }))
      .filter(c => c.startTime); // Remove any with invalid timestamps

    console.log('Codeforces contests fetched:', contests.length);
    return contests;
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.log('LC Helper: Codeforces API unavailable');
    }
    return [];
  }
}

async function fetchLeetCodeContests() {
  try {
    // Try kontests.net API first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('https://kontests.net/api/v1/leet_code', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const contests = data
          .filter(c => {
            const startTime = normalizeToISO(c.start_time);
            return startTime && new Date(startTime) > new Date();
          })
          .slice(0, 10)
          .map(c => ({
            id: `lc_${c.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`,
            name: c.name,
            platform: 'leetcode',
            url: c.url || 'https://leetcode.com/contest/',
            startTime: normalizeToISO(c.start_time),
            duration: parseDuration(c.duration)
          }))
          .filter(c => c.startTime); // Remove any with invalid timestamps

        console.log('LeetCode contests fetched:', contests.length);
        return contests;
      }
    } catch (e) {
      // Silently fall back - network errors are expected
      if (e.name !== 'AbortError') {
        console.log('LC Helper: LeetCode API unavailable, using fallback');
      }
    }

    // Fallback: Return estimated weekly contest
    // LeetCode Weekly Contests are typically on Sundays at 2:30 AM UTC
    const now = new Date();
    const nextWeekly = new Date(now);
    nextWeekly.setUTCDate(now.getUTCDate() + (7 - now.getUTCDay()) % 7); // Next Sunday in UTC
    nextWeekly.setUTCHours(2, 30, 0, 0); // 2:30 AM UTC

    if (nextWeekly <= now) {
      nextWeekly.setUTCDate(nextWeekly.getUTCDate() + 7);
    }

    return [{
      id: 'lc_weekly_mock',
      name: 'Weekly Contest',
      platform: 'leetcode',
      url: 'https://leetcode.com/contest/',
      startTime: normalizeToISO(nextWeekly),
      duration: 90
    }].filter(c => c.startTime); // Ensure valid timestamp
  } catch (error) {
    console.log('LC Helper: Error fetching LeetCode contests');
    return [];
  }
}

async function fetchCodeChefContests() {
  try {
    // Try kontests.net API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('https://kontests.net/api/v1/code_chef', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const contests = data
          .filter(c => {
            const startTime = normalizeToISO(c.start_time);
            return startTime && new Date(startTime) > new Date();
          })
          .slice(0, 10)
          .map(c => ({
            id: `cc_${c.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`,
            name: c.name,
            platform: 'codechef',
            url: c.url || 'https://www.codechef.com/contests',
            startTime: normalizeToISO(c.start_time),
            duration: parseDuration(c.duration)
          }))
          .filter(c => c.startTime); // Remove any with invalid timestamps

        console.log('CodeChef contests fetched:', contests.length);
        return contests;
      }
    } catch (e) {
      // Silently try next fallback
      if (e.name !== 'AbortError') {
        console.log('LC Helper: Kontests.net unavailable for CodeChef, trying direct API');
      }
    }

    // Try direct CodeChef API as fallback
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all', {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const futureContests = data.future_contests || [];

        return futureContests
          .slice(0, 10)
          .map(c => ({
            id: `cc_${c.contest_code}`,
            name: c.contest_name,
            platform: 'codechef',
            url: `https://www.codechef.com/${c.contest_code}`,
            startTime: normalizeToISO(c.contest_start_date_iso),
            duration: Math.floor((new Date(c.contest_end_date_iso) - new Date(c.contest_start_date_iso)) / 60000)
          }))
          .filter(c => c.startTime); // Remove any with invalid timestamps
      }
    } catch (e) {
      // Silently return empty - network errors are expected
      if (e.name !== 'AbortError') {
        console.log('LC Helper: CodeChef API unavailable');
      }
    }

    return [];
  } catch (error) {
    console.log('LC Helper: Error fetching CodeChef contests');
    return [];
  }
}

// Normalize timestamp to ISO 8601 UTC format
// Handles various input formats: ISO strings (with/without timezone), Unix timestamps, Date objects
function normalizeToISO(timestamp) {
  if (!timestamp) return null;

  try {
    // If it's already a Date object, convert directly
    if (timestamp instanceof Date) {
      if (isNaN(timestamp.getTime())) {
        console.warn('LC Helper: Invalid Date object');
        return null;
      }
      return timestamp.toISOString();
    }

    // Try parsing as Date (handles ISO strings with/without timezone, Unix timestamps, etc.)
    // JavaScript Date constructor automatically handles:
    // - ISO 8601 strings: "2024-12-14T02:30:00Z" or "2024-12-14T02:30:00+05:30"
    // - Unix timestamps (milliseconds or seconds)
    // - Other date string formats
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.warn('LC Helper: Invalid timestamp format:', timestamp);
      return null;
    }

    // Return as ISO 8601 UTC string (always in UTC, ends with 'Z')
    return date.toISOString();
  } catch (error) {
    console.warn('LC Helper: Error normalizing timestamp:', timestamp, error);
    return null;
  }
}

function parseDuration(durationStr) {
  if (!durationStr) return null;

  // Parse duration strings like "2:00:00" or "1 days, 2:00:00"
  const parts = durationStr.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);

    // Check for days
    if (parts[0].includes('days')) {
      const dayMatch = parts[0].match(/(\d+)\s*days?,?\s*(\d+)/);
      if (dayMatch) {
        hours = parseInt(dayMatch[1]) * 24 + parseInt(dayMatch[2]);
      }
    }

    return hours * 60 + minutes;
  }

  return null;
}

// Notification management
async function toggleContestNotification(contestId, enabled) {
  const { notifiedContests = [] } = await chrome.storage.local.get('notifiedContests');
  const { contests } = await chrome.storage.local.get('contests');
  const contest = contests?.find(c => c.id === contestId);

  let updated;
  if (enabled) {
    updated = [...new Set([...notifiedContests, contestId])];
    console.log('LC Helper: Enabling reminder for contest:', contest?.name || contestId);
  } else {
    updated = notifiedContests.filter(id => id !== contestId);
    // Remove alarm if disabled
    await chrome.alarms.clear(`contest_${contestId}`);
    console.log('LC Helper: Disabling reminder for contest:', contest?.name || contestId);
  }

  await chrome.storage.local.set({ notifiedContests: updated });

  if (enabled) {
    await setContestAlarm(contestId);
  }
}

async function setContestAlarm(contestId) {
  const { contests } = await chrome.storage.local.get('contests');
  const contest = contests?.find(c => c.id === contestId);

  if (!contest) {
    console.log('LC Helper: Contest not found for alarm:', contestId);
    return;
  }

  const reminderMinutes = await getReminderTime();
  const startTime = new Date(contest.startTime).getTime();
  const alarmTime = startTime - (reminderMinutes * 60 * 1000);

  if (alarmTime > Date.now()) {
    try {
      await chrome.alarms.create(`contest_${contestId}`, {
        when: alarmTime
      });
      const alarmDate = new Date(alarmTime);
      console.log('LC Helper: Contest alarm set for', contest.name, 'at', alarmDate.toLocaleString());
    } catch (error) {
      console.error('LC Helper: Failed to create contest alarm:', error);
    }
  } else {
    console.log('LC Helper: Cannot set alarm for', contest.name, '- alarm time is in the past');
  }
}

async function updateContestAlarms() {
  const { notifiedContests = [] } = await chrome.storage.local.get('notifiedContests');

  for (const contestId of notifiedContests) {
    await setContestAlarm(contestId);
  }
}

async function getReminderTime() {
  const { reminderTime } = await chrome.storage.sync.get('reminderTime');
  return parseInt(reminderTime) || 30;
}

// Backend removed - Extension is now fully client-side (BYOK only)

// AI Hints Generation with Caching and Hybrid Mode
async function generateHints(problem) {
  // Generate cache key from problem URL or title
  const cacheKey = `hints_${generateCacheKey(problem.url || problem.title)}`;

  // Check if we should force refresh
  if (!problem.forceRefresh) {
    // Try to get cached hints
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      console.log('Using cached hints for:', problem.title);
      return { ...cached[cacheKey], cached: true };
    }
  }

  // Detect platform from URL
  let platform = 'codeforces'; // default to CP-focused
  if (problem.url) {
    if (problem.url.includes('leetcode.com')) {
      platform = 'leetcode';
    } else if (problem.url.includes('codechef.com')) {
      platform = 'codechef';
    } else if (problem.url.includes('codeforces.com')) {
      platform = 'codeforces';
    }
    // Future: add more interview-focused platforms (gfg, etc.) here
  }

  // Always use BYOK (Bring Your Own Key) mode
  const { key: apiKey, provider: apiProvider, error } = await getApiKeySafely();

  if (error || !apiKey) {
    return { error: error || 'API key not configured. Add your API key in settings.' };
  }

  const provider = apiProvider;
  let result;

  if (provider === 'gemini') {
    result = await generateHintsGemini(problem, apiKey, platform);
  } else if (provider === 'claude') {
    result = await generateHintsClaude(problem, apiKey, platform);
  } else if (provider === 'groq') {
    result = await generateHintsGroq(problem, apiKey, platform);
  } else if (provider === 'together') {
    result = await generateHintsTogether(problem, apiKey, platform);
  } else if (provider === 'huggingface') {
    result = await generateHintsHuggingFace(problem, apiKey, platform);
  } else if (provider === 'openrouter') {
    result = await generateHintsOpenRouter(problem, apiKey, platform);
  } else if (provider === 'custom') {
    result = await generateHintsCustom(problem, apiKey, platform);
  } else {
    // Default to OpenAI
    result = await generateHintsOpenAI(problem, apiKey, platform);
  }

  // Cache the result if successful
  if (result && !result.error) {
    const cacheData = {
      ...result,
      cachedAt: Date.now(),
      problemTitle: problem.title,
      problemUrl: problem.url
    };
    await chrome.storage.local.set({ [cacheKey]: cacheData });
    console.log('Cached hints for:', problem.title);
  }

  return result;
}

// Safe API Key Retrieval - Never logs the actual key
async function getApiKeySafely() {
  // Use secure utility if available, otherwise fallback to direct storage access
  if (typeof getApiKeySecurely !== 'undefined') {
    const result = await getApiKeySecurely();
    return {
      key: result.key,
      provider: result.provider,
      error: result.error || null
    };
  }

  // Fallback implementation (for backward compatibility)
  try {
    const { apiKey, apiProvider, customEndpoint, customModel } = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'customEndpoint', 'customModel']);

    // For custom provider, API key is optional but endpoint and model are required
    if (apiProvider === 'custom') {
      if (!customEndpoint || !customModel) {
        return { key: null, provider: null, error: 'Custom endpoint URL and model name must be configured in settings.' };
      }
      // API key is optional for custom endpoints
      return { key: apiKey || '', provider: 'custom' };
    }

    if (!apiKey) {
      return { key: null, provider: null, error: 'API key not configured. Add your API key in settings.' };
    }

    // SECURITY: Never log the actual key - only log sanitized version
    const sanitized = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : '***';
    console.log('LC Helper: Using API key (provider: ' + (apiProvider || 'gemini') + ', format: ' + sanitized + ')');

    return { key: apiKey, provider: apiProvider || 'gemini' };
  } catch (error) {
    console.error('LC Helper: Error retrieving API key:', error.message);
    return { key: null, provider: null, error: 'Failed to retrieve API key' };
  }
}

// Generate consistent cache key from URL or title
function generateCacheKey(input) {
  // Remove protocol, query params, and normalize
  const normalized = input
    .replace(/^https?:\/\//, '')
    .replace(/\?.*$/, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    .slice(0, 100); // Limit length
  return normalized;
}

// Backend service removed - Extension is now fully client-side (BYOK only)

// Explain problem in simpler terms
async function explainProblem(problem) {
  const cacheKey = `explain_${generateCacheKey(problem.url || problem.title)}`;

  // Check if we should force refresh
  if (!problem.forceRefresh) {
    // Check cache
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      console.log('Using cached explanation for:', problem.title);
      return { ...cached[cacheKey], cached: true };
    }
  }

  // Detect platform from URL
  let platform = 'codeforces'; // default
  if (problem.url) {
    if (problem.url.includes('leetcode.com')) {
      platform = 'leetcode';
    } else if (problem.url.includes('codechef.com')) {
      platform = 'codechef';
    } else if (problem.url.includes('codeforces.com')) {
      platform = 'codeforces';
    }
  }

  // Always use BYOK mode
  const { key: apiKey, provider: apiProvider, error } = await getApiKeySafely();

  if (error || !apiKey) {
    return { error: error || 'API key not configured. Add your API key in settings.' };
  }

  const provider = apiProvider;
  let result;

  if (provider === 'gemini') {
    result = await explainProblemGemini(problem, apiKey, platform);
  } else if (provider === 'claude') {
    result = await explainProblemClaude(problem, apiKey, platform);
  } else if (provider === 'groq') {
    result = await explainProblemGroq(problem, apiKey, platform);
  } else if (provider === 'together') {
    result = await explainProblemTogether(problem, apiKey, platform);
  } else if (provider === 'huggingface') {
    result = await explainProblemHuggingFace(problem, apiKey, platform);
  } else if (provider === 'openrouter') {
    result = await explainProblemOpenRouter(problem, apiKey, platform);
  } else if (provider === 'custom') {
    result = await explainProblemCustom(problem, apiKey, platform);
  } else {
    // Default to OpenAI
    result = await explainProblemOpenAI(problem, apiKey, platform);
  }

  // Cache the result if successful
  if (result && !result.error) {
    const cacheData = {
      ...result,
      cachedAt: Date.now(),
      problemTitle: problem.title,
      problemUrl: problem.url
    };
    await chrome.storage.local.set({ [cacheKey]: cacheData });
    console.log('Cached explanation for:', problem.title);
  }

  return result;
}

async function explainProblemGemini(problem, apiKey, platform = 'codeforces') {
  try {
    // Log the complete problem object received
    console.log('='.repeat(80));
    console.log('LC Helper - EXPLAIN PROBLEM - Received Problem Object:');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      title: problem.title,
      difficulty: problem.difficulty,
      tags: problem.tags,
      constraints: problem.constraints,
      description: problem.description,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      examples: problem.examples,
      examplesCount: problem.examplesCount,
      url: problem.url,
      hasImages: problem.hasImages,
      platform: platform
    }, null, 2));
    console.log('='.repeat(80));

    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    // Format examples for better context
    const examplesText = problem.examples ?
      `\n\nSAMPLE TEST CASES:\n${problem.examples}\n\nIMPORTANT: Use these exact examples in your explanation. Walk through each example step-by-step to show how the input leads to the output.` :
      '\n\nNote: No sample test cases provided. Focus on explaining the problem statement clearly.';

    // Use LeetCode-specific prompt for LeetCode, competitive programming prompt for others
    let prompt;
    if (platform === 'leetcode') {
      // LeetCode interview-focused prompt
      prompt = `You are an expert LeetCode tutor.  

Your goal is to help users fully understand the problem before they try to solve it.

═══════════════════════════════════════════════════════════════

PROBLEM INFORMATION

═══════════════════════════════════════════════════════════════

**Title:** ${problem.title}

**Difficulty:** ${difficulty}

${existingTags ? `**Tags:** ${existingTags}` : ''}

${problem.constraints ? `**Constraints:** ${problem.constraints}` : ''}

**Problem Description:**

${problem.description}

${problem.inputFormat ? `**Input Format:**\n${problem.inputFormat}` : ''}

${problem.outputFormat ? `**Output Format:**\n${problem.outputFormat}` : ''}

${examplesText}

═══════════════════════════════════════════════════════════════

YOUR TASK

═══════════════════════════════════════════════════════════════

Explain this problem clearly and simply. Your job is to help the student build the RIGHT mental model using a clean breakdown.

Your explanation must include:

1. **Plain-English restatement**

   - Remove unnecessary wording and restate the core task simply.

   - State the input and output clearly.

2. **What the problem is REALLY asking**

   - Identify the core structure (array/string/tree/graph/set).

   - Clarify the goal in a short, clean way.

   - Explain how data transforms into output.

3. **Constraints and why they matter**

   - Highlight important limits (like n ≤ 1e5, value ranges, etc.).

   - Explain what is *feasible* (e.g., brute force too slow, must be linear or log-linear) WITHOUT naming specific algorithms.

4. **Walk through the examples step-by-step**

   - Show exactly how input leads to output.

   - Emphasize what the example demonstrates about the rules.

5. **Edge cases or tricky points**

   - Mention anything the student must NOT overlook.

   - Clarify weird or ambiguous parts of the statement.

═══════════════════════════════════════════════════════════════

OUTPUT FORMAT (STRICT JSON - MANDATORY)

═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

═══════════════════════════════════════════════════════════════

RULES

═══════════════════════════════════════════════════════════════

❌ DO NOT:

- Reveal or hint at a solution approach.

- Mention algorithms (sliding window, DP, etc.).

- Provide code or pseudocode.

- Mention time complexity.

- Add any text outside the JSON object.

- Wrap JSON in markdown code blocks.

✅ DO:

- Be clear, conversational, beginner-friendly.

- Focus ONLY on understanding the problem.

- Use small examples to clarify behavior.

- Encourage careful reading of constraints.

- Return ONLY the JSON object, nothing else.

Now return ONLY the JSON object (no other text):`;
    } else {
      // Codeforces/CodeChef competitive programming focused prompt
      prompt = `You are an expert competitive programming tutor.  



Your role is to help students TRULY UNDERSTAND the problem before they attempt to solve it.

Your explanation must follow the thought process of a strong competitive programmer:

- Strip away story and rewrite the problem as a clean **math/combinatorial model**.

- Identify the **core objects**, **operations**, and **constraints**.

- Highlight anything "strange" or unusual — these are usually the key insights.

- Use samples to **verify the mental model**.

═══════════════════════════════════════════════════════════════

PROBLEM INFORMATION

═══════════════════════════════════════════════════════════════

**Title:** ${problem.title}

**Difficulty:** ${difficulty}

${existingTags ? `**Tags:** ${existingTags}` : ''}

${problem.constraints ? `**Constraints:** ${problem.constraints}` : ''}

${problem.html ? `**Problem Statement (HTML with LaTeX math notation):**

The problem statement is provided as HTML below. It contains LaTeX mathematical notation embedded in <script type="math/tex"> tags. Modern LLMs can parse this HTML and LaTeX notation naturally.

${problem.html}

**Note:** The HTML above contains the complete problem statement with all formatting and mathematical notation preserved. Parse the LaTeX math expressions (in <script type="math/tex"> tags) to understand the mathematical content.` : `**Problem Description:**

${problem.description}

${problem.inputFormat ? `**Input Format:**\n${problem.inputFormat}` : ''}

${problem.outputFormat ? `**Output Format:**\n${problem.outputFormat}` : ''}`}

${examplesText}

═══════════════════════════════════════════════════════════════

YOUR TASK

═══════════════════════════════════════════════════════════════

Explain this problem in clear, structured, beginner-friendly language — BUT with the analytical depth of a competitive programmer.

Your explanation must help the student understand:

1. **What the story is actually saying in pure mathematical terms.**

   - Rewrite the problem *without story*, using precise, compact definitions.

   - Identify the true objects (arrays, graphs, strings, sets, paths, trees, etc.).

2. **What exactly needs to be computed.**

   - Clarify the goal in one or two clean sentences.

   - Remove all narrative distractions.

3. **Key constraints and why they matter.**

   - Emphasize ranges like \`N ≤ 14\`, \`N ≤ 1e5\`, etc.

   - Briefly mention what such constraints *usually imply* (e.g., small N → brute force possible), but DO NOT give solution ideas.

4. **Important terminology & concepts.**

   - Define any technical terms used in the problem.

   - Mention familiar CP structures (like "this graph description actually forms a tree") *only when factual*, not as hints.

5. **Walk through the examples in detail.**

   - Step-by-step explain how inputs map to outputs.

   - Use this to confirm the abstract model is correct.

6. **What makes the problem tricky or interesting.**

   - Call out ambiguities, edge cases, restrictions, or unusual conditions.

   - Highlight patterns or structural weirdness, but NOT solution strategies.

═══════════════════════════════════════════════════════════════

OUTPUT FORMAT (STRICT JSON - MANDATORY)

═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

═══════════════════════════════════════════════════════════════

CRITICAL GUIDELINES

═══════════════════════════════════════════════════════════════

✅ DO:

- Think like a problem-setter: what structure the problem is *really* about.

- Rewrite the problem as a minimal, precise mathematical statement.

- Use small phrases like "In plain terms…" or "Stripped of its story…"

- Be friendly, clear, and highly structured.

- Use markdown formatting for readability (inside the JSON string).

- Validate interpretation using the samples.

- Return ONLY the JSON object, nothing else.

❌ DON'T:

- DO NOT provide algorithms, hints, approaches, or solution ideas.

- DO NOT mention complexity, optimality, or algorithmic techniques.

- DO NOT suggest brute force, DP, greedy, graph traversal, etc.

- DO NOT say things like "this can be solved by…"

- DO NOT skip example walkthroughs.

- DO NOT assume missing information.

- DO NOT add any text outside the JSON object.

- DO NOT wrap JSON in markdown code blocks.

═══════════════════════════════════════════════════════════════

Now return ONLY the JSON object (no other text):`;
    }

    // Log the exact prompt being sent to LLM for debugging
    console.log('='.repeat(80));
    console.log('LC Helper - EXPLAIN PROBLEM - Prompt sent to LLM:');
    console.log('='.repeat(80));
    console.log('Platform:', platform);
    console.log('Problem Data:', JSON.stringify({
      title: problem.title,
      difficulty: difficulty,
      tags: existingTags,
      constraints: problem.constraints,
      description: problem.description?.substring(0, 500) + (problem.description?.length > 500 ? '...' : ''),
      inputFormat: problem.inputFormat?.substring(0, 200) + (problem.inputFormat?.length > 200 ? '...' : ''),
      outputFormat: problem.outputFormat?.substring(0, 200) + (problem.outputFormat?.length > 200 ? '...' : ''),
      examplesLength: problem.examples?.length || 0,
      hasImages: problem.hasImages || false
    }, null, 2));
    console.log('='.repeat(80));
    console.log('Full Prompt (first 2000 chars):');
    console.log(prompt.substring(0, 2000) + (prompt.length > 2000 ? '\n... [truncated]' : ''));
    console.log('='.repeat(80));

    const parts = [{ text: prompt }];

    // Handle images - use only imageData (base64 from html2canvas)
    // Note: We don't fetch imageUrls due to CORS restrictions from LeetCode/CDN
    if (problem.hasImages && problem.imageData) {
      try {
        // Extract base64 data (remove data:image/jpeg;base64, or data:image/png;base64, prefix)
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');

        // Detect MIME type from the original data URL
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';

        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });

        console.log('Gemini: Including image data in explanation request');
      } catch (imageError) {
        console.warn('Gemini: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    // SECURITY: Use header instead of query param to prevent API key exposure in URLs/logs
    // Use response_schema to enforce JSON structure
    const requestBody = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500,
        response_mime_type: "application/json",
        response_schema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description: "Clear explanation of the problem"
            },
            keyPoints: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Array of key insights about the problem"
            }
          },
          required: ["explanation", "keyPoints"]
        }
      }
    };

    let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      const friendlyError = formatApiError(errorData.error?.message || 'Failed to generate explanation', 'gemini');
      return { error: friendlyError };
    }

    let data = await response.json();
    let content = data.candidates[0].content.parts[0].text;

    // Parse JSON from response (should be valid JSON due to response_mime_type and response_schema)
    let parsed = null;
    try {
      parsed = JSON.parse(content);
      if (parsed.explanation && parsed.keyPoints) {
        return parsed;
      }
      // If parsed but missing fields, try to use what we have
      if (parsed.explanation) {
        return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      }
    } catch (e) {
      console.warn('LC Helper: First attempt JSON parse failed, trying extraction:', e.message);
      // Fallback: try to extract JSON using robust extraction
      parsed = extractJSONFromResponse(content);
      if (parsed && parsed.explanation) {
        return parsed;
      }
    }

    // If we still don't have valid JSON, retry with a stricter prompt
    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;
      
      try {
        // Rebuild parts array with stricter prompt
        const retryParts = [{ text: strictPrompt }];
        if (parts.length > 1) {
          retryParts.push(...parts.slice(1)); // Keep image parts if any
        }
        
        const retryRequestBody = {
          contents: [{ parts: retryParts }],
          generationConfig: requestBody.generationConfig
        };

        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(retryRequestBody)
        });

        if (response.ok) {
          data = await response.json();
          content = data.candidates[0].content.parts[0].text;
          
          try {
            parsed = JSON.parse(content);
            if (parsed.explanation && parsed.keyPoints) {
              console.log('LC Helper: Retry successful, got valid JSON');
              return parsed;
            }
            if (parsed.explanation) {
              return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
            }
          } catch (e2) {
            parsed = extractJSONFromResponse(content);
            if (parsed && parsed.explanation) {
              console.log('LC Helper: Retry successful after extraction');
              return parsed;
            }
          }
        }
      } catch (retryError) {
        console.error('LC Helper: Retry failed:', retryError);
      }
    }

    // Final fallback: extract meaningful text from response instead of raw JSON/markdown
    const cleanText = extractTextFromResponse(content);
    console.log('LC Helper: Using extracted text fallback for explanation');
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with Gemini:', error);
    const friendlyError = formatApiError(error.message, 'gemini');
    return { error: friendlyError };
  }
}

async function explainProblemOpenAI(problem, apiKey, platform = 'codeforces') {
  try {
    // Use gpt-4o for vision support if images are present (either imageData or imageUrls), otherwise use gpt-4o-mini
    const hasImages = (problem.hasImages && (problem.imageData || (problem.imageUrls && problem.imageUrls.length > 0)));
    let model = hasImages ? 'gpt-4o' : 'gpt-4o-mini';
    let useImages = hasImages;

    // Format examples for better context
    const examplesText = problem.examples ?
      `\n\n**SAMPLE TEST CASES:**\n${problem.examples}\n\nIMPORTANT: Use these exact examples in your explanation. Walk through each example step-by-step to show how the input leads to the output.` :
      '\n\nNote: No sample test cases provided. Focus on explaining the problem statement clearly.';

    // Use LeetCode-specific prompt for LeetCode, competitive programming prompt for others
    let systemPrompt, userText;
    if (platform === 'leetcode') {
      // LeetCode interview-focused prompt
      systemPrompt = `You are an expert LeetCode tutor. Your goal is to help users fully understand the problem before they try to solve it.

Your explanations should:
- Be clear, conversational, beginner-friendly
- Focus ONLY on understanding the problem
- Use markdown formatting: **bold** for key terms, *italics* for emphasis, \`code\` for variables
- Walk through sample test cases step-by-step
- Highlight important constraints and edge cases

CRITICAL: Do NOT reveal or hint at solution approaches. Do NOT mention algorithms. Do NOT provide code or pseudocode. Do NOT mention time complexity.`;

      userText = `Explain this LeetCode problem clearly and simply. Your job is to help the student build the RIGHT mental model using a clean breakdown.

═══════════════════════════════════════════════════════════════
PROBLEM INFORMATION
═══════════════════════════════════════════════════════════════

**Title:** ${problem.title}
${problem.difficulty ? `**Difficulty:** ${problem.difficulty}` : ''}
${problem.tags ? `**Tags:** ${problem.tags}` : ''}
${problem.constraints ? `**Constraints:**\n${problem.constraints}` : ''}

**Problem Description:**
${problem.description}

${problem.inputFormat ? `**Input Format:**\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `**Output Format:**\n${problem.outputFormat}` : ''}
${examplesText}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════

Your explanation must include:

1. **Plain-English restatement**
   - Remove unnecessary wording and restate the core task simply.
   - State the input and output clearly.

2. **What the problem is REALLY asking**
   - Identify the core structure (array/string/tree/graph/set).
   - Clarify the goal in a short, clean way.
   - Explain how data transforms into output.

3. **Constraints and why they matter**
   - Highlight important limits (like n ≤ 1e5, value ranges, etc.).
   - Explain what is *feasible* (e.g., brute force too slow, must be linear or log-linear) WITHOUT naming specific algorithms.

4. **Walk through the examples step-by-step**
   - Show exactly how input leads to output.
   - Emphasize what the example demonstrates about the rules.

5. **Edge cases or tricky points**
   - Mention anything the student must NOT overlook.
   - Clarify weird or ambiguous parts of the statement.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON - MANDATORY)
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text):`;
    } else {
      // Codeforces/CodeChef competitive programming focused prompt
      systemPrompt = `You are an expert competitive programming tutor. Your role is to help students TRULY UNDERSTAND the problem before they attempt to solve it.

Your explanation must follow the thought process of a strong competitive programmer:
- Strip away story and rewrite the problem as a clean math/combinatorial model
- Identify the core objects, operations, and constraints
- Highlight anything "strange" or unusual — these are usually the key insights
- Use samples to verify the mental model

Your explanations should:
- Use simple, conversational language but with analytical depth
- Define technical terms when first introduced
- Walk through sample test cases step-by-step
- Use markdown formatting: **bold** for key terms, *italics* for emphasis, \`code\` for variables
- Break complex ideas into digestible parts
- Highlight important constraints and edge cases

CRITICAL: Do NOT provide algorithms, hints, approaches, or solution ideas. Do NOT mention complexity, optimality, or algorithmic techniques. Do NOT suggest brute force, DP, greedy, graph traversal, etc.`;

      userText = `Explain this competitive programming problem in clear, structured, beginner-friendly language — BUT with the analytical depth of a competitive programmer.

═══════════════════════════════════════════════════════════════
PROBLEM INFORMATION
═══════════════════════════════════════════════════════════════

**Title:** ${problem.title}
${problem.difficulty ? `**Difficulty:** ${problem.difficulty}` : ''}
${problem.tags ? `**Tags:** ${problem.tags}` : ''}
${problem.constraints ? `**Constraints:**\n${problem.constraints}` : ''}

${problem.html ? `**Problem Statement (HTML with LaTeX math notation):**

The problem statement is provided as HTML below. It contains LaTeX mathematical notation embedded in <script type="math/tex"> tags. Modern LLMs can parse this HTML and LaTeX notation naturally.

${problem.html}

**Note:** The HTML above contains the complete problem statement with all formatting and mathematical notation preserved. Parse the LaTeX math expressions (in <script type="math/tex"> tags) to understand the mathematical content.` : `**Problem Description:**
${problem.description}

${problem.inputFormat ? `**Input Format:**\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `**Output Format:**\n${problem.outputFormat}` : ''}`}

${examplesText}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════

Your explanation must help the student understand:

1. **What the story is actually saying in pure mathematical terms.**
   - Rewrite the problem *without story*, using precise, compact definitions.
   - Identify the true objects (arrays, graphs, strings, sets, paths, trees, etc.).

2. **What exactly needs to be computed.**
   - Clarify the goal in one or two clean sentences.
   - Remove all narrative distractions.

3. **Key constraints and why they matter.**
   - Emphasize ranges like \`N ≤ 14\`, \`N ≤ 1e5\`, etc.
   - Briefly mention what such constraints *usually imply* (e.g., small N → brute force possible), but DO NOT give solution ideas.

4. **Important terminology & concepts.**
   - Define any technical terms used in the problem.
   - Mention familiar CP structures (like "this graph description actually forms a tree") *only when factual*, not as hints.

5. **Walk through the examples in detail.**
   - Step-by-step explain how inputs map to outputs.
   - Use this to confirm the abstract model is correct.

6. **What makes the problem tricky or interesting.**
   - Call out ambiguities, edge cases, restrictions, or unusual conditions.
   - Highlight patterns or structural weirdness, but NOT solution strategies.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON - MANDATORY)
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text):`;
    }

    const userContent = [
      {
        type: 'text',
        text: userText
      }
    ];

    // Handle images - use only imageData (base64 from html2canvas)
    // Note: We don't fetch imageUrls due to CORS restrictions from LeetCode/CDN
    if (problem.hasImages && problem.imageData) {
      try {
        // OpenAI accepts data URLs directly
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData
          }
        });

        console.log('OpenAI: Including image data in explanation request');
      } catch (imageError) {
        console.warn('OpenAI: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: "json_object" }
      })
    });

    let data = await response.json();

    // If gpt-4o fails (user doesn't have access), fallback to gpt-4o-mini without images
    if (data.error && model === 'gpt-4o' && hasImages) {
      console.log('LC Helper: gpt-4o not available for explanation, falling back to gpt-4o-mini (images will be skipped)');

      // Remove images from content and retry with gpt-4o-mini
      const textOnlyContent = userContent.filter(item => item.type === 'text');
      model = 'gpt-4o-mini';
      useImages = false;

      // Update prompt to mention images were detected but can't be analyzed
      const updatedUserText = userText + '\n\n⚠️ Note: This problem contains images/graphs, but your API key doesn\'t have access to vision models (gpt-4o). The explanation is based on text description only.';

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: [{ type: 'text', text: updatedUserText }]
            }
          ],
          temperature: 0.3,
          max_tokens: 2500,
          response_format: { type: "json_object" }
        })
      });

      data = await response.json();
    }

    if (data.error) {
      const friendlyError = formatApiError(data.error.message, 'openai');
      // Add specific message for vision model access issues
      if (hasImages && model === 'gpt-4o') {
        return {
          error: friendlyError + '\n\n💡 Tip: This problem contains images. To analyze images, you need an OpenAI API key with access to gpt-4o model. Alternatively, use Gemini which supports vision with all API keys.'
        };
      }
      return { error: friendlyError };
    }

    const content = data.choices[0].message.content;

    // Parse JSON from response (should be valid JSON due to response_format)
    try {
      const parsed = JSON.parse(content);
      if (parsed.explanation && parsed.keyPoints) {
        return parsed;
      }
    } catch (e) {
      // Fallback: try to extract JSON using robust extraction
      const extracted = extractJSONFromResponse(content);
      if (extracted && extracted.explanation) {
        return extracted;
      }
    }

    // Fallback: extract meaningful text from response instead of raw JSON/markdown
    const cleanText = extractTextFromResponse(content);
    console.log('LC Helper: Using extracted text fallback for explanation (OpenAI)');
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with OpenAI:', error);
    const friendlyError = formatApiError(error.message, 'openai');
    return { error: friendlyError };
  }
}

// Convert API errors to user-friendly messages
function formatApiError(errorMessage, provider = 'gemini') {
  if (!errorMessage) return 'An error occurred. Please try again.';

  const message = errorMessage.toLowerCase();

  // Quota/limit exceeded errors
  if (message.includes('quota') || message.includes('limit') || message.includes('exceeded')) {
    if (message.includes('limit: 0')) {
      return 'API quota exhausted. Get a new API key or enable billing.';
    }
    return 'API quota exceeded. Try again later or upgrade your plan.';
  }

  // Invalid API key errors
  if (message.includes('invalid') && (message.includes('api key') || message.includes('key'))) {
    return 'Invalid API key. Check your settings and try again.';
  }

  // Authentication errors
  if (message.includes('unauthorized') || message.includes('permission') || message.includes('forbidden')) {
    return 'API key not authorized. Check your key in settings.';
  }

  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Network errors
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'Network error. Check your internet connection.';
  }

  // Billing errors
  if (message.includes('billing') || message.includes('payment')) {
    return 'Billing issue. Enable billing in your API account.';
  }

  // Default: return shortened version of original error
  if (message.length > 100) {
    return 'API error occurred. Check your API key and try again.';
  }

  return errorMessage;
}

// Helper function to fix JSON with unescaped newlines/special chars in string values
// LLM APIs sometimes return JSON with literal newlines inside strings instead of \n
function fixMalformedJSON(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;
  
  // First, try parsing as-is - if it works, no fix needed
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch (e) {
    // Need to fix malformed JSON
  }
  
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const charCode = jsonStr.charCodeAt(i);
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }
    
    // If we're inside a string, escape special characters
    if (inString) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (charCode < 32) {
        // Escape other control characters
        result += '\\u' + charCode.toString(16).padStart(4, '0');
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }
  
  return result;
}

// Helper function to extract and parse JSON from LLM responses
// Handles markdown code blocks, nested JSON, and various response formats
function extractJSONFromResponse(content) {
  if (!content || typeof content !== 'string') {
    console.error('LC Helper: extractJSONFromResponse - Invalid content:', typeof content);
    return null;
  }

  // Log the raw content for debugging (truncated)
  console.log('LC Helper: Extracting JSON from response (first 500 chars):', content.substring(0, 500));

  // Pre-process: Fix malformed JSON with unescaped newlines
  let normalizedContent = content;
  
  // Method 1: Try direct JSON parse first (simplest case)
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      console.log('LC Helper: Successfully parsed direct JSON');
      return parsed;
    } catch (e) {
      // Try fixing malformed JSON (unescaped newlines in strings)
      console.log('LC Helper: Direct parse failed, trying to fix malformed JSON...');
      try {
        const fixed = fixMalformedJSON(trimmed);
        const parsed = JSON.parse(fixed);
        console.log('LC Helper: Successfully parsed JSON after fixing malformed content');
        return parsed;
      } catch (e2) {
        console.warn('LC Helper: Fix malformed JSON failed:', e2.message);
        // Continue to other methods
      }
    }
  }

  // Method 2: Try to extract from markdown code blocks (```json ... ``` or ``` ... ```)
  // Use a more robust regex that handles various code block formats
  const codeBlockPatterns = [
    /```json\s*([\s\S]*?)```/g,  // ```json ... ```
    /```\s*([\s\S]*?)```/g,       // ``` ... ```
    /```json\s*([\s\S]*)$/g,      // ```json ... (unclosed)
    /```\s*([\s\S]*)$/g           // ``` ... (unclosed)
  ];
  
  for (const regex of codeBlockPatterns) {
    regex.lastIndex = 0; // Reset regex state
    let match;
    while ((match = regex.exec(normalizedContent)) !== null) {
      let jsonStr = match[1].trim();
      
      // Remove any trailing incomplete markdown
      jsonStr = jsonStr.replace(/```\s*$/, '').trim();
      
      // Skip if empty or doesn't look like JSON
      if (!jsonStr || (!jsonStr.startsWith('{') && !jsonStr.startsWith('['))) {
        continue;
      }
      
      // Try parsing strategies in order: direct, fix malformed, repair incomplete
      const parseStrategies = [
        () => JSON.parse(jsonStr),
        () => JSON.parse(fixMalformedJSON(jsonStr)),
        () => JSON.parse(repairIncompleteJSON(jsonStr)),
        () => JSON.parse(fixMalformedJSON(repairIncompleteJSON(jsonStr)))
      ];
      
      for (const strategy of parseStrategies) {
        try {
          const parsed = strategy();
          console.log('LC Helper: Successfully extracted JSON from code block');
          return parsed;
        } catch (e) {
          // Try next strategy
        }
      }
    }
  }

  // Method 3: Try to find JSON object using balanced brace matching
  // This handles cases where JSON is embedded in text
  const jsonObjects = findBalancedJSON(normalizedContent);
  for (const jsonStr of jsonObjects) {
    // Try parsing strategies in order
    const parseStrategies = [
      () => JSON.parse(jsonStr),
      () => JSON.parse(fixMalformedJSON(jsonStr)),
      () => JSON.parse(repairIncompleteJSON(jsonStr)),
      () => JSON.parse(fixMalformedJSON(repairIncompleteJSON(jsonStr)))
    ];
    
    for (const strategy of parseStrategies) {
      try {
        const parsed = strategy();
        console.log('LC Helper: Successfully extracted JSON using brace matching');
        return parsed;
      } catch (e) {
        // Try next strategy
      }
    }
  }

  // Method 4: Fallback to simple regex (greedy match)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parseStrategies = [
      () => JSON.parse(jsonMatch[0]),
      () => JSON.parse(fixMalformedJSON(jsonMatch[0])),
      () => JSON.parse(repairIncompleteJSON(jsonMatch[0])),
      () => JSON.parse(fixMalformedJSON(repairIncompleteJSON(jsonMatch[0])))
    ];
    
    for (const strategy of parseStrategies) {
      try {
        const parsed = strategy();
        console.log('LC Helper: Successfully extracted JSON using regex fallback');
        return parsed;
      } catch (e) {
        // Try next strategy
      }
    }
  }

  // Method 5: Try to find JSON array (in case response is just an array)
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const arrayStrategies = [
      () => JSON.parse(arrayMatch[0]),
      () => JSON.parse(fixMalformedJSON(arrayMatch[0]))
    ];
    
    for (const strategy of arrayStrategies) {
      try {
        const parsed = strategy();
        // If it's an array, wrap it in an object with hints property
        if (Array.isArray(parsed) && parsed.length === 3) {
          console.log('LC Helper: Found array, converting to hints object');
          return { hints: parsed };
        }
        return parsed;
      } catch (e) {
        // Try next strategy
      }
    }
  }

  // Method 6: Try to extract incomplete JSON and repair it
  const incompleteJsonMatch = content.match(/\{[\s\S]*/);
  if (incompleteJsonMatch) {
    const incompleteStrategies = [
      () => repairIncompleteJSON(incompleteJsonMatch[0]),
      () => fixMalformedJSON(repairIncompleteJSON(incompleteJsonMatch[0]))
    ];
    
    for (const repairStrategy of incompleteStrategies) {
      const repaired = repairStrategy();
      if (repaired) {
        try {
          const parsed = JSON.parse(repaired);
          console.log('LC Helper: Successfully extracted and repaired incomplete JSON');
          return parsed;
        } catch (e) {
          // Try next strategy
        }
      }
    }
  }

  console.error('LC Helper: Failed to extract JSON from response');
  console.error('LC Helper: Full response content:', content);
  return null;
}

/**
 * Normalize hints from various response formats to a consistent array format.
 * Handles both array and object formats from different AI providers.
 * @param {Object} parsed - The parsed JSON response
 * @returns {Object|null} - Normalized response with hints as array, or null if no hints found
 */
function normalizeHintsResponse(parsed) {
  if (!parsed) return null;
  
  // Case 1: hints is already an array with at least 3 items - perfect!
  if (parsed.hints && Array.isArray(parsed.hints) && parsed.hints.length >= 3) {
    return parsed;
  }
  
  // Case 2: hints is an array but with less than 3 items - pad it
  if (parsed.hints && Array.isArray(parsed.hints) && parsed.hints.length > 0) {
    console.log('LC Helper: Padding hints array from', parsed.hints.length, 'to 3 items');
    while (parsed.hints.length < 3) {
      parsed.hints.push('(Additional hint not available)');
    }
    return parsed;
  }
  
  // Case 3: hints is an object with gentle/stronger/almost keys (Claude format)
  if (parsed.hints && typeof parsed.hints === 'object' && !Array.isArray(parsed.hints)) {
    const hintsObj = parsed.hints;
    const hints = [
      hintsObj.gentle || hintsObj.hint1 || hintsObj['1'] || hintsObj.first || '',
      hintsObj.stronger || hintsObj.hint2 || hintsObj['2'] || hintsObj.second || '',
      hintsObj.almost || hintsObj.hint3 || hintsObj['3'] || hintsObj.third || ''
    ].filter(h => h && typeof h === 'string' && h.trim());
    
    if (hints.length > 0) {
      console.log('LC Helper: Converted object hints format to array');
      while (hints.length < 3) hints.push('(Additional hint not available)');
      return { ...parsed, hints };
    }
  }
  
  // Case 4: hints at top level with hint1/hint2/hint3 keys
  if (parsed.hint1 || parsed.hint_1 || parsed.Hint1) {
    const hints = [
      parsed.hint1 || parsed.hint_1 || parsed.Hint1 || '',
      parsed.hint2 || parsed.hint_2 || parsed.Hint2 || '',
      parsed.hint3 || parsed.hint_3 || parsed.Hint3 || ''
    ].filter(h => h && typeof h === 'string' && h.trim());
    
    if (hints.length > 0) {
      console.log('LC Helper: Extracted hints from hint1/hint2/hint3 format');
      while (hints.length < 3) hints.push('(Additional hint not available)');
      return { ...parsed, hints };
    }
  }
  
  // Case 5: Array at root level (some models return just the array)
  if (Array.isArray(parsed) && parsed.length > 0) {
    console.log('LC Helper: Response is array at root level, wrapping in hints object');
    const hints = parsed.slice(0, 3);
    while (hints.length < 3) hints.push('(Additional hint not available)');
    return { hints };
  }
  
  // Could not normalize
  console.warn('LC Helper: Could not normalize hints response:', JSON.stringify(parsed).substring(0, 300));
  return null;
}

// Helper to find balanced JSON objects in content
function findBalancedJSON(content) {
  const results = [];
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (braceCount === 0) {
        startIndex = i;
      }
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        // Found a complete JSON object
        results.push(content.substring(startIndex, i + 1));
        startIndex = -1;
      }
    }
  }

  return results;
}

// Helper to extract plain text from content that may contain markdown-wrapped JSON
// Used as fallback when JSON extraction fails
function extractTextFromResponse(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  let text = content.trim();

  // First, try to extract JSON if present
  if (text.startsWith('{') || text.includes('"explanation"')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.explanation) {
        return parsed.explanation;
      }
    } catch (e) {
      // Not valid JSON, try extraction
    }
    
    // Try to extract explanation field with regex (handles multiline strings better)
    const explanationMatch = text.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/s);
    if (explanationMatch) {
      try {
        // Unescape the JSON string
        return JSON.parse('"' + explanationMatch[1] + '"');
      } catch (e) {
        return explanationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }

    // Try multiline JSON extraction (handles unescaped newlines)
    const multilineMatch = text.match(/"explanation"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (multilineMatch) {
      try {
        return JSON.parse('"' + multilineMatch[1] + '"');
      } catch (e) {
        // If JSON parsing fails, try to extract the text between quotes manually
        let extracted = multilineMatch[1];
        // Handle escaped sequences
        extracted = extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        return extracted;
      }
    }
  }

  // Remove markdown code blocks
  text = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  text = text.replace(/```(?:json)?\s*([\s\S]*)$/g, '$1').trim();

  // If text still looks like it contains JSON structure, try to extract just the explanation text
  // Look for patterns like "explanation": "..." or explanation: "..."
  const looseMatch = text.match(/(?:explanation|Explanation)\s*[:\-]\s*["']?([^"'{}\[\]]+)["']?/i);
  if (looseMatch && looseMatch[1].trim().length > 10) {
    return looseMatch[1].trim();
  }

  // Remove any remaining partial JSON-like structures at the start
  text = text.replace(/^\s*\{[\s\S]*?$/, '').trim();
  
  // If the text is very long and seems to be a full explanation (not JSON), use it
  // This handles cases where LLM completely ignores JSON format
  if (text.length > 50 && !text.startsWith('{') && !text.startsWith('[')) {
    return text;
  }
  
  return text || content;
}

// Helper function to repair incomplete JSON
function repairIncompleteJSON(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return null;
  
  let repaired = jsonStr.trim();
  
  // Remove any trailing incomplete markdown or whitespace
  repaired = repaired.replace(/```\s*$/, '').trim();
  
  // Check if we're in the middle of a string
  let inString = false;
  let escapeNext = false;
  let lastQuoteIndex = -1;
  
  for (let i = 0; i < repaired.length; i++) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (repaired[i] === '\\') {
      escapeNext = true;
      continue;
    }
    if (repaired[i] === '"') {
      inString = !inString;
      lastQuoteIndex = i;
    }
  }
  
  // If we're in a string (odd number of unescaped quotes), close it
  if (inString) {
    // Find where the string should end - look for common patterns
    // If the last part looks like incomplete text, just close the quote
    const afterLastQuote = repaired.substring(lastQuoteIndex + 1);
    if (afterLastQuote.trim().length > 0 && !afterLastQuote.trim().match(/^[,}\]]/)) {
      // We're in the middle of a string value - close it
      repaired += '"';
    }
  }
  
  // Count brackets and braces to close them
  let openBraces = (repaired.match(/\{/g) || []).length;
  let closeBraces = (repaired.match(/\}/g) || []).length;
  let openBrackets = (repaired.match(/\[/g) || []).length;
  let closeBrackets = (repaired.match(/\]/g) || []).length;
  
  // Close brackets first (inner structures)
  while (closeBrackets < openBrackets) {
    repaired += ']';
    closeBrackets++;
  }
  
  // Then close braces (outer structure)
  while (closeBraces < openBraces) {
    repaired += '}';
    closeBraces++;
  }
  
  return repaired;
}

async function generateHintsGemini(problem, apiKey, platform = 'codeforces') {
  try {
    // Helper function to truncate text while preserving important content
    const truncateText = (text, maxLength, suffix = '...[truncated]') => {
      if (!text || text.length <= maxLength) return text || '';
      return text.substring(0, maxLength - suffix.length) + suffix;
    };

    // Truncate long fields to prevent hitting token limits
    // Keep description reasonable but allow enough for complex problems
    const MAX_DESCRIPTION_LENGTH = 6000;
    const MAX_EXAMPLES_LENGTH = 2000;
    const MAX_FORMAT_LENGTH = 1000;
    const MAX_HTML_LENGTH = 8000;

    const truncatedDescription = truncateText(problem.description, MAX_DESCRIPTION_LENGTH);
    const truncatedExamples = truncateText(problem.examples, MAX_EXAMPLES_LENGTH);
    const truncatedInputFormat = truncateText(problem.inputFormat, MAX_FORMAT_LENGTH);
    const truncatedOutputFormat = truncateText(problem.outputFormat, MAX_FORMAT_LENGTH);
    const truncatedHtml = truncateText(problem.html, MAX_HTML_LENGTH);

    // Log the complete problem object received (with truncated values for logging)
    console.log('='.repeat(80));
    console.log('LC Helper - GET HINTS - Received Problem Object:');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      title: problem.title,
      difficulty: problem.difficulty,
      tags: problem.tags,
      constraints: problem.constraints,
      descriptionLength: problem.description?.length || 0,
      descriptionTruncated: problem.description?.length > MAX_DESCRIPTION_LENGTH,
      inputFormat: truncatedInputFormat?.substring(0, 200),
      outputFormat: truncatedOutputFormat?.substring(0, 200),
      examplesLength: problem.examples?.length || 0,
      url: problem.url,
      hasImages: problem.hasImages,
      platform: platform
    }, null, 2));
    console.log('='.repeat(80));

    // Enhanced context extraction
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    // Use LeetCode interview-focused prompt for LeetCode, CP-focused prompt for others
    let prompt;
    if (platform === 'leetcode') {
      // LeetCode interview-focused prompt
      prompt = `You are a world-class LeetCode interview coach.  

Your goal is to guide the user toward the solution WITHOUT revealing the full answer.

Provide **three progressively stronger hints**, where each helps the user think more clearly about the structure of the problem.

═══════════════════════════════════════════════════════════════

HOW TO THINK (MANDATORY)

═══════════════════════════════════════════════════════════════

Base all hints on these reasoning techniques:

1. **Understand the structure of the input**  

   (array, string, tree, graph, intervals, DP states, etc.)

2. **Analyze constraints**  

   (size limits, value ranges, whether brute force is possible)

3. **Try small examples**  

   - Consider edge cases.

   - Observe patterns manually.

4. **Look for the core behavior**  

   - Are we tracking a window? a running sum? a frequency? a state?

   - Does the problem want you to compare, count, merge, search, split, or optimize something?

5. **Spot unusual details**  

   - Special rules often point to the main idea.

Hints must guide, NOT reveal.

═══════════════════════════════════════════════════════════════

WHAT EACH HINT SHOULD DO

═══════════════════════════════════════════════════════════════

### **Hint 1 — Understanding & Key Observations**

- Clarify how to interpret the input.

- Point out what is MOST important.

- Suggest small example testing.

- DO NOT mention algorithms.

### **Hint 2 — Structural Insight**

- Reveal the deeper structure of the problem.

- Reference constraints like "n is large, so we need an efficient way to handle X" WITHOUT naming the technique.

- Highlight relationships or invariants.

- Still DO NOT reveal the exact method.

### **Hint 3 — High-Level Algorithm Direction**

- Now you may mention general algorithm families (e.g., "a two-pointer strategy fits the pattern", "a DFS-style traversal might work", "a DP formulation seems natural").

- DO NOT give recurrences, code, or exact implementation.

═══════════════════════════════════════════════════════════════

OUTPUT FORMAT (STRICT JSON)

═══════════════════════════════════════════════════════════════

Return ONLY:

{

  "hints": [

    "Hint 1 (understanding + observations)...",

    "Hint 2 (structural insight)...",

    "Hint 3 (high-level algorithm family without specifics)..."

  ]

}

═══════════════════════════════════════════════════════════════

RULES

═══════════════════════════════════════════════════════════════

❌ NEVER:

- Reveal the solution.

- Give code or pseudocode.

- Give exact algorithm steps.

- State complexity like O(n log n) unless necessary.

- Use phrases like "the answer is" or "the correct approach is".

✅ ALWAYS:

- Lead the student step by step.

- Encourage careful reasoning.

- Help them uncover the structure on their own.

- Keep hints progressively stronger but never explicit.

═══════════════════════════════════════════════════════════════

NOW ANALYZE THIS ${difficulty.toUpperCase()} PROBLEM:

═══════════════════════════════════════════════════════════════

Title: ${problem.title}
${existingTags ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}
Description: ${truncatedDescription}
${truncatedExamples ? `\n\nSample Test Cases:\n${truncatedExamples}` : ''}
${truncatedInputFormat ? `\n\nInput Format:\n${truncatedInputFormat}` : ''}
${truncatedOutputFormat ? `\n\nOutput Format:\n${truncatedOutputFormat}` : ''}

${problem.hasImages ? 'Note: This problem includes images/graphs in the problem statement. Analyze them carefully along with the text description.' : ''}
${truncatedExamples ? '\nIMPORTANT: Use the sample test cases to verify your understanding. The hints should guide toward a solution that works for these examples.' : ''}

Now generate the three hints as JSON.`;
    } else {
      // Codeforces/CodeChef competitive programming focused prompt
      prompt = `You are a world-class competitive programming coach.  

Your job is NOT to give the solution.  

Your job is to guide the user toward discovering the solution on their own — using the reasoning techniques of top competitive programmers.



Hints must be **progressive**, **non-revealing**, and **focused on understanding**, not implementation.



═══════════════════════════════════════════════════════════════

HOW YOU MUST THINK

═══════════════════════════════════════════════════════════════



Your hints must follow the structured thought process used by strong competitive programmers:



1. **Strip story → Identify the pure mathematical model.**

2. **Analyze constraints** (small N → brute force options, large N → linear/logarithmic approaches).

3. **Search for known patterns** (tree, graph, DP state, window, monotonicity, parity, greedy invariants).

4. **Use "specific → general" reasoning.**

   - Try extremely small cases and understand their behavior.

5. **Make testable hypotheses** (e.g., structure, monotonicity, invariants).

6. **Spot unusual / restricting parts of the statement** — these are often the key.

7. **Break the problem into components**, if possible.



Never jump directly to the algorithm.  

Hints should gradually guide thinking, not reveal.

**Mathematical Notation**: The problem statement uses standard mathematical notation where:
- Subscripts are indicated with underscores: "s_i" means s subscript i, "a_1" means a subscript 1
- Superscripts are indicated with carets: "2^k" means 2 to the power of k, "10^n" means 10 to the power of n
- Variable names follow standard mathematical conventions (single letters like n, k, m, i, j, etc.)

═══════════════════════════════════════════════════════════════

WHAT YOU MUST OUTPUT

═══════════════════════════════════════════════════════════════



Provide THREE HINTS:



### **Hint 1 — Understanding & Key Observations**

- Help the student build the correct mental model.

- Point out what part of the statement is most important or unusual.

- Suggest examining small cases.

- Suggest what structures/patterns the problem resembles.

- DO NOT mention specific algorithms or data structures yet.



### **Hint 2 — Structural Insight (Still Non-Solution)**

- Highlight the mathematical/structural property that unlocks the problem.

- Refer to constraint implications.

- Mention categories like "graph problem", "DP-like behavior", "two-pointer-like structure", etc. without naming exact methods.

- Give high-level reasoning direction but NOT the final method.



### **Hint 3 — Algorithmic Direction (General Approach Only)**

- Now you may hint at possible method families (e.g., "a tree DP might fit", "binary search on the answer is plausible", "greedy structure looks promising").

- DO NOT specify the exact recurrence, data structure, or steps.

- DO NOT provide code, pseudocode, or the full algorithm.

- DO NOT reveal the solution outright.

- Keep hints directional, not explicit.



═══════════════════════════════════════════════════════════════

OUTPUT FORMAT (STRICT JSON)

═══════════════════════════════════════════════════════════════



Return ONLY:



{

  "hints": [

    "Hint 1 (key observations, understanding the model)...",

    "Hint 2 (structural insight, constraint-based reasoning)...",

    "Hint 3 (high-level algorithm family, without giving away the full solution)..."

  ]

}



═══════════════════════════════════════════════════════════════

CRITICAL RULES

═══════════════════════════════════════════════════════════════



❌ DO NOT:

- Do NOT give the solution.

- Do NOT give code or pseudocode.

- Do NOT give exact data structures unless needed conceptually.

- Do NOT reveal formulae, transitions, or constructions.

- Do NOT mention explicit algorithm names in Hints 1,2.



✅ DO:

- Guide the user's thinking progressively.

- Make them *see* the structure and reach the insight themselves.

- Use language like:

  - "Try examining how this behaves for small inputs…"

  - "Notice that this condition strongly restricts X…"

  - "Think about what the constraint N ≤ ___ implies…"

  - "Consider whether this object behaves like a tree/interval/DP state/etc."



═══════════════════════════════════════════════════════════════

NOW ANALYZE THIS ${difficulty.toUpperCase()} PROBLEM:

═══════════════════════════════════════════════════════════════

Title: ${problem.title}
${existingTags ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}

${truncatedHtml ? `**Problem Statement (HTML with LaTeX math notation):**

The problem statement is provided as HTML below. It contains LaTeX mathematical notation embedded in <script type="math/tex"> tags. Modern LLMs can parse this HTML and LaTeX notation naturally.

${truncatedHtml}

**Note:** The HTML above contains the complete problem statement with all formatting and mathematical notation preserved. Parse the LaTeX math expressions (in <script type="math/tex"> tags) to understand the mathematical content.` : `Description: ${truncatedDescription}
${truncatedInputFormat ? `\n\nInput Format:\n${truncatedInputFormat}` : ''}
${truncatedOutputFormat ? `\n\nOutput Format:\n${truncatedOutputFormat}` : ''}`}

${truncatedExamples ? `\n\nSample Test Cases:\n${truncatedExamples}` : ''}

${problem.hasImages ? 'Note: This problem includes images/graphs in the problem statement. Analyze them carefully along with the text description.' : ''}
${truncatedExamples ? '\nIMPORTANT: Use the sample test cases to verify your understanding. The hints should guide toward a solution that works for these examples.' : ''}

Now generate the hints as JSON.`;
    }

    // Log the exact prompt being sent to LLM for debugging
    console.log('='.repeat(80));
    console.log('LC Helper - GET HINTS - Prompt sent to LLM:');
    console.log('='.repeat(80));
    console.log('Platform:', platform);
    console.log('Problem Data:', JSON.stringify({
      title: problem.title,
      difficulty: difficulty,
      tags: existingTags,
      constraints: problem.constraints,
      description: problem.description?.substring(0, 500) + (problem.description?.length > 500 ? '...' : ''),
      inputFormat: problem.inputFormat?.substring(0, 200) + (problem.inputFormat?.length > 200 ? '...' : ''),
      outputFormat: problem.outputFormat?.substring(0, 200) + (problem.outputFormat?.length > 200 ? '...' : ''),
      examplesLength: problem.examples?.length || 0,
      hasImages: problem.hasImages || false
    }, null, 2));
    console.log('='.repeat(80));
    console.log('Full Prompt (first 2000 chars):');
    console.log(prompt.substring(0, 2000) + (prompt.length > 2000 ? '\n... [truncated]' : ''));
    console.log('='.repeat(80));

    // Build parts array - include image if available
    const parts = [{ text: prompt }];

    // Handle images - use only imageData (base64 from html2canvas)
    // Note: We don't fetch imageUrls due to CORS restrictions from LeetCode/CDN
    if (problem.hasImages && problem.imageData) {
      try {
        // Extract base64 data (remove data:image/jpeg;base64, or data:image/png;base64, prefix)
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');

        // Detect MIME type from the original data URL
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';

        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });

        console.log('Gemini: Including image data in hints request');
      } catch (imageError) {
        console.warn('Gemini: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    // SECURITY: Use header instead of query param to prevent API key exposure in URLs/logs
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.5,  // Lowered from 0.7 for more consistent hints
          maxOutputTokens: 4096,  // Increased to handle longer responses
          topP: 0.9,
          topK: 40,
          response_mime_type: "application/json"  // Force JSON output - prevents markdown wrapping
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      const friendlyError = formatApiError(data.error.message, 'gemini');
      return { error: friendlyError };
    }

    // Check if the API actually truncated the response
    const finishReason = data.candidates?.[0]?.finishReason;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('LC Helper: Gemini response finishReason:', finishReason);
    console.log('LC Helper: Gemini response content length:', content.length);
    console.log('LC Helper: Gemini response content (first 500 chars):', content.substring(0, 500));

    // If the API explicitly says it hit token limit, report that
    if (finishReason === 'MAX_TOKENS') {
      console.error('LC Helper: Gemini response was truncated due to MAX_TOKENS');
      return { error: 'Response was truncated due to token limit. Please try again with a shorter problem description.' };
    }

    // Parse JSON from response using robust extraction
    const parsed = extractJSONFromResponse(content);
    if (parsed) {
      console.log('LC Helper: Parsed Gemini hints response:', JSON.stringify(parsed, null, 2).substring(0, 500));
    }
    
    // Use the helper function to normalize hints from various formats
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    // If we couldn't parse or normalize, provide a helpful error
    console.error('LC Helper: Failed to extract/normalize hints from Gemini response');
    console.error('LC Helper: Full response content:', content);
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with Gemini:', error);
    const friendlyError = formatApiError(error.message, 'gemini');
    return { error: friendlyError };
  }
}

async function generateHintsOpenAI(problem, apiKey, platform = 'codeforces') {
  try {
    // Use gpt-5 for vision support if images are present (either imageData or imageUrls), otherwise use gpt-5-mini
    const hasImages = (problem.hasImages && (problem.imageData || (problem.imageUrls && problem.imageUrls.length > 0)));
    let model = hasImages ? 'gpt-5' : 'gpt-5-mini';
    let useImages = hasImages;

    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    // Use LeetCode interview-focused prompt for LeetCode, CP-focused prompt for others
    let systemPrompt, userText;
    if (platform === 'leetcode') {
      // LeetCode interview-focused prompt
      systemPrompt = `You are a world-class LeetCode interview coach. Your goal is to guide the user toward the solution WITHOUT revealing the full answer.

Provide **three progressively stronger hints**, where each helps the user think more clearly about the structure of the problem.

Base all hints on these reasoning techniques:
1. **Understand the structure of the input** (array, string, tree, graph, intervals, DP states, etc.)
2. **Analyze constraints** (size limits, value ranges, whether brute force is possible)
3. **Try small examples** - Consider edge cases, observe patterns manually
4. **Look for the core behavior** - Are we tracking a window? a running sum? a frequency? a state?
5. **Spot unusual details** - Special rules often point to the main idea

Hints must guide, NOT reveal.
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.' : ''}`;

      userText = `Analyze this LeetCode problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}
Description: ${problem.description}
${problem.examples ? `\n\nSample Test Cases:\n${problem.examples}` : ''}
${problem.inputFormat ? `\n\nInput Format:\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `\n\nOutput Format:\n${problem.outputFormat}` : ''}

${problem.examples ? 'IMPORTANT: Use the sample test cases to verify your understanding. The hints should guide toward a solution that works for these examples.' : ''}

Generate hints following these guidelines:

**Hint 1 — Understanding & Key Observations**
- Clarify how to interpret the input
- Point out what is MOST important
- Suggest small example testing
- DO NOT mention algorithms

**Hint 2 — Structural Insight**
- Reveal the deeper structure of the problem
- Reference constraints like "n is large, so we need an efficient way to handle X" WITHOUT naming the technique
- Highlight relationships or invariants
- Still DO NOT reveal the exact method

**Hint 3 — High-Level Algorithm Direction**
- Now you may mention general algorithm families (e.g., "a two-pointer strategy fits the pattern", "a DFS-style traversal might work", "a DP formulation seems natural")
- DO NOT give recurrences, code, or exact implementation

Return JSON with this structure:
{
  "hints": [
    "Hint 1 (understanding + observations)...",
    "Hint 2 (structural insight)...",
    "Hint 3 (high-level algorithm family without specifics)..."
  ]
}

Remember: NEVER reveal the solution, give code, or state exact algorithm steps. Lead the student step by step.`;
    } else {
      // Codeforces/CodeChef competitive programming focused prompt
      systemPrompt = `You are a world-class competitive programming coach.  

Your job is NOT to give the solution.  

Your job is to guide the user toward discovering the solution on their own — using the reasoning techniques of top competitive programmers.

Hints must be **progressive**, **non-revealing**, and **focused on understanding**, not implementation.

Your hints must follow the structured thought process used by strong competitive programmers:

1. **Strip story → Identify the pure mathematical model.**
2. **Analyze constraints** (small N → brute force options, large N → linear/logarithmic approaches).
3. **Search for known patterns** (tree, graph, DP state, window, monotonicity, parity, greedy invariants).
4. **Use "specific → general" reasoning.**
   - Try extremely small cases and understand their behavior.
5. **Make testable hypotheses** (e.g., structure, monotonicity, invariants).
6. **Spot unusual / restricting parts of the statement** — these are often the key.
7. **Break the problem into components**, if possible.

Never jump directly to the algorithm. Hints should gradually guide thinking, not reveal.

**Mathematical Notation**: The problem statement uses standard mathematical notation where:
- Subscripts are indicated with underscores: "s_i" means s subscript i, "a_1" means a subscript 1
- Superscripts are indicated with carets: "2^k" means 2 to the power of k, "10^n" means 10 to the power of n
- Variable names follow standard mathematical conventions (single letters like n, k, m, i, j, etc.)
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.' : ''}`;

      userText = `Analyze this competitive programming problem and generate progressive hints:

Title: ${problem.title}
${existingTags ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}

${problem.html ? `**Problem Statement (HTML with LaTeX math notation):**

The problem statement is provided as HTML below. It contains LaTeX mathematical notation embedded in <script type="math/tex"> tags. Modern LLMs can parse this HTML and LaTeX notation naturally.

${problem.html}

**Note:** The HTML above contains the complete problem statement with all formatting and mathematical notation preserved. Parse the LaTeX math expressions (in <script type="math/tex"> tags) to understand the mathematical content.` : `Description: ${problem.description}
${problem.inputFormat ? `\n\nInput Format:\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `\n\nOutput Format:\n${problem.outputFormat}` : ''}`}

${problem.examples ? `\n\nSample Test Cases:\n${problem.examples}` : ''}

${problem.examples ? 'IMPORTANT: Use the sample test cases to verify your understanding. The hints should guide toward a solution that works for these examples.' : ''}

Generate three hints:

**Hint 1 — Understanding & Key Observations**
- Help the student build the correct mental model
- Point out what part of the statement is most important or unusual
- Suggest examining small cases
- Suggest what structures/patterns the problem resembles
- DO NOT mention specific algorithms or data structures yet

**Hint 2 — Structural Insight (Still Non-Solution)**
- Highlight the mathematical/structural property that unlocks the problem
- Refer to constraint implications
- Mention categories like "graph problem", "DP-like behavior", "two-pointer-like structure", etc. without naming exact methods
- Give high-level reasoning direction but NOT the final method

**Hint 3 — Algorithmic Direction (General Approach Only)**
- Now you may hint at possible method families (e.g., "a tree DP might fit", "binary search on the answer is plausible", "greedy structure looks promising")
- DO NOT specify the exact recurrence, data structure, or steps
- DO NOT provide code, pseudocode, or the full algorithm
- DO NOT reveal the solution outright
- Keep hints directional, not explicit

Return JSON with this structure:
{
  "hints": [
    "Hint 1 (key observations, understanding the model)...",
    "Hint 2 (structural insight, constraint-based reasoning)...",
    "Hint 3 (high-level algorithm family, without giving away the full solution)..."
  ]
}

Remember: DO NOT give the solution, code, or exact data structures. Guide the user's thinking progressively.`;
    }

    // Build user content - include image if available
    const userContent = [
      {
        type: 'text',
        text: userText
      }
    ];

    // Handle images - use only imageData (base64 from html2canvas)
    // Note: We don't fetch imageUrls due to CORS restrictions from LeetCode/CDN
    if (problem.hasImages && problem.imageData) {
      try {
        // OpenAI accepts data URLs directly
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData
          }
        });

        console.log('OpenAI: Including image data in hints request');
      } catch (imageError) {
        console.warn('OpenAI: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.7,
        max_tokens: 3072,  // Increased from 2048 to handle longer responses
        response_format: { type: "json_object" }  // Force JSON output
      })
    });

    const data = await response.json();

    if (data.error) {
      const friendlyError = formatApiError(data.error.message, 'openai');
      return { error: friendlyError };
    }

    // Check if the API truncated the response
    const finishReason = data.choices?.[0]?.finish_reason;
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('LC Helper: OpenAI response finish_reason:', finishReason);
    console.log('LC Helper: OpenAI response content length:', content.length);

    if (finishReason === 'length') {
      console.error('LC Helper: OpenAI response was truncated due to length limit');
      return { error: 'Response was truncated due to token limit. Please try again with a shorter problem description.' };
    }

    // Parse JSON from response using robust extraction
    const parsed = extractJSONFromResponse(content);
    if (parsed) {
      console.log('LC Helper: Parsed OpenAI hints response:', JSON.stringify(parsed, null, 2).substring(0, 500));
    }
    
    // Use the helper function to normalize hints from various formats
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from OpenAI response');
    console.error('LC Helper: Full response content:', content);
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with OpenAI:', error);
    const friendlyError = formatApiError(error.message, 'openai');
    return { error: friendlyError };
  }
}

// ============================================
// CLAUDE (ANTHROPIC) HINTS GENERATION
// ============================================

async function generateHintsClaude(problem, apiKey, platform = 'codeforces') {
  try {
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    const systemPrompt = platform === 'leetcode'
      ? 'You are a world-class LeetCode interview coach. Provide three progressive hints without revealing the solution.'
      : 'You are a world-class competitive programming coach. Provide three progressive hints without revealing the solution.';

    const userPrompt = `Analyze this problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
Constraints: ${problem.constraints || 'Not specified'}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\n\nExamples:\n${problem.examples}` : ''}

Return JSON:
{
  "hints": {
    "gentle": "Hint 1 (understanding + observations)...",
    "stronger": "Hint 2 (structural insight)...",
    "almost": "Hint 3 (high-level direction)..."
  },
  "topic": "Topic classification",
  "timeComplexity": "Time complexity analysis",
  "spaceComplexity": "Space complexity analysis"
}`;

    // Build content array - start with text
    const content = [{
      type: 'text',
      text: userPrompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        // Extract base64 data (remove data:image/jpeg;base64, or data:image/png;base64, prefix)
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');

        // Detect MIME type from the original data URL
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';

        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data
          }
        });

        console.log('Claude: Including image data in hints request');
      } catch (imageError) {
        console.warn('Claude: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 3072,  // Increased from 2048 to handle longer responses
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: content
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Check if response was truncated
    const stopReason = data.stop_reason;
    console.log('LC Helper: Claude response stop_reason:', stopReason);
    
    if (stopReason === 'max_tokens') {
      console.error('LC Helper: Claude response was truncated due to max_tokens');
      return { error: 'Response was truncated due to token limit. Please try again with a shorter problem description.' };
    }
    
    const responseText = data.content?.[0]?.text || '';
    console.log('LC Helper: Claude response length:', responseText.length);

    // Parse JSON from response using robust extraction
    const parsed = extractJSONFromResponse(responseText);
    if (parsed) {
      console.log('LC Helper: Parsed Claude hints response:', JSON.stringify(parsed, null, 2).substring(0, 500));
    }
    
    // Use the helper function to normalize hints from various formats
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from Claude response');
    console.error('LC Helper: Full response content:', responseText);
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with Claude:', error);
    const friendlyError = formatApiError(error.message, 'claude');
    return { error: friendlyError };
  }
}

async function explainProblemClaude(problem, apiKey, platform = 'codeforces') {
  try {
    const jsonRules = `

OUTPUT FORMAT (STRICT JSON - MANDATORY)

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text).`;

    const prompt = `Explain this problem in simpler terms:

Title: ${problem.title}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\nExamples:\n${problem.examples}` : ''}

Provide a clear explanation with key concepts and approach.${jsonRules}`;

    // Build content array - start with text
    const messageContent = [{
      type: 'text',
      text: prompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        // Extract base64 data (remove data:image/jpeg;base64, or data:image/png;base64, prefix)
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');

        // Detect MIME type from the original data URL
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';

        messageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data
          }
        });

        console.log('Claude: Including image data in explanation request');
      } catch (imageError) {
        console.warn('Claude: Failed to process image data, continuing with text-only:', imageError.message);
        // Continue without image if processing fails
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: messageContent
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let content = data.content[0].text;
    const imagePart = messageContent.find(part => part.type === 'image');

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.explanation && parsed.keyPoints) return parsed;
        if (parsed.explanation) return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      } catch (e) {
        const extracted = extractJSONFromResponse(text);
        if (extracted && extracted.explanation) return extracted;
      }
      return null;
    };

    let parsed = tryParse(content);

    // Retry with stricter prompt if needed
    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: Claude JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;

      const retryContent = [{
        type: 'text',
        text: strictPrompt
      }];

      if (imagePart) {
        retryContent.push(imagePart);
      }

      const retryResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: retryContent
          }]
        })
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        content = retryData.content[0].text;
        parsed = tryParse(content);
      }
    }

    if (parsed && parsed.explanation) {
      return {
        explanation: parsed.explanation,
        keyPoints: parsed.keyPoints || []
      };
    }

    // Final fallback to text extraction
    const cleanText = extractTextFromResponse(content);
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with Claude:', error);
    return { error: formatApiError(error.message, 'claude') };
  }
}

// ============================================
// GROQ (FREE TIER) HINTS GENERATION
// ============================================

async function generateHintsGroq(problem, apiKey, platform = 'codeforces') {
  try {
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    const systemPrompt = platform === 'leetcode'
      ? 'You are a world-class LeetCode interview coach. Provide three progressive hints without revealing the solution.'
      : 'You are a world-class competitive programming coach. Provide three progressive hints without revealing the solution.';

    const userPrompt = `Analyze this problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\n\nExamples:\n${problem.examples}` : ''}

Return JSON:
{
  "hints": {
    "gentle": "Hint 1...",
    "stronger": "Hint 2...",
    "almost": "Hint 3..."
  },
  "topic": "Topic",
  "timeComplexity": "Time complexity",
  "spaceComplexity": "Space complexity"
}`;

    // Build user message content - start with text
    const userContent = [{
      type: 'text',
      text: userPrompt
    }];

    // Add image if available (Groq supports vision models)
    if (problem.hasImages && problem.imageData) {
      try {
        // Groq accepts data URLs directly in image_url format
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData
          }
        });
        console.log('Groq: Including image data in request');
      } catch (imageError) {
        console.warn('Groq: Failed to process image data, continuing with text-only:', imageError.message);
      }
    }

    // Use vision model if images are present, otherwise use standard model
    const model = (problem.hasImages && problem.imageData)
      ? 'llama-3.2-90b-vision-preview'  // Vision-capable model
      : 'llama-3.3-70b-versatile';      // Standard model

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 3072,  // Increased from 2048 to handle longer responses
        response_format: { type: "json_object" }  // Force JSON output
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Check if response was truncated
    const finishReason = data.choices?.[0]?.finish_reason;
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('LC Helper: Groq response finish_reason:', finishReason);
    console.log('LC Helper: Groq response content length:', content.length);

    if (finishReason === 'length') {
      console.error('LC Helper: Groq response was truncated due to length limit');
      return { error: 'Response was truncated due to token limit. Please try again with a shorter problem description.' };
    }

    // Parse JSON from response using robust extraction
    const parsed = extractJSONFromResponse(content);
    
    // Use the helper function to normalize hints from various formats
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from Groq response');
    console.error('LC Helper: Full response content:', content);
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with Groq:', error);
    return { error: formatApiError(error.message, 'groq') };
  }
}

async function explainProblemGroq(problem, apiKey, platform = 'codeforces') {
  try {
    const jsonRules = `

OUTPUT FORMAT (STRICT JSON - MANDATORY)

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text).`;

    const prompt = `Explain this problem in simpler terms:

Title: ${problem.title}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\nExamples:\n${problem.examples}` : ''}${jsonRules}`;

    // Build user message content - start with text
    const userContent = [{
      type: 'text',
      text: prompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData
          }
        });
        console.log('Groq: Including image data in explanation request');
      } catch (imageError) {
        console.warn('Groq: Failed to process image data, continuing with text-only:', imageError.message);
      }
    }

    // Use vision model if images are present
    const model = (problem.hasImages && problem.imageData)
      ? 'llama-3.2-90b-vision-preview'
      : 'llama-3.3-70b-versatile';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    const imagePart = userContent.find(part => part.type === 'image_url');

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.explanation && parsed.keyPoints) return parsed;
        if (parsed.explanation) return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      } catch (e) {
        const extracted = extractJSONFromResponse(text);
        if (extracted && extracted.explanation) return extracted;
      }
      return null;
    };

    let parsed = tryParse(content);

    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: Groq JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;

      const retryContent = [{
        type: 'text',
        text: strictPrompt
      }];
      if (imagePart) retryContent.push(imagePart);

      const retryResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: retryContent }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        content = retryData.choices?.[0]?.message?.content || content;
        parsed = tryParse(content);
      }
    }

    if (parsed && parsed.explanation) {
      return {
        explanation: parsed.explanation,
        keyPoints: parsed.keyPoints || []
      };
    }

    const cleanText = extractTextFromResponse(content);
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with Groq:', error);
    return { error: formatApiError(error.message, 'groq') };
  }
}

// ============================================
// TOGETHER AI (FREE TIER) HINTS GENERATION
// ============================================

async function generateHintsTogether(problem, apiKey, platform = 'codeforces') {
  try {
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    const systemPrompt = platform === 'leetcode'
      ? 'You are a world-class LeetCode interview coach. Provide three progressive hints without revealing the solution.'
      : 'You are a world-class competitive programming coach. Provide three progressive hints without revealing the solution.';

    const userPrompt = `Analyze this problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\n\nExamples:\n${problem.examples}` : ''}

Return JSON:
{
  "hints": {
    "gentle": "Hint 1...",
    "stronger": "Hint 2...",
    "almost": "Hint 3..."
  },
  "topic": "Topic",
  "timeComplexity": "Time complexity",
  "spaceComplexity": "Space complexity"
}`;

    // Build user message content - start with text
    const userContent = [{
      type: 'text',
      text: userPrompt
    }];

    // Add image if available (Together AI supports vision models)
    if (problem.hasImages && problem.imageData) {
      try {
        // Together AI accepts data URLs directly
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData
          }
        });
        console.log('Together AI: Including image data in request');
      } catch (imageError) {
        console.warn('Together AI: Failed to process image data, continuing with text-only:', imageError.message);
      }
    }

    // Use vision model if images are present, otherwise use standard model
    const model = (problem.hasImages && problem.imageData)
      ? 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo'  // Vision-capable model
      : 'meta-llama/Llama-3.3-70B-Instruct-Turbo';    // Standard model

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 3072,  // Increased from 2048 to handle longer responses
        response_format: { type: "json_object" }  // Force JSON output
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Check if response was truncated
    const finishReason = data.choices?.[0]?.finish_reason;
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('LC Helper: Together AI response finish_reason:', finishReason);
    console.log('LC Helper: Together AI response content length:', content.length);

    if (finishReason === 'length') {
      console.error('LC Helper: Together AI response was truncated due to length limit');
      return { error: 'Response was truncated due to token limit. Please try again with a shorter problem description.' };
    }

    // Parse JSON from response using robust extraction
    const parsed = extractJSONFromResponse(content);
    
    // Use the helper function to normalize hints from various formats
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from Together AI response');
    console.error('LC Helper: Full response content:', content);
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with Together AI:', error);
    return { error: formatApiError(error.message, 'together') };
  }
}

async function explainProblemTogether(problem, apiKey, platform = 'codeforces') {
  try {
    const jsonRules = `

OUTPUT FORMAT (STRICT JSON - MANDATORY)

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text).`;

    const prompt = `Explain this problem in simpler terms:

Title: ${problem.title}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\nExamples:\n${problem.examples}` : ''}${jsonRules}`;

    // Build user message content - start with text
    const userContent = [{
      type: 'text',
      text: prompt
    }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: problem.imageData
          }
        });
        console.log('Together AI: Including image data in explanation request');
      } catch (imageError) {
        console.warn('Together AI: Failed to process image data, continuing with text-only:', imageError.message);
      }
    }

    // Use vision model if images are present
    const model = (problem.hasImages && problem.imageData)
      ? 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo'
      : 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    const imagePart = userContent.find(part => part.type === 'image_url');

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.explanation && parsed.keyPoints) return parsed;
        if (parsed.explanation) return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      } catch (e) {
        const extracted = extractJSONFromResponse(text);
        if (extracted && extracted.explanation) return extracted;
      }
      return null;
    };

    let parsed = tryParse(content);

    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: Together JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;

      const retryContent = [{
        type: 'text',
        text: strictPrompt
      }];
      if (imagePart) retryContent.push(imagePart);

      const retryResponse = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: retryContent }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        content = retryData.choices?.[0]?.message?.content || content;
        parsed = tryParse(content);
      }
    }

    if (parsed && parsed.explanation) {
      return {
        explanation: parsed.explanation,
        keyPoints: parsed.keyPoints || []
      };
    }

    const cleanText = extractTextFromResponse(content);
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with Together AI:', error);
    return { error: formatApiError(error.message, 'together') };
  }
}

// ============================================
// HUGGING FACE (FREE TIER) HINTS GENERATION
// ============================================

async function generateHintsHuggingFace(problem, apiKey, platform = 'codeforces') {
  try {
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    const systemPrompt = platform === 'leetcode'
      ? 'You are a world-class LeetCode interview coach. Provide three progressive hints without revealing the solution.'
      : 'You are a world-class competitive programming coach. Provide three progressive hints without revealing the solution.';

    const userPrompt = `Analyze this problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\n\nExamples:\n${problem.examples}` : ''}

Return JSON:
{
  "hints": {
    "gentle": "Hint 1...",
    "stronger": "Hint 2...",
    "almost": "Hint 3..."
  },
  "topic": "Topic",
  "timeComplexity": "Time complexity",
  "spaceComplexity": "Space complexity"
}`;

    // Hugging Face Inference API format - use vision model if images present
    const model = (problem.hasImages && problem.imageData)
      ? 'HuggingFaceM4/idefics2-8b-base'  // Vision-capable model
      : 'meta-llama/Llama-3.3-70B-Instruct';  // Standard model

    // Build inputs - for vision models, include image in inputs
    let inputs;
    if (problem.hasImages && problem.imageData && model.includes('idefics')) {
      // Idefics2 format: accepts image as part of inputs
      inputs = {
        question: userPrompt,
        image: problem.imageData  // Data URL format
      };
    } else {
      // Standard text-only format
      inputs = `<|system|>\n${systemPrompt}\n<|user|>\n${userPrompt}\n<|assistant|>\n`;
    }

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: inputs,
        parameters: {
          temperature: 0.7,
          max_new_tokens: 2048,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    
    console.log('LC Helper: HuggingFace response content length:', content?.length || 0);

    // Parse JSON from response using robust extraction
    const parsed = extractJSONFromResponse(content || '');
    
    // Use the helper function to normalize hints from various formats
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from HuggingFace response');
    console.error('LC Helper: Full response content:', content);
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with Hugging Face:', error);
    return { error: formatApiError(error.message, 'huggingface') };
  }
}

async function explainProblemHuggingFace(problem, apiKey, platform = 'codeforces') {
  try {
    const jsonRules = `

OUTPUT FORMAT (STRICT JSON - MANDATORY)

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text).`;

    const prompt = `Explain this problem in simpler terms:

Title: ${problem.title}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\nExamples:\n${problem.examples}` : ''}${jsonRules}`;

    // Use vision model if images present
    const model = (problem.hasImages && problem.imageData)
      ? 'HuggingFaceM4/idefics2-8b-base'
      : 'meta-llama/Llama-3.3-70B-Instruct';

    // Build inputs - for vision models, include image
    let inputs;
    if (problem.hasImages && problem.imageData && model.includes('idefics')) {
      inputs = {
        question: prompt,
        image: problem.imageData
      };
    } else {
      inputs = `<|user|>\n${prompt}\n<|assistant|>\n`;
    }

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: inputs,
        parameters: {
          temperature: 0.7,
          max_new_tokens: 2048,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let content = Array.isArray(data) ? data[0].generated_text : data.generated_text;

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.explanation && parsed.keyPoints) return parsed;
        if (parsed.explanation) return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      } catch (e) {
        const extracted = extractJSONFromResponse(text);
        if (extracted && extracted.explanation) return extracted;
      }
      return null;
    };

    let parsed = tryParse(content);

    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: HuggingFace JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;

      let strictInputs;
      if (problem.hasImages && problem.imageData && model.includes('idefics')) {
        strictInputs = {
          question: strictPrompt,
          image: problem.imageData
        };
      } else {
        strictInputs = `<|user|>\n${strictPrompt}\n<|assistant|>\n`;
      }

      const retryResponse = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          inputs: strictInputs,
          parameters: {
            temperature: 0.7,
            max_new_tokens: 2048,
            return_full_text: false
          }
        })
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        content = Array.isArray(retryData) ? retryData[0].generated_text : retryData.generated_text;
        parsed = tryParse(content);
      }
    }

    if (parsed && parsed.explanation) {
      return {
        explanation: parsed.explanation,
        keyPoints: parsed.keyPoints || []
      };
    }

    const cleanText = extractTextFromResponse(content);
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with Hugging Face:', error);
    return { error: formatApiError(error.message, 'huggingface') };
  }
}

// ============================================
// OPENROUTER HINTS GENERATION
// ============================================

async function generateHintsOpenRouter(problem, apiKey, platform = 'codeforces') {
  try {
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    // Use the same prompt structure as OpenAI
    const systemPrompt = platform === 'leetcode'
      ? 'You are a world-class LeetCode interview coach. Provide three progressive hints without revealing the solution.'
      : 'You are a world-class competitive programming coach. Provide three progressive hints without revealing the solution.';

    // Build the same comprehensive prompt used for OpenAI
    const truncatedDescription = problem.description ? problem.description.substring(0, 4000) : '';
    const truncatedExamples = problem.examples ? problem.examples.substring(0, 2000) : '';
    const truncatedInputFormat = problem.inputFormat ? problem.inputFormat.substring(0, 1000) : '';
    const truncatedOutputFormat = problem.outputFormat ? problem.outputFormat.substring(0, 1000) : '';

    const userPrompt = platform === 'leetcode'
      ? `Analyze this LeetCode problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${truncatedDescription}
${truncatedExamples ? `\n\nExamples:\n${truncatedExamples}` : ''}

Return JSON with three hints:
{
  "hints": [
    "Hint 1 (gentle push)...",
    "Hint 2 (stronger nudge)...",
    "Hint 3 (almost there)..."
  ],
  "topic": "Topic classification",
  "timeComplexity": "Time complexity",
  "spaceComplexity": "Space complexity"
}`
      : `Analyze this competitive programming problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${truncatedDescription}
${truncatedExamples ? `\n\nExamples:\n${truncatedExamples}` : ''}
${truncatedInputFormat ? `\n\nInput Format:\n${truncatedInputFormat}` : ''}
${truncatedOutputFormat ? `\n\nOutput Format:\n${truncatedOutputFormat}` : ''}

Return JSON with three hints:
{
  "hints": [
    "Hint 1 (gentle push)...",
    "Hint 2 (stronger nudge)...",
    "Hint 3 (almost there)..."
  ],
  "topic": "Topic classification",
  "timeComplexity": "Time complexity",
  "spaceComplexity": "Space complexity"
}`;

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Add image if available (OpenRouter supports vision models)
    if (problem.hasImages && problem.imageData) {
      try {
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';
        
        messages[1].content = [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`
            }
          }
        ];
        console.log('OpenRouter: Including image data in request');
      } catch (imageError) {
        console.warn('OpenRouter: Failed to process image data, continuing with text-only:', imageError.message);
      }
    }

    // Use a good default model (user can override via OpenRouter dashboard)
    // OpenRouter will route to the best available model
    const model = 'openai/gpt-4o-mini'; // Default, but OpenRouter allows many models

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'LC Helper'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 3072,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const parsed = extractJSONFromResponse(content);
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from OpenRouter response');
    return { error: 'Failed to parse AI response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with OpenRouter:', error);
    return { error: formatApiError(error.message, 'openrouter') };
  }
}

async function explainProblemOpenRouter(problem, apiKey, platform = 'codeforces') {
  try {
    const jsonRules = `

OUTPUT FORMAT (STRICT JSON - MANDATORY)

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text).`;

    const prompt = `Explain this problem in simpler terms:

Title: ${problem.title}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\nExamples:\n${problem.examples}` : ''}

Provide a clear explanation with key concepts.${jsonRules}`;

    const messages = [{ role: 'user', content: prompt }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      try {
        const base64Data = problem.imageData.replace(/^data:image\/\w+;base64,/, '');
        const mimeTypeMatch = problem.imageData.match(/^data:image\/(\w+);base64,/);
        const mimeType = mimeTypeMatch ? `image/${mimeTypeMatch[1]}` : 'image/jpeg';
        
        messages[0].content = [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`
            }
          }
        ];
      } catch (imageError) {
        console.warn('OpenRouter: Failed to process image data, continuing with text-only:', imageError.message);
      }
    }

    const model = 'openai/gpt-4o-mini';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'LC Helper'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    const imagePart = Array.isArray(messages[0].content) ? messages[0].content.find(part => part.type === 'image_url') : null;

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.explanation && parsed.keyPoints) return parsed;
        if (parsed.explanation) return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      } catch (e) {
        const extracted = extractJSONFromResponse(text);
        if (extracted && extracted.explanation) return extracted;
      }
      return null;
    };

    let parsed = tryParse(content);

    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: OpenRouter JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;

      const strictMessageContent = imagePart
        ? [{ type: 'text', text: strictPrompt }, imagePart]
        : strictPrompt;

      const retryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': chrome.runtime.getURL(''),
          'X-Title': 'LC Helper'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: strictMessageContent }],
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        content = retryData.choices?.[0]?.message?.content || content;
        parsed = tryParse(content);
      }
    }

    if (parsed && parsed.explanation) {
      return {
        explanation: parsed.explanation,
        keyPoints: parsed.keyPoints || []
      };
    }

    const cleanText = extractTextFromResponse(content);
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with OpenRouter:', error);
    return { error: formatApiError(error.message, 'openrouter') };
  }
}

// ============================================
// CUSTOM HTTP ENDPOINT HINTS GENERATION
// ============================================

async function generateHintsCustom(problem, apiKey, platform = 'codeforces') {
  try {
    // Get custom endpoint settings
    const { customEndpoint, customModel } = await chrome.storage.sync.get(['customEndpoint', 'customModel']);
    
    if (!customEndpoint || !customModel) {
      return { error: 'Custom endpoint URL and model name must be configured in settings.' };
    }

    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';

    const systemPrompt = platform === 'leetcode'
      ? 'You are a world-class LeetCode interview coach. Provide three progressive hints without revealing the solution.'
      : 'You are a world-class competitive programming coach. Provide three progressive hints without revealing the solution.';

    const userPrompt = `Analyze this problem and generate three progressive hints:

Title: ${problem.title}
${existingTags ? `Tags: ${existingTags}` : ''}
Difficulty: ${difficulty}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\n\nExamples:\n${problem.examples}` : ''}

Return JSON:
{
  "hints": [
    "Hint 1 (gentle push)...",
    "Hint 2 (stronger nudge)...",
    "Hint 3 (almost there)..."
  ],
  "topic": "Topic classification",
  "timeComplexity": "Time complexity",
  "spaceComplexity": "Space complexity"
}`;

    // Build request body - try OpenAI-compatible format first
    const requestBody = {
      model: customModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 3072,
      response_format: { type: "json_object" }
    };

    // Build headers
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(customEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => '');
      throw new Error(errorData || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Try to extract content from various response formats
    let content = '';
    if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if (data.content) {
      content = data.content;
    } else if (data.text) {
      content = data.text;
    } else if (typeof data === 'string') {
      content = data;
    }

    // Parse JSON from response
    const parsed = extractJSONFromResponse(content);
    const normalized = normalizeHintsResponse(parsed);
    if (normalized) {
      return normalized;
    }

    console.error('LC Helper: Failed to extract/normalize hints from custom endpoint response');
    return { error: 'Failed to parse AI response. Please check your endpoint format.' };
  } catch (error) {
    console.error('Error generating hints with custom endpoint:', error);
    return { error: formatApiError(error.message, 'custom') };
  }
}

async function explainProblemCustom(problem, apiKey, platform = 'codeforces') {
  try {
    // Get custom endpoint settings
    const { customEndpoint, customModel } = await chrome.storage.sync.get(['customEndpoint', 'customModel']);
    
    if (!customEndpoint || !customModel) {
      return { error: 'Custom endpoint URL and model name must be configured in settings.' };
    }

    const jsonRules = `

OUTPUT FORMAT (STRICT JSON - MANDATORY)

⚠️ CRITICAL: You MUST return ONLY valid JSON. No markdown, no code blocks, no explanatory text before or after the JSON. Just the raw JSON object.

REQUIRED JSON SCHEMA:
{
  "explanation": "string (required)",
  "keyPoints": ["string", "string", "string", ...] (required, array of strings)
}

JSON RULES:
1. Start with { and end with }
2. Use double quotes for all strings: "text"
3. Escape newlines as \\n (backslash-n), NOT literal line breaks
4. Escape quotes inside strings as \\\"
5. Use \\\\n\\\\n for paragraph breaks in explanation text
6. keyPoints must be an array of strings, even if empty: []

EXAMPLE OF CORRECT OUTPUT:
{"explanation":"This problem asks us to find...\\n\\nThe key insight is...","keyPoints":["Point 1","Point 2","Point 3"]}

❌ WRONG OUTPUTS (DO NOT DO THIS):
- Plain text explanation without JSON
- Markdown code blocks like \`\`\`json ... \`\`\`
- Text before or after the JSON object
- JSON with unescaped newlines or quotes
- Missing required fields (explanation or keyPoints)

Return ONLY the JSON object (no other text).`;

    const prompt = `Explain this problem in simpler terms:

Title: ${problem.title}
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.\n' : ''}Description: ${problem.description}
${problem.examples ? `\nExamples:\n${problem.examples}` : ''}

Provide a clear explanation with key concepts.${jsonRules}`;

    // Build request body - OpenAI-compatible format
    const requestBody = {
      model: customModel,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2048
    };

    // Build headers
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(customEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => '');
      throw new Error(errorData || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Try to extract content from various response formats
    const extractContent = (payload, fallback = '') => {
      if (payload?.choices?.[0]?.message?.content) return payload.choices[0].message.content;
      if (payload?.content) return payload.content;
      if (payload?.text) return payload.text;
      if (typeof payload === 'string') return payload;
      return fallback;
    };

    let content = extractContent(data, '');

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.explanation && parsed.keyPoints) return parsed;
        if (parsed.explanation) return { explanation: parsed.explanation, keyPoints: parsed.keyPoints || [] };
      } catch (e) {
        const extracted = extractJSONFromResponse(text);
        if (extracted && extracted.explanation) return extracted;
      }
      return null;
    };

    let parsed = tryParse(content);

    if (!parsed || !parsed.explanation) {
      console.warn('LC Helper: Custom endpoint JSON extraction failed, retrying with stricter prompt...');
      const strictPrompt = `${prompt}\n\n⚠️ REMINDER: You MUST return ONLY valid JSON. No text before or after. Start with { and end with }. Example: {"explanation":"...","keyPoints":["..."]}`;

      const strictRequestBody = {
        ...requestBody,
        messages: [
          { role: 'user', content: strictPrompt }
        ],
        response_format: { type: "json_object" }
      };

      const retryResponse = await fetch(customEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(strictRequestBody)
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json().catch(() => ({}));
        content = extractContent(retryData, content);
        parsed = tryParse(content);
      }
    }

    if (parsed && parsed.explanation) {
      return {
        explanation: parsed.explanation,
        keyPoints: parsed.keyPoints || []
      };
    }

    const cleanText = extractTextFromResponse(content);
    return {
      explanation: cleanText || 'Failed to parse explanation. Please try again.',
      keyPoints: []
    };
  } catch (error) {
    console.error('Error explaining problem with custom endpoint:', error);
    return { error: formatApiError(error.message, 'custom') };
  }
}

// ============================================
// UNIFIED STREAK TRACKER SYSTEM (API-BASED)
// ============================================

// Ensure streak data exists (called on every service worker start)
async function ensureStreakDataExists() {
  const { streakData } = await chrome.storage.local.get('streakData');

  if (!streakData) {
    console.log('Unified streak data not found, initializing...');
    await chrome.storage.local.set({
      streakData: {
        unified: {
          currentStreak: 0,
          longestStreak: 0,
          totalActiveDays: 0,
          lastActiveDate: null,
          platformBreakdown: {
            leetcode: 0,
            codeforces: 0,
            codechef: 0
          }
        },
        platforms: {
          leetcode: null,
          codeforces: null,
          codechef: null
        }
      },
      lastSyncTime: null
    });
    console.log('Unified streak data initialized');
  } else {
    console.log('Streak data exists:', streakData);
  }
}

async function initializeStreakSystem() {
  await ensureStreakDataExists();

  // Set up unified streak sync alarm (every 6 hours)
  chrome.alarms.create('unifiedStreakSync', {
    periodInMinutes: 360 // 6 hours
  });

  // Set up daily reminder alarm (8 PM)
  chrome.alarms.create('dailyStreakReminder', {
    when: getDailyReminderTime(),
    periodInMinutes: 1440
  });

  // Set up daily stats reset alarm (4 AM)
  chrome.alarms.create('dailyStatsReset', {
    when: getNextResetTime(),
    periodInMinutes: 1440 // 24 hours
  });

  // Set up today count auto-refresh alarm (every 15 minutes)
  chrome.alarms.create('refreshTodayCount', {
    periodInMinutes: 15
  });

  // Initial sync
  await syncUnifiedStreak();

  // Initial refresh of today's count
  syncTodayCountFromAPIs().catch(err => console.log('Initial today count sync failed:', err));

  console.log('Unified streak system fully initialized with alarms');
}

// Update alarm listener to handle streak alarms
const originalAlarmListener = chrome.alarms.onAlarm.hasListener;
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'unifiedStreakSync') {
    await syncUnifiedStreak();
  } else if (alarm.name === 'dailyStreakReminder') {
    await sendStreakReminder();
  } else if (alarm.name === 'dailyStatsReset') {
    // Reset daily stats at 4 AM
    const today = getTodayDateString();
    await chrome.storage.local.set({
      dailyStats: { date: today, count: 0, problems: [] }
    });
    console.log('Daily stats reset for:', today);
  } else if (alarm.name.startsWith('timer_') && !alarm.name.startsWith('timerStop_')) {
    // 30-minute timer reminder
    await handleTimerAlarm(alarm.name);
  } else if (alarm.name.startsWith('timerStop_')) {
    // 1-hour timer stop
    await handleTimerStopAlarm(alarm.name);
  } else if (alarm.name === 'refreshTodayCount') {
    // Auto-refresh today's count from APIs
    await syncTodayCountFromAPIs();
  }
});

// Handle 30-minute timer alarm
async function handleTimerAlarm(alarmName) {
  const timerKey = alarmName; // timer_xxx format matches storage key
  const result = await chrome.storage.local.get(timerKey);
  const timerData = result[timerKey];

  if (timerData && !timerData.reminderSent) {
    // Mark reminder as sent
    timerData.reminderSent = true;
    await chrome.storage.local.set({ [timerKey]: timerData });

    // Send notification
    chrome.notifications.create(`timerReminder_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon128.png'),
      title: '⏰ 30 Minutes Elapsed!',
      message: `You've been working on "${timerData.title}" for 30 minutes. Consider taking a hint or watching the solution.`,
      buttons: [
        { title: '💡 Take a Hint' },
        { title: '📺 Watch Solution' }
      ],
      priority: 2,
      requireInteraction: true
    }).catch((error) => {
      console.error('LC Helper: Failed to create timer notification:', error);
    });

    console.log('Timer reminder sent for:', timerData.title);
  }
}

// Handle 1-hour timer stop alarm
async function handleTimerStopAlarm(alarmName) {
  const cacheKey = alarmName.replace('timerStop_', '');
  const timerKey = `timer_${cacheKey}`;
  const result = await chrome.storage.local.get(timerKey);
  const timerData = result[timerKey];

  if (timerData) {
    // Stop the timer
    await stopProblemTimer(timerData.url);

    // Try to notify the tab if it's still open
    if (timerData.tabId) {
      try {
        await chrome.tabs.get(timerData.tabId);
        // Tab still exists, send message to stop timer display
        chrome.tabs.sendMessage(timerData.tabId, {
          type: 'TIMER_STOPPED',
          reason: '1hour'
        }).catch(() => {
          // Tab might not have content script loaded
          console.log('LC Helper: Could not send timer stop message to tab');
        });
      } catch (e) {
        // Tab doesn't exist anymore, that's fine
        console.log('LC Helper: Timer tab already closed');
      }
    }

    console.log('Timer stopped after 1 hour for:', timerData.title);
  }
}

// ============================================
// UNIFIED STREAK SYNC - Fetch from all platforms
// ============================================

async function syncUnifiedStreak() {
  console.log('Starting unified streak sync...');

  try {
    // Get usernames from settings
    const { leetcodeUsername, codeforcesUsername, codechefUsername } =
      await chrome.storage.sync.get(['leetcodeUsername', 'codeforcesUsername', 'codechefUsername']);

    if (!leetcodeUsername && !codeforcesUsername && !codechefUsername) {
      console.log('No usernames configured, skipping sync');
      return;
    }

    // Fetch data from all platforms in parallel
    const results = await Promise.allSettled([
      leetcodeUsername ? fetchLeetCodeActivity(leetcodeUsername) : Promise.resolve(null),
      codeforcesUsername ? fetchCodeforcesActivity(codeforcesUsername) : Promise.resolve(null),
      codechefUsername ? fetchCodeChefActivity(codechefUsername) : Promise.resolve(null)
    ]);

    const leetcodeData = results[0].status === 'fulfilled' ? results[0].value : null;
    const codeforcesData = results[1].status === 'fulfilled' ? results[1].value : null;
    const codechefData = results[2].status === 'fulfilled' ? results[2].value : null;

    console.log('Fetched platform data:', { leetcodeData, codeforcesData, codechefData });

    // Calculate unified streak
    const unifiedStreakData = calculateUnifiedStreak(leetcodeData, codeforcesData, codechefData);

    // Store data
    await chrome.storage.local.set({
      streakData: {
        unified: unifiedStreakData,
        platforms: {
          leetcode: leetcodeData,
          codeforces: codeforcesData,
          codechef: codechefData
        }
      },
      lastSyncTime: Date.now()
    });

    console.log('Unified streak calculated:', unifiedStreakData);

  } catch (error) {
    console.error('Error syncing unified streak:', error);
  }
}

// ============================================
// API FETCHING FUNCTIONS
// ============================================

async function fetchLeetCodeActivity(username) {
  try {
    const query = `
      query userProfileCalendar($username: String!) {
        matchedUser(username: $username) {
          userCalendar {
            streak
            totalActiveDays
            submissionCalendar
          }
        }
      }
    `;

    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { username }
      })
    });

    if (!response.ok) {
      throw new Error(`LeetCode API error: ${response.status}`);
    }

    const data = await response.json();
    const calendar = data.data?.matchedUser?.userCalendar;

    if (!calendar) {
      throw new Error('Invalid LeetCode response');
    }

    // Parse submission calendar (timestamps as keys)
    const submissionCalendar = JSON.parse(calendar.submissionCalendar || '{}');
    const activityDates = Object.keys(submissionCalendar).map(timestamp => {
      const date = new Date(parseInt(timestamp) * 1000);
      return formatDateToYYYYMMDD(date);
    });

    return {
      dates: activityDates,
      totalActiveDays: calendar.totalActiveDays,
      platform: 'leetcode'
    };

  } catch (error) {
    console.error('Error fetching LeetCode activity:', error);
    return null;
  }
}

async function fetchCodeforcesActivity(username) {
  try {
    const response = await fetch(
      `https://codeforces.com/api/user.status?handle=${username}&from=1&count=1000`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`Codeforces API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error('Invalid Codeforces response');
    }

    // Filter accepted submissions and extract unique dates
    const acceptedSubmissions = data.result.filter(s => s.verdict === 'OK');
    const uniqueDates = new Set();

    acceptedSubmissions.forEach(submission => {
      const date = new Date(submission.creationTimeSeconds * 1000);
      uniqueDates.add(formatDateToYYYYMMDD(date));
    });

    return {
      dates: Array.from(uniqueDates),
      totalActiveDays: uniqueDates.size,
      platform: 'codeforces'
    };

  } catch (error) {
    console.error('Error fetching Codeforces activity:', error);
    return null;
  }
}

async function fetchCodeChefActivity(username) {
  try {
    const response = await fetch(
      `https://codechef-api.vercel.app/heatmap/${username}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`CodeChef API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.heatmap) {
      throw new Error('Invalid CodeChef response');
    }

    // Heatmap already has dates in YYYY-MM-DD format
    const activityDates = Object.keys(data.heatmap).filter(date => data.heatmap[date] > 0);

    return {
      dates: activityDates,
      totalActiveDays: activityDates.length,
      platform: 'codechef',
      apiStreak: data.streak // Optional: API-provided streak for reference
    };

  } catch (error) {
    console.error('Error fetching CodeChef activity:', error);
    return null;
  }
}

// ============================================
// UNIFIED STREAK CALCULATION
// ============================================

function calculateUnifiedStreak(leetcodeData, codeforcesData, codechefData) {
  // Merge all activity dates from all platforms
  const allDates = new Set();
  const platformBreakdown = {
    leetcode: 0,
    codeforces: 0,
    codechef: 0
  };

  if (leetcodeData?.dates) {
    leetcodeData.dates.forEach(date => allDates.add(date));
  }

  if (codeforcesData?.dates) {
    codeforcesData.dates.forEach(date => allDates.add(date));
  }

  if (codechefData?.dates) {
    codechefData.dates.forEach(date => allDates.add(date));
  }

  if (allDates.size === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
      lastActiveDate: null,
      platformBreakdown
    };
  }

  // Sort dates chronologically
  const sortedDates = Array.from(allDates).sort();

  // Calculate individual platform streaks (for breakdown)
  if (leetcodeData?.dates) {
    platformBreakdown.leetcode = calculateCurrentStreak(leetcodeData.dates.sort());
  }
  if (codeforcesData?.dates) {
    platformBreakdown.codeforces = calculateCurrentStreak(codeforcesData.dates.sort());
  }
  if (codechefData?.dates) {
    platformBreakdown.codechef = calculateCurrentStreak(codechefData.dates.sort());
  }

  // Calculate current streak from merged dates
  const currentStreak = calculateCurrentStreak(sortedDates);

  // Calculate longest streak from merged dates
  const longestStreak = calculateLongestStreak(sortedDates);

  return {
    currentStreak,
    longestStreak,
    totalActiveDays: allDates.size,
    lastActiveDate: sortedDates[sortedDates.length - 1],
    platformBreakdown
  };
}

function calculateCurrentStreak(sortedDates) {
  if (sortedDates.length === 0) return 0;

  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  // Get most recent date
  const mostRecent = sortedDates[sortedDates.length - 1];

  // Current streak only counts if last activity was today or yesterday
  if (mostRecent !== today && mostRecent !== yesterday) {
    return 0;
  }

  // Count backwards from most recent date
  let streak = 0;
  let currentDate = mostRecent === today ? today : yesterday;

  for (let i = sortedDates.length - 1; i >= 0; i--) {
    if (sortedDates[i] === currentDate) {
      streak++;
      currentDate = getPreviousDateString(currentDate);
    } else if (sortedDates[i] < currentDate) {
      // Found a gap
      break;
    }
  }

  return streak;
}

function calculateLongestStreak(sortedDates) {
  if (sortedDates.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]);
    const currDate = new Date(sortedDates[i]);

    // Check if dates are consecutive
    const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

// Send daily reminder notification
async function sendStreakReminder() {
  const { streakData, notifyDaily } = await chrome.storage.local.get(['streakData', 'notifyDaily']);

  // Check if user has enabled daily reminders (default true)
  if (notifyDaily === false) return;
  if (!streakData?.unified) return;

  const today = getTodayDateString();
  const currentStreak = streakData.unified.currentStreak || 0;
  const lastActiveDate = streakData.unified.lastActiveDate;

  // Only send reminder if user hasn't been active today
  if (lastActiveDate !== today) {
    let message;
    if (currentStreak > 0) {
      message = `🔥 Keep your ${currentStreak}-day unified streak alive! Solve on any platform today.`;
    } else {
      message = `🌟 Start a new streak today! Solve on LeetCode, Codeforces, or CodeChef.`;
    }

    chrome.notifications.create('dailyReminder', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon128.png'),
      title: '⏰ Daily Coding Reminder',
      message: message,
      priority: 2,
      requireInteraction: false
    }).catch((error) => {
      console.error('LC Helper: Failed to create daily reminder notification:', error);
    });
  }
}

// Manual refresh trigger
async function refreshUnifiedStreak() {
  console.log('Manual refresh triggered');
  await syncUnifiedStreak();
  const { streakData } = await chrome.storage.local.get('streakData');
  return { success: true, streakData: streakData?.unified };
}


// Helper functions for dates (YYYY-MM-DD format in UTC)
function getTodayDateString() {
  const date = new Date();
  return formatDateToYYYYMMDD(date);
}

function getYesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDateToYYYYMMDD(date);
}

function getPreviousDateString(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return formatDateToYYYYMMDD(date);
}

function formatDateToYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextResetTime() {
  // Reset at 4 AM instead of midnight
  const now = new Date();
  const resetTime = new Date(now);
  resetTime.setHours(4, 0, 0, 0);

  // If it's already past 4 AM today, schedule for tomorrow 4 AM
  if (resetTime <= now) {
    resetTime.setDate(resetTime.getDate() + 1);
  }

  return resetTime.getTime();
}

function getDailyReminderTime() {
  // Default: 8 PM (20:00)
  const now = new Date();
  const reminder = new Date(now);
  reminder.setHours(20, 0, 0, 0);

  if (reminder <= now) {
    // If already past 8 PM today, schedule for tomorrow
    reminder.setDate(reminder.getDate() + 1);
  }

  return reminder.getTime();
}

// ============================================
// DAILY STATS TRACKING
// ============================================

async function getDailyStats() {
  const { dailyStats } = await chrome.storage.local.get('dailyStats');
  const today = getTodayDateString();

  // If no stats or stats are from a different day, return fresh stats
  if (!dailyStats || dailyStats.date !== today) {
    return { date: today, count: 0, problems: [], apiSynced: false };
  }

  return dailyStats;
}

// Sync today's count from APIs (fully API-based)
async function syncTodayCountFromAPIs() {
  const today = getTodayDateString();
  let { dailyStats } = await chrome.storage.local.get('dailyStats');

  // Reset if from different day
  if (!dailyStats || dailyStats.date !== today) {
    dailyStats = { date: today, count: 0, problems: [], apiSynced: false };
  }

  // Get usernames from settings
  const { leetcodeUsername, codeforcesUsername, codechefUsername } =
    await chrome.storage.sync.get(['leetcodeUsername', 'codeforcesUsername', 'codechefUsername']);

  if (!leetcodeUsername && !codeforcesUsername && !codechefUsername) {
    console.log('No usernames configured for API sync');
    return dailyStats;
  }

  // Fetch today's solved problems from all platforms
  const results = await Promise.allSettled([
    leetcodeUsername ? fetchLeetCodeTodaySubmissions(leetcodeUsername) : Promise.resolve([]),
    codeforcesUsername ? fetchCodeforcesTodaySubmissions(codeforcesUsername) : Promise.resolve([]),
    codechefUsername ? fetchCodeChefTodaySubmissions(codechefUsername) : Promise.resolve([])
  ]);

  const leetcodeProblems = results[0].status === 'fulfilled' ? results[0].value : [];
  const codeforcesProblems = results[1].status === 'fulfilled' ? results[1].value : [];
  const codechefProblems = results[2].status === 'fulfilled' ? results[2].value : [];

  // Combine all problems from all platforms
  const allTodayProblems = [
    ...leetcodeProblems,
    ...codeforcesProblems,
    ...codechefProblems
  ];

  // Update daily stats with API data
  const existingProblems = new Set(dailyStats.problems || []);
  // Start count from existing problems size to ensure consistency
  // This fixes potential mismatch between count and problems array
  let newCount = existingProblems.size;

  allTodayProblems.forEach(problemUrl => {
    if (!existingProblems.has(problemUrl)) {
      existingProblems.add(problemUrl);
      newCount++;
    }
  });

  dailyStats = {
    date: today,
    count: newCount,
    problems: Array.from(existingProblems),
    apiSynced: true,
    lastApiSync: Date.now()
  };

  await chrome.storage.local.set({ dailyStats });
  console.log('Today count synced from APIs:', newCount, 'problems');

  return dailyStats;
}

// Fetch today's accepted submissions from LeetCode
async function fetchLeetCodeTodaySubmissions(username) {
  try {
    const query = `
      query recentAcSubmissions($username: String!, $limit: Int!) {
        recentAcSubmissionList(username: $username, limit: $limit) {
          id
          title
          titleSlug
          timestamp
        }
      }
    `;

    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.com'
      },
      body: JSON.stringify({
        query,
        variables: { username, limit: 50 }
      })
    });

    if (!response.ok) {
      throw new Error(`LeetCode API error: ${response.status}`);
    }

    const data = await response.json();
    const submissions = data.data?.recentAcSubmissionList || [];

    const today = getTodayDateString();
    const todayProblems = [];

    submissions.forEach(submission => {
      const submissionDate = new Date(parseInt(submission.timestamp) * 1000);
      const submissionDateStr = formatDateToYYYYMMDD(submissionDate);

      if (submissionDateStr === today) {
        // Create problem URL from titleSlug
        const problemUrl = `https://leetcode.com/problems/${submission.titleSlug}/`;
        todayProblems.push(problemUrl);
      }
    });

    console.log('LeetCode today submissions:', todayProblems.length);
    return todayProblems;

  } catch (error) {
    console.error('Error fetching LeetCode today submissions:', error);
    return [];
  }
}

// Fetch today's accepted submissions from Codeforces
async function fetchCodeforcesTodaySubmissions(username) {
  try {
    const response = await fetch(
      `https://codeforces.com/api/user.status?handle=${username}&from=1&count=100`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`Codeforces API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error('Invalid Codeforces response');
    }

    const today = getTodayDateString();
    const todayProblems = [];

    // Filter accepted submissions from today
    data.result.forEach(submission => {
      if (submission.verdict === 'OK') {
        const submissionDate = new Date(submission.creationTimeSeconds * 1000);
        const submissionDateStr = formatDateToYYYYMMDD(submissionDate);

        if (submissionDateStr === today) {
          // Create problem URL from contest and problem index
          const problemUrl = `https://codeforces.com/problemset/problem/${submission.problem.contestId}/${submission.problem.index}`;
          if (!todayProblems.includes(problemUrl)) {
            todayProblems.push(problemUrl);
          }
        }
      }
    });

    console.log('Codeforces today submissions:', todayProblems.length);
    return todayProblems;

  } catch (error) {
    console.error('Error fetching Codeforces today submissions:', error);
    return [];
  }
}

// Fetch today's solved problems from CodeChef
async function fetchCodeChefTodaySubmissions(username) {
  try {
    // Use the community API to get user stats
    const response = await fetch(
      `https://codechef-api.vercel.app/handle/${username}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`CodeChef API error: ${response.status}`);
    }

    const data = await response.json();

    // CodeChef API doesn't provide detailed submission history easily
    // We'll use a workaround: check if user has activity today via heatmap
    const today = getTodayDateString();
    const todayProblems = [];

    if (data.heatmap && data.heatmap[today] && data.heatmap[today] > 0) {
      // User has activity today, but we can't get exact problem URLs from this API
      // We'll mark it as active but can't count specific problems
      // For now, we'll return empty array and rely on manual marking
      // In the future, could scrape the user's submission page
      console.log('CodeChef user has activity today, but exact problems not available from API');
    }

    return todayProblems;

  } catch (error) {
    console.error('Error fetching CodeChef today submissions:', error);
    return [];
  }
}

// Set up 4 AM reset alarm
async function setupDailyResetAlarm() {
  const resetTime = getNextResetTime();
  chrome.alarms.create('dailyStatsReset', {
    when: resetTime,
    periodInMinutes: 1440 // 24 hours
  });
  console.log('Daily reset alarm set for:', new Date(resetTime));
}

// ============================================
// FAVORITES SYSTEM (Local Storage Only)
// ============================================

async function getFavorites() {
  const { favorites } = await chrome.storage.local.get('favorites');
  return favorites || [];
}

async function addFavorite(problem) {
  // Generate ID
  const id = `${problem.platform}_${generateCacheKey(problem.url)}`;

  // Save to local storage
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  if (favorites.some(f => f.id === id)) {
    return { success: false, error: 'Already in favorites' };
  }

  const newFavorite = {
    id,
    url: problem.url,
    title: problem.title,
    platform: problem.platform,
    difficulty: problem.difficulty || 'Unknown',
    addedAt: Date.now()
  };

  favorites.push(newFavorite);
  await chrome.storage.local.set({ favorites });
  return { success: true, favorite: newFavorite };
}

async function removeFavorite(id) {
  // Remove from local storage
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  const updated = favorites.filter(f => f.id !== id);
  await chrome.storage.local.set({ favorites: updated });
  return { success: true };
}

async function isFavorite(url) {
  // Check local storage
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  return favorites.some(f => f.url === url);
}

// ============================================
// PROBLEM TIMER SYSTEM
// ============================================

async function startProblemTimer(problem, tabId) {
  const timerKey = `timer_${generateCacheKey(problem.url)}`;
  const now = Date.now();

  // Check if timer already exists for this problem
  const existing = await chrome.storage.local.get(timerKey);
  if (existing[timerKey]) {
    // Update tab ID if provided (in case tab was refreshed)
    if (tabId && existing[timerKey].tabId !== tabId) {
      existing[timerKey].tabId = tabId;
      await chrome.storage.local.set({ [timerKey]: existing[timerKey] });
    }
    return { timer: existing[timerKey], isNew: false };
  }

  const timerData = {
    url: problem.url,
    title: problem.title,
    platform: problem.platform,
    startTime: now,
    reminderSent: false,
    tabId: tabId || null
  };

  await chrome.storage.local.set({ [timerKey]: timerData });

  const cacheKey = generateCacheKey(problem.url);

  // Set 30-minute alarm for reminder
  chrome.alarms.create(`timer_${cacheKey}`, {
    delayInMinutes: 30
  });

  // Set 1-hour alarm to stop timer
  chrome.alarms.create(`timerStop_${cacheKey}`, {
    delayInMinutes: 60
  });

  console.log('Timer started for:', problem.title);

  return { timer: timerData, isNew: true };
}

async function getActiveTimer(url) {
  const timerKey = `timer_${generateCacheKey(url)}`;
  const result = await chrome.storage.local.get(timerKey);
  return result[timerKey] || null;
}

async function stopProblemTimer(url) {
  const timerKey = `timer_${generateCacheKey(url)}`;
  const cacheKey = generateCacheKey(url);
  const alarmName = `timer_${cacheKey}`;
  const stopAlarmName = `timerStop_${cacheKey}`;

  await chrome.storage.local.remove(timerKey);
  chrome.alarms.clear(alarmName);
  chrome.alarms.clear(stopAlarmName);

  console.log('Timer stopped for:', url);
}

// Test function to manually trigger timer notification
async function testTimerNotification(url) {
  const timerKey = `timer_${generateCacheKey(url)}`;
  const result = await chrome.storage.local.get(timerKey);
  const timerData = result[timerKey];

  if (!timerData) {
    return { success: false, error: 'No active timer found for this problem. Please start a timer first.' };
  }

  // Reset reminderSent flag so we can test the notification multiple times
  timerData.reminderSent = false;
  await chrome.storage.local.set({ [timerKey]: timerData });

  // Manually trigger the notification
  await handleTimerAlarm(`timer_${generateCacheKey(url)}`);

  // Also trigger the modal on the page
  try {
    const tabs = await chrome.tabs.query({ url: url });
    if (tabs.length > 0) {
      // Send message to content script to show modal
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'TEST_TIMER_MODAL'
      }).catch(() => {
        // Tab might not have content script loaded yet
        console.log('LC Helper: Could not send modal message to tab');
      });
    } else {
      // Try URL pattern matching
      const urlPattern = url.split('?')[0] + '*';
      const matchingTabs = await chrome.tabs.query({ url: urlPattern });
      if (matchingTabs.length > 0) {
        chrome.tabs.sendMessage(matchingTabs[0].id, {
          type: 'TEST_TIMER_MODAL'
        }).catch(() => { });
      }
    }
  } catch (e) {
    console.log('LC Helper: Could not trigger modal:', e.message);
  }

  return { success: true, message: 'Notification and modal triggered successfully!' };
}

// Test function to verify scraping accuracy by asking LLM to reconstruct the problem
async function testScrapingAccuracy(problem) {
  try {
    const { key: apiKey, provider: apiProvider, error } = await getApiKeySafely();

    if (error || !apiKey) {
      return {
        success: false,
        error: error || 'API key not configured. Add your API key in settings to test scraping accuracy.'
      };
    }

    const provider = apiProvider;


    // Build the test prompt - ask LLM to convert scraped data to human-readable format
    let testPrompt;

    if (problem.html) {
      testPrompt = `Convert the following Codeforces problem statement from HTML with LaTeX notation into a clean, human-readable format.

The HTML contains LaTeX mathematical notation embedded in <script type="math/tex"> tags. Convert all LaTeX to readable mathematical notation.

**HTML Problem Statement:**
${problem.html}

**Your Task:**
Convert the above HTML problem statement into a clean, human-readable format. Render all LaTeX math properly. Keep the exact same content, just make it readable.

Return your response as a structured JSON object:
{
  "title": "Problem title",
  "description": "Full problem description in human-readable format with proper math notation",
  "inputFormat": "Input format description",
  "outputFormat": "Output format description",
  "constraints": "Constraints description",
  "examples": [
    {
      "input": "Example 1 input",
      "output": "Example 1 output"
    }
  ],
  "notes": "Any notes if present"
}`;
    } else {
      testPrompt = `Convert the following scraped problem statement into a clean, human-readable format.

**Problem Title:** ${problem.title || 'Not provided'}

**Problem Description:**
${problem.description || 'Not provided'}

**Input Format:**
${problem.inputFormat || 'Not provided'}

**Output Format:**
${problem.outputFormat || 'Not provided'}

**Constraints:**
${problem.constraints || 'Not provided'}

**Sample Test Cases:**
${problem.examples || 'Not provided'}

**Your Task:**
Convert the above scraped problem data into a clean, human-readable format. Clean up any LaTeX notation, formatting issues, or rendering artifacts. Keep the exact same content, just make it readable.

Return your response as a structured JSON object:
{
  "title": "Problem title",
  "description": "Full problem description in human-readable format",
  "inputFormat": "Input format description",
  "outputFormat": "Output format description",
  "constraints": "Constraints description",
  "examples": [
    {
      "input": "Example 1 input",
      "output": "Example 1 output"
    }
  ],
  "notes": "Any notes if present"
}`;
    }

    let llmResponse;

    if (provider === 'gemini') {
      llmResponse = await testScrapingAccuracyGemini(problem, apiKey, testPrompt);
    } else {
      llmResponse = await testScrapingAccuracyOpenAI(problem, apiKey, testPrompt);
    }

    // Compare original with LLM's interpretation
    const comparison = {
      original: {
        title: problem.title,
        description: problem.description,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        constraints: problem.constraints,
        examples: problem.examples,
        examplesCount: problem.examplesCount,
        hasHTML: !!problem.html,
        htmlLength: problem.html?.length || 0
      },
      llmInterpretation: llmResponse,
      accuracy: {
        titleMatch: problem.title?.toLowerCase().trim() === llmResponse.title?.toLowerCase().trim(),
        examplesCountMatch: problem.examplesCount === (llmResponse.examples?.length || 0),
        hasCompleteInfo: !!(llmResponse.description && (llmResponse.inputFormat || llmResponse.inputDescription) && (llmResponse.outputFormat || llmResponse.outputDescription))
      }
    };


    return {
      success: true,
      comparison: comparison,
      message: 'Test completed. Check console for detailed results.'
    };

  } catch (error) {
    console.error('LC Helper: Scraping accuracy test failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to test scraping accuracy'
    };
  }
}

// Helper function to test with Gemini
async function testScrapingAccuracyGemini(problem, apiKey, testPrompt) {
  try {
    const parts = [{ text: testPrompt }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      const matches = problem.imageData.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = matches ? matches[1] : 'image/jpeg';
      const base64Data = matches ? matches[2] : problem.imageData;

      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    }

    // SECURITY: Use header instead of query param to prevent API key exposure in URLs/logs
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
          maxOutputTokens: 2048
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, return the text as-is
    return { rawResponse: text };
  } catch (error) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

// Submit user feedback
async function submitFeedback(feedback) {
  try {
    // Store feedback locally (you can later send to backend or email)
    const feedbackKey = `feedback_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await chrome.storage.local.set({
      [feedbackKey]: {
        ...feedback,
        id: feedbackKey,
        storedAt: Date.now()
      }
    });

    // Track feedback submission
    if (typeof LCAnalytics !== 'undefined') {
      LCAnalytics.trackEvent('feedback_received', {
        feedback_type: feedback.type,
        has_email: !!feedback.email
      });
    }

    // Optionally send to backend API
    // Backend removed - feedback is stored locally only
    //     body: JSON.stringify(feedback)
    //   });
    // }

    console.log('LC Helper: Feedback submitted:', feedback.type);
    return { success: true };
  } catch (error) {
    console.error('LC Helper: Error submitting feedback:', error);
    if (typeof LCHErrorTracking !== 'undefined') {
      LCHErrorTracking.trackError(error, {
        tags: { type: 'feedback_submission' }
      });
    }
    return { success: false, error: error.message };
  }
}

// Helper function to test with OpenAI
async function testScrapingAccuracyOpenAI(problem, apiKey, testPrompt) {
  try {
    const userContent = [{ type: 'text', text: testPrompt }];

    // Add image if available
    if (problem.hasImages && problem.imageData) {
      userContent.push({
        type: 'image_url',
        image_url: { url: problem.imageData }
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, return the text as-is
    return { rawResponse: text };
  } catch (error) {
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

