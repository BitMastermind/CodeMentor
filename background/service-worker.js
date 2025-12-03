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

// ============================================
// LEETCODE SUBMISSION API LISTENER
// ============================================

// Listen for LeetCode submission API responses
// This detects when a user submits code and the result comes back
chrome.webRequest.onCompleted.addListener(
  (details) => {
    // Check for submission check endpoint (this returns the actual result)
    // LeetCode uses endpoints like: /submissions/detail/{id}/check/
    if (details.url.includes('/submissions/detail/') && 
        details.url.includes('/check/') && 
        details.statusCode === 200) {
      
      console.log('LC Helper: Detected submission check API call:', details.url);
      
      // Notify the content script that a submission result is available
      // The content script will verify if it's "Accepted" by checking the DOM or re-fetching
      chrome.tabs.sendMessage(details.tabId, {
        event: 'submissionCheckCompleted',
        url: details.url
      }).catch(err => {
        // Tab might not have content script loaded
        console.log('LC Helper: Could not send message to tab:', err.message);
      });
    }
    
    // Also listen for the initial submission endpoint
    if (details.url.includes('/problems/') && 
        details.url.includes('/submit/') && 
        details.statusCode === 200) {
      
      console.log('LC Helper: Detected submission API call:', details.url);
      
      chrome.tabs.sendMessage(details.tabId, {
        event: 'submissionStarted',
        url: details.url
      }).catch(err => {
        console.log('LC Helper: Could not send message to tab:', err.message);
      });
    }
  },
  { urls: ["*://leetcode.com/*"] }
);

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
  const { contests } = await chrome.storage.local.get('contests');
  const contest = contests?.find(c => c.id === notificationId);
  
  if (contest) {
    chrome.tabs.create({ url: contest.url });
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    const { contests } = await chrome.storage.local.get('contests');
    const contest = contests?.find(c => c.id === notificationId);
    
    if (contest) {
      chrome.tabs.create({ url: contest.url });
    }
  }
});

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
      
    case 'MARK_SOLVED':
      const result = await markProblemSolved(message.problemData);
      sendResponse(result);
      break;
      
    case 'GET_STREAK_DATA':
      const { streakData } = await chrome.storage.local.get('streakData');
      sendResponse({ streakData: streakData || {} });
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
    const response = await fetch('https://codeforces.com/api/contest.list', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    
    if (data.status !== 'OK') {
      console.error('Codeforces API returned error:', data);
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
    console.error('Error fetching Codeforces contests:', error);
    return [];
  }
}

async function fetchLeetCodeContests() {
  try {
    // Try kontests.net API first
    try {
      const response = await fetch('https://kontests.net/api/v1/leet_code', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
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
      console.warn('Kontests.net failed, trying alternative...', e);
    }
    
    // Fallback: Return empty or use mock data for testing
    console.log('Using mock LeetCode contest for testing');
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
    console.error('Error fetching LeetCode contests:', error);
    return [];
  }
}

async function fetchCodeChefContests() {
  try {
    // Try kontests.net API
    try {
      const response = await fetch('https://kontests.net/api/v1/code_chef', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
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
      console.warn('Kontests.net failed for CodeChef', e);
    }
    
    // Try direct CodeChef API as fallback
    try {
      const response = await fetch('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all');
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
      console.warn('Direct CodeChef API also failed', e);
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching CodeChef contests:', error);
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
    return { error: 'API key not configured' };
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

Be specific, concise, and competition-focused.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
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
      return { error: data.error.message };
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'Failed to parse response' };
  } catch (error) {
    console.error('Error generating hints with Gemini:', error);
    return { error: error.message };
  }
}

async function generateHintsOpenAI(problem, apiKey) {
  try {
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
            role: 'system',
            content: `You are a world-class competitive programming coach. Provide HIGH-PERFORMANCE, contest-winning insights with focus on:

1. EXACT TOPIC (with time complexity) - Be hyper-specific, e.g. "DP on Trees with Re-rooting O(n)", "Binary Search on Answer O(n log m)", "Monotonic Stack O(n)"

2. THREE PROGRESSIVE HINTS (PERFORMANCE-FOCUSED):
   - Hint 1: Key observation - what pattern/property to exploit for optimal solution
   - Hint 2: Specific algorithm/data structure with WHY it's optimal and complexity analysis
   - Hint 3: Step-by-step approach with optimizations, edge cases, and full complexity analysis

Focus on OPTIMAL solutions, mention specific data structures (Segment Tree, Fenwick Tree, etc.), and consider competitive programming constraints.

Format as JSON:
{
  "topic": "Exact Topic (with Time Complexity)",
  "hints": [
    "Hint 1 with key insight...",
    "Hint 2 with algorithm + complexity...",
    "Hint 3 with implementation strategy..."
  ]
}`
          },
          {
            role: 'user',
            content: `Analyze for optimal competitive programming solution:\n\nTitle: ${problem.title}\n\nDescription: ${problem.description}\n\nConstraints: ${problem.constraints || 'Not specified'}`
          }
        ],
        temperature: 0.7,
        max_tokens: 2048
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      return { error: data.error.message };
    }
    
    const content = data.choices[0].message.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { error: 'Failed to parse response' };
  } catch (error) {
    console.error('Error generating hints with OpenAI:', error);
    return { error: error.message };
  }
}

// ============================================
// DAILY STREAK TRACKER SYSTEM
// ============================================

// Ensure streak data exists (called on every service worker start)
async function ensureStreakDataExists() {
  const { streakData } = await chrome.storage.local.get('streakData');
  
  if (!streakData) {
    console.log('Streak data not found, initializing...');
    await chrome.storage.local.set({
      streakData: {
        currentStreak: 0,
        longestStreak: 0,
        lastSolveDate: null,
        totalDaysSolved: 0,
        solvedToday: false,
        streakHistory: [],
        freezeTokens: 1,
        lastCheckedDate: getTodayDateString()
      }
    });
    console.log('Streak data initialized');
  } else {
    console.log('Streak data exists:', streakData);
  }
}

async function initializeStreakSystem() {
  await ensureStreakDataExists();
  
  // Set up daily streak check alarm (checks at midnight)
  chrome.alarms.create('dailyStreakCheck', {
    when: getNextMidnight(),
    periodInMinutes: 1440 // Daily
  });
  
  // Set up daily reminder alarm (8 PM)
  chrome.alarms.create('dailyStreakReminder', {
    when: getDailyReminderTime(),
    periodInMinutes: 1440
  });
  
  console.log('Streak system fully initialized with alarms');
}

// Update alarm listener to handle streak alarms
const originalAlarmListener = chrome.alarms.onAlarm.hasListener;
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyStreakCheck') {
    await checkDailyStreak();
  } else if (alarm.name === 'dailyStreakReminder') {
    await sendStreakReminder();
  }
});

// Check if streak should be reset
async function checkDailyStreak() {
  const { streakData } = await chrome.storage.local.get('streakData');
  if (!streakData) return;
  
  const today = getTodayDateString();
  
  if (streakData.lastCheckedDate !== today) {
    // New day started
    if (!streakData.solvedToday && streakData.currentStreak > 0) {
      // User didn't solve yesterday - streak may break
      const yesterday = getYesterdayDateString();
      if (streakData.lastSolveDate !== yesterday) {
        // Streak broken!
        await handleStreakBroken(streakData);
      }
    }
    
    // Reset daily flag
    streakData.solvedToday = false;
    streakData.lastCheckedDate = today;
    await chrome.storage.local.set({ streakData });
  }
}

async function handleStreakBroken(streakData) {
  // Update longest streak if needed
  if (streakData.currentStreak > streakData.longestStreak) {
    streakData.longestStreak = streakData.currentStreak;
  }
  
  // Send notification about broken streak
  chrome.notifications.create('streakBroken', {
    type: 'basic',
    iconUrl: 'assets/icon128.png',
    title: '💔 Streak Broken',
    message: `Your ${streakData.currentStreak}-day streak has ended. Start a new one today!`,
    priority: 1
  });
  
  // Reset streak
  streakData.currentStreak = 0;
  await chrome.storage.local.set({ streakData });
}

// Send daily reminder notification
async function sendStreakReminder() {
  const { streakData, notifyDaily } = await chrome.storage.local.get(['streakData', 'notifyDaily']);
  
  // Check if user has enabled daily reminders (default true)
  if (notifyDaily === false) return;
  if (!streakData) return;
  
  if (!streakData.solvedToday) {
    let message;
    if (streakData.currentStreak > 0) {
      message = `🔥 Keep your ${streakData.currentStreak}-day streak alive! Solve 1 problem today.`;
    } else {
      message = `🌟 Start a new streak today! Solve your first problem.`;
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

// Mark problem as solved (call this when user solves a problem)
async function markProblemSolved(problemData) {
  console.log('markProblemSolved called with:', problemData);
  
  let { streakData } = await chrome.storage.local.get('streakData');
  
  if (!streakData) {
    console.log('No streak data found, initializing...');
    await ensureStreakDataExists();
    const result = await chrome.storage.local.get('streakData');
    streakData = result.streakData;
  }
  
  console.log('Current streak data:', streakData);
  
  const today = getTodayDateString();
  console.log('Today:', today);
  
  // Check if this is first solve today
  if (!streakData.solvedToday) {
    console.log('First solve today! Updating streak...');
    streakData.solvedToday = true;
    
    // Check if streak should continue
    const yesterday = getYesterdayDateString();
    console.log('Yesterday:', yesterday, 'Last solve date:', streakData.lastSolveDate);
    
    if (streakData.lastSolveDate === yesterday || streakData.currentStreak === 0) {
      // Continue or start streak
      streakData.currentStreak++;
      console.log('Streak continued/started! New streak:', streakData.currentStreak);
      
      // Update longest streak if current streak is now the longest
      if (streakData.currentStreak > streakData.longestStreak) {
        streakData.longestStreak = streakData.currentStreak;
        console.log('New longest streak!', streakData.longestStreak);
      }
      
      // Show celebration for milestones
      if ([7, 30, 50, 100, 365].includes(streakData.currentStreak)) {
        showStreakMilestone(streakData.currentStreak);
      }
    } else if (streakData.lastSolveDate !== today) {
      // Gap in streak - reset
      console.log('Gap detected! Resetting streak...');
      if (streakData.currentStreak > streakData.longestStreak) {
        streakData.longestStreak = streakData.currentStreak;
      }
      streakData.currentStreak = 1;
    }
    
    streakData.lastSolveDate = today;
    streakData.totalDaysSolved++;
    
    // Add to history for heatmap
    if (!streakData.streakHistory) {
      streakData.streakHistory = [];
    }
    if (!streakData.streakHistory.includes(today)) {
      streakData.streakHistory.push(today);
    }
    
    await chrome.storage.local.set({ streakData });
    console.log('Streak data saved:', streakData);
    
    // Return updated data for UI
    return { success: true, streakData };
  }
  
  return { success: true, alreadySolvedToday: true, streakData };
}

function showStreakMilestone(days) {
  const milestones = {
    7: { title: '🔥 Week Warrior!', message: 'You hit a 7-day streak!' },
    30: { title: '🔥🔥 Month Master!', message: '30 days strong!' },
    50: { title: '🏆 Unstoppable!', message: '50-day streak achieved!' },
    100: { title: '👑 Century Champion!', message: '100 days of dedication!' },
    365: { title: '🌟 LEGEND STATUS!', message: 'You solved problems for a FULL YEAR!' }
  };
  
  const milestone = milestones[days];
  if (milestone) {
    chrome.notifications.create(`milestone_${days}`, {
      type: 'basic',
      iconUrl: 'assets/icon128.png',
      title: milestone.title,
      message: milestone.message,
      priority: 2,
      requireInteraction: true
    });
  }
}

// Helper functions for dates
function getTodayDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getYesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

