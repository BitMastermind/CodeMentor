// LC Helper - Codeforces Content Script

(function() {
  'use strict';

  let panel = null;
  let fab = null;
  let isLoading = false;
  let timerInterval = null;
  let timerStartTime = null;
  let currentProblemData = null;

  // Check if extension context is still valid
  function isExtensionContextValid() {
    try {
      // This will throw if context is invalidated
      return chrome.runtime && chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Safe wrapper for chrome.storage.sync operations
  async function safeStorageGet(key) {
    if (!isExtensionContextValid()) {
      console.log('LC Helper: Extension context invalidated, using fallback');
      return {};
    }
    try {
      return await chrome.storage.sync.get(key);
    } catch (e) {
      console.log('LC Helper: Storage access failed:', e.message);
      return {};
    }
  }

  // Safe wrapper for chrome.runtime.sendMessage
  async function safeSendMessage(message) {
    if (!isExtensionContextValid()) {
      console.log('LC Helper: Extension context invalidated, cannot send message');
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
      console.log('LC Helper: Message send failed:', e.message);
      return null;
    }
  }

  // Handle messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_HINTS_PANEL') {
      if (panel) {
        panel.classList.add('active');
        loadHints();
      } else {
        // Initialize if not already done
        init();
        setTimeout(() => {
          if (panel) {
            panel.classList.add('active');
            loadHints();
          }
        }, 2000);
      }
      sendResponse({ success: true });
    } else if (message.type === 'TEST_TIMER_MODAL') {
      // Test handler to manually show the timer reminder modal
      showTimerReminderModal();
      sendResponse({ success: true });
    } else if (message.type === 'TIMER_STOPPED') {
      // Timer was stopped (either after 1 hour or tab closed)
      stopTimerDisplay();
      sendResponse({ success: true });
    }
    return true;
  });

  // Listen for messages from page context (for testing)
  window.addEventListener('message', async (event) => {
    // Only accept messages from same origin
    if (event.data && event.data.type === 'LCH_TEST_TIMER') {
      try {
        const response = await safeSendMessage({
          type: 'TEST_TIMER_NOTIFICATION',
          url: event.data.url || location.href
        });
        
        // Send response back to page
        window.postMessage({
          type: 'LCH_TEST_RESPONSE',
          success: response?.success || false,
          error: response?.error || null
        }, '*');
      } catch (error) {
        window.postMessage({
          type: 'LCH_TEST_RESPONSE',
          success: false,
          error: error.message
        }, '*');
      }
    } else if (event.data && event.data.type === 'LCH_FORWARD_MESSAGE' && event.data.originalMessage) {
      // Forward any message from page to background script
      try {
        const response = await safeSendMessage(event.data.originalMessage);
        
        // Send response back to page
        window.postMessage({
          type: 'LCH_TEST_RESPONSE',
          ...response
        }, '*');
      } catch (error) {
        window.postMessage({
          type: 'LCH_TEST_RESPONSE',
          success: false,
          error: error.message
        }, '*');
      }
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Function to initialize everything
    const doInit = async () => {
      if (!document.body) {
        // If body still doesn't exist, wait a bit more
        setTimeout(doInit, 100);
        return;
      }
      
      createFAB();
      checkAutoShow();
      
      // Start problem timer
      await initializeTimer();
    };
    
    // Wait for page to load, but also check if body is ready
    if (document.body) {
      setTimeout(doInit, 1000);
    } else {
      // Wait for body to be ready
      const bodyObserver = new MutationObserver((mutations, observer) => {
        if (document.body) {
          observer.disconnect();
          setTimeout(doInit, 1000);
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
      // Fallback timeout
      setTimeout(() => {
        bodyObserver.disconnect();
        doInit();
      }, 5000);
    }
  }

  // Initialize problem timer
  async function initializeTimer() {
    if (!isExtensionContextValid()) return;
    
    try {
      const problemData = await extractProblemData();
      if (!problemData.title) return;
      
      currentProblemData = {
        url: window.location.href,
        title: problemData.title,
        platform: 'codeforces',
        difficulty: problemData.difficulty
      };
      
      const response = await safeSendMessage({
        type: 'START_TIMER',
        problem: currentProblemData
      });
      
      if (response?.timer) {
        timerStartTime = response.timer.startTime;
        startTimerDisplay();
        
        if (response.timer.reminderSent) {
          showTimerReminderModal();
        }
      }
    } catch (e) {
      console.log('LC Helper: Timer init failed:', e.message);
    }
  }

  function startTimerDisplay() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const timerEl = document.querySelector('.lch-timer-display');
    if (!timerEl || !timerStartTime) return;
    
    const elapsed = Date.now() - timerStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    // Stop timer if it reaches 1 hour (60 minutes)
    if (minutes >= 60) {
      stopTimerDisplay();
      timerEl.textContent = '60:00';
      timerEl.classList.add('warning');
      return;
    }
    
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    if (minutes >= 30) {
      timerEl.classList.add('warning');
    }
  }

  // Stop timer display
  function stopTimerDisplay() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerStartTime = null;
  }

  function showTimerReminderModal() {
    // Check if toast already exists
    const existingToast = document.querySelector('.lch-timer-toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'lch-timer-toast';
    toast.innerHTML = `
      <div class="lch-timer-toast-content">
        <div class="lch-timer-toast-header">
          <div class="lch-timer-toast-icon">⏰</div>
          <div class="lch-timer-toast-info">
            <div class="lch-timer-toast-title">30 Minutes Elapsed!</div>
            <p class="lch-timer-toast-text">Consider taking a hint or viewing the solution</p>
          </div>
          <button class="lch-timer-toast-close-btn" id="timerToastClose">×</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger slide-in animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    // Auto-dismiss after 8 seconds
    const autoDismiss = setTimeout(() => {
      dismissToast();
    }, 8000);
    
    const dismissToast = () => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };
    
    // Add close button listener
    document.getElementById('timerToastClose').addEventListener('click', () => {
      clearTimeout(autoDismiss);
      dismissToast();
    });
    
    // Click anywhere on toast to dismiss
    toast.addEventListener('click', (e) => {
      if (e.target === toast || e.target.closest('.lch-timer-toast-content')) {
        clearTimeout(autoDismiss);
        dismissToast();
      }
    });
  }

  function createFAB() {
    if (document.querySelector('.lch-fab')) return;

    // Ensure document.body exists
    if (!document.body) {
      // Retry after a short delay if body isn't ready
      setTimeout(createFAB, 100);
      return;
    }

    fab = document.createElement('button');
    fab.className = 'lch-fab';
    // Add inline styles as fallback to ensure visibility
    fab.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 16px !important;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
      border: none !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 4px 24px rgba(99, 102, 241, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset !important;
      z-index: 99999 !important;
      padding: 0 !important;
      margin: 0 !important;
    `;
    fab.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; fill: white;">
        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
      </svg>
    `;
    fab.title = 'LC Helper - Get Hints';
    fab.setAttribute('aria-label', 'LC Helper - Get Hints');
    fab.addEventListener('click', togglePanel);

    try {
      document.body.appendChild(fab);
      console.log('LC Helper: FAB created and appended to body');
    } catch (e) {
      console.error('LC Helper: Failed to append FAB:', e);
      // Retry after a delay
      setTimeout(createFAB, 200);
    }
  }

  function createPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.className = 'lch-panel';
    panel.innerHTML = `
      <div class="lch-panel-header">
        <div class="lch-panel-header-top">
          <div>
            <h3 class="lch-panel-title">LC Helper</h3>
            <p class="lch-panel-subtitle">Smart hints & topic analysis</p>
          </div>
          <div class="lch-timer-badge">
            <span class="lch-timer-icon">⏱️</span>
            <span class="lch-timer-display">00:00</span>
          </div>
        </div>
      </div>
      <div class="lch-panel-body">
        <div class="lch-quick-actions"></div>
      </div>
    `;

    document.body.appendChild(panel);
    
    // Prevent clicks inside panel from closing it
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Close panel when clicking outside (but not on FAB)
    document.addEventListener('click', handleOutsideClick);
    
    if (timerStartTime) {
      updateTimerDisplay();
    }
    
    // Show quick actions (favorite, get hints) without auto-loading
    showQuickActions();
  }

  function handleOutsideClick(e) {
    // Don't close if panel doesn't exist or isn't active
    if (!panel || !panel.classList.contains('active')) {
      return;
    }
    
    // Don't close if clicking on the FAB (it has its own toggle handler)
    if (fab && fab.contains(e.target)) {
      return;
    }
    
    // Don't close if clicking inside the panel
    if (panel.contains(e.target)) {
      return;
    }
    
    // Close the panel if clicking outside
    panel.classList.remove('active');
  }

  // Show quick actions panel without loading hints
  async function showQuickActions() {
    const body = panel.querySelector('.lch-panel-body');
    
    // Extract problem data for favorites (lightweight, no API call)
    if (!currentProblemData) {
      try {
        const problemData = await extractProblemData();
        if (problemData.title) {
          currentProblemData = {
            url: window.location.href,
            title: problemData.title,
            platform: 'codeforces',
            difficulty: problemData.difficulty
          };
        }
      } catch (e) {
        console.log('LC Helper: Could not extract problem data:', e.message);
      }
    }
    
    // Check if problem is in favorites
    let isFavorite = false;
    try {
      const favResponse = await safeSendMessage({ type: 'IS_FAVORITE', url: window.location.href });
      isFavorite = favResponse?.isFavorite || false;
    } catch (e) {}
    
    body.innerHTML = `
      <div class="lch-quick-actions">
        <div class="lch-quick-section">
          <button class="lch-explain-btn" id="explainBtn">
            <span class="lch-btn-icon">📖</span>
            <span class="lch-btn-text">Explain the Problem</span>
          </button>
          <p class="lch-quick-hint">Understand the problem statement better</p>
        </div>
        <div class="lch-quick-divider"></div>
        <div class="lch-quick-section">
          <button class="lch-get-hints-btn" id="getHintsBtn">
            <span class="lch-btn-icon">💡</span>
            <span class="lch-btn-text">Get Smart Hints</span>
          </button>
          <p class="lch-quick-hint">Uses AI to analyze the problem</p>
        </div>
        <div class="lch-quick-divider"></div>
        <div class="lch-quick-section">
          <button class="lch-favorite-btn ${isFavorite ? 'active' : ''}" id="favoriteBtn">
            ${isFavorite ? '❤️ Favorited' : '🤍 Add to Favorites'}
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    body.querySelector('#explainBtn').addEventListener('click', () => {
      explainProblem();
    });
    
    body.querySelector('#getHintsBtn').addEventListener('click', () => {
      loadHints();
    });
    
    const favoriteBtn = body.querySelector('#favoriteBtn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', async () => {
        await toggleFavorite(favoriteBtn);
      });
    }
  }

  function togglePanel() {
    if (!panel) {
      createPanel();
    }

    panel.classList.toggle('active');
    
    // Don't auto-load hints - let user click "Get Hints" button
    // This saves API calls when user just wants to check timer or favorite
  }

  async function checkAutoShow() {
    if (!isExtensionContextValid()) return;
    
    const { autoShowPanel } = await safeStorageGet('autoShowPanel');
    if (autoShowPanel) {
      createPanel();
      panel.classList.add('active');
      loadHints();
    }
  }

  async function loadHints(forceRefresh = false) {
    if (!isExtensionContextValid()) {
      showError('Extension was reloaded. Please refresh the page.');
      return;
    }

    const { apiKey } = await safeStorageGet('apiKey');

    if (!apiKey) {
      showSettingsPrompt();
      return;
    }

    isLoading = true;
    showLoading();

    const problem = await extractProblemData();

    if (!problem.title || !problem.description) {
      showError('Could not extract problem data. Please refresh the page.');
      isLoading = false;
      return;
    }

    // Set currentProblemData for favorite button functionality
    currentProblemData = {
      url: window.location.href,
      title: problem.title,
      platform: 'codeforces',
      difficulty: problem.difficulty
    };

    problem.forceRefresh = forceRefresh;

    try {
      if (!isExtensionContextValid()) {
        showError('Extension was reloaded. Please refresh the page.');
        isLoading = false;
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'GET_HINTS',
        problem
      });

      if (!response) {
        showError('Extension was reloaded. Please refresh the page.');
      } else if (response.error) {
        showError(response.error);
      } else {
        await showHints(response);
      }
    } catch (error) {
      showError(error.message || 'An error occurred. Please refresh the page.');
    }

    isLoading = false;
  }

  async function explainProblem() {
    if (!isExtensionContextValid()) {
      showError('Extension was reloaded. Please refresh the page.');
      return;
    }
    
    try {
      const { apiKey } = await safeStorageGet('apiKey');

      if (!apiKey) {
        showSettingsPrompt();
        return;
      }

      isLoading = true;
      showLoading();

      const problem = await extractProblemData();

      if (!problem.title || !problem.description) {
        showError('Could not extract problem data. Please refresh the page.');
        isLoading = false;
        return;
      }

      if (!currentProblemData) {
        currentProblemData = {
          url: window.location.href,
          title: problem.title,
          platform: 'codeforces',
          difficulty: problem.difficulty
        };
      }

      const response = await chrome.runtime.sendMessage({
        type: 'EXPLAIN_PROBLEM',
        problem
      });

      if (!response) {
        showError('Extension was reloaded. Please refresh the page.');
      } else if (response.error) {
        showError(response.error);
      } else {
        showExplanation(response);
      }
    } catch (error) {
      showError(error.message || 'An error occurred. Please refresh the page.');
    }

    isLoading = false;
  }

  // Extract contest ID and problem index from Codeforces URL
  // Examples:
  // - https://codeforces.com/problemset/problem/1234/A
  // - https://codeforces.com/contest/1234/problem/A
  // - https://codeforces.com/gym/100001/problem/A
  function parseProblemUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      // Check for problemset URL: /problemset/problem/{contestId}/{index}
      const problemsetIndex = pathParts.indexOf('problem');
      if (problemsetIndex >= 0 && problemsetIndex < pathParts.length - 1) {
        const contestId = parseInt(pathParts[problemsetIndex - 1] === 'problem' ? 
                                  pathParts[problemsetIndex - 2] : pathParts[problemsetIndex - 1]);
        const index = pathParts[problemsetIndex + 1];
        if (!isNaN(contestId) && index) {
          return { contestId, index, type: 'problemset' };
        }
      }
      
      // Check for contest URL: /contest/{contestId}/problem/{index}
      // or gym URL: /gym/{contestId}/problem/{index}
      const contestIdMatch = url.match(/\/(?:contest|gym|problemset)\/(\d+)\/problem\/([A-Z])/i);
      if (contestIdMatch) {
        return {
          contestId: parseInt(contestIdMatch[1]),
          index: contestIdMatch[2],
          type: pathParts[0] === 'gym' ? 'gym' : 'contest'
        };
      }
    } catch (e) {
      console.log('LC Helper: Failed to parse Codeforces URL:', e.message);
    }
    return null;
  }

  // Fetch problem metadata from Codeforces API
  // Returns: { tags, rating, solvedCount } or null if API call fails
  async function fetchProblemMetadataFromAPI(contestId, problemIndex) {
    try {
      // API endpoint: https://codeforces.com/api/problemset.problems
      const response = await fetch('https://codeforces.com/api/problemset.problems');
      
      if (!response.ok) {
        console.log('LC Helper: Codeforces API request failed:', response.status);
        return null;
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK' || !data.result || !data.result.problems) {
        console.log('LC Helper: Codeforces API returned error:', data.comment);
        return null;
      }
      
      // Find the matching problem in the API response
      const problem = data.result.problems.find(
        p => p.contestId === contestId && p.index === problemIndex
      );
      
      if (!problem) {
        console.log('LC Helper: Problem not found in API response');
        return null;
      }
      
      // Find corresponding statistics
      const stats = data.result.problemStatistics?.find(
        s => s.contestId === contestId && s.index === problemIndex
      );
      
      return {
        tags: problem.tags || [],
        rating: problem.rating || null,
        solvedCount: stats?.solvedCount || null,
        name: problem.name || null
      };
    } catch (error) {
      console.log('LC Helper: Error fetching from Codeforces API:', error.message);
      return null;
    }
  }

  async function extractProblemData() {
    // First, try to fetch metadata from API if we can parse the URL
    let apiMetadata = null;
    const urlInfo = parseProblemUrl(window.location.href);
    if (urlInfo) {
      apiMetadata = await fetchProblemMetadataFromAPI(urlInfo.contestId, urlInfo.index);
    }
    
    // Codeforces problem page selectors
    const titleEl = document.querySelector('.title');
    const problemStatement = document.querySelector('.problem-statement');
    
    let description = '';
    let constraints = '';
    
    // Extract difficulty from title (e.g., "A. Problem Name" -> Easy, "E. Problem Name" -> Hard)
    let difficulty = 'Unknown';
    let problemRating = '';
    if (titleEl) {
      const titleText = titleEl.textContent.trim();
      const letter = titleText.match(/^([A-G])\./)?.[1];
      if (letter) {
        const difficultyMap = { 'A': 'Easy', 'B': 'Easy', 'C': 'Medium', 'D': 'Medium', 'E': 'Hard', 'F': 'Hard', 'G': 'Hard' };
        difficulty = difficultyMap[letter] || 'Medium';
      }
    }
    
    // Use API rating if available, otherwise try DOM
    if (apiMetadata && apiMetadata.rating) {
      problemRating = String(apiMetadata.rating);
    } else {
      // Try to get problem rating (shown on some problem pages)
      const ratingEl = document.querySelector('.tag-box[title*="Difficulty"]') || 
                       document.querySelector('[title*="rating"]');
      if (ratingEl) {
        problemRating = ratingEl.textContent.trim().replace('*', '');
      }
    }
    
    // Use API tags if available, otherwise extract from DOM
    let tags = '';
    if (apiMetadata && apiMetadata.tags && apiMetadata.tags.length > 0) {
      tags = apiMetadata.tags.join(', ');
    } else {
      // Extract tags if available
      const tagElements = document.querySelectorAll('.tag-box a, [class*="tag"]');
      if (tagElements.length > 0) {
        tags = Array.from(tagElements)
          .map(el => el.textContent.trim())
          .filter(t => t.length > 0 && t.length < 30 && !t.match(/^\*?\d+$/)) // Exclude rating numbers
          .slice(0, 5)
          .join(', ');
      }
    }
    
    // Extract input/output format descriptions
    let inputFormat = '';
    let outputFormat = '';
    
    // Helper function to clean LaTeX duplication patterns
    function cleanLatexDuplication(text) {
      if (!text) return '';
      
      // Remove leading "ss" or other common prefixes (with or without space)
      // Also handle cases where "ss" appears after whitespace or punctuation
      text = text.replace(/^ss\s*/i, '');
      text = text.replace(/([.!?]\s*)ss\s+/gi, '$1');
      
      // Remove common HTML artifact prefixes
      text = text.replace(/^(ss|s|st)\s+/i, '');
      
      // Map Unicode math symbols to their ASCII equivalents
      const unicodeToAscii = {
        '𝑠': 's', '𝑡': 't', '𝑛': 'n', '𝑖': 'i', '𝑎': 'a', 'ℎ': 'h', '𝑚': 'm'
      };
      
      // Pattern 1: Remove Unicode math symbol followed by ASCII equivalent
      // e.g., "𝑛n" -> "𝑛", "𝑖i" -> "𝑖", "𝑎a" -> "𝑎"
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        // Simple pattern: unicode + ascii (one or more) -> unicode
        text = text.replace(new RegExp(`(${unicode})(${ascii})+`, 'g'), '$1');
        
        // Pattern with operators: "𝑛×n×n" -> "𝑛×𝑛"
        // Match: unicode + operator + ascii + operator + ascii
        // Try with and without spaces
        const operatorPatterns = [
          new RegExp(`(${unicode})([×≤≥≠−＋])\\s*(${ascii})\\s*\\2\\s*(${ascii})`, 'g'),
          new RegExp(`(${unicode})([×≤≥≠−＋])(${ascii})\\2(${ascii})`, 'g'),
        ];
        operatorPatterns.forEach(regex => {
          text = text.replace(regex, (match, u, op, a1, a2) => {
            // Convert the second ascii back to unicode
            return u + op + u;
          });
        });
      });
      
      // Pattern 1b: Handle "𝑛×n×n" -> "𝑛×𝑛" more directly
      // Match: unicode + operator + ascii + operator + ascii
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        // Try multiple patterns to catch variations
        const patterns = [
          // "𝑛×n×n" -> "𝑛×𝑛"
          new RegExp(`(${unicode})([×])([${ascii}])\\2([${ascii}])`, 'g'),
          // "𝑛×n×n" with any operator
          new RegExp(`(${unicode})([×≤≥≠−＋])([${ascii}])\\2([${ascii}])`, 'g'),
        ];
        patterns.forEach(regex => {
          text = text.replace(regex, '$1$2$1');
        });
      });
      
      // Pattern 2: Handle subscript patterns like "ℎ𝑖hi" -> "ℎ𝑖"
      // Match: two unicode symbols followed by their ASCII equivalents
      Object.keys(unicodeToAscii).forEach(u1 => {
        const a1 = unicodeToAscii[u1];
        Object.keys(unicodeToAscii).forEach(u2 => {
          const a2 = unicodeToAscii[u2];
          const pattern = new RegExp(`(${u1})(${u2})(${a1})(${a2})`, 'g');
          text = text.replace(pattern, '$1$2');
        });
      });
      
      // Pattern 3: Handle expressions like "1≤𝑖<𝑛1≤i<n" -> "1≤𝑖<𝑛"
      // This is more complex - match number + operators + unicode vars + same in ASCII
      text = text.replace(/(\d+)([≤≥<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])([≤≥<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])(\d+)([≤≥<>=])([a-z])([≤≥<>=])([a-z])/g, 
        (match, n1, op1, u1, op2, u2, n2, op3, a1, op4, a2) => {
          if (n1 === n2 && op1 === op3 && op2 === op4 && 
              unicodeToAscii[u1] === a1 && unicodeToAscii[u2] === a2) {
            return n1 + op1 + u1 + op2 + u2;
          }
          return match;
        });
      
      // Pattern 3b: Handle expressions like "1<𝑖<𝑛1<i<n" -> "1<𝑖<𝑛" (without numbers at end)
      text = text.replace(/(\d+)([<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])([<>=])([𝑛𝑖𝑎ℎ𝑠𝑡])(\d+)([<>=])([a-z])([<>=])([a-z])/g, 
        (match, n1, op1, u1, op2, u2, n2, op3, a1, op4, a2) => {
          if (n1 === n2 && op1 === op3 && op2 === op4 && 
              unicodeToAscii[u1] === a1 && unicodeToAscii[u2] === a2) {
            return n1 + op1 + u1 + op2 + u2;
          }
          return match;
        });
      
      // Pattern 3c: Handle expressions like "1≤𝑖≤𝑛1≤i≤n" -> "1≤𝑖≤𝑛"
      text = text.replace(/(\d+)([≤≥])([𝑛𝑖𝑎ℎ𝑠𝑡])([≤≥])([𝑛𝑖𝑎ℎ𝑠𝑡])(\d+)([≤≥])([a-z])([≤≥])([a-z])/g, 
        (match, n1, op1, u1, op2, u2, n2, op3, a1, op4, a2) => {
          if (n1 === n2 && op1 === op3 && op2 === op4 && 
              unicodeToAscii[u1] === a1 && unicodeToAscii[u2] === a2) {
            return n1 + op1 + u1 + op2 + u2;
          }
          return match;
        });
      
      // Pattern 4: Handle superscripts - detect "1018" and convert to "10^18"
      // Also handle "−1018" -> "−10^18"
      // Match patterns like "1018", "10^18", or superscript Unicode
      text = text.replace(/([−]?)10(\d{1,3})(?![0-9])/g, (match, sign, exp) => {
        // If it's a reasonable exponent (1-3 digits), convert to 10^exp
        if (exp.length <= 3 && parseInt(exp) > 0) {
          return (sign || '') + '10^' + exp;
        }
        return match;
      });
      
      // Pattern 4b: Handle "5×105" -> "5×10^5"
      text = text.replace(/(\d+)×10(\d)/g, (match, base, exp) => {
        return base + '×10^' + exp;
      });
      
      // Pattern 4c: Handle Unicode superscripts like 10¹⁸ -> 10^18
      const superscriptMap = {
        '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0'
      };
      Object.keys(superscriptMap).forEach(sup => {
        const num = superscriptMap[sup];
        text = text.replace(new RegExp(`10${sup}`, 'g'), `10^${num}`);
        // Handle multi-digit superscripts like 10¹⁸
        const multiSupPattern = new RegExp(`10([¹²³⁴⁵⁶⁷⁸⁹⁰]+)`, 'g');
        text = text.replace(multiSupPattern, (match, sups) => {
          const exp = sups.split('').map(s => superscriptMap[s] || '').join('');
          return `10^${exp}`;
        });
      });
      
      // Pattern 5: Handle patterns like "𝑛−1n−1" -> "𝑛−1"
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        const pattern = new RegExp(`(${unicode})([−＋])(\\d+)(${ascii})\\2(\\d+)`, 'g');
        text = text.replace(pattern, (match, u, op, n1, a, n2) => {
          if (n1 === n2) return u + op + n1;
          return match;
        });
      });
      
      // Pattern 5b: Handle patterns like "(𝑛−1)(n−1)" -> "(𝑛−1)"
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        const pattern = new RegExp(`\\((${unicode})([−＋])(\\d+)\\)\\((${ascii})\\2(\\d+)\\)`, 'g');
        text = text.replace(pattern, (match, u, op, n1, a, n2) => {
          if (n1 === n2) return `(${u}${op}${n1})`;
          return match;
        });
      });
      
      // Pattern 6: Handle patterns like "𝑎𝑖ai" -> "𝑎𝑖" (already handled in Pattern 2, but be explicit)
      Object.keys(unicodeToAscii).forEach(u1 => {
        const a1 = unicodeToAscii[u1];
        Object.keys(unicodeToAscii).forEach(u2 => {
          const a2 = unicodeToAscii[u2];
          const pattern = new RegExp(`(${u1})(${u2})(${a1})(${a2})(?![a-z])`, 'g');
          text = text.replace(pattern, '$1$2');
        });
      });
      
      // Pattern 6b: Handle patterns like "𝑛=300000n=300000" -> "𝑛=300000"
      // Match: unicode + operator + value + ascii + operator + value
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        // Pattern: unicode=value + ascii=value
        text = text.replace(new RegExp(`(${unicode})=([^=]+)(${ascii})=\\2`, 'g'), '$1=$2');
        // Pattern: unicode=value + ascii=value (with spaces)
        text = text.replace(new RegExp(`(${unicode})\\s*=\\s*([^=\\s]+)\\s*(${ascii})\\s*=\\s*\\2`, 'g'), '$1=$2');
      });
      
      // Get unicode characters string once for use in multiple patterns
      const unicodeChars = Object.keys(unicodeToAscii).join('');
      
      // Pattern 6c: Handle patterns like "𝑎1,𝑎2,…,𝑎𝑛a1,a2,…,an" -> "𝑎1,𝑎2,…,𝑎𝑛"
      // Match: unicode sequence pattern followed by ASCII version
      // Use explicit unicode characters instead of ranges
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        // Pattern: ...unicode + comma/ellipsis + unicode + ascii + comma/ellipsis + ascii
        const unicodePattern = `[${unicodeChars}\\d,]+`;
        text = text.replace(new RegExp(`(${unicodePattern})(${unicode})([a-z\\d,]+)(${ascii})`, 'g'), 
          (match, before1, u, before2, a) => {
            // Check if before1 and before2 are similar (same structure)
            // Remove unicode chars and keep only digits/commas
            const clean1 = before1.replace(new RegExp(`[${unicodeChars}]`, 'g'), '').replace(/[^0-9,]/g, '');
            const clean2 = before2.replace(/[a-z]/g, '').replace(/[^0-9,]/g, '');
            if (clean1 === clean2) {
              return before1 + u; // Keep unicode version
            }
            return match;
          });
      });
      
      // Pattern 6c2: More aggressive pattern for "𝑎1,𝑎2,…,𝑎𝑛a1,a2,…,an" -> "𝑎1,𝑎2,…,𝑎𝑛"
      // Match sequences ending with unicode variable followed by same in ASCII
      Object.keys(unicodeToAscii).forEach(unicode => {
        const ascii = unicodeToAscii[unicode];
        // Match: unicode sequence ending with unicode var, followed by ASCII sequence ending with ASCII var
        const pattern = new RegExp(`([${unicodeChars}\\d,]+${unicode})([a-z\\d,]+${ascii})`, 'g');
        text = text.replace(pattern, (match, unicodeSeq, asciiSeq) => {
          // Extract just the numeric/structural part
          const unicodeNums = unicodeSeq.replace(new RegExp(`[${unicodeChars}]`, 'g'), '').replace(/[^0-9,]/g, '');
          const asciiNums = asciiSeq.replace(/[a-z]/g, '').replace(/[^0-9,]/g, '');
          if (unicodeNums === asciiNums) {
            return unicodeSeq; // Keep unicode version
          }
          return match;
        });
      });
      
      // Pattern 6d: Handle patterns like "|𝑎𝑖−𝑎𝑖−1|<|𝑎𝑖+1−𝑎𝑖||ai−ai−1|<|ai+1−ai|" -> "|𝑎𝑖−𝑎𝑖−1|<|𝑎𝑖+1−𝑎𝑖|"
      // Match: expression with unicode + same expression with ASCII
      text = text.replace(/(\|[^|]+\|)(\|[^|]+\|)/g, (match, expr1, expr2) => {
        // Check if expr2 is ASCII version of expr1
        const expr1Clean = expr1.replace(new RegExp(`[${unicodeChars}]`, 'g'), '').replace(/[^a-z0-9|−+<>≤≥=]/g, '');
        const expr2Clean = expr2.replace(/[a-z]/g, '').replace(/[^a-z0-9|−+<>≤≥=]/g, '');
        if (expr1Clean === expr2Clean && expr1.includes('𝑎') && expr2.includes('a')) {
          return expr1; // Keep unicode version
        }
        return match;
      });
      
      // Pattern 6e: Handle patterns like "[1,1,3,6,10,3,11,1][1,1,3,6,10,3,11,1]" -> "[1,1,3,6,10,3,11,1]"
      text = text.replace(/(\[[^\]]+\])\1/g, '$1');
      
      // Pattern 6f: Handle patterns like "0,2,3,4,7,8,100,2,3,4,7,8,10" -> "0,2,3,4,7,8,10"
      // Match: number sequence + same sequence repeated
      text = text.replace(/(\d+(?:,\d+)+),\1/g, '$1');
      
      // Pattern 6g: Handle number duplication like "55" when it should be "5"
      // But be careful - only fix obvious duplications in context
      // Match: single digit repeated 2+ times when followed by text like "different values"
      text = text.replace(/(\d)\1+(?=\s*(?:different|distinct|values|points|elements))/g, '$1');
      
      // Pattern 6h: Handle "−1018≤𝑎𝑖≤1018−1018≤ai≤1018" -> "−10^18≤𝑎𝑖≤10^18"
      // First convert 1018 to 10^18, then remove duplication
      // This pattern handles constraint expressions with duplication
      text = text.replace(new RegExp(`([−]?10\\^\\d+)([≤≥<>=])([${unicodeChars}]+)([≤≥<>=])(10\\^\\d+)([−]?10\\^\\d+)\\2([a-z]+)\\4(10\\^\\d+)`, 'g'), 
        (match, val1, op1, var1, op2, val2, val1Dup, var1Dup, val2Dup) => {
          // Check if it's a duplication
          if (val1 === val1Dup && val2 === val2Dup && 
              unicodeToAscii[var1] === var1Dup) {
            return val1 + op1 + var1 + op2 + val2;
          }
          return match;
        });
      
      // Pattern 6h2: Handle simpler case "−1018≤𝑎𝑖≤1018−1018≤ai≤1018" before superscript conversion
      // Match: constraint expression + same expression in ASCII
      text = text.replace(new RegExp(`([−]?\\d+)([≤≥<>=])([${unicodeChars}]+)([≤≥<>=])(\\d+)([−]?\\d+)\\2([a-z]+)\\4(\\d+)`, 'g'),
        (match, val1, op1, var1, op2, val2, val1Dup, var1Dup, val2Dup) => {
          if (val1 === val1Dup && val2 === val2Dup && 
              unicodeToAscii[var1] === var1Dup) {
            return val1 + op1 + var1 + op2 + val2;
          }
          return match;
        });
      
      // Pattern 6h3: Handle "−10^18≤𝑎𝑖≤10^18−10^18≤ai≤10^18" after superscript conversion
      // Match: constraint expression with superscript + same expression in ASCII
      text = text.replace(new RegExp(`([−]?10\\^\\d+)([≤≥<>=])([${unicodeChars}]+)([≤≥<>=])(10\\^\\d+)([−]?10\\^\\d+)\\2([a-z]+)\\4(10\\^\\d+)`, 'g'),
        (match, val1, op1, var1, op2, val2, val1Dup, var1Dup, val2Dup) => {
          if (val1 === val1Dup && val2 === val2Dup && 
              unicodeToAscii[var1] === var1Dup) {
            return val1 + op1 + var1 + op2 + val2;
          }
          return match;
        });
      
      // Pattern 7: Handle subscript duplication like "s_𝑖i" or "𝑠𝑖si" -> "s_i" or "𝑠𝑖"
      // Map Unicode subscript characters
      const subscriptMap = {
        '𝑖': 'i', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5',
        '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₀': '0',
        'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k',
        'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r',
        'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x'
      };
      
      // Remove subscript duplication: unicode subscript + ASCII equivalent
      Object.keys(subscriptMap).forEach(subUnicode => {
        const ascii = subscriptMap[subUnicode];
        // Escape special regex characters in ascii value
        const escapedAscii = ascii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Pattern: letter + unicode subscript + same letter + same ascii (e.g., "s𝑖si" -> "s_i")
        text = text.replace(new RegExp(`([a-zA-Z])(${subUnicode})\\1(${escapedAscii})(?![a-z0-9₀-₉ᵢ-ₓ])`, 'gi'), `$1_${ascii}`);
        // Pattern: just unicode subscript + ascii (e.g., "𝑖i" -> "i" with underscore context)
        text = text.replace(new RegExp(`(${subUnicode})(${escapedAscii})(?![a-z0-9₀-₉])`, 'gi'), `_${ascii}`);
      });
      
      // Pattern 8: Handle superscript duplication like "2𝑘k" or "10¹⁸18" -> "2^k" or "10^18"
      // Map Unicode superscript characters (extended set)
      const superscriptMapExtended = {
        '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', 
        '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0',
        'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f',
        'ᵍ': 'g', 'ʰ': 'h', 'ⁱ': 'i', 'ʲ': 'j', 'ᵏ': 'k', 'ˡ': 'l',
        'ᵐ': 'm', 'ⁿ': 'n', 'ᵒ': 'o', 'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's',
        'ᵗ': 't', 'ᵘ': 'u', 'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
        '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')'
      };
      
      // Remove superscript duplication: unicode superscript + ASCII equivalent
      Object.keys(superscriptMapExtended).forEach(supUnicode => {
        const ascii = superscriptMapExtended[supUnicode];
        // Escape special regex characters in ascii value
        const escapedAscii = ascii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Pattern: number/letter + unicode superscript + same number/letter + same ascii (e.g., "2𝑘k" -> "2^k")
        text = text.replace(new RegExp(`([a-zA-Z0-9])(${supUnicode})\\1(${escapedAscii})(?![a-z0-9⁰-⁹ᵃ-ᶻ])`, 'gi'), `$1^${ascii}`);
        // Pattern: just unicode superscript + ascii (e.g., "𝑘k" -> "^k" in context)
        text = text.replace(new RegExp(`([a-zA-Z0-9])(${supUnicode})([a-zA-Z0-9]*?)(${escapedAscii})(?![a-z0-9⁰-⁹ᵃ-ᶻ])`, 'gi'), (match, base, unicode, mid, asciiVal) => {
          // If mid is empty or very short, it's likely a duplication
          if (mid.length <= 1) {
            return base + '^' + ascii;
          }
          return match;
        });
      });
      
      // Pattern 9: Handle specific patterns like "𝑠𝑖si" (unicode subscript sequence + ASCII)
      const subscriptChars = Object.keys(subscriptMap).join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`([${subscriptChars}]+)([a-z]+)(?![a-z0-9₀-₉])`, 'gi'), (match, unicodeSubs, ascii) => {
        // Convert unicode subscripts to ASCII and check if they match
        const converted = unicodeSubs.split('').map(c => subscriptMap[c] || '').join('');
        if (converted.toLowerCase() === ascii.toLowerCase()) {
          // It's a duplication, keep the ASCII with underscores
          return ascii.split('').join('_');
        }
        return match;
      });
      
      // Pattern 6i: Handle thousands separator - "300000" -> "300 000" (but only in specific contexts)
      // Only apply to numbers that appear in test case descriptions like "n = 300000"
      text = text.replace(/([𝑛𝑚])\s*=\s*(\d{4,})/g, (match, variable, num) => {
        if (num.length >= 4) {
          return variable + ' = ' + num.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        }
        return match;
      });
      
      // Pattern 7: Handle triple repetition like "998244353998244353998244353"
      text = text.replace(/(\d{4,})\1{2,}/g, '$1');
      
      // Pattern 8: Handle simple word duplication (be careful with legitimate words)
      text = text.replace(/([A-Za-z]{2,15})\1{1,}(?=\s|$|[.,;:!?])/g, '$1');
      
      // Pattern 9: Fix word boundary issues - "cel" -> "cell", "unles" -> "unless", etc.
      const wordFixes = {
        'cel': 'cell',
        'unles': 'unless',
        'Al tiles': 'All tiles',
        'al tiles': 'all tiles',
        'Al ': 'All ',
        'al ': 'all ',
        'equall to': 'equal to'
      };
      Object.keys(wordFixes).forEach(wrong => {
        const correct = wordFixes[wrong];
        text = text.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct);
      });
      
      // Pattern 10: Clean up constraints duplication
      // Remove duplicate "time limit per test" lines (handle with or without newlines)
      text = text.replace(/(time limit per test[^\n]+)(\s*\n?\s*)\1/g, '$1');
      text = text.replace(/(memory limit per test[^\n]+)(\s*\n?\s*)\1/g, '$1');
      // Also handle cases where they appear on same line
      text = text.replace(/(time limit per test[^\n]+)\s+\1/g, '$1');
      text = text.replace(/(memory limit per test[^\n]+)\s+\1/g, '$1');
      
      // Clean up multiple spaces
      text = text.replace(/\s{2,}/g, ' ');
      
      // Clean up multiple newlines
      text = text.replace(/\n{3,}/g, '\n\n');
      
      return text.trim();
    }
    
    // Final cleanup pass to fix remaining issues after normalization
    function finalCleanup(text) {
      if (!text) return '';
      
      // Remove leading "ss" or "smemory" prefix (more aggressive - handle at start of text or after punctuation)
      text = text.replace(/^ss\s+/i, '');
      text = text.replace(/^ss(?=[A-Z])/i, '');
      text = text.replace(/^smemory\s+/i, 'memory ');
      text = text.replace(/([.!?]\s*)ss\s+/gi, '$1');
      // Also remove if it's stuck to the first word
      text = text.replace(/^ss([A-Z][a-z])/i, '$1');
      
      // Fix patterns like "n(n+1)2n(n+1)2" -> "n(n+1)/2"
      // This is a formula duplication where "/" was lost
      text = text.replace(/([a-zA-Z]\([a-zA-Z][+\-×/]*[a-zA-Z0-9]+\))(\d+)\1\2/g, (match, expr, num) => {
        // Check if this looks like it should have a division
        if (num === '2' && !expr.includes('/')) {
          return expr + '/' + num;
        }
        return expr + num; // Otherwise just remove duplicate
      });
      
      // Fix "2k2k" pattern -> should be "2^k" (duplicate after normalization)
      // Match: number + letter + same number + same letter (e.g., "2k2k")
      text = text.replace(/(\d+)([kmnKM])\1\2(?![a-zA-Z0-9^_])/g, (match, num, letter) => {
        return num + '^' + letter.toLowerCase();
      });
      
      // Fix "2k 2k" (with space) -> "2^k"
      text = text.replace(/(\d+)([kmnKM])\s+\1\2(?![a-zA-Z0-9^_])/g, (match, num, letter) => {
        return num + '^' + letter.toLowerCase();
      });
      
      // Fix "2^k−12k−1" -> "2^k−1" (superscript expression followed by duplicate without superscript)
      // Pattern: expression with ^ followed by duplicate expression without ^
      // Example: "2^k−1" followed by "2k−1"
      text = text.replace(/(\d+\^[kmnKM][−+×/\d]*)(\d+)([kmnKM])(\2\3[−+×/\d]*)(?![a-zA-Z0-9^_])/g,
        (match, expr1, base, letter, rest) => {
          // Check if the base and letter match the start of expr1
          const exprBase = expr1.match(/^(\d+)\^/);
          if (exprBase && exprBase[1] === base && ['k', 'K', 'm', 'M', 'n', 'N'].includes(letter)) {
            // Remove the duplicate part, keep the superscript version
            return expr1;
          }
          return match;
        });
      
      // Fix simpler pattern: "2k−12k−1" -> "2^k−1" 
      // When both parts don't have superscripts but should (full duplicate)
      text = text.replace(/(\d+)([kmnKM])([−+×/]?)(\d*)\1\2\3\4(?![a-zA-Z0-9^_])/g, 
        (match, num, letter, op, num2) => {
          // Convert to superscript and keep only first occurrence
          return num + '^' + letter.toLowerCase() + (op || '') + (num2 || '');
        });
      
      // Clean up multiple spaces again
      text = text.replace(/\s{2,}/g, ' ');
      
      return text;
    }
    
    // Normalize Unicode math symbols to ASCII with proper subscript/superscript notation
    // This function converts Unicode mathematical italic characters to ASCII with proper
    // subscript (_) and superscript (^) notation that LLMs can understand better
    function normalizeMathNotation(text) {
      if (!text) return '';
      
      // Mapping of Unicode math italic letters to ASCII
      // These are the mathematical italic Unicode characters used by Codeforces
      const unicodeToAscii = {
        '𝑎': 'a', '𝑏': 'b', '𝑐': 'c', '𝑑': 'd', '𝑒': 'e', '𝑓': 'f', '𝑔': 'g',
        'ℎ': 'h', '𝑖': 'i', '𝑗': 'j', '𝑘': 'k', '𝑙': 'l', '𝑚': 'm', '𝑛': 'n',
        '𝑜': 'o', '𝑝': 'p', '𝑞': 'q', '𝑟': 'r', '𝑠': 's', '𝑡': 't', '𝑢': 'u',
        '𝑣': 'v', '𝑤': 'w', '𝑥': 'x', '𝑦': 'y', '𝑧': 'z',
        '𝐴': 'A', '𝐵': 'B', '𝐶': 'C', '𝐷': 'D', '𝐸': 'E', '𝐹': 'F', '𝐺': 'G',
        '𝐻': 'H', '𝐼': 'I', '𝐽': 'J', '𝐾': 'K', '𝐿': 'L', '𝑀': 'M', '𝑁': 'N',
        '𝑂': 'O', '𝑃': 'P', '𝑄': 'Q', '𝑅': 'R', '𝑆': 'S', '𝑇': 'T', '𝑈': 'U',
        '𝑉': 'V', '𝑊': 'W', '𝑋': 'X', '𝑌': 'Y', '𝑍': 'Z'
      };
      
      // Common subscript indices (variables often used as subscripts)
      const commonSubscripts = ['i', 'j', 'k', 'n', 'm', '1', '2', '3', '4', '5'];
      // Common exponent variables
      const commonExponents = ['k', 'n', 'm'];
      
      // Step 1: Handle superscript patterns FIRST (before subscript conversion)
      // Pattern: digit(s) + unicode variable (common exponent) -> number^variable
      // Example: "2𝑘" -> "2^k", "10𝑛" -> "10^n"
      Object.entries(unicodeToAscii).forEach(([unicode, ascii]) => {
        if (commonExponents.includes(ascii.toLowerCase())) {
          // Match number followed by unicode exponent variable
          // Negative lookahead ensures we don't match if it's part of a larger expression
          text = text.replace(new RegExp(`(\\d+)${unicode}(?![₀-₉¹²³⁴⁵⁶⁷⁸⁹⁰a-zA-Z0-9])`, 'g'), `$1^${ascii}`);
        }
      });
      
      // Step 2: Convert all subscripts to remove underscore notation
      // We'll convert subscripts to plain concatenation (a_1 -> a1, s_i -> si)
      // This simplifies duplicate removal later
      
      // Step 2a: Handle unicode variable + unicode subscript variable -> ascii1 + ascii2 (no underscore)
      Object.entries(unicodeToAscii).forEach(([unicode1, ascii1]) => {
        Object.entries(unicodeToAscii).forEach(([unicode2, ascii2]) => {
          if (unicode1 !== unicode2 && commonSubscripts.includes(ascii2.toLowerCase())) {
            // Convert unicode variable + subscript unicode variable to ASCII without underscore
            text = text.replace(new RegExp(`${unicode1}${unicode2}(?![₀-₉¹²³⁴⁵⁶⁷⁸⁹⁰a-zA-Z0-9])`, 'g'), `${ascii1}${ascii2}`);
          }
        });
        
        // Match: unicode variable + digit(s) -> variable + digit (no underscore)
        // Example: "𝑎1" -> "a1", "𝑛2" -> "n2"
        text = text.replace(new RegExp(`${unicode1}(\\d+)(?![₀-₉¹²³⁴⁵⁶⁷⁸⁹⁰a-zA-Z])`, 'g'), `${ascii1}$1`);
      });
      
      // Step 3: Convert remaining standalone Unicode variables to ASCII
      Object.entries(unicodeToAscii).forEach(([unicode, ascii]) => {
        text = text.replace(new RegExp(unicode, 'g'), ascii);
      });
      
      // Step 4: Remove all underscore notation from subscripts (a_1 -> a1, s_i -> si)
      // This handles any underscores that were created by HTML <sub> tags or other sources
      text = text.replace(/([a-zA-Z])_(\d+)/g, '$1$2'); // a_1 -> a1
      text = text.replace(/([a-zA-Z])_([a-zA-Z])/g, '$1$2'); // s_i -> si
      text = text.replace(/([a-zA-Z])_\{([^}]+)\}/g, '$1$2'); // a_{i_1} -> ai1 (handle braces)
      
      // Step 5: Convert remaining "2k" patterns to "2^k" when they appear in mathematical contexts
      // Match: digit(s) + common exponent letters (k, n, m) at word boundaries or before operators
      const exponentContextPattern = /(\d+)([kmnKM])(?=\s|$|[−+×/≤≥<>=,\.\)])/g;
      text = text.replace(exponentContextPattern, (match, num, letter) => {
        // Only convert if it looks like an exponent (small numbers like 2, 10, etc. with k/n/m)
        const numValue = parseInt(num);
        if (numValue <= 100 || numValue === 10 || numValue === 2 || numValue === 5) {
          return num + '^' + letter.toLowerCase();
        }
        return match;
      });
      
      return text;
    }
    
    // Helper function to extract formatted text preserving structure
    function extractFormattedText(element, useInnerText = true) {
      if (!element) return '';
      
      // Clone the element to avoid modifying the original
      const clone = element.cloneNode(true);
      
      // Remove section titles (we'll handle them separately)
      clone.querySelectorAll('.section-title').forEach(el => el.remove());
      
      // Remove script and style tags
      clone.querySelectorAll('script, style').forEach(el => el.remove());
      
      // Process <sub> and <sup> tags BEFORE extracting text to avoid duplication
      // Convert <sub>content</sub> to _content
      clone.querySelectorAll('sub').forEach(sub => {
        const subText = sub.textContent.trim();
        const replacement = document.createTextNode('_' + subText);
        if (sub.parentNode) {
          sub.parentNode.replaceChild(replacement, sub);
        }
      });
      
      // Convert <sup>content</sup> to ^content
      clone.querySelectorAll('sup').forEach(sup => {
        const supText = sup.textContent.trim();
        const replacement = document.createTextNode('^' + supText);
        if (sup.parentNode) {
          sup.parentNode.replaceChild(replacement, sup);
        }
      });
      
      // Remove empty <span> tags that might contain MathML or LaTeX artifacts
      clone.querySelectorAll('span:empty, span[style*="display:none"], span[class*="math"]').forEach(el => {
        // Only remove if it's truly empty or hidden
        if (!el.textContent.trim() || el.style.display === 'none') {
          el.remove();
        }
      });
      
      // Use innerText for visible text (avoids LaTeX source duplication)
      // innerText respects CSS and only returns rendered text
      let text = '';
      if (useInnerText && clone.innerText) {
        text = clone.innerText.trim();
      } else {
        // Fallback to textContent, but clean it
        text = clone.textContent.trim();
      }
      
      // Clean LaTeX duplication patterns
      text = cleanLatexDuplication(text);
      
      // Normalize mathematical notation (Unicode to ASCII with proper subscripts/superscripts)
      text = normalizeMathNotation(text);
      
      // Final cleanup: Remove any remaining "ss" prefix and fix common patterns
      text = finalCleanup(text);
      
      // Normalize line breaks
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Clean up excessive line breaks
      text = text.replace(/\n{3,}/g, '\n\n');
      
      return text;
    }
    
    if (problemStatement) {
      // Codeforces structure: .problem-statement > div (description divs) > .section-title (Input/Output/Note)
      // We want to capture everything before Input/Output sections
      
      // Method 1: Get all direct child divs and process them
      const allDivs = Array.from(problemStatement.querySelectorAll(':scope > div'));
      const descriptionParts = [];
      
      // Find where Input section starts
      let inputSectionIndex = -1;
      let outputSectionIndex = -1;
      
      allDivs.forEach((div, index) => {
        const sectionTitle = div.querySelector('.section-title');
        if (sectionTitle) {
          const titleText = sectionTitle.textContent.trim().toLowerCase();
          if (titleText.includes('input') && inputSectionIndex === -1) {
            inputSectionIndex = index;
          }
          if (titleText.includes('output') && outputSectionIndex === -1) {
            outputSectionIndex = index;
          }
        }
      });
      
      // Extract description: all divs before Input section
      const descriptionEndIndex = inputSectionIndex !== -1 ? inputSectionIndex : 
                                  (outputSectionIndex !== -1 ? outputSectionIndex : allDivs.length);
      
      for (let i = 0; i < descriptionEndIndex; i++) {
        const div = allDivs[i];
        const sectionTitle = div.querySelector('.section-title');
        
        // Skip if it's a section header (Input/Output/Note)
        if (sectionTitle) {
          const titleText = sectionTitle.textContent.trim().toLowerCase();
          if (titleText.includes('input') || titleText.includes('output') || 
              titleText.includes('note') || titleText.includes('example')) {
            break; // Stop at first section
          }
        }
        
        // Extract text with better formatting
        const divText = extractFormattedText(div);
        if (divText.trim()) {
          descriptionParts.push(divText.trim());
        }
      }
      
      description = descriptionParts.join('\n\n');
      
      // Clean up description to remove LaTeX duplication
      description = cleanLatexDuplication(description);
      
      // Remove title if it appears at the start of description (common duplication)
      if (titleEl) {
        const titleText = titleEl.textContent.trim();
        if (description.startsWith(titleText)) {
          description = description.substring(titleText.length).trim();
        }
        // Also check for title with "time limit" prefix
        const titleMatch = description.match(new RegExp(`^.*?${titleText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
        if (titleMatch && titleMatch.index === 0) {
          description = description.substring(titleMatch[0].length).trim();
        }
      }
      
      // Remove time/memory limit lines if they appear in description
      description = description.replace(/time limit per test\s*\d+\s*(second|seconds)/gi, '').trim();
      description = description.replace(/memory limit per test\s*\d+\s*(megabyte|megabytes|mb)/gi, '').trim();
      description = description.replace(/input\s*standard input/gi, '').trim();
      description = description.replace(/output\s*standard output/gi, '').trim();
      
      // Fallback: If description is too short or empty, try alternative extraction
      if (!description || description.trim().length < 100) {
        // Try getting all text before Input section using innerText (rendered text only)
        const problemText = problemStatement.innerText || problemStatement.textContent || '';
        const inputMatch = problemText.match(/Input\s*:?\s*/i);
        if (inputMatch) {
          description = cleanLatexDuplication(problemText.substring(0, inputMatch.index).trim());
        } else {
          // Last resort: get first few divs' content
          const firstDivs = allDivs.slice(0, Math.min(5, allDivs.length));
          description = firstDivs.map(div => extractFormattedText(div)).filter(t => t.trim()).join('\n\n');
          description = cleanLatexDuplication(description);
        }
      }
      
      // Get input specification
      const inputSpec = problemStatement.querySelector('.input-specification');
      if (inputSpec) {
        const inputText = extractFormattedText(inputSpec);
        // Remove "Input" header if present
        inputFormat = inputText.replace(/^Input\s*:?\s*/i, '').trim();
      }
      
      // Get output specification
      const outputSpec = problemStatement.querySelector('.output-specification');
      if (outputSpec) {
        const outputText = extractFormattedText(outputSpec);
        // Remove "Output" header if present
        outputFormat = outputText.replace(/^Output\s*:?\s*/i, '').trim();
      }
      
      // Extract constraints separately (time limit, memory limit, and constraint section)
      const constraintParts = [];
      
      // Get time and memory limits
      const timeLimit = document.querySelector('.time-limit');
      const memoryLimit = document.querySelector('.memory-limit');
      if (timeLimit) {
        constraintParts.push(timeLimit.textContent.trim());
      }
      if (memoryLimit) {
        constraintParts.push(memoryLimit.textContent.trim());
      }
      
      // Look for a constraints section (if it exists separately from input)
      const constraintSection = problemStatement.querySelector('.property-title');
      if (constraintSection) {
        const constraintText = constraintSection.parentElement?.textContent?.trim();
        if (constraintText && !constraintText.toLowerCase().includes('input') && 
            !constraintText.toLowerCase().includes('output')) {
          constraintParts.push(constraintText);
        }
      }
      
      // If we have input format but no separate constraints, extract constraints from input format
      // (Codeforces often puts constraints in the input section)
      if (inputFormat && constraintParts.length === 0) {
        // Try to extract constraint-like text from input format
        // Look for patterns like "1 ≤ q ≤ 10", "2 ≤ |s| ≤ 11", etc.
        const constraintMatches = inputFormat.match(/\d+\s*≤\s*[^≤]+≤\s*\d+/g);
        if (constraintMatches && constraintMatches.length > 0) {
          constraintParts.push(...constraintMatches);
        }
      }
      
      constraints = constraintParts.join('\n');
      
      // Also get Note section if it exists (adds important context)
      const noteSpec = problemStatement.querySelector('.note');
      if (noteSpec && !description.includes('Note:')) {
        const noteText = extractFormattedText(noteSpec);
        if (noteText.trim()) {
          description += '\n\nNote: ' + noteText.replace(/^Note\s*:?\s*/i, '').trim();
        }
      }
    }

    // Constraints are now handled above in the input/output extraction section

    // Extract sample test cases from Codeforces structure
    const examples = [];
    const sampleTests = document.querySelectorAll('.sample-test');
    
    // Helper function to extract text with proper line breaks from Codeforces pre elements
    function extractPreText(preEl) {
      if (!preEl) return '';
      
      // Method 1: Check for nested divs (Codeforces uses divs for each line)
      const divs = preEl.querySelectorAll('div');
      if (divs.length > 0) {
        return Array.from(divs).map(d => {
          // Use innerText to avoid LaTeX duplication
          const text = d.innerText || d.textContent || '';
          return cleanLatexDuplication(text.trim());
        }).join('\n');
      }
      
      // Method 2: Check for <br> tags
      const html = preEl.innerHTML;
      if (html.includes('<br')) {
        const text = html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        return cleanLatexDuplication(text);
      }
      
      // Method 3: Use innerText which preserves line breaks better than textContent
      // innerText respects CSS styling and returns rendered text with line breaks
      if (preEl.innerText) {
        return cleanLatexDuplication(preEl.innerText.trim());
      }
      
      // Fallback: textContent (but clean it)
      return cleanLatexDuplication(preEl.textContent.trim());
    }
    
    sampleTests.forEach((sampleTest, testIndex) => {
      const inputs = sampleTest.querySelectorAll('.input pre');
      const outputs = sampleTest.querySelectorAll('.output pre');
      
      // Codeforces usually has paired input/output
      const maxPairs = Math.max(inputs.length, outputs.length);
      
      for (let i = 0; i < maxPairs; i++) {
        const inputEl = inputs[i];
        const outputEl = outputs[i];
        
        if (inputEl || outputEl) {
          const inputText = extractPreText(inputEl);
          const outputText = extractPreText(outputEl);
          
          examples.push({
            index: examples.length + 1,
            input: inputText,
            output: outputText
          });
        }
      }
    });

    // Format examples as string for LLM
    const examplesText = examples.map(ex => {
      return `Example ${ex.index}:\n  Input:\n    ${ex.input.split('\n').join('\n    ')}\n  Output:\n    ${ex.output.split('\n').join('\n    ')}`;
    }).join('\n\n');

    // Increase limits for better problem capture
    // Description: up to 5000 chars (most problems fit, but allow for longer ones)
    // Input/Output: up to 1000 chars each
    // Constraints: up to 1000 chars
    const baseData = {
      title: titleEl?.textContent?.trim() || '',
      description: description.trim().slice(0, 5000) || '',
      constraints: constraints.slice(0, 1000),
      difficulty: difficulty,
      problemRating: problemRating,
      tags: tags,
      inputFormat: inputFormat.slice(0, 1000),
      outputFormat: outputFormat.slice(0, 1000),
      examples: examplesText,
      examplesCount: examples.length,
      url: window.location.href,
      // Add API metadata if available
      solvedCount: apiMetadata?.solvedCount || null,
      apiTags: apiMetadata?.tags || null
    };
    
    // Console log extracted data for accuracy testing
    console.log('='.repeat(80));
    console.log('LC Helper - DOM Scraped Problem Data (Codeforces)');
    console.log('='.repeat(80));
    console.log('📡 Data Source:', apiMetadata ? 'API Metadata + DOM Scraping' : 'DOM Scraping Only');
    console.log('📌 Title:', baseData.title);
    console.log('📊 Difficulty:', baseData.difficulty, problemRating ? `(Rating: ${problemRating})` : '');
    console.log('🏷️ Tags:', baseData.tags || 'None found');
    if (apiMetadata) {
      console.log('📡 API Metadata:', {
        rating: apiMetadata.rating || 'N/A',
        solvedCount: apiMetadata.solvedCount || 'N/A',
        tagsFromAPI: apiMetadata.tags?.length || 0
      });
    }
    console.log('-'.repeat(80));
    console.log('📝 FULL DESCRIPTION (' + baseData.description.length + ' chars):');
    console.log(baseData.description);
    console.log('-'.repeat(80));
    console.log('📥 Input Format (' + inputFormat.length + ' chars):', inputFormat || 'None found');
    console.log('📤 Output Format (' + outputFormat.length + ' chars):', outputFormat || 'None found');
    console.log('📏 Constraints (' + baseData.constraints.length + ' chars):', baseData.constraints || 'None found');
    console.log('-'.repeat(80));
    console.log(`📋 Sample Test Cases (${examples.length} found):`);
    examples.forEach(ex => {
      console.log(`  Example ${ex.index}:`);
      console.log(`    Input:`);
      ex.input.split('\n').forEach(line => console.log(`      ${line}`));
      console.log(`    Output:`);
      ex.output.split('\n').forEach(line => console.log(`      ${line}`));
    });
    console.log('-'.repeat(80));
    console.log('🔗 URL:', baseData.url);
    console.log('='.repeat(80));
    console.log('\n📦 COMPLETE EXTRACTED DATA OBJECT:');
    console.log(JSON.stringify(baseData, null, 2));

    // Check if problem has images/graphs and capture them
    if (problemStatement && typeof html2canvas !== 'undefined') {
      const imageElements = problemStatement.querySelectorAll('img, svg, canvas');
      const hasImages = imageElements.length > 0;
      
      if (hasImages) {
        // Check for external images that might cause CORS issues
        let hasExternalImages = false;
        const currentOrigin = window.location.origin;
        
        imageElements.forEach(img => {
          if (img.tagName === 'IMG') {
            const src = img.src || img.getAttribute('src') || '';
            if (src) {
              try {
                const url = new URL(src, window.location.href);
                if (url.origin !== currentOrigin && url.origin !== window.location.origin) {
                  hasExternalImages = true;
                }
              } catch (e) {
                // Invalid URL, might be external
                if (src.startsWith('http') || src.includes('espresso.codeforces.com')) {
                  hasExternalImages = true;
                }
              }
            }
          }
        });
        
        // If we have external images, skip image capture to avoid CORS errors
        if (hasExternalImages) {
          console.log('LC Helper: Skipping image capture due to external images (CORS restrictions)');
          return baseData; // Return text-only version
        }
        
        try {
          // Capture the problem statement element as an image
          const canvas = await html2canvas(problemStatement, {
            allowTaint: false, // Don't allow tainted canvas
            useCORS: true,
            scale: 1.5, // Balance between quality and size
            logging: false,
            backgroundColor: '#ffffff',
            onclone: (clonedDoc) => {
              // Remove external images from cloned document to prevent CORS issues
              const clonedImages = clonedDoc.querySelectorAll('img');
              clonedImages.forEach(img => {
                const src = img.src || img.getAttribute('src') || '';
                if (src) {
                  try {
                    const url = new URL(src, window.location.href);
                    if (url.origin !== window.location.origin) {
                      img.remove(); // Remove external images
                    }
                  } catch (e) {
                    if (src.includes('espresso.codeforces.com') || src.startsWith('http')) {
                      img.remove(); // Remove potentially external images
                    }
                  }
                }
              });
            }
          });
          
          // Optimize image size - resize if too large
          const optimizedImage = optimizeImageData(canvas);
          
          return {
            ...baseData,
            hasImages: true,
            imageData: optimizedImage // Base64 encoded image
          };
        } catch (error) {
          // Silently fail for CORS-related errors, log others
          if (!error.message?.includes('CORS') && 
              !error.message?.includes('Access-Control') &&
              !error.message?.includes('tainted')) {
            console.warn('LC Helper: Failed to capture image:', error.message);
          }
          // Fall back to text-only if image capture fails
        }
      }
    }

    return baseData;
  }

  // Optimize image data to reduce payload size
  function optimizeImageData(canvas, maxWidth = 1200, maxHeight = 1600, quality = 0.8) {
    let { width, height } = canvas;
    
    // Calculate scale factor if image is too large
    const scaleX = maxWidth / width;
    const scaleY = maxHeight / height;
    const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
    
    if (scale < 1) {
      // Need to resize
      const newWidth = Math.floor(width * scale);
      const newHeight = Math.floor(height * scale);
      
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = newWidth;
      resizedCanvas.height = newHeight;
      
      const ctx = resizedCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
      
      // Use JPEG for better compression
      return resizedCanvas.toDataURL('image/jpeg', quality);
    }
    
    // If small enough, use JPEG with compression
    return canvas.toDataURL('image/jpeg', quality);
  }

  function showLoading() {
    const body = panel.querySelector('.lch-panel-body');
    body.innerHTML = `
      <div class="lch-loading">
        <div class="lch-spinner"></div>
        <span class="lch-loading-text">Analyzing problem...</span>
      </div>
    `;
  }

  function showError(message) {
    const body = panel.querySelector('.lch-panel-body');
    
    // Check if it's a quota error and add helpful action
    const isQuotaError = message.toLowerCase().includes('quota') || message.toLowerCase().includes('exhausted');
    const isApiKeyError = message.toLowerCase().includes('api key') || message.toLowerCase().includes('not configured');
    
    // Make error messages more suggestive without buttons
    if (isApiKeyError) {
      message = 'API key not configured. Configure it via the extension icon → Settings tab.';
    }
    
    body.innerHTML = `
      <div class="lch-error">
        <div class="lch-error-icon">${isQuotaError ? '⚠️' : '😕'}</div>
        <p class="lch-error-message">${escapeHtml(message)}</p>
        <button class="lch-retry-btn">Try Again</button>
      </div>
    `;

    body.querySelector('.lch-retry-btn').addEventListener('click', loadHints);
  }

  async function showSettingsPrompt() {
    const body = panel.querySelector('.lch-panel-body');
    
    // Set currentProblemData even without API key so favorite button works
    if (!currentProblemData) {
      try {
        const problemData = await extractProblemData();
        if (problemData.title) {
          currentProblemData = {
            url: window.location.href,
            title: problemData.title,
            platform: 'codeforces',
            difficulty: problemData.difficulty
          };
        }
      } catch (e) {
        console.log('LC Helper: Could not extract problem data for favorites:', e.message);
      }
    }
    
    // Check if problem is in favorites
    let isFavorite = false;
    try {
      const favResponse = await safeSendMessage({ type: 'IS_FAVORITE', url: window.location.href });
      isFavorite = favResponse?.isFavorite || false;
    } catch (e) {}
    
    body.innerHTML = `
      <div class="lch-settings-prompt">
        <div class="lch-settings-icon">🔑</div>
        <p class="lch-settings-message">
          Smart hints require an API key. You can configure it by clicking the extension icon in your browser toolbar and navigating to the Settings tab.
        </p>
      </div>
      ${currentProblemData ? `
      <div class="lch-actions-section">
        <button class="lch-favorite-btn ${isFavorite ? 'active' : ''}" id="favoriteBtn">
          ${isFavorite ? '❤️ Favorited' : '🤍 Add to Favorites'}
        </button>
      </div>
      ` : ''}
    `;
    
    // Add favorite button handler if button exists
    const favoriteBtn = body.querySelector('#favoriteBtn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', async () => {
        await toggleFavorite(favoriteBtn);
      });
    }
  }

  async function showExplanation(data) {
    const body = panel.querySelector('.lch-panel-body');
    
    let isFavorite = false;
    try {
      const favResponse = await safeSendMessage({ type: 'IS_FAVORITE', url: window.location.href });
      isFavorite = favResponse?.isFavorite || false;
    } catch (e) {}

    const formattedExplanation = parseMarkdown(data.explanation || '');

    body.innerHTML = `
      <div class="lch-explanation-section">
        <div class="lch-explanation-header">
          <span class="lch-explanation-icon">📖</span>
          <h3 class="lch-explanation-title">Problem Explanation</h3>
        </div>
        <div class="lch-explanation-content">${formattedExplanation}</div>
        ${data.keyPoints ? `
        <div class="lch-key-points">
          <h4 class="lch-key-points-title">Key Points:</h4>
          <ul class="lch-key-points-list">
            ${data.keyPoints.map(point => `<li>${parseMarkdown(point)}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        <div class="lch-explanation-actions">
          <button class="lch-get-hints-after-explanation" id="getHintsAfterExplanation">
            💡 Now Get Hints
          </button>
        </div>
      </div>
      <div class="lch-actions-section">
        <button class="lch-favorite-btn ${isFavorite ? 'active' : ''}" id="favoriteBtn">
          ${isFavorite ? '❤️ Favorited' : '🤍 Add to Favorites'}
        </button>
      </div>
    `;

    const getHintsBtn = body.querySelector('#getHintsAfterExplanation');
    if (getHintsBtn) {
      getHintsBtn.addEventListener('click', () => {
        loadHints();
      });
    }
    
    const favoriteBtn = body.querySelector('#favoriteBtn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', async () => {
        await toggleFavorite(favoriteBtn);
      });
    }
  }

  async function showHints(data) {
    const body = panel.querySelector('.lch-panel-body');
    
    const hintLabels = ['Gentle Push', 'Stronger Nudge', 'Almost There'];
    const hintClasses = ['hint-1', 'hint-2', 'hint-3'];
    
    const isCached = data.cached === true;
    const cacheInfo = isCached ? `
      <div class="lch-cache-info">
        <span class="lch-cache-badge">📦 Cached</span>
        <button class="lch-refresh-btn" title="Regenerate hints">🔄 Refresh</button>
      </div>
    ` : '';
    
    // Check if problem is in favorites
    let isFavorite = false;
    try {
      const favResponse = await safeSendMessage({ type: 'IS_FAVORITE', url: window.location.href });
      isFavorite = favResponse?.isFavorite || false;
    } catch (e) {}

    body.innerHTML = `
      ${data.topic ? `<div class="lch-topic-section">
        <div class="lch-topic-label">Problem Topic</div>
        <div class="lch-topic-badge">${escapeHtml(data.topic)}</div>
        ${cacheInfo}
      </div>` : `<div class="lch-topic-section">${cacheInfo}</div>`}
      <div class="lch-hints-section">
        ${data.hints.map((hint, i) => `
          <div class="lch-hint-card">
            <div class="lch-hint-header" data-hint="${i}">
              <div class="lch-hint-number">
                <span class="lch-hint-badge ${hintClasses[i]}">${i + 1}</span>
                <span class="lch-hint-title">${hintLabels[i]}</span>
              </div>
              <button class="lch-hint-reveal-btn">Reveal</button>
            </div>
            <div class="lch-hint-content" data-hint="${i}">
              ${formatHint(hint, i)}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="lch-actions-section">
        <button class="lch-favorite-btn ${isFavorite ? 'active' : ''}" id="favoriteBtn">
          ${isFavorite ? '❤️ Favorited' : '🤍 Add to Favorites'}
        </button>
      </div>
      <div class="lch-feedback-section" id="feedbackSection">
        <span class="lch-feedback-label">Were these hints helpful?</span>
        <div class="lch-feedback-buttons">
          <button class="lch-feedback-btn positive" data-rating="up" title="Helpful">👍</button>
          <button class="lch-feedback-btn negative" data-rating="down" title="Not helpful">👎</button>
        </div>
      </div>
    `;

    body.querySelectorAll('.lch-hint-header').forEach(header => {
      header.addEventListener('click', () => {
        const hintIndex = header.dataset.hint;
        const content = body.querySelector(`.lch-hint-content[data-hint="${hintIndex}"]`);
        const btn = header.querySelector('.lch-hint-reveal-btn');
        
        content.classList.toggle('revealed');
        btn.textContent = content.classList.contains('revealed') ? 'Hide' : 'Reveal';
      });
    });
    
    const refreshBtn = body.querySelector('.lch-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadHints(true);
      });
    }
    
    body.querySelectorAll('.lch-feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => handleFeedback(btn.dataset.rating, data));
    });
    
    // Add favorite button handler
    const favoriteBtn = body.querySelector('#favoriteBtn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', async () => {
        await toggleFavorite(favoriteBtn);
      });
    }
  }
  
  // Toggle favorite status
  async function toggleFavorite(btn) {
    if (!isExtensionContextValid() || !currentProblemData) return;
    
    const isCurrentlyFavorite = btn.classList.contains('active');
    
    try {
      if (isCurrentlyFavorite) {
        const id = `codeforces_${generateCacheKey(currentProblemData.url)}`;
        await safeSendMessage({ type: 'REMOVE_FAVORITE', id });
        btn.classList.remove('active');
        btn.innerHTML = '🤍 Add to Favorites';
      } else {
        await safeSendMessage({ type: 'ADD_FAVORITE', problem: currentProblemData });
        btn.classList.add('active');
        btn.innerHTML = '❤️ Favorited';
      }
    } catch (e) {
      console.log('LC Helper: Favorite toggle failed:', e.message);
    }
  }
  
  function handleFeedback(rating, hintData) {
    const feedbackSection = panel.querySelector('#feedbackSection');
    
    if (rating === 'up') {
      feedbackSection.innerHTML = `
        <div class="lch-feedback-thanks">
          <div class="lch-feedback-thanks-text">✨ Thanks for your feedback!</div>
        </div>
      `;
      console.log('Positive feedback:', hintData.topic);
    } else {
      feedbackSection.innerHTML = `
        <div class="lch-feedback-thanks">
          <div class="lch-feedback-improve">
            <div class="lch-feedback-improve-text">Sorry the hints weren't helpful.</div>
            <button class="lch-feedback-regenerate-btn">🔄 Try Different Hints</button>
          </div>
        </div>
      `;
      console.log('Negative feedback:', hintData.topic);
      
      feedbackSection.querySelector('.lch-feedback-regenerate-btn').addEventListener('click', () => {
        loadHints(true);
      });
    }
  }

  // Format hint text professionally
  function formatHint(hint, hintIndex) {
    if (!hint) return '';
    
    let formatted = hint.trim();
    
    // Remove redundant prefixes like "Hint 3:", "Implementation:", "Hint 3: Implementation:"
    formatted = formatted.replace(/^Hint\s+\d+\s*:?\s*/i, '');
    formatted = formatted.replace(/^Implementation\s*:?\s*/i, '');
    formatted = formatted.trim();
    
    // Split by numbered list items (1), 2), 3), etc.)
    // Pattern: number followed by ) and space, capturing everything until next number) or end
    const parts = [];
    let currentIndex = 0;
    
    // Find all numbered list items
    const listItemRegex = /(\d+\))\s+/g;
    const matches = [];
    let match;
    
    while ((match = listItemRegex.exec(formatted)) !== null) {
      matches.push({
        index: match.index,
        number: match[1],
        length: match[0].length
      });
    }
    
    // If we found numbered items, process them
    if (matches.length >= 2) {
      let htmlList = '<ol class="lch-hint-list">';
      let lastItemEnd = 0;
      
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index + matches[i].length;
        const end = (i < matches.length - 1) ? matches[i + 1].index : formatted.length;
        let itemText = formatted.substring(start, end).trim();
        lastItemEnd = end;
        
        // Clean up trailing periods/spaces
        itemText = itemText.replace(/^[.\s]+|[.\s]+$/g, '');
        
        if (itemText) {
          htmlList += `<li>${escapeHtml(itemText)}</li>`;
        }
      }
      
      htmlList += '</ol>';
      
      // Check for edge cases or additional notes after the last item
      const remainingText = formatted.substring(lastItemEnd).trim();
      
      if (remainingText && !remainingText.match(/^\d+\)/)) {
        // Check if it starts with "Edge cases" or "Edge case"
        const edgeCaseMatch = remainingText.match(/^(Edge\s+cases?:?\s*)(.+)$/i);
        if (edgeCaseMatch) {
          htmlList += `<div class="lch-hint-edge-cases"><strong>Edge Cases:</strong> ${escapeHtml(edgeCaseMatch[2])}</div>`;
        } else {
          htmlList += `<div class="lch-hint-note">${escapeHtml(remainingText)}</div>`;
        }
      }
      
      return htmlList;
    }
    
    // If not a numbered list, just escape and return
    return escapeHtml(formatted);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Parse markdown to HTML for professional formatting
  function parseMarkdown(text) {
    if (!text) return '';
    
    // First escape HTML to prevent XSS (but preserve structure)
    let html = escapeHtml(text);
    
    // Split into lines for better processing
    const lines = html.split('\n');
    const processedLines = [];
    let inParagraph = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      // Skip empty lines (they'll create paragraph breaks)
      if (!line) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        continue;
      }
      
      // Detect section headers (lines ending with ':' that are short and followed by content)
      if (line.endsWith(':') && line.length < 60 && nextLine && !nextLine.startsWith('-') && !nextLine.match(/^\d+\./)) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        // Format as section header
        const headerText = line.slice(0, -1); // Remove the colon
        processedLines.push(`<h4 class="lch-explanation-section-header">${headerText}</h4>`);
        continue;
      }
      
      // Detect list items (lines starting with "- " or numbered)
      if (line.match(/^[-•]\s+/) || line.match(/^\d+\.\s+/)) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        const listContent = line.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, '');
        processedLines.push(`<li class="lch-explanation-list-item">${listContent}</li>`);
        continue;
      }
      
      // Regular paragraph content
      if (!inParagraph) {
        processedLines.push('<p class="lch-explanation-paragraph">');
        inParagraph = true;
      } else {
        processedLines.push('<br>');
      }
      processedLines.push(line);
    }
    
    // Close any open paragraph
    if (inParagraph) {
      processedLines.push('</p>');
    }
    
    html = processedLines.join('');
    
    // Now process markdown formatting within the HTML
    // Convert **bold** to <strong> (handle nested cases)
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="lch-markdown-bold">$1</strong>');
    
    // Convert *italic* to <em> (but not if it's part of **bold**)
    html = html.replace(/(?<!\*)\*([^*\s][^*]*?[^*\s])\*(?!\*)/g, '<em class="lch-markdown-italic">$1</em>');
    
    // Convert `code` to <code>
    html = html.replace(/`([^`]+)`/g, '<code class="lch-markdown-code">$1</code>');
    
    // Wrap consecutive list items in ul tags
    // Replace patterns like: <li>...</li><li>...</li> with <ul><li>...</li><li>...</li></ul>
    html = html.replace(/(<li class="lch-explanation-list-item">[\s\S]*?<\/li>(?:\s*<li class="lch-explanation-list-item">[\s\S]*?<\/li>)*)/g, 
      (match) => {
        // Only wrap if not already wrapped
        if (!match.includes('<ul')) {
          return `<ul class="lch-explanation-list">${match}</ul>`;
        }
        return match;
      });
    
    return html;
  }

  function generateCacheKey(url) {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 100);
  }

})();

