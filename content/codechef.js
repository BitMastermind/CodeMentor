// LC Helper - CodeChef Content Script

(function () {
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
      setTimeout(doInit, 1500);
    } else {
      // Wait for body to be ready
      const bodyObserver = new MutationObserver((mutations, observer) => {
        if (document.body) {
          observer.disconnect();
          setTimeout(doInit, 1500);
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
        platform: 'codechef',
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
    const header = panel.querySelector('.lch-panel-header');
    
    // Show the panel header when showing quick actions
    if (header) {
      header.style.display = '';
    }

    // Extract problem data for favorites (lightweight, no API call)
    if (!currentProblemData) {
      try {
        const problemData = await extractProblemData();
        if (problemData.title) {
          currentProblemData = {
            url: window.location.href,
            title: problemData.title,
            platform: 'codechef',
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
    } catch (e) { }

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
    if (!panel) createPanel();
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
    if (!apiKey) { showSettingsPrompt(); return; }

    isLoading = true;
    showLoading();

    const problem = await extractProblemData();
    if (!problem.title || !problem.description) {
      showError('Could not extract problem data.');
      isLoading = false;
      return;
    }

    // Set currentProblemData for favorite button functionality
    currentProblemData = {
      url: window.location.href,
      title: problem.title,
      platform: 'codechef',
      difficulty: problem.difficulty
    };

    problem.forceRefresh = forceRefresh;

    try {
      if (!isExtensionContextValid()) {
        showError('Extension was reloaded. Please refresh the page.');
        isLoading = false;
        return;
      }

      const response = await chrome.runtime.sendMessage({ type: 'GET_HINTS', problem });
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

  async function explainProblem(forceRefresh = false) {
    if (!isExtensionContextValid()) {
      showError('Extension was reloaded. Please refresh the page.');
      return;
    }

    try {
      const { apiKey } = await safeStorageGet('apiKey');
      if (!apiKey) { showSettingsPrompt(); return; }

      isLoading = true;
      showLoading();

      const problem = await extractProblemData();
      if (!problem.title || !problem.description) {
        showError('Could not extract problem data.');
        isLoading = false;
        return;
      }

      if (!currentProblemData) {
        currentProblemData = {
          url: window.location.href,
          title: problem.title,
          platform: 'codechef',
          difficulty: problem.difficulty
        };
      }

      // Add force refresh flag
      problem.forceRefresh = forceRefresh;

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

  // Extract problem code from CodeChef URL
  // Examples:
  // - https://www.codechef.com/problems/FLOW001
  // - https://www.codechef.com/START51D/problems/FLOW001
  // - https://www.codechef.com/practice/problems/FLOW001
  function parseProblemCodeFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      // Pattern: /problems/{CODE} or /{CONTEST}/problems/{CODE} or /practice/problems/{CODE}
      const problemsIndex = pathParts.indexOf('problems');
      if (problemsIndex >= 0 && problemsIndex < pathParts.length - 1) {
        return pathParts[problemsIndex + 1];
      }

      // Pattern: /problemset/{CODE}
      const problemsetIndex = pathParts.indexOf('problemset');
      if (problemsetIndex >= 0 && problemsetIndex < pathParts.length - 1) {
        return pathParts[problemsetIndex + 1];
      }
    } catch (e) {
      console.log('LC Helper: Failed to parse CodeChef URL:', e.message);
    }
    return null;
  }

  // Utility function to wait for DOM elements with retry logic (handles slow networks)
  async function waitForElement(selectors, options = {}) {
    const {
      timeout = 10000, // 10 seconds default timeout
      retryInterval = 500, // Start with 500ms intervals
      minContentLength = 0, // Minimum text content length
      checkContent = null // Custom function to check if element is ready
    } = options;

    const startTime = Date.now();
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

    // First, try immediate check
    for (const selector of selectorArray) {
      const element = document.querySelector(selector);
      if (element) {
        // Check if element has sufficient content
        if (minContentLength > 0 && element.textContent.trim().length < minContentLength) {
          // Element exists but content not loaded yet, continue to waiting logic
        } else if (checkContent && !checkContent(element)) {
          // Custom check failed, continue to waiting logic
        } else {
          return element;
        }
      }
    }

    // If not found immediately, use MutationObserver with retry logic
    return new Promise((resolve, reject) => {
      let retryCount = 0;
      const maxRetries = Math.floor(timeout / retryInterval);

      const observer = new MutationObserver(() => {
        for (const selector of selectorArray) {
          const element = document.querySelector(selector);
          if (element) {
            // Check if element has sufficient content
            if (minContentLength > 0 && element.textContent.trim().length < minContentLength) {
              continue; // Content not ready yet
            }
            if (checkContent && !checkContent(element)) {
              continue; // Custom check failed
            }

            observer.disconnect();
            resolve(element);
            return;
          }
        }

        // Retry with exponential backoff
        retryCount++;
        if (retryCount >= maxRetries) {
          observer.disconnect();
          reject(new Error(`Element not found after ${timeout}ms. Tried selectors: ${selectorArray.join(', ')}`));
        }
      });

      // Start observing
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      // Fallback timeout
      setTimeout(() => {
        observer.disconnect();
        // Final attempt
        for (const selector of selectorArray) {
          const element = document.querySelector(selector);
          if (element && (minContentLength === 0 || element.textContent.trim().length >= minContentLength)) {
            if (!checkContent || checkContent(element)) {
              resolve(element);
              return;
            }
          }
        }
        reject(new Error(`Element not found after ${timeout}ms. Tried selectors: ${selectorArray.join(', ')}`));
      }, timeout);
    });
  }

  // Extract problem data using raw HTML approach (future-proof, LLM handles parsing)
  async function extractProblemData() {
    // Extract problem code from URL (for logging)
    const problemCode = parseProblemCodeFromUrl(window.location.href);
    if (problemCode) {
      console.log('LC Helper: CodeChef problem code:', problemCode);
    }

    // Note: CodeChef does not have an official API for problem statements
    // We send raw HTML to LLM which intelligently parses it

    // Wait for problem statement container with retry logic (handles slow networks)
    // Prioritize the tab panel content which contains only the problem text
    let problemDiv;
    try {
      problemDiv = await waitForElement([
        '#vertical-tab-panel-0',  // CodeChef new UI - Statement tab content
        '[class*="_tab__content"]',  // Tab content area (problem statement only)
        '#problem-statement',  // ID selector - most specific
        '.problem-statement',  // Class selector
        '.problemstatement',
        '[class*="problem-statement"]',
        '[data-testid="problem-statement"]',
        '.problem-body'
      ], {
        timeout: 15000, // 15 seconds for slow networks
        minContentLength: 100 // Ensure it has actual content
      });
    } catch (error) {
      console.error('LC Helper: Failed to find problem statement:', error);
      throw new Error('Problem statement not found. The page may still be loading. Please wait a moment and try again.');
    }

    // Extract title (for metadata) - wait for it if needed
    let titleEl;
    try {
      titleEl = await waitForElement([
        'h1',
        '.problem-name',
        '[class*="problem-title"]',
        '[class*="ProblemHeader"] h1',
        '[data-testid="problem-title"]'
      ], {
        timeout: 5000,
        minContentLength: 1
      });
    } catch (e) {
      // Title not critical, try direct query as fallback
      titleEl = document.querySelector('h1') ||
        document.querySelector('.problem-name') ||
        document.querySelector('[class*="problem-title"]') ||
        document.querySelector('[class*="ProblemHeader"] h1') ||
        document.querySelector('[data-testid="problem-title"]');
    }
    const title = titleEl?.textContent?.trim() || '';

    // Extract difficulty (for metadata)
    let difficulty = 'Unknown';
    const difficultyEl = document.querySelector('.difficulty, [class*="difficulty"]') ||
      document.querySelector('[class*="star"]');
    if (difficultyEl) {
      difficulty = difficultyEl.textContent.trim();
    }

    // Check for difficulty in breadcrumbs or sidebar
    const breadcrumbDifficulty = document.querySelector('[href*="easy"], [href*="medium"], [href*="hard"]');
    if (breadcrumbDifficulty && difficulty === 'Unknown') {
      const href = breadcrumbDifficulty.getAttribute('href') || '';
      if (href.includes('easy')) difficulty = 'Easy';
      else if (href.includes('medium')) difficulty = 'Medium';
      else if (href.includes('hard')) difficulty = 'Hard';
    }

    // Extract tags (for metadata)
    let tags = '';
    const tagElements = document.querySelectorAll('.tags a, [class*="tag"], [class*="topic"]');
    if (tagElements.length > 0) {
      tags = Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 5)
        .join(', ');
    }

    // Clean HTML to reduce token usage (aggressive cleaning for CodeChef)
    function cleanHTML(clone) {
      // Remove script tags (except math/tex which we need), style tags, noscript
      clone.querySelectorAll('script:not([type*="math"]), style, noscript, link').forEach(el => el.remove());

      // Remove CodeChef-specific non-problem elements
      // IDE section (code editor, run/submit buttons, language selector)
      clone.querySelectorAll('[class*="_ide__container"], [class*="ide-container"], [class*="CodeMirror"], [class*="ace_editor"], [class*="monaco-editor"]').forEach(el => el.remove());

      // Tabs (Statement, Hints, Submissions, Solution, AI Help)
      clone.querySelectorAll('[role="tablist"], [role="tab"], [class*="_tab__"], [class*="MuiTab-"]').forEach(el => el.remove());

      // Navigation elements (back link, prev/next problem)
      clone.querySelectorAll('[class*="_backToPractice"], [class*="back-to"], [class*="_prev"], [class*="_next"], [class*="problem-nav"]').forEach(el => el.remove());

      // AI Tutor and learning promotion sections
      clone.querySelectorAll('[class*="ai-tutor"], [class*="tutor-mode"], [class*="start-learning"], [class*="_aiTutor"]').forEach(el => el.remove());

      // Material-UI components (buttons, selects, accordions, etc.)
      clone.querySelectorAll('[class*="MuiButton"], [class*="MuiSelect"], [class*="MuiAccordion"], [class*="MuiIconButton"], [class*="MuiSvgIcon"]').forEach(el => el.remove());

      // Custom input section, visualize code, run/submit buttons
      clone.querySelectorAll('[class*="custom-input"], [class*="visualize"], [class*="_run"], [class*="_submit"], button').forEach(el => el.remove());

      // Problem metadata that's not useful for solving (author, submissions count, success rate)
      clone.querySelectorAll('[class*="author"], [class*="submissions"], [class*="success-rate"], [class*="_stats"], [class*="problem-info"]').forEach(el => el.remove());

      // Difficulty badges and star ratings (already extracted separately)
      clone.querySelectorAll('[class*="difficulty"], [class*="_star"], [class*="rating-badge"]').forEach(el => el.remove());

      // Navigation, sidebar, drawer, footer
      clone.querySelectorAll('nav, .nav, .navigation, .menu, .sidebar, .MuiDrawer-root, [class*="Drawer"], [class*="sidebar"], .footer').forEach(el => el.remove());

      // Remove hidden elements
      clone.querySelectorAll('[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"], .hidden, [hidden]').forEach(el => el.remove());

      // Remove MathJax rendered output (keep only our converted LaTeX)
      clone.querySelectorAll('.MathJax, .MathJax_Preview, .MathJax_Display, .mjx-chtml, .mjx-math, [class*="MathJax"]').forEach(el => el.remove());

      // Remove SVG icons and decorative elements (not images in problem)
      clone.querySelectorAll('svg:not([class*="problem"]):not([class*="figure"]):not([class*="diagram"])').forEach(el => el.remove());

      // Remove empty elements (multiple passes for nested empties)
      for (let i = 0; i < 3; i++) {
        clone.querySelectorAll('div:empty, span:empty, p:empty').forEach(el => el.remove());
      }

      // Remove ALL attributes except href, src, alt (strips class, id, style, data-*, etc.)
      clone.querySelectorAll('*').forEach(el => {
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt');
        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
        if (href) el.setAttribute('href', href);
        if (src) el.setAttribute('src', src);
        if (alt) el.setAttribute('alt', alt);
      });

      return clone;
    }

    // Compress HTML output
    function getCleanTextContent(element) {
      let html = element.innerHTML;
      html = html.replace(/\s+/g, ' ');
      html = html.replace(/<!--[\s\S]*?-->/g, '');
      html = html.replace(/<(\w+)[^>]*>\s*<\/\1>/g, '');
      return html.trim();
    }

    // Convert MathJax script tags to LaTeX notation (for LLM)
    function convertMathJaxToLaTeX(element) {
      if (!element) return '';

      const clone = element.cloneNode(true);

      // First, convert MathJax BEFORE cleaning (so we preserve math/tex scripts)
      // Convert inline MathJax: <script type="math/tex">...</script> -> $...$
      const inlineMath = clone.querySelectorAll('script[type="math/tex"]');
      inlineMath.forEach(script => {
        const latex = script.textContent;
        const span = document.createElement('span');
        span.textContent = `$${latex}$`;
        if (script.parentNode) {
          script.parentNode.replaceChild(span, script);
        }
      });

      // Convert display MathJax: <script type="math/tex; mode=display">...</script> -> $$...$$
      const displayMath = clone.querySelectorAll('script[type="math/tex; mode=display"]');
      displayMath.forEach(script => {
        const latex = script.textContent;
        const div = document.createElement('div');
        div.textContent = `$$${latex}$$`;
        if (script.parentNode) {
          script.parentNode.replaceChild(div, script);
        }
      });

      // Now clean the HTML to reduce tokens
      cleanHTML(clone);

      // Apply final compression
      const cleanHtml = getCleanTextContent(clone);

      console.log(`[LC Helper] HTML Reduction: ${originalLength} chars -> ${cleanHtml.length} chars (-${Math.round((1 - cleanHtml.length / originalLength) * 100)}%)`);

      return cleanHtml;
    }

    // Get HTML with MathJax converted to LaTeX
    const originalLength = problemDiv.innerHTML.length;
    const problemHTML = convertMathJaxToLaTeX(problemDiv, originalLength);

    // Check if problem has images/graphs
    const hasImages = problemDiv.querySelectorAll('img, svg, canvas').length > 0;

    const baseData = {
      title: title,
      description: problemHTML, // Send HTML as description (LLM will parse it)
      html: problemHTML, // Also include in html field for consistency
      difficulty: difficulty,
      tags: tags,
      url: window.location.href,
      hasImages: hasImages
    };

    // Log extracted data
    console.log('='.repeat(80));
    console.log('LC Helper - CodeChef Problem Data (HTML-based extraction)');
    console.log('='.repeat(80));
    console.log('📡 Data Source: Raw HTML (LLM will parse intelligently)');
    if (problemCode) {
      console.log('📋 Problem Code:', problemCode);
    }
    console.log('📌 Title:', baseData.title);
    console.log('📊 Difficulty:', baseData.difficulty);
    console.log('🏷️ Tags:', baseData.tags || 'None found');
    console.log('📝 HTML Length:', problemHTML.length, 'characters');
    console.log('🖼️ Has Images:', hasImages);
    console.log('🔗 URL:', baseData.url);
    console.log('='.repeat(80));

    // Capture images if available
    if (hasImages && typeof html2canvas !== 'undefined') {
      try {
        const canvas = await html2canvas(problemDiv, {
          allowTaint: true,
          useCORS: true,
          scale: 1.5,
          logging: false,
          backgroundColor: '#ffffff'
        });

        const optimizedImage = optimizeImageData(canvas);

        return {
          ...baseData,
          hasImages: true,
          imageData: optimizedImage
        };
      } catch (error) {
        console.error('LC Helper: Failed to capture image:', error);
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
    panel.querySelector('.lch-panel-body').innerHTML = `
      <div class="lch-loading">
        <div class="lch-spinner"></div>
        <span class="lch-loading-text">Analyzing problem...</span>
      </div>`;
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
        <div class="lch-error-buttons">
          <button class="lch-back-btn">Back</button>
          <button class="lch-retry-btn">Try Again</button>
        </div>
      </div>`;

    body.querySelector('.lch-retry-btn').addEventListener('click', loadHints);
    body.querySelector('.lch-back-btn').addEventListener('click', async () => {
      await showQuickActions();
    });
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
            platform: 'codechef',
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
    } catch (e) { }

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

  // Helper function to extract clean text from potential JSON/markdown-wrapped content
  function extractCleanExplanation(str) {
    if (!str || typeof str !== 'string') return str;
    
    let cleaned = str.trim();
    
    // Try to extract from markdown code blocks first
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    } else {
      // Check for unclosed code blocks
      const unclosedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*)/);
      if (unclosedMatch) {
        cleaned = unclosedMatch[1].trim();
      }
    }
    
    // If cleaned looks like JSON, try to extract explanation
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && parsed.explanation) {
          return { explanation: parsed.explanation, keyPoints: parsed.keyPoints };
        }
      } catch (e) {
        // Try to extract explanation field with regex
        const explanationMatch = cleaned.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (explanationMatch) {
          try {
            return { explanation: JSON.parse('"' + explanationMatch[1] + '"') };
          } catch (e2) {
            return { explanation: explanationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') };
          }
        }
      }
    }
    
    return null;
  }

  async function showExplanation(data) {
    const body = panel.querySelector('.lch-panel-body');
    const header = panel.querySelector('.lch-panel-header');

    // Hide the panel header when showing explanation
    if (header) {
      header.style.display = 'none';
    }

    let isFavorite = false;
    try {
      const favResponse = await safeSendMessage({ type: 'IS_FAVORITE', url: window.location.href });
      isFavorite = favResponse?.isFavorite || false;
    } catch (e) { }

    // Parse response if it's a JSON string (matching leetcode.js logic)
    let explanationData = data;
    if (typeof data === 'string') {
      try {
        explanationData = JSON.parse(data);
      } catch (e) {
        // If parsing fails, treat the whole string as explanation
        explanationData = { explanation: data };
      }
    }

    // Handle cases where explanation contains JSON or markdown-wrapped JSON
    if (explanationData && explanationData.explanation && typeof explanationData.explanation === 'string') {
      const explanationStr = explanationData.explanation.trim();
      
      // Check if explanation looks like JSON or markdown-wrapped JSON
      if (explanationStr.startsWith('{') || explanationStr.startsWith('`') || 
          explanationStr.startsWith('[') || explanationStr.startsWith('"') ||
          explanationStr.includes('```json') || explanationStr.includes('"explanation"')) {
        
        const extracted = extractCleanExplanation(explanationStr);
        if (extracted && extracted.explanation) {
          explanationData = { ...explanationData, ...extracted };
        } else {
          // Try direct JSON parse for simple cases
          try {
            let jsonStr = explanationStr;
            if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
              jsonStr = JSON.parse(jsonStr);
            }
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object' && parsed.explanation) {
              explanationData = { ...explanationData, ...parsed };
            } else if (parsed && typeof parsed === 'object') {
              explanationData = { ...explanationData, ...parsed };
            }
          } catch (e) {
            // If all parsing fails, use as is
            console.log('[LC Helper] Explanation is not JSON, using as markdown:', e.message);
          }
        }
      }
    }

    const explanationText = explanationData.explanation || '';
    const keyPoints = explanationData.keyPoints;
    const formattedExplanation = parseMarkdown(explanationText);

    // Check if explanation is from cache
    const isCached = data.cached === true;

    body.innerHTML = `
      <div class="lch-explanation-fullview">
        <div class="lch-explanation-toolbar">
          <button class="lch-toolbar-btn" id="backToMain" title="Back to menu">
            <svg width="18" height="18" viewBox="0 0 16 16">
              <path d="M10 14L4 8l6-6"/>
            </svg>
          </button>
          ${isCached ? `<button class="lch-toolbar-btn lch-refresh-small" id="refreshExplanation" title="Regenerate explanation">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M13.5 8c0 3-2.5 5.5-5.5 5.5S2.5 11 2.5 8 5 2.5 8 2.5c1.5 0 2.9.6 3.9 1.6"/>
              <path d="M12 4.5V1.5L15 4.5H12z"/>
            </svg>
          </button>` : ''}
        </div>
        <div class="lch-explanation-reader">
          <div class="lch-explanation-text">${formattedExplanation}</div>
          ${keyPoints && Array.isArray(keyPoints) && keyPoints.length > 0 ? `
          <div class="lch-key-points-reader">
            <h4 class="lch-key-points-heading">Key Points</h4>
            <ul class="lch-key-points-items">
              ${keyPoints.map(point => `<li>${parseMarkdown(point)}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
        </div>
        <div class="lch-explanation-footer">
          <button class="lch-footer-btn lch-footer-hints" id="getHintsAfterExplanation">
            💡 Get Hints
          </button>
          <button class="lch-footer-btn lch-footer-fav ${isFavorite ? 'active' : ''}" id="favoriteBtn">
            ${isFavorite ? '❤️' : '🤍'}
          </button>
        </div>
      </div>
    `;

    // Trigger MathJax rendering if available (CodeChef may use MathJax)
    const explanationContent = body.querySelector('.lch-explanation-text');
    if (explanationContent && window.MathJax && window.MathJax.typesetPromise) {
      try {
        window.MathJax.typesetPromise([explanationContent]).catch((err) => {
          console.log('LC Helper: MathJax rendering error:', err);
        });
      } catch (e) {
        console.log('LC Helper: MathJax not available or error:', e);
      }
    } else if (explanationContent && window.MathJax && window.MathJax.Hub) {
      // Fallback for older MathJax versions
      try {
        window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, explanationContent]);
      } catch (e) {
        console.log('LC Helper: MathJax Hub error:', e);
      }
    }

    // Add back button listener
    const backBtn = body.querySelector('#backToMain');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        showQuickActions();
      });
    }

    // Add refresh handler if cached
    const refreshBtn = body.querySelector('#refreshExplanation');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        explainProblem(true); // Force refresh
      });
    }

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
    const header = panel.querySelector('.lch-panel-header');

    // Hide the panel header when showing hints
    if (header) {
      header.style.display = 'none';
    }

    const labels = ['Gentle Push', 'Stronger Nudge', 'Almost There'];
    const classes = ['hint-1', 'hint-2', 'hint-3'];

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
    } catch (e) { }

    body.innerHTML = `
      <div class="lch-explanation-fullview">
        <div class="lch-explanation-toolbar">
          <button class="lch-toolbar-btn" id="backToMain" title="Back to menu">
            <svg width="18" height="18" viewBox="0 0 16 16">
              <path d="M10 14L4 8l6-6"/>
            </svg>
          </button>
          ${isCached ? `<button class="lch-toolbar-btn lch-refresh-small" id="refreshHints" title="Regenerate hints">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M13.5 8c0 3-2.5 5.5-5.5 5.5S2.5 11 2.5 8 5 2.5 8 2.5c1.5 0 2.9.6 3.9 1.6"/>
              <path d="M12 4.5V1.5L15 4.5H12z"/>
            </svg>
          </button>` : ''}
        </div>
        <div class="lch-explanation-reader">
          ${data.topic ? `
          <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; font-weight: bold;">Problem Topic</div>
            <div style="display: inline-block; background: rgba(139, 92, 246, 0.2); color: #a78bfa; padding: 4px 12px; border-radius: 12px; font-size: 14px;">${escapeHtml(data.topic)}</div>
          </div>
          ` : ''}
          ${data.hints.map((hint, i) => `
            <div class="lch-hint-card">
              <div class="lch-hint-header" data-hint="${i}">
                <div class="lch-hint-number">
                  <span class="lch-hint-badge ${classes[i]}">${i + 1}</span>
                  <span class="lch-hint-title">${labels[i]}</span>
                </div>
                <button class="lch-hint-reveal-btn">Reveal</button>
              </div>
              <div class="lch-hint-content" data-hint="${i}">${formatHint(hint, i)}</div>
            </div>
          `).join('')}
        </div>
        <div class="lch-explanation-footer">
          <button class="lch-footer-btn lch-footer-fav ${isFavorite ? 'active' : ''}" id="favoriteBtn">
            ${isFavorite ? '❤️' : '🤍'}
          </button>
          <div class="lch-feedback-section" id="feedbackSection" style="display: flex; align-items: center; gap: 12px;">
            <span class="lch-feedback-label" style="color: #888; font-size: 14px;">Were these hints helpful?</span>
            <div class="lch-feedback-buttons" style="display: flex; gap: 8px;">
              <button class="lch-feedback-btn positive" data-rating="up" title="Helpful" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 6px; cursor: pointer;">👍</button>
              <button class="lch-feedback-btn negative" data-rating="down" title="Not helpful" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 6px; cursor: pointer;">👎</button>
            </div>
          </div>
        </div>
      </div>`;

    // Add back button listener
    const backBtn = body.querySelector('#backToMain');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Show header again when going back
        if (header) {
          header.style.display = '';
        }
        showQuickActions();
      });
    }

    body.querySelectorAll('.lch-hint-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx = header.dataset.hint;
        const content = body.querySelector(`.lch-hint-content[data-hint="${idx}"]`);
        const btn = header.querySelector('.lch-hint-reveal-btn');
        content.classList.toggle('revealed');
        btn.textContent = content.classList.contains('revealed') ? 'Hide' : 'Reveal';
      });
    });

    const refreshBtn = body.querySelector('#refreshHints');
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
        const id = `codechef_${generateCacheKey(currentProblemData.url)}`;
        const response = await safeSendMessage({ type: 'REMOVE_FAVORITE', id });
        if (response && response.success) {
          btn.classList.remove('active');
          btn.innerHTML = '🤍 Add to Favorites';
        }
      } else {
        const response = await safeSendMessage({ type: 'ADD_FAVORITE', problem: currentProblemData });
        if (response && response.success) {
          btn.classList.add('active');
          btn.innerHTML = '❤️ Favorited';
        } else if (response && response.error) {
          // Show error message for limit exceeded or other errors
          alert(response.error);
        }
      }
    } catch (e) {
      console.error('LC Helper: Error toggling favorite:', e);
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

    // Convert literal \n strings to actual newlines (handles improperly escaped AI responses)
    // Note: We don't replace \\\\ -> \\ as parseMarkdown handles math notation
    formatted = formatted
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');

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
          // Parse markdown in list items
          htmlList += `<li>${parseMarkdown(itemText)}</li>`;
        }
      }

      htmlList += '</ol>';

      // Check for edge cases or additional notes after the last item
      const remainingText = formatted.substring(lastItemEnd).trim();

      if (remainingText && !remainingText.match(/^\d+\)/)) {
        // Check if it starts with "Edge cases" or "Edge case"
        const edgeCaseMatch = remainingText.match(/^(Edge\s+cases?:?\s*)(.+)$/i);
        if (edgeCaseMatch) {
          htmlList += `<div class="lch-hint-edge-cases"><strong>Edge Cases:</strong> ${parseMarkdown(edgeCaseMatch[2])}</div>`;
        } else {
          htmlList += `<div class="lch-hint-note">${parseMarkdown(remainingText)}</div>`;
        }
      }

      return htmlList;
    }

    // If not a numbered list, parse markdown and return
    return parseMarkdown(formatted);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Parse markdown to HTML for professional formatting
  function parseMarkdown(text) {
    if (!text) return '';

    let processedText = text;

    // STEP 1: Extract LaTeX math FIRST (before any string replacements that might corrupt it)
    const mathPlaceholders = [];

    // Process display math blocks \[...\] (non-greedy match)
    // Handle both single and double-escaped backslashes from JSON
    processedText = processedText.replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, function (match, content) {
      const placeholder = `__MATH_DISPLAY_${mathPlaceholders.length}__`;
      // Use styled span for CodeChef (may have MathJax)
      mathPlaceholders.push(`<span class="lch-math-display">${escapeHtml(content.trim())}</span>`);
      return placeholder;
    });

    // Process inline math \(...\) (non-greedy, handle newlines in content)
    // Handle both single and double-escaped backslashes from JSON
    processedText = processedText.replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, function (match, content) {
      const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
      mathPlaceholders.push(`<span class="lch-math-inline">${escapeHtml(content)}</span>`);
      return placeholder;
    });

    // Also handle $...$ and $$...$$ notation (common in AI responses)
    // Display math: $$...$$
    processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, function (match, content) {
      const placeholder = `__MATH_DISPLAY_${mathPlaceholders.length}__`;
      mathPlaceholders.push(`<span class="lch-math-display">${escapeHtml(content.trim())}</span>`);
      return placeholder;
    });

    // Inline math: $...$ (but not $$)
    processedText = processedText.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, function (match, content) {
      const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
      mathPlaceholders.push(`<span class="lch-math-inline">${escapeHtml(content)}</span>`);
      return placeholder;
    });

    // STEP 2: Now convert literal \n strings to actual newlines (AFTER extracting math)
    // This handles cases where AI returns escaped newlines that weren't properly unescaped
    processedText = processedText
      .replace(/\\n/g, '\n')  // Convert literal \n to actual newline
      .replace(/\\"/g, '"');   // Convert escaped quotes
    // Note: We don't replace \\\\ -> \\ anymore as it can corrupt math notation

    // First escape HTML to prevent XSS (but preserve structure)
    let html = escapeHtml(processedText);

    // Restore math spans
    mathPlaceholders.forEach((mathTag, index) => {
      const displayPattern = `__MATH_DISPLAY_${index}__`;
      const inlinePattern = `__MATH_INLINE_${index}__`;
      if (html.includes(displayPattern)) {
        html = html.replace(displayPattern, mathTag);
      } else if (html.includes(inlinePattern)) {
        html = html.replace(inlinePattern, mathTag);
      }
    });

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

      // Handle markdown headers (# syntax)
      if (line.startsWith('### ')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        processedLines.push(`<h4 class="lch-explanation-section-header">${line.substring(4)}</h4>`);
        continue;
      } else if (line.startsWith('## ')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        processedLines.push(`<h4 class="lch-explanation-section-header">${line.substring(3)}</h4>`);
        continue;
      } else if (line.startsWith('# ')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        processedLines.push(`<h4 class="lch-explanation-section-header">${line.substring(2)}</h4>`);
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

