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
      const timerResult = await startProblemTimer(message.problem);
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
      // Open extension popup/options page
      chrome.runtime.openOptionsPage();
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
  
  const { apiKey, apiProvider } = await chrome.storage.sync.get(['apiKey', 'apiProvider']);
  
  if (!apiKey) {
    return { error: 'API key not configured. Add your API key in settings.' };
  }
  
  const provider = apiProvider || 'gemini';
  let result;
  
  if (provider === 'gemini') {
    result = await generateHintsGemini(problem, apiKey);
  } else {
    result = await generateHintsOpenAI(problem, apiKey);
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

async function generateHintsGemini(problem, apiKey) {
  try {
    // Enhanced context extraction
    const difficulty = problem.difficulty || 'Unknown';
    const existingTags = problem.tags || '';
    
    const prompt = `You are a competitive programming expert providing contest-ready hints.

EXAMPLE OF PERFECT HINTS:

Problem: Two Sum
Difficulty: Easy
Topic: Hash Table - O(n) time, O(n) space

Hint 1: For each number x, you need to find if (target - x) exists. Checking all pairs takes O(n²). What data structure provides O(1) lookup to reduce this to O(n)?

Hint 2: Use a hash table (unordered_map in C++, dict in Python) to achieve O(n) time. Store each number with its index as you iterate. Before storing, check if (target - current) exists in the table. This single-pass approach is O(n) vs O(n²) nested loops.

Hint 3: Implementation: 1) Create empty hash table number→index. 2) For each nums[i]: compute complement = target - nums[i]. 3) If complement in table, return [table[complement], i]. 4) Otherwise, insert nums[i]→i into table. Edge cases: duplicate values, negative numbers, ensure i ≠ j.

---

NOW ANALYZE THIS ${difficulty.toUpperCase()} PROBLEM:

Title: ${problem.title}
${existingTags ? `Platform Tags: ${existingTags}` : ''}
Constraints: ${problem.constraints || 'Not specified'}
Description: ${problem.description}

${problem.hasImages ? 'Note: This problem includes images/graphs in the problem statement. Analyze them carefully along with the text description.' : ''}

OUTPUT FORMAT (JSON only):
{
  "topic": "<Algorithm/DS> - O() time, O() space",
  "hints": [
    "<Hint 1: Key observation>",
    "<Hint 2: Specific algorithm with why>",
    "<Hint 3: Implementation steps>"
  ]
}

REQUIREMENTS:
1. Topic MUST include time complexity (e.g., "DP on Trees - O(n)")
2. Hint 1: State key insight, ask guiding question, NO algorithms yet
3. Hint 2: Name EXACT algorithm/data structure (e.g., "segment tree", "unordered_map"), explain WHY optimal, compare complexities
4. Hint 3: List 3-5 numbered steps, mention edge cases, NO actual code
5. Use specific terminology: "unordered_map in C++", "bisect_left in Python", "lower_bound in C++"
6. Compare complexities: O(n log n) vs O(n²), explain trade-offs
${problem.hasImages ? '7. If images/graphs are present, incorporate visual information into your analysis' : ''}

Be specific, concise, and competition-focused.`;

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

async function generateHintsOpenAI(problem, apiKey) {
  try {
    // Use gpt-4o for vision support if images are present, otherwise use gpt-4o-mini
    const model = (problem.hasImages && problem.imageData) ? 'gpt-4o' : 'gpt-4o-mini';
    
    const systemPrompt = `You are a world-class competitive programming coach. Provide HIGH-PERFORMANCE, contest-winning insights with focus on:

1. EXACT TOPIC (with time complexity) - Be hyper-specific, e.g. "DP on Trees with Re-rooting O(n)", "Binary Search on Answer O(n log m)", "Monotonic Stack O(n)"

2. THREE PROGRESSIVE HINTS (PERFORMANCE-FOCUSED):
   - Hint 1: Key observation - what pattern/property to exploit for optimal solution
   - Hint 2: Specific algorithm/data structure with WHY it's optimal and complexity analysis
   - Hint 3: Step-by-step approach with optimizations, edge cases, and full complexity analysis

Focus on OPTIMAL solutions, mention specific data structures (Segment Tree, Fenwick Tree, etc.), and consider competitive programming constraints.
${problem.hasImages ? 'Note: This problem includes images/graphs. Analyze them carefully along with the text description.' : ''}

Format as JSON:
{
  "topic": "Exact Topic (with Time Complexity)",
  "hints": [
    "Hint 1 with key insight...",
    "Hint 2 with algorithm + complexity...",
    "Hint 3 with implementation strategy..."
  ]
}`;

    // Build user content - include image if available
    const userContent = [
      {
        type: 'text',
        text: `Analyze for optimal competitive programming solution:\n\nTitle: ${problem.title}\n\nDescription: ${problem.description}\n\nConstraints: ${problem.constraints || 'Not specified'}`
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
  
  // Initial sync
  await syncUnifiedStreak();
  
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
  } else if (alarm.name.startsWith('timer_')) {
    // 30-minute timer reminder
    await handleTimerAlarm(alarm.name);
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
    return { date: today, count: 0, problems: [] };
  }
  
  return dailyStats;
}

async function incrementDailyCount(problemUrl) {
  const today = getTodayDateString();
  let { dailyStats } = await chrome.storage.local.get('dailyStats');
  
  // Reset if from different day
  if (!dailyStats || dailyStats.date !== today) {
    dailyStats = { date: today, count: 0, problems: [] };
  }
  
  // Check if already counted this problem today
  if (!dailyStats.problems.includes(problemUrl)) {
    dailyStats.count++;
    dailyStats.problems.push(problemUrl);
    await chrome.storage.local.set({ dailyStats });
  }
  
  return dailyStats;
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

async function startProblemTimer(problem) {
  const timerKey = `timer_${generateCacheKey(problem.url)}`;
  const now = Date.now();
  
  // Check if timer already exists for this problem
  const existing = await chrome.storage.local.get(timerKey);
  if (existing[timerKey]) {
    return { timer: existing[timerKey], isNew: false };
  }
  
  const timerData = {
    url: problem.url,
    title: problem.title,
    platform: problem.platform,
    startTime: now,
    reminderSent: false
  };
  
  await chrome.storage.local.set({ [timerKey]: timerData });
  
  // Set 30-minute alarm
  chrome.alarms.create(`timer_${generateCacheKey(problem.url)}`, {
    delayInMinutes: 30
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
  const alarmName = `timer_${generateCacheKey(url)}`;
  
  await chrome.storage.local.remove(timerKey);
  chrome.alarms.clear(alarmName);
  
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

