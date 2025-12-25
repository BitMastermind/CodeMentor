// CodeMentor - Codeforces Content Script

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
      return {};
    }
    try {
      return await chrome.storage.sync.get(key);
    } catch (e) {
      return {};
    }
  }

  // Safe wrapper for chrome.runtime.sendMessage
  async function safeSendMessage(message) {
    if (!isExtensionContextValid()) {
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
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
    } else if (event.data && event.data.type === 'LCH_TEST_SCRAPING') {
      // Test scraping accuracy
      try {
        const problem = await extractProblemData();
        const response = await safeSendMessage({
          type: 'TEST_SCRAPING_ACCURACY',
          problem: problem
        });

        // Send response back to page
        window.postMessage({
          type: 'LCH_TEST_RESPONSE',
          success: response?.success || false,
          comparison: response?.comparison || null,
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

  // Show human-readable converted problem statement
  function showScrapingComparison(comparison) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 100000;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      max-width: 900px;
      margin: 20px auto;
      background: #1e1e1e;
      border-radius: 12px;
      padding: 24px;
      color: #e0e0e0;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 2px solid #333;
      padding-bottom: 16px;
    `;

    const title = document.createElement('h2');
    title.textContent = '📄 Human-Readable Problem Statement';
    title.style.cssText = 'margin: 0; color: #fff; font-size: 24px;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: #ff4444;
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
    `;
    closeBtn.onclick = () => modal.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Get LLM converted data (human-readable version)
    const llmData = comparison.llmInterpretation;
    if (!llmData) {
      const errorDiv = document.createElement('div');
      errorDiv.textContent = 'No converted data available';
      errorDiv.style.cssText = 'color: #ff4444; padding: 20px; text-align: center;';
      content.appendChild(header);
      content.appendChild(errorDiv);
      modal.appendChild(content);
      document.body.appendChild(modal);
      return;
    }

    // Problem Title
    if (llmData.title) {
      const titleDiv = document.createElement('div');
      titleDiv.style.cssText = 'margin-bottom: 24px;';
      titleDiv.innerHTML = `
        <div style="color: #fff; font-size: 28px; font-weight: bold;">
          ${escapeHtml(llmData.title)}
        </div>
      `;
      content.appendChild(titleDiv);
    }

    // Problem Description
    if (llmData.description || llmData.summary) {
      const descDiv = document.createElement('div');
      descDiv.style.cssText = 'margin-bottom: 24px;';
      descDiv.innerHTML = `
        <div style="color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; font-weight: bold;">
          Problem Statement
        </div>
        <div style="color: #e0e0e0; font-size: 16px; line-height: 1.8; white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 16px; border-radius: 6px;">
          ${escapeHtml(llmData.description || llmData.summary || '')}
        </div>
      `;
      content.appendChild(descDiv);
    }

    // Input Format
    if (llmData.inputFormat || llmData.inputDescription) {
      const inputDiv = document.createElement('div');
      inputDiv.style.cssText = 'margin-bottom: 24px;';
      inputDiv.innerHTML = `
        <div style="color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; font-weight: bold;">
          Input Format
        </div>
        <div style="color: #e0e0e0; font-size: 15px; line-height: 1.8; white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 16px; border-radius: 6px;">
          ${escapeHtml(llmData.inputFormat || llmData.inputDescription || '')}
        </div>
      `;
      content.appendChild(inputDiv);
    }

    // Output Format
    if (llmData.outputFormat || llmData.outputDescription) {
      const outputDiv = document.createElement('div');
      outputDiv.style.cssText = 'margin-bottom: 24px;';
      outputDiv.innerHTML = `
        <div style="color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; font-weight: bold;">
          Output Format
        </div>
        <div style="color: #e0e0e0; font-size: 15px; line-height: 1.8; white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 16px; border-radius: 6px;">
          ${escapeHtml(llmData.outputFormat || llmData.outputDescription || '')}
        </div>
      `;
      content.appendChild(outputDiv);
    }

    // Constraints
    if (llmData.constraints) {
      const constraintsDiv = document.createElement('div');
      constraintsDiv.style.cssText = 'margin-bottom: 24px;';
      constraintsDiv.innerHTML = `
        <div style="color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; font-weight: bold;">
          Constraints
        </div>
        <div style="color: #ffa500; font-size: 15px; line-height: 1.8; white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 16px; border-radius: 6px; font-family: monospace;">
          ${escapeHtml(llmData.constraints)}
        </div>
      `;
      content.appendChild(constraintsDiv);
    }

    // Examples
    let examples = llmData.examples;
    if (!Array.isArray(examples)) {
      examples = [];
    }
    if (examples.length > 0) {
      const examplesDiv = document.createElement('div');
      examplesDiv.style.cssText = 'margin-bottom: 24px;';
      const examplesHeader = document.createElement('div');
      examplesHeader.textContent = `Examples (${examples.length})`;
      examplesHeader.style.cssText = 'color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 16px; font-weight: bold;';
      examplesDiv.appendChild(examplesHeader);

      examples.forEach((ex, i) => {
        const exDiv = document.createElement('div');
        exDiv.style.cssText = `
          background: rgba(0,0,0,0.5);
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 16px;
          border-left: 4px solid #4caf50;
        `;
        exDiv.innerHTML = `
          <div style="color: #4caf50; font-weight: bold; font-size: 18px; margin-bottom: 16px;">
            Example ${i + 1}
          </div>
          <div style="margin-bottom: 16px;">
            <div style="color: #4caf50; font-size: 13px; text-transform: uppercase; margin-bottom: 8px; font-weight: bold;">Input:</div>
            <div style="color: #e0e0e0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 14px; background: rgba(0,0,0,0.5); padding: 12px; border-radius: 4px; overflow-x: auto;">
              ${escapeHtml(ex.input || 'N/A')}
            </div>
          </div>
          <div>
            <div style="color: #4caf50; font-size: 13px; text-transform: uppercase; margin-bottom: 8px; font-weight: bold;">Output:</div>
            <div style="color: #e0e0e0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 14px; background: rgba(0,0,0,0.5); padding: 12px; border-radius: 4px; overflow-x: auto;">
              ${escapeHtml(ex.output || 'N/A')}
            </div>
          </div>
        `;
        examplesDiv.appendChild(exDiv);
      });

      content.appendChild(examplesDiv);
    }

    // Notes
    if (llmData.notes) {
      const notesDiv = document.createElement('div');
      notesDiv.style.cssText = 'margin-top: 24px; padding-top: 24px; border-top: 2px solid #444;';
      notesDiv.innerHTML = `
        <div style="color: #888; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; font-weight: bold;">
          Notes
        </div>
        <div style="color: #ffd700; font-size: 15px; line-height: 1.8; white-space: pre-wrap; font-style: italic; background: rgba(0,0,0,0.3); padding: 16px; border-radius: 6px;">
          ${escapeHtml(llmData.notes)}
        </div>
      `;
      content.appendChild(notesDiv);
    }

    content.appendChild(header);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  // Expose test function to content script context
  // Note: To access from page console, use: window.postMessage({type: 'LCH_TEST_SCRAPING'}, '*')
  // Or switch to Extension context in DevTools console dropdown
  window.testScrapingAccuracy = async function () {
    try {
      const problem = await extractProblemData();

      const response = await safeSendMessage({
        type: 'TEST_SCRAPING_ACCURACY',
        problem: problem
      });

      if (response?.success) {
        // Show visual comparison modal
        showScrapingComparison(response.comparison);
        return response.comparison;
      } else {
        console.error('❌ Test failed:', response?.error);
        return null;
      }
    } catch (error) {
      console.error('❌ Test error:', error);
      return null;
    }
  };

  // Also expose via page message for page console access
  // Listen for page messages requesting the test
  window.addEventListener('message', async (event) => {
    // Only handle messages from the page itself
    if (event.source !== window) return;

    if (event.data && event.data.type === 'LCH_CALL_TEST_SCRAPING') {
      try {
        const result = await window.testScrapingAccuracy();
        window.postMessage({
          type: 'LCH_TEST_RESULT',
          success: true,
          result: result
        }, '*');
      } catch (error) {
        window.postMessage({
          type: 'LCH_TEST_RESULT',
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
      console.log('CodeMentor: Timer init failed:', e.message);
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
    fab.title = 'CodeMentor - Get Hints';
    fab.setAttribute('aria-label', 'CodeMentor - Get Hints');
    fab.addEventListener('click', togglePanel);

    try {
      document.body.appendChild(fab);
    } catch (e) {
      console.error('CodeMentor: Failed to append FAB:', e);
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
            <h3 class="lch-panel-title">CodeMentor</h3>
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
            platform: 'codeforces',
            difficulty: problemData.difficulty
          };
        }
      } catch (e) {
        console.log('CodeMentor: Could not extract problem data:', e.message);
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
            ❤️
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

  async function explainProblem(forceRefresh = false) {
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
      // Failed to parse Codeforces URL
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
        console.log('CodeMentor: Codeforces API request failed:', response.status);
        return null;
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.result || !data.result.problems) {
        console.log('CodeMentor: Codeforces API returned error:', data.comment);
        return null;
      }

      // Find the matching problem in the API response
      const problem = data.result.problems.find(
        p => p.contestId === contestId && p.index === problemIndex
      );

      if (!problem) {
        console.log('CodeMentor: Problem not found in API response');
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
      console.log('CodeMentor: Error fetching from Codeforces API:', error.message);
      return null;
    }
  }

  // Extract examples from Codeforces problem page
  function extractExamples() {
    const examples = [];
    
    // Method 1: Look for .sample-test divs (standard Codeforces structure)
    const sampleTestDivs = document.querySelectorAll('.sample-test');
    if (sampleTestDivs.length > 0) {
      sampleTestDivs.forEach(sample => {
        const inputPre = sample.querySelector('.input pre');
        const outputPre = sample.querySelector('.output pre');
        examples.push({
          input: inputPre?.textContent.trim() || '',
          output: outputPre?.textContent.trim() || ''
        });
      });
      return examples;
    }
    
    // Method 2: Fallback - look for .input and .output divs directly
    const sampleTests = document.querySelector('.sample-tests');
    if (sampleTests) {
      const inputDivs = sampleTests.querySelectorAll('.input');
      const outputDivs = sampleTests.querySelectorAll('.output');
      
      for (let i = 0; i < inputDivs.length; i++) {
        const inputPre = inputDivs[i].querySelector('pre');
        const outputPre = outputDivs[i]?.querySelector('pre');
        examples.push({
          input: inputPre?.textContent.trim() || '',
          output: outputPre?.textContent.trim() || ''
        });
      }
    }
    
    return examples;
  }

  // Extract image URLs from HTML content
  function extractImagesFromHTML(htmlString) {
    if (!htmlString) return [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      const images = doc.querySelectorAll('img');

      return Array.from(images).map(img => {
        // Get src - handle both absolute and relative URLs
        let src = img.src || img.getAttribute('src') || '';

        // Convert relative URLs to absolute
        if (src && !src.startsWith('http')) {
          if (src.startsWith('//')) {
            src = 'https:' + src;
          } else if (src.startsWith('/')) {
            src = 'https://codeforces.com' + src;
          } else {
            src = 'https://codeforces.com/' + src;
          }
        }

        return {
          url: src,
          alt: img.alt || img.getAttribute('alt') || 'Problem diagram',
          width: img.width || img.getAttribute('width') || null,
          height: img.height || img.getAttribute('height') || null
        };
      }).filter(img => img.url && img.url.length > 0); // Filter out empty URLs
    } catch (e) {
      console.log('[CodeMentor] extractImagesFromHTML: Error parsing HTML:', e);
      return [];
    }
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
    // Wait for problem statement with retry logic (handles slow networks)
    let problemStatement;
    try {
      problemStatement = await waitForElement('.problem-statement', {
        timeout: 15000, // 15 seconds for slow networks
        minContentLength: 100 // Ensure it has actual content, not just empty element
      });
    } catch (error) {
      console.error('CodeMentor: Failed to find problem statement:', error);
      throw new Error('Problem statement not found. The page may still be loading. Please wait a moment and try again.');
    }

    // Extract title (for metadata) - wait for it if needed
    let titleEl;
    try {
      titleEl = await waitForElement('.title', {
        timeout: 5000,
        minContentLength: 1
      });
    } catch (e) {
      // Title not critical, try direct query as fallback
      titleEl = document.querySelector('.title');
    }
    const title = titleEl?.textContent?.trim() || '';

    // Extract difficulty from title (e.g., "A. Problem Name" -> Easy)
    let difficulty = 'Unknown';
    if (titleEl) {
      const titleText = titleEl.textContent.trim();
      const letter = titleText.match(/^([A-G])\./)?.[1];
      if (letter) {
        const difficultyMap = {
          'A': 'Easy', 'B': 'Easy', 'C': 'Medium',
          'D': 'Medium', 'E': 'Hard', 'F': 'Hard', 'G': 'Hard'
        };
        difficulty = difficultyMap[letter] || 'Medium';
      }
    }

    // Get problem rating from DOM (for metadata)
    let problemRating = '';
    const ratingEl = document.querySelector('.tag-box[title*="Difficulty"]') ||
      document.querySelector('[title*="rating"]');
    if (ratingEl) {
      problemRating = ratingEl.textContent.trim().replace('*', '');
    }

    // Get tags from DOM (for metadata)
    let tags = '';
    const tagElements = document.querySelectorAll('.tag-box a, [class*="tag"]');
    if (tagElements.length > 0) {
      tags = Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30 && !t.match(/^\*?\d+$/)) // Exclude rating numbers
        .slice(0, 5)
        .join(', ');
    }

    // Convert HTML to compact plain text format for maximum token reduction
    // This extracts ALL essential problem information while removing HTML overhead
    function extractStructuredText(problemStatementEl) {
      if (!problemStatementEl) return '';
      
      const originalLength = problemStatementEl.innerHTML.length;
      const clone = problemStatementEl.cloneNode(true);
      
      // Convert MathJax to LaTeX FIRST (before any text extraction)
      // Inline math: <script type="math/tex">...</script> -> $...$
      clone.querySelectorAll('script[type="math/tex"]').forEach(script => {
        const latex = script.textContent;
        const span = document.createElement('span');
        span.textContent = ` $${latex}$ `;
        if (script.parentNode) script.parentNode.replaceChild(span, script);
      });
      
      // Display math: <script type="math/tex; mode=display">...</script> -> $$...$$
      clone.querySelectorAll('script[type="math/tex; mode=display"]').forEach(script => {
        const latex = script.textContent;
        const span = document.createElement('span');
        span.textContent = `\n$$${latex}$$\n`;
        if (script.parentNode) script.parentNode.replaceChild(span, script);
      });
      
      // Convert <sup> tags to LaTeX superscript notation (preserves footnotes like *, †)
      // This ensures footnotes are readable in the extracted text
      clone.querySelectorAll('sup').forEach(sup => {
        const supText = sup.textContent.trim();
        const span = document.createElement('span');
        span.textContent = `^{${supText}}`;
        if (sup.parentNode) sup.parentNode.replaceChild(span, sup);
      });
      
      // Convert <sub> tags to LaTeX subscript notation
      clone.querySelectorAll('sub').forEach(sub => {
        const subText = sub.textContent.trim();
        const span = document.createElement('span');
        span.textContent = `_{${subText}}`;
        if (sub.parentNode) sub.parentNode.replaceChild(span, sub);
      });
      
      // Remove MathJax rendered output (we keep our LaTeX conversion)
      clone.querySelectorAll('.MathJax, .MathJax_Preview, .MathJax_Display, .mjx-chtml, .mjx-math, [class*="MathJax"]').forEach(el => el.remove());
      
      // Remove ONLY non-problem elements (keep all problem content)
      clone.querySelectorAll('script:not([type*="math"]), style, noscript, link').forEach(el => el.remove());
      clone.querySelectorAll('.time-limit, .memory-limit, .input-file, .output-file').forEach(el => el.remove());
      clone.querySelectorAll('.property-title').forEach(el => { if (el.parentElement) el.parentElement.remove(); });
      clone.querySelectorAll('.tag-box, .star-icon, form, button, nav, .footer, .header').forEach(el => el.remove());
      clone.querySelectorAll('[style*="display:none"], [hidden], .hidden').forEach(el => el.remove());
      
      // Extract structured sections
      const sections = {};
      
      // Get title (header div) - preserve full title
      const titleEl = clone.querySelector('.title');
      sections.title = titleEl ? titleEl.textContent.trim() : '';
      if (titleEl) titleEl.remove();
      
      // Get problem statement - the main description div (usually first child or has no specific class)
      // Codeforces structure: .problem-statement > .header, then description divs, then .input-specification, .output-specification, .sample-tests, .note
      let description = '';
      
      // Method 1: Get all direct child divs that are NOT special sections
      const allChildren = clone.querySelectorAll(':scope > div');
      allChildren.forEach(div => {
        const className = div.className || '';
        // Skip known section classes
        if (className.includes('header') || 
            className.includes('input-specification') || 
            className.includes('output-specification') || 
            className.includes('sample-tests') || 
            className.includes('note') ||
            className.includes('section-title')) {
          return;
        }
        // This is likely the problem description
        const text = div.textContent.trim();
        if (text && text.length > 10) {
          description += text + '\n\n';
        }
      });
      
      // Method 2: If no description found, try getting text before input-specification
      if (!description.trim()) {
        // Get all text nodes and p tags before the first section
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;
        let foundSection = false;
        while ((node = walker.nextNode()) && !foundSection) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const className = node.className || '';
            if (className.includes('input-specification') || className.includes('output-specification')) {
              foundSection = true;
              break;
            }
            if (node.tagName === 'P' || node.tagName === 'DIV') {
              const text = node.textContent.trim();
              if (text && text.length > 10 && !className.includes('header')) {
                description += text + '\n\n';
              }
            }
          }
        }
      }
      sections.description = description.trim();
      
      // Get Input specification - preserve ALL content
      const inputSection = clone.querySelector('.input-specification');
      if (inputSection) {
        // Remove the "Input" title but keep everything else
        const inputTitle = inputSection.querySelector('.section-title');
        if (inputTitle) inputTitle.remove();
        sections.input = inputSection.textContent.trim();
      } else {
        sections.input = '';
      }
      
      // Get Output specification - preserve ALL content
      const outputSection = clone.querySelector('.output-specification');
      if (outputSection) {
        const outputTitle = outputSection.querySelector('.section-title');
        if (outputTitle) outputTitle.remove();
        sections.output = outputSection.textContent.trim();
      } else {
        sections.output = '';
      }
      
      // Get Note section - preserve ALL content (often contains crucial hints)
      const noteSection = clone.querySelector('.note');
      if (noteSection) {
        const noteTitle = noteSection.querySelector('.section-title');
        if (noteTitle) noteTitle.remove();
        sections.note = noteSection.textContent.trim();
      } else {
        sections.note = '';
      }
      
      // Get ALL Examples - preserve exact formatting
      // Use ORIGINAL element (not clone) to ensure we get unmodified examples
      const originalSampleTests = problemStatementEl.querySelector('.sample-tests');
      const examples = [];
      
      if (originalSampleTests) {
        // Method 1: Look for .sample-test divs (standard Codeforces structure)
        const sampleTestDivs = originalSampleTests.querySelectorAll('.sample-test');
        
        if (sampleTestDivs.length > 0) {
          sampleTestDivs.forEach((sample, idx) => {
            const inputPre = sample.querySelector('.input pre');
            const outputPre = sample.querySelector('.output pre');
            const input = inputPre?.textContent.trim() || '';
            const output = outputPre?.textContent.trim() || '';
            examples.push({ input, output });
          });
        } else {
          // Method 2: Fallback - pair up .input and .output divs
          const inputDivs = originalSampleTests.querySelectorAll('.input');
          const outputDivs = originalSampleTests.querySelectorAll('.output');
          
          for (let i = 0; i < inputDivs.length; i++) {
            const inputPre = inputDivs[i].querySelector('pre');
            const outputPre = outputDivs[i]?.querySelector('pre');
            const input = inputPre?.textContent.trim() || '';
            const output = outputPre?.textContent.trim() || '';
            examples.push({ input, output });
          }
        }
        
        // Method 3: If still no examples, try getting all pre tags
        if (examples.length === 0) {
          const allPres = originalSampleTests.querySelectorAll('pre');
          // Assume alternating input/output
          for (let i = 0; i < allPres.length; i += 2) {
            const input = allPres[i]?.textContent.trim() || '';
            const output = allPres[i + 1]?.textContent.trim() || '';
            if (input || output) {
              examples.push({ input, output });
            }
          }
        }
      } else {
        // Try alternative selector - some problems might have different structure
        const altExamples = problemStatementEl.querySelectorAll('.input pre, .output pre');
      }
      
      sections.examples = examples;
      
      // Build compact text representation (markdown-like, no HTML tags)
      let compactText = '';
      
      // Problem description (the core problem statement)
      if (sections.description) {
        compactText += sections.description + '\n\n';
      }
      
      // Input format
      if (sections.input) {
        compactText += '**Input:**\n' + sections.input + '\n\n';
      }
      
      // Output format
      if (sections.output) {
        compactText += '**Output:**\n' + sections.output + '\n\n';
      }
      
      // All examples with clear formatting
      if (sections.examples.length > 0) {
        compactText += '**Examples:**\n';
        sections.examples.forEach((ex, i) => {
          compactText += `\nExample ${i + 1}:\n`;
          compactText += `Input:\n${ex.input}\n`;
          compactText += `Output:\n${ex.output}\n`;
        });
        compactText += '\n';
      }
      
      // Note section (often contains important clarifications)
      if (sections.note) {
        compactText += '**Note:**\n' + sections.note + '\n';
      }
      
      // Clean up excessive whitespace while preserving structure
      compactText = compactText.replace(/\n{4,}/g, '\n\n\n').trim();
      
      return compactText;
    }
    
    // Fallback: Clean HTML if structured extraction fails (preserves more structure)
    function cleanHTMLFallback(element) {
      if (!element) return '';
      
      const originalLength = element.innerHTML.length;
      const clone = element.cloneNode(true);
      
      // Convert MathJax to LaTeX
      clone.querySelectorAll('script[type="math/tex"]').forEach(script => {
        const span = document.createElement('span');
        span.textContent = ` $${script.textContent}$ `;
        if (script.parentNode) script.parentNode.replaceChild(span, script);
      });
      clone.querySelectorAll('script[type="math/tex; mode=display"]').forEach(script => {
        const span = document.createElement('span');
        span.textContent = `\n$$${script.textContent}$$\n`;
        if (script.parentNode) script.parentNode.replaceChild(span, script);
      });
      
      // Remove non-essential elements but keep problem content
      clone.querySelectorAll('script:not([type*="math"]), style, noscript, link').forEach(el => el.remove());
      clone.querySelectorAll('.time-limit, .memory-limit, .input-file, .output-file, .property-title').forEach(el => el.remove());
      clone.querySelectorAll('.tag-box, .MathJax, .MathJax_Preview, .mjx-chtml, form, button, nav, .footer, .header, .caption').forEach(el => el.remove());
      clone.querySelectorAll('[style*="display:none"], [hidden], .hidden').forEach(el => el.remove());
      
      // Replace section titles with markdown headers
      clone.querySelectorAll('.section-title').forEach(el => {
        const title = el.textContent.trim();
        el.textContent = `\n**${title}:**\n`;
      });
      
      // Convert <pre> tags to preserve code formatting
      clone.querySelectorAll('pre').forEach(pre => {
        pre.textContent = '\n```\n' + pre.textContent + '\n```\n';
      });
      
      // Strip all attributes (reduces size significantly)
      clone.querySelectorAll('*').forEach(el => {
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
        if (href) el.setAttribute('href', href);
        if (src) el.setAttribute('src', src);
      });
      
      // Get text content - use textContent for cleaner output
      let text = clone.textContent || clone.innerText || '';
      
      // Clean up whitespace while preserving paragraph breaks
      text = text.replace(/[ \t]+/g, ' ');  // Collapse horizontal whitespace
      text = text.replace(/\n[ \t]+/g, '\n');  // Remove leading whitespace on lines
      text = text.replace(/[ \t]+\n/g, '\n');  // Remove trailing whitespace on lines
      text = text.replace(/\n{4,}/g, '\n\n\n');  // Limit consecutive newlines
      text = text.trim();
      
      return text;
    }

    // Extract problem content - try structured text first, fallback to clean HTML
    let problemHTML = extractStructuredText(problemStatement);
    
    // If structured extraction yields too little content, use fallback
    if (problemHTML.length < 100) {
      console.log('[CodeMentor] ⚠️ Structured extraction too short (' + problemHTML.length + ' chars), using HTML fallback');
      problemHTML = cleanHTMLFallback(problemStatement);
    }

    // Check if problem has images/graphs
    const hasImages = problemStatement.querySelectorAll('img, svg, canvas').length > 0;

    // Extract examples (for reference, but LLM will parse from HTML)
    const examples = extractExamples();
    const examplesText = examples.map((ex, i) => {
      return `Example ${i + 1}:\n  Input:\n    ${(ex.input || '').split('\n').join('\n    ')}\n  Output:\n    ${(ex.output || '').split('\n').join('\n    ')}`;
    }).join('\n\n');

    // Extract time/memory limits (for metadata)
    const timeLimit = document.querySelector('.time-limit')?.textContent.trim() || '';
    const memoryLimit = document.querySelector('.memory-limit')?.textContent.trim() || '';
    const constraints = [timeLimit, memoryLimit].filter(c => c).join('\n');

    const baseData = {
      title: title,
      description: problemHTML, // Send HTML as description (LLM will parse it)
      html: problemHTML, // Also include in html field for consistency
      constraints: constraints,
      difficulty: difficulty,
      problemRating: problemRating,
      tags: tags,
      examples: examplesText,
      examplesCount: examples.length,
      url: window.location.href,
      hasImages: hasImages
    };

    // Capture images if available
    if (hasImages && typeof html2canvas !== 'undefined') {
      try {
        const canvas = await html2canvas(problemStatement, {
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
        console.error('CodeMentor: Failed to capture image from Codeforces:', error);
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
        <div class="lch-error-buttons">
          <button class="lch-back-btn">Back</button>
          <button class="lch-retry-btn">Try Again</button>
        </div>
      </div>
    `;

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
            platform: 'codeforces',
            difficulty: problemData.difficulty
          };
        }
      } catch (e) {
        // Could not extract problem data for favorites
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
        <h3 class="lch-settings-title">API Key Required</h3>
        <p class="lch-settings-message">
          To use CodeMentor, please configure your API key in the extension settings.
        </p>
        <p class="lch-settings-suggestion">
          💡 Open settings on extension icon → Settings tab
        </p>
        <div class="lch-settings-actions">
          <button class="lch-settings-back-btn" id="backBtn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Back to Hints
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    const backBtn = body.querySelector('#backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        await showQuickActions();
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

    // Trigger MathJax rendering if available (Codeforces uses MathJax)
    const explanationContent = body.querySelector('.lch-explanation-text');
    if (explanationContent && window.MathJax && window.MathJax.typesetPromise) {
      try {
        window.MathJax.typesetPromise([explanationContent]).catch((err) => {
          // MathJax rendering error
        });
      } catch (e) {
        // MathJax not available or error
      }
    } else if (explanationContent && window.MathJax && window.MathJax.Hub) {
      // Fallback for older MathJax versions
      try {
        window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, explanationContent]);
      } catch (e) {
        // MathJax Hub error
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
      </div>
    `;

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

    // Add reveal handlers
    body.querySelectorAll('.lch-hint-header').forEach(header => {
      header.addEventListener('click', () => {
        const hintIndex = header.dataset.hint;
        const content = body.querySelector(`.lch-hint-content[data-hint="${hintIndex}"]`);
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
    if (!isExtensionContextValid()) return;

    // Ensure currentProblemData is set
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
        console.error('CodeMentor: Could not extract problem data for favorite:', e.message);
        return;
      }
    }

    if (!currentProblemData) {
      console.error('CodeMentor: No problem data available for favorite');
      return;
    }

    const isCurrentlyFavorite = btn.classList.contains('active');

    try {
      if (isCurrentlyFavorite) {
        const id = `${currentProblemData.platform}_${generateCacheKey(currentProblemData.url)}`;
        const response = await safeSendMessage({ type: 'REMOVE_FAVORITE', id });
        if (response && response.success) {
          btn.classList.remove('active');
          btn.innerHTML = '🤍';
        } else if (response && response.error) {
          // Try URL-based removal as fallback (ID might not match due to URL variations)
          const urlResponse = await safeSendMessage({ type: 'REMOVE_FAVORITE_BY_URL', url: currentProblemData.url });
          if (urlResponse && urlResponse.success) {
            btn.classList.remove('active');
            btn.innerHTML = '🤍';
          } else {
            // Only log error if both methods failed
            console.error('CodeMentor: Failed to remove favorite:', response.error);
          }
        }
      } else {
        const response = await safeSendMessage({ type: 'ADD_FAVORITE', problem: currentProblemData });
        if (response && response.success) {
          btn.classList.add('active');
          btn.innerHTML = '❤️';
        } else if (response && response.error) {
          // Show error message for limit exceeded or other errors
          alert(response.error);
        }
      }
    } catch (e) {
      console.error('CodeMentor: Error toggling favorite:', e);
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
    } else {
      feedbackSection.innerHTML = `
        <div class="lch-feedback-thanks">
          <div class="lch-feedback-improve">
            <div class="lch-feedback-improve-text">Sorry the hints weren't helpful.</div>
            <button class="lch-feedback-regenerate-btn">🔄 Try Different Hints</button>
          </div>
        </div>
      `;

      const regenerateBtn = feedbackSection.querySelector('.lch-feedback-regenerate-btn');
      if (regenerateBtn) {
        regenerateBtn.addEventListener('click', () => {
          loadHints(true);
        });
      }
    }
  }

  // Format hint text professionally
  // Format hint text professionally (matching LeetCode's implementation)
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
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Convert LaTeX math notation to readable HTML
  // This handles both formal LaTeX (\leq) and shorthand (\le) variants
  function convertMathToHtml(content) {
    if (!content) return '';
    
    let result = content
      // Handle subscripts: x_i, x_{abc}
      .replace(/([a-zA-Z])_\{([^}]+)\}/g, '$1<sub>$2</sub>')
      .replace(/([a-zA-Z])_([a-zA-Z0-9])/g, '$1<sub>$2</sub>')
      // Handle superscripts: 10^5, x^{abc}, n^2 - BEFORE other replacements
      .replace(/(\d+)\^\{([^}]+)\}/g, '$1<sup>$2</sup>')
      .replace(/([a-zA-Z0-9])\^\{([^}]+)\}/g, '$1<sup>$2</sup>')
      .replace(/(\d+)\^(\d+)/g, '$1<sup>$2</sup>')
      .replace(/([a-zA-Z])\^([a-zA-Z0-9])/g, '$1<sup>$2</sup>')
      // Handle common LaTeX comparison commands (BOTH full and shorthand forms)
      .replace(/\\leq/g, '≤')
      .replace(/\\le(?![a-z])/g, '≤')  // \le but not \left, \leftarrow, etc.
      .replace(/\\geq/g, '≥')
      .replace(/\\ge(?![a-z])/g, '≥')  // \ge but not \get, etc.
      .replace(/\\neq/g, '≠')
      .replace(/\\ne(?![a-z])/g, '≠')  // \ne shorthand
      .replace(/\\approx/g, '≈')
      .replace(/\\sim/g, '~')
      .replace(/\\equiv/g, '≡')
      // Handle arithmetic
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\mp/g, '∓')
      .replace(/\\infty/g, '∞')
      .replace(/\\sum/g, 'Σ')
      .replace(/\\prod/g, '∏')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\sqrt/g, '√')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)')
      .replace(/\\left/g, '')
      .replace(/\\right/g, '')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\texttt\{([^}]+)\}/g, '$1')
      .replace(/\\mathrm\{([^}]+)\}/g, '$1')
      .replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>')
      .replace(/\\mathit\{([^}]+)\}/g, '<em>$1</em>')
      // Handle common functions
      .replace(/\\log/g, 'log')
      .replace(/\\ln/g, 'ln')
      .replace(/\\sin/g, 'sin')
      .replace(/\\cos/g, 'cos')
      .replace(/\\tan/g, 'tan')
      .replace(/\\min/g, 'min')
      .replace(/\\max/g, 'max')
      .replace(/\\mod/g, 'mod')
      .replace(/\\bmod/g, 'mod')
      .replace(/\\gcd/g, 'gcd')
      .replace(/\\lcm/g, 'lcm')
      .replace(/\\floor/g, 'floor')
      .replace(/\\ceil/g, 'ceil')
      // Handle arrows
      .replace(/\\rightarrow/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\\Rightarrow/g, '⇒')
      .replace(/\\Leftarrow/g, '⇐')
      .replace(/\\to/g, '→')
      .replace(/\\gets/g, '←')
      .replace(/\\iff/g, '⟺')
      // Handle comparison
      .replace(/\\lt/g, '<')
      .replace(/\\gt/g, '>')
      // Handle sets
      .replace(/\\in/g, '∈')
      .replace(/\\notin/g, '∉')
      .replace(/\\subset/g, '⊂')
      .replace(/\\subseteq/g, '⊆')
      .replace(/\\supset/g, '⊃')
      .replace(/\\supseteq/g, '⊇')
      .replace(/\\cup/g, '∪')
      .replace(/\\cap/g, '∩')
      .replace(/\\emptyset/g, '∅')
      .replace(/\\forall/g, '∀')
      .replace(/\\exists/g, '∃')
      .replace(/\\nexists/g, '∄')
      // Handle Greek letters (lowercase)
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\epsilon/g, 'ε')
      .replace(/\\varepsilon/g, 'ε')
      .replace(/\\zeta/g, 'ζ')
      .replace(/\\eta/g, 'η')
      .replace(/\\theta/g, 'θ')
      .replace(/\\iota/g, 'ι')
      .replace(/\\kappa/g, 'κ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\nu/g, 'ν')
      .replace(/\\xi/g, 'ξ')
      .replace(/\\pi/g, 'π')
      .replace(/\\rho/g, 'ρ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\tau/g, 'τ')
      .replace(/\\upsilon/g, 'υ')
      .replace(/\\phi/g, 'φ')
      .replace(/\\varphi/g, 'φ')
      .replace(/\\chi/g, 'χ')
      .replace(/\\psi/g, 'ψ')
      .replace(/\\omega/g, 'ω')
      // Handle Greek letters (uppercase)
      .replace(/\\Gamma/g, 'Γ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\Theta/g, 'Θ')
      .replace(/\\Lambda/g, 'Λ')
      .replace(/\\Xi/g, 'Ξ')
      .replace(/\\Pi/g, 'Π')
      .replace(/\\Sigma/g, 'Σ')
      .replace(/\\Phi/g, 'Φ')
      .replace(/\\Psi/g, 'Ψ')
      .replace(/\\Omega/g, 'Ω')
      // Handle O notation and mathcal
      .replace(/\\mathcal\{O\}/g, 'O')
      .replace(/\\mathcal\{([^}]+)\}/g, '$1')
      .replace(/\\mathbb\{([^}]+)\}/g, '$1')
      // Handle dots
      .replace(/\\ldots/g, '...')
      .replace(/\\cdots/g, '···')
      .replace(/\\vdots/g, '⋮')
      .replace(/\\ddots/g, '⋱')
      // Clean up remaining backslashes that might be LaTeX artifacts
      .replace(/\\,/g, ' ')
      .replace(/\\ /g, ' ')
      .replace(/\\;/g, ' ')
      .replace(/\\!/g, '')
      .replace(/\\:/g, ' ')
      .replace(/\\quad/g, '  ')
      .replace(/\\qquad/g, '    ')
      // Clean up curly braces used for grouping (after all other replacements)
      .replace(/\{([^{}]+)\}/g, '$1');
    
    return result;
  }
  
  // Convert LaTeX commands to Unicode symbols (no HTML tags)
  // This is for text not wrapped in math delimiters
  function convertLatexToUnicode(text) {
    if (!text) return '';
    
    return text
      // Handle comparison operators (BOTH full and shorthand forms)
      .replace(/\\leq/g, '≤')
      .replace(/\\le(?![a-z])/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\ge(?![a-z])/g, '≥')
      .replace(/\\neq/g, '≠')
      .replace(/\\ne(?![a-z])/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\sim/g, '~')
      .replace(/\\equiv/g, '≡')
      // Handle arithmetic
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\mp/g, '∓')
      .replace(/\\infty/g, '∞')
      .replace(/\\sum/g, 'Σ')
      .replace(/\\prod/g, '∏')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\sqrt/g, '√')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)')
      // Handle text formatting (remove LaTeX wrappers)
      .replace(/\\left/g, '')
      .replace(/\\right/g, '')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\texttt\{([^}]+)\}/g, '$1')
      .replace(/\\mathrm\{([^}]+)\}/g, '$1')
      .replace(/\\mathbf\{([^}]+)\}/g, '$1')
      .replace(/\\mathit\{([^}]+)\}/g, '$1')
      // Handle common functions
      .replace(/\\log/g, 'log')
      .replace(/\\ln/g, 'ln')
      .replace(/\\sin/g, 'sin')
      .replace(/\\cos/g, 'cos')
      .replace(/\\tan/g, 'tan')
      .replace(/\\min/g, 'min')
      .replace(/\\max/g, 'max')
      .replace(/\\mod/g, 'mod')
      .replace(/\\bmod/g, 'mod')
      .replace(/\\gcd/g, 'gcd')
      .replace(/\\lcm/g, 'lcm')
      // Handle arrows
      .replace(/\\rightarrow/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\\Rightarrow/g, '⇒')
      .replace(/\\Leftarrow/g, '⇐')
      .replace(/\\to/g, '→')
      .replace(/\\gets/g, '←')
      .replace(/\\iff/g, '⟺')
      // Handle comparison
      .replace(/\\lt/g, '<')
      .replace(/\\gt/g, '>')
      // Handle sets
      .replace(/\\in/g, '∈')
      .replace(/\\notin/g, '∉')
      .replace(/\\subset/g, '⊂')
      .replace(/\\subseteq/g, '⊆')
      .replace(/\\supset/g, '⊃')
      .replace(/\\supseteq/g, '⊇')
      .replace(/\\cup/g, '∪')
      .replace(/\\cap/g, '∩')
      .replace(/\\emptyset/g, '∅')
      .replace(/\\forall/g, '∀')
      .replace(/\\exists/g, '∃')
      .replace(/\\nexists/g, '∄')
      // Handle Greek letters (lowercase)
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\epsilon/g, 'ε')
      .replace(/\\varepsilon/g, 'ε')
      .replace(/\\zeta/g, 'ζ')
      .replace(/\\eta/g, 'η')
      .replace(/\\theta/g, 'θ')
      .replace(/\\iota/g, 'ι')
      .replace(/\\kappa/g, 'κ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\nu/g, 'ν')
      .replace(/\\xi/g, 'ξ')
      .replace(/\\pi/g, 'π')
      .replace(/\\rho/g, 'ρ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\tau/g, 'τ')
      .replace(/\\upsilon/g, 'υ')
      .replace(/\\phi/g, 'φ')
      .replace(/\\varphi/g, 'φ')
      .replace(/\\chi/g, 'χ')
      .replace(/\\psi/g, 'ψ')
      .replace(/\\omega/g, 'ω')
      // Handle Greek letters (uppercase)
      .replace(/\\Gamma/g, 'Γ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\Theta/g, 'Θ')
      .replace(/\\Lambda/g, 'Λ')
      .replace(/\\Xi/g, 'Ξ')
      .replace(/\\Pi/g, 'Π')
      .replace(/\\Sigma/g, 'Σ')
      .replace(/\\Phi/g, 'Φ')
      .replace(/\\Psi/g, 'Ψ')
      .replace(/\\Omega/g, 'Ω')
      // Handle O notation and mathcal
      .replace(/\\mathcal\{O\}/g, 'O')
      .replace(/\\mathcal\{([^}]+)\}/g, '$1')
      .replace(/\\mathbb\{([^}]+)\}/g, '$1')
      // Handle dots
      .replace(/\\ldots/g, '...')
      .replace(/\\cdots/g, '···')
      .replace(/\\vdots/g, '⋮')
      .replace(/\\ddots/g, '⋱')
      // Clean up spacing commands
      .replace(/\\,/g, ' ')
      .replace(/\\ /g, ' ')
      .replace(/\\;/g, ' ')
      .replace(/\\!/g, '')
      .replace(/\\:/g, ' ')
      .replace(/\\quad/g, '  ')
      .replace(/\\qquad/g, '    ')
      // Convert superscript notation to Unicode superscripts where possible
      // 10^5 -> 10⁵, n^2 -> n², etc.
      .replace(/\^0/g, '⁰')
      .replace(/\^1/g, '¹')
      .replace(/\^2/g, '²')
      .replace(/\^3/g, '³')
      .replace(/\^4/g, '⁴')
      .replace(/\^5/g, '⁵')
      .replace(/\^6/g, '⁶')
      .replace(/\^7/g, '⁷')
      .replace(/\^8/g, '⁸')
      .replace(/\^9/g, '⁹')
      .replace(/\^\{0\}/g, '⁰')
      .replace(/\^\{1\}/g, '¹')
      .replace(/\^\{2\}/g, '²')
      .replace(/\^\{3\}/g, '³')
      .replace(/\^\{4\}/g, '⁴')
      .replace(/\^\{5\}/g, '⁵')
      .replace(/\^\{6\}/g, '⁶')
      .replace(/\^\{7\}/g, '⁷')
      .replace(/\^\{8\}/g, '⁸')
      .replace(/\^\{9\}/g, '⁹')
      // Handle multi-digit superscripts: ^{10} -> ¹⁰
      .replace(/\^\{(\d+)\}/g, (match, digits) => {
        const superscriptMap = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'};
        return digits.split('').map(d => superscriptMap[d] || d).join('');
      })
      // Handle subscript notation to Unicode subscripts
      .replace(/_0/g, '₀')
      .replace(/_1/g, '₁')
      .replace(/_2/g, '₂')
      .replace(/_3/g, '₃')
      .replace(/_4/g, '₄')
      .replace(/_5/g, '₅')
      .replace(/_6/g, '₆')
      .replace(/_7/g, '₇')
      .replace(/_8/g, '₈')
      .replace(/_9/g, '₉')
      .replace(/_i/g, 'ᵢ')
      .replace(/_j/g, 'ⱼ')
      .replace(/_n/g, 'ₙ')
      .replace(/\{i\}/g, 'ᵢ')
      .replace(/\{j\}/g, 'ⱼ')
      // Clean up remaining curly braces (after all other replacements)
      .replace(/\{([^{}]+)\}/g, '$1');
  }

  function parseMarkdown(text) {
    if (!text) return '';

    let processedText = text;

    // STEP 1: Extract LaTeX math FIRST (before any string replacements that might corrupt it)
    // Process LaTeX notation - extract and replace with placeholders BEFORE escaping HTML
    const mathPlaceholders = [];

    // Process display math blocks \[...\] (non-greedy match)
    // Handle both single and double-escaped backslashes from JSON
    processedText = processedText.replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, function (match, content) {
      const placeholder = `__MATH_DISPLAY_${mathPlaceholders.length}__`;
      // Convert LaTeX to readable HTML directly
      const htmlContent = convertMathToHtml(content.trim());
      mathPlaceholders.push(`<span class="lch-math-display">${htmlContent}</span>`);
      return placeholder;
    });

    // Process inline math \(...\) (non-greedy, handle newlines in content)
    // Handle both single and double-escaped backslashes from JSON
    processedText = processedText.replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, function (match, content) {
      const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
      // Convert LaTeX to readable HTML directly
      const htmlContent = convertMathToHtml(content);
      mathPlaceholders.push(`<span class="lch-math-inline">${htmlContent}</span>`);
      return placeholder;
    });

    // Also handle $...$ and $$...$$ notation (common in AI responses)
    // Display math: $$...$$
    processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, function (match, content) {
      const placeholder = `__MATH_DISPLAY_${mathPlaceholders.length}__`;
      const htmlContent = convertMathToHtml(content.trim());
      mathPlaceholders.push(`<span class="lch-math-display">${htmlContent}</span>`);
      return placeholder;
    });

    // Inline math: $...$ (but not $$)
    processedText = processedText.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, function (match, content) {
      const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
      const htmlContent = convertMathToHtml(content);
      mathPlaceholders.push(`<span class="lch-math-inline">${htmlContent}</span>`);
      return placeholder;
    });

    // STEP 2: Now convert literal \n strings to actual newlines (AFTER extracting LaTeX)
    // This handles cases where AI returns escaped newlines that weren't properly unescaped
    processedText = processedText
      .replace(/\\n/g, '\n')  // Convert literal \n to actual newline
      .replace(/\\"/g, '"');   // Convert escaped quotes

    // STEP 3: Apply LaTeX-to-Unicode conversion to remaining text (for LaTeX not wrapped in math delimiters)
    // This handles cases like "1 \le t \le 10^5" that aren't inside $...$ or \(...\)
    // We use Unicode conversion here (not HTML) so it survives the escapeHtml step
    processedText = convertLatexToUnicode(processedText);

    // First escape HTML to prevent XSS (but preserve structure)
    let html = escapeHtml(processedText);

    // Restore math HTML (unescaped, as it's proper HTML we generated)
    mathPlaceholders.forEach((mathTag, index) => {
      // Replace the placeholder (which was escaped as regular text)
      // Try both display and inline placeholder patterns
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

    // Convert subscript notation: x_i, x_{ij}, s_1, etc. to proper subscripts
    // Handle braced subscripts first: x_{abc} -> x<sub>abc</sub>
    html = html.replace(/([a-zA-Z])_\{([^}]+)\}/g, '$1<sub>$2</sub>');
    // Handle single character subscripts: x_i, x_1, etc. -> x<sub>i</sub>
    html = html.replace(/([a-zA-Z])_([a-zA-Z0-9])/g, '$1<sub>$2</sub>');
    
    // Convert superscript notation: x^2, x^{n}, etc. to proper superscripts
    // Handle braced superscripts first: x^{abc} -> x<sup>abc</sup>
    html = html.replace(/([a-zA-Z0-9])?\^?\{([^}]+)\}/g, (match, base, exp) => {
      if (base) return `${base}<sup>${exp}</sup>`;
      return match;
    });
    // Handle single character superscripts: x^2, n^k -> x<sup>2</sup>
    html = html.replace(/([a-zA-Z0-9])\^([a-zA-Z0-9])/g, '$1<sup>$2</sup>');

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
    if (!url) return '';
    // Match service worker implementation exactly
    return url
      .replace(/^https?:\/\//, '')
      .replace(/\?.*$/, '')  // Remove query params
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()  // Convert to lowercase
      .slice(0, 100);
  }

})();
