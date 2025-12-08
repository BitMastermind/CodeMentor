// LC Helper - Background Service Worker

// Initialize on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('LC Helper installed/updated:', details.reason);
  fetchAndCacheContests();
  
  // Set up periodic contest refresh (every 6 hours)
  chrome.alarms.create('refreshContests', { periodInMinutes: 360 });
  
  // Always initialize streak system on install/update
  await initializeStreakSystem();
});

// Also initialize on service worker startup (in case it was sleeping)
(async () => {
  console.log('Service worker starting...');
  await ensureStreakDataExists();
})();

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
    const { contests } = await chrome.storage.local.get('contests');
    const contest = contests?.find(c => c.id === contestId);
    
    if (contest) {
      chrome.notifications.create(contestId, {
        type: 'basic',
        iconUrl: 'assets/icon128.png',
        title: '🏁 Contest Starting Soon!',
        message: `${contest.name} starts in ${await getReminderTime()} minutes!`,
        buttons: [{ title: 'Open Contest' }],
        priority: 2
      });
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
            }).catch(() => {});
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
              }).catch(() => {});
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
      const { apiKey } = await chrome.storage.sync.get('apiKey');
      sendResponse({ apiKey });
      break;
      
    case 'GET_STREAK_DATA':
      const { streakData } = await chrome.storage.local.get('streakData');
      sendResponse({ streakData: streakData?.unified || {} });
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
      
    case 'INCREMENT_DAILY_COUNT':
      const updatedStats = await incrementDailyCount(message.problemUrl);
      sendResponse({ dailyStats: updatedStats });
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
    
    case 'OPEN_POPUP':
      // Open extension popup/settings
      // Since we don't have an options page defined, open the popup HTML in a new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
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
        startTime: new Date(c.startTimeSeconds * 1000).toISOString(),
        duration: c.durationSeconds / 60
      }));
    
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
          .filter(c => new Date(c.start_time) > new Date())
          .slice(0, 10)
          .map(c => ({
            id: `lc_${c.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`,
            name: c.name,
            platform: 'leetcode',
            url: c.url || 'https://leetcode.com/contest/',
            startTime: c.start_time,
            duration: parseDuration(c.duration)
          }));
        
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
    const now = new Date();
    const nextWeekly = new Date(now);
    nextWeekly.setDate(now.getDate() + (7 - now.getDay()) % 7); // Next Sunday
    nextWeekly.setHours(2, 30, 0, 0); // 2:30 AM UTC (8:00 AM IST)
    
    if (nextWeekly < now) {
      nextWeekly.setDate(nextWeekly.getDate() + 7);
    }
    
    return [{
      id: 'lc_weekly_mock',
      name: 'Weekly Contest (Check LeetCode for exact time)',
      platform: 'leetcode',
      url: 'https://leetcode.com/contest/',
      startTime: nextWeekly.toISOString(),
      duration: 90
    }];
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
          .filter(c => new Date(c.start_time) > new Date())
          .slice(0, 10)
          .map(c => ({
            id: `cc_${c.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`,
            name: c.name,
            platform: 'codechef',
            url: c.url || 'https://www.codechef.com/contests',
            startTime: c.start_time,
            duration: parseDuration(c.duration)
          }));
        
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
        
        return futureContests.slice(0, 10).map(c => ({
          id: `cc_${c.contest_code}`,
          name: c.contest_name,
          platform: 'codechef',
          url: `https://www.codechef.com/${c.contest_code}`,
          startTime: new Date(c.contest_start_date_iso).toISOString(),
          duration: Math.floor((new Date(c.contest_end_date_iso) - new Date(c.contest_start_date_iso)) / 60000)
        }));
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
  
  let updated;
  if (enabled) {
    updated = [...new Set([...notifiedContests, contestId])];
  } else {
    updated = notifiedContests.filter(id => id !== contestId);
    // Remove alarm if disabled
    chrome.alarms.clear(`contest_${contestId}`);
  }
  
  await chrome.storage.local.set({ notifiedContests: updated });
  
  if (enabled) {
    await setContestAlarm(contestId);
  }
}

async function setContestAlarm(contestId) {
  const { contests } = await chrome.storage.local.get('contests');
  const contest = contests?.find(c => c.id === contestId);
  
  if (!contest) return;
  
  const reminderMinutes = await getReminderTime();
  const startTime = new Date(contest.startTime).getTime();
  const alarmTime = startTime - (reminderMinutes * 60 * 1000);
  
  if (alarmTime > Date.now()) {
    chrome.alarms.create(`contest_${contestId}`, {
      when: alarmTime
    });
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

// AI Hints Generation with Caching
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
  
  const { apiKey, apiProvider } = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
  
  if (!apiKey) {
    return { error: 'API key not configured. Add your API key in settings.' };
  }
  
  const provider = apiProvider || 'gemini';
  let result;
  
  if (provider === 'gemini') {
    result = await generateHintsGemini(problem, apiKey, platform);
  } else {
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

// Explain problem in simpler terms
async function explainProblem(problem) {
  const cacheKey = `explain_${generateCacheKey(problem.url || problem.title)}`;
  
  // Check cache
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    console.log('Using cached explanation for:', problem.title);
    return { ...cached[cacheKey], cached: true };
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
  
  const { apiKey, apiProvider } = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
  
  if (!apiKey) {
    return { error: 'API key not configured. Add your API key in settings.' };
  }
  
  const provider = apiProvider || 'gemini';
  let result;
  
  if (provider === 'gemini') {
    result = await explainProblemGemini(problem, apiKey, platform);
  } else {
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

OUTPUT FORMAT (STRICT JSON)

═══════════════════════════════════════════════════════════════

Return ONLY this JSON:

{

  "explanation": "Clear, friendly explanation with **bold** for key terms, *italics* for emphasis, and \`code\` for variables. Break into paragraphs using \\n\\n.",

  "keyPoints": [

    "First key insight about understanding the problem",

    "Second important detail about input/structure",

    "Third clarification from sample walkthrough",

    "Fourth tricky case or rule to remember"

  ]

}

═══════════════════════════════════════════════════════════════

RULES

═══════════════════════════════════════════════════════════════

❌ DO NOT:

- Reveal or hint at a solution approach.

- Mention algorithms (sliding window, DP, etc.).

- Provide code or pseudocode.

- Mention time complexity.

✅ DO:

- Be clear, conversational, beginner-friendly.

- Focus ONLY on understanding the problem.

- Use small examples to clarify behavior.

- Encourage careful reading of constraints.

Now return the JSON explanation.`;
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

**Problem Description:**

${problem.description}

${problem.inputFormat ? `**Input Format:**\n${problem.inputFormat}` : ''}

${problem.outputFormat ? `**Output Format:**\n${problem.outputFormat}` : ''}

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

OUTPUT FORMAT (STRICT JSON)

═══════════════════════════════════════════════════════════════

Return ONLY valid JSON with this exact structure:

{

  "explanation": "A clear, well-structured explanation. Use **bold** for important terms, *italics* for emphasis, and \`code\` for variables. Break into paragraphs with \\n\\n. Follow the problem-modeling process: story → stripped model → goal → constraints → examples → tricky points.",

  "keyPoints": [

    "First key insight about the model (e.g., what the core object really is)",

    "Second important detail about inputs/constraints",

    "Third clarification from the sample walkthrough",

    "Fourth notable tricky or unusual condition the student must not overlook"

  ]

}

═══════════════════════════════════════════════════════════════

CRITICAL GUIDELINES

═══════════════════════════════════════════════════════════════

✅ DO:

- Think like a problem-setter: what structure the problem is *really* about.

- Rewrite the problem as a minimal, precise mathematical statement.

- Use small phrases like "In plain terms…" or "Stripped of its story…"

- Be friendly, clear, and highly structured.

- Use markdown formatting for readability.

- Validate interpretation using the samples.

❌ DON'T:

- DO NOT provide algorithms, hints, approaches, or solution ideas.

- DO NOT mention complexity, optimality, or algorithmic techniques.

- DO NOT suggest brute force, DP, greedy, graph traversal, etc.

- DO NOT say things like "this can be solved by…"

- DO NOT skip example walkthroughs.

- DO NOT assume missing information.

═══════════════════════════════════════════════════════════════

Now provide your explanation as JSON:`;
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2500,
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      const friendlyError = formatApiError(errorData.error?.message || 'Failed to generate explanation', 'gemini');
      return { error: friendlyError };
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;
    
    // Parse JSON from response (should be valid JSON due to response_mime_type)
    try {
      const parsed = JSON.parse(content);
      if (parsed.explanation && parsed.keyPoints) {
        return parsed;
      }
    } catch (e) {
      // Fallback: try to extract JSON if response_mime_type didn't work
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error('Failed to parse JSON:', e2);
        }
      }
    }
    
    // Fallback: return as explanation if JSON parsing fails
    return {
      explanation: content,
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
    const model = (problem.hasImages && problem.imageData) ? 'gpt-4o' : 'gpt-4o-mini';
    
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
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return valid JSON with this structure:
{
  "explanation": "Clear, friendly explanation with **bold** for key terms, *italics* for emphasis, and \`code\` for variables. Break into paragraphs using \\n\\n.",
  "keyPoints": [
    "First key insight about understanding the problem",
    "Second important detail about input/structure",
    "Third clarification from sample walkthrough",
    "Fourth tricky case or rule to remember"
  ]
}`;
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

**Problem Description:**
${problem.description}

${problem.inputFormat ? `**Input Format:**\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `**Output Format:**\n${problem.outputFormat}` : ''}
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
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return valid JSON with this structure:
{
  "explanation": "A clear, well-structured explanation. Use **bold** for important terms, *italics* for emphasis, and \`code\` for variables. Break into paragraphs with \\n\\n. Follow the problem-modeling process: story → stripped model → goal → constraints → examples → tricky points.",
  "keyPoints": [
    "First key insight about the model (e.g., what the core object really is)",
    "Second important detail about inputs/constraints",
    "Third clarification from the sample walkthrough",
    "Fourth notable tricky or unusual condition the student must not overlook"
  ]
}`;
    }

    const userContent = [
      {
        type: 'text',
        text: userText
      }
    ];

    if (problem.hasImages && problem.imageData) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: problem.imageData
        }
      });
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
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: "json_object" }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      const friendlyError = formatApiError(data.error.message, 'openai');
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
      // Fallback: try to extract JSON if response_format didn't work
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error('Failed to parse JSON:', e2);
        }
      }
    }
    
    // Fallback: return as explanation
    return {
      explanation: content,
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

async function generateHintsGemini(problem, apiKey, platform = 'codeforces') {
  try {
    // Log the complete problem object received
    console.log('='.repeat(80));
    console.log('LC Helper - GET HINTS - Received Problem Object:');
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
Description: ${problem.description}
${problem.examples ? `\n\nSample Test Cases:\n${problem.examples}` : ''}
${problem.inputFormat ? `\n\nInput Format:\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `\n\nOutput Format:\n${problem.outputFormat}` : ''}

${problem.hasImages ? 'Note: This problem includes images/graphs in the problem statement. Analyze them carefully along with the text description.' : ''}
${problem.examples ? '\nIMPORTANT: Use the sample test cases to verify your understanding. The hints should guide toward a solution that works for these examples.' : ''}

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

- Do NOT mention explicit algorithm names in Hints 1–2.



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
Description: ${problem.description}
${problem.examples ? `\n\nSample Test Cases:\n${problem.examples}` : ''}
${problem.inputFormat ? `\n\nInput Format:\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `\n\nOutput Format:\n${problem.outputFormat}` : ''}

${problem.hasImages ? 'Note: This problem includes images/graphs in the problem statement. Analyze them carefully along with the text description.' : ''}
${problem.examples ? '\nIMPORTANT: Use the sample test cases to verify your understanding. The hints should guide toward a solution that works for these examples.' : ''}

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
    
    if (problem.hasImages && problem.imageData) {
      // Extract base64 data and mime type from data URL
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.5,  // Lowered from 0.7 for more consistent hints
          maxOutputTokens: 2048,
          topP: 0.9,
          topK: 40
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      const friendlyError = formatApiError(data.error.message, 'gemini');
      return { error: friendlyError };
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'Failed to parse response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with Gemini:', error);
    const friendlyError = formatApiError(error.message, 'gemini');
    return { error: friendlyError };
  }
}

async function generateHintsOpenAI(problem, apiKey, platform = 'codeforces') {
  try {
    // Use gpt-4o for vision support if images are present, otherwise use gpt-4o-mini
    const model = (problem.hasImages && problem.imageData) ? 'gpt-4o' : 'gpt-4o-mini';
    
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
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.' : ''}`;

      userText = `Analyze this competitive programming problem and generate progressive hints:

Title: ${problem.title}
${existingTags ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}
Description: ${problem.description}
${problem.examples ? `\n\nSample Test Cases:\n${problem.examples}` : ''}
${problem.inputFormat ? `\n\nInput Format:\n${problem.inputFormat}` : ''}
${problem.outputFormat ? `\n\nOutput Format:\n${problem.outputFormat}` : ''}

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

    // Add image if present
    if (problem.hasImages && problem.imageData) {
      // OpenAI accepts the full data URL directly
      userContent.push({
        type: 'image_url',
        image_url: {
          url: problem.imageData
        }
      });
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
        max_tokens: 2048
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      const friendlyError = formatApiError(data.error.message, 'openai');
      return { error: friendlyError };
    }
    
    const content = data.choices[0].message.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'Failed to parse response. Please try again.' };
  } catch (error) {
    console.error('Error generating hints with OpenAI:', error);
    const friendlyError = formatApiError(error.message, 'openai');
    return { error: friendlyError };
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
  
  // Set up daily stats reset alarm (midnight)
  chrome.alarms.create('dailyStatsReset', {
    when: getNextMidnight(),
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
    // Reset daily stats at midnight
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
      iconUrl: 'assets/icon128.png',
      title: '⏰ 30 Minutes Elapsed!',
      message: `You've been working on "${timerData.title}" for 30 minutes. Consider taking a hint or watching the solution.`,
      buttons: [
        { title: '💡 Take a Hint' },
        { title: '📺 Watch Solution' }
      ],
      priority: 2,
      requireInteraction: true
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
    
    // Fetch data from all platforms in parallel (with delay for Codeforces)
    const results = await Promise.allSettled([
      leetcodeUsername ? fetchLeetCodeActivity(leetcodeUsername) : Promise.resolve(null),
      new Promise(resolve => setTimeout(async () => {
        resolve(codeforcesUsername ? await fetchCodeforcesActivity(codeforcesUsername) : null);
      }, 2000)), // 2 second delay for Codeforces rate limiting
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
      iconUrl: 'assets/icon128.png',
      title: '⏰ Daily Coding Reminder',
      message: message,
      priority: 2,
      requireInteraction: false
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

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
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

async function incrementDailyCount(problemUrl) {
  const today = getTodayDateString();
  let { dailyStats } = await chrome.storage.local.get('dailyStats');
  
  // Reset if from different day
  if (!dailyStats || dailyStats.date !== today) {
    dailyStats = { date: today, count: 0, problems: [], apiSynced: false };
  }
  
  // Check if already counted this problem today
  if (!dailyStats.problems.includes(problemUrl)) {
    dailyStats.count++;
    dailyStats.problems.push(problemUrl);
    await chrome.storage.local.set({ dailyStats });
  }
  
  return dailyStats;
}

// Sync today's count from APIs
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
    new Promise(resolve => setTimeout(async () => {
      resolve(codeforcesUsername ? await fetchCodeforcesTodaySubmissions(codeforcesUsername) : []);
    }, 2000)), // 2 second delay for Codeforces rate limiting
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
  let newCount = dailyStats.count || 0;
  
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

// Set up midnight reset alarm
async function setupDailyResetAlarm() {
  const midnight = getNextMidnight();
  chrome.alarms.create('dailyStatsReset', {
    when: midnight,
    periodInMinutes: 1440 // 24 hours
  });
  console.log('Daily reset alarm set for:', new Date(midnight));
}

// ============================================
// FAVORITES SYSTEM
// ============================================

async function getFavorites() {
  const { favorites } = await chrome.storage.local.get('favorites');
  return favorites || [];
}

async function addFavorite(problem) {
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  
  // Generate unique ID
  const id = `${problem.platform}_${generateCacheKey(problem.url)}`;
  
  // Check if already exists
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
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  const updated = favorites.filter(f => f.id !== id);
  await chrome.storage.local.set({ favorites: updated });
  return { success: true };
}

async function isFavorite(url) {
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
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.log('LC Helper: Could not trigger modal:', e.message);
  }
  
  return { success: true, message: 'Notification and modal triggered successfully!' };
}

