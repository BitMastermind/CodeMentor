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
  window.testScrapingAccuracy = async function() {
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

  // Extract problem data with proper LaTeX handling from MathJax script tags
  function extractProblemWithMath(selectorOrElement) {
    // Accept either a selector string or an HTML element
    const element = typeof selectorOrElement === 'string' 
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;
    if (!element) return '';

    // Clone to avoid modifying the original DOM
    const clone = element.cloneNode(true);

    // Find all MathJax script tags and replace with LaTeX notation
    const mathScripts = clone.querySelectorAll('script[type="math/tex"]');
    mathScripts.forEach(script => {
      const latex = script.textContent;
      const span = document.createElement('span');
      span.textContent = `$${latex}$`;
      script.parentNode.replaceChild(span, script);
    });

    // Handle display math (block equations)
    const displayMath = clone.querySelectorAll('script[type="math/tex; mode=display"]');
    displayMath.forEach(script => {
      const latex = script.textContent;
      const div = document.createElement('div');
      div.textContent = `$$${latex}$$`;
      script.parentNode.replaceChild(div, script);
    });

    // Now get the text content with proper formatting
    return clone.textContent.trim();
  }

  // Extract examples from Codeforces problem page
  function extractExamples() {
    const sampleTests = document.querySelectorAll('.sample-test');
    return Array.from(sampleTests).map(sample => {
      const inputs = sample.querySelectorAll('.input pre');
      const outputs = sample.querySelectorAll('.output pre');

      return {
        input: inputs[0]?.textContent.trim() || '',
        output: outputs[0]?.textContent.trim() || ''
      };
    });
  }

  // Scrape problem HTML directly (best for LLM - preserves all formatting and math)
  function scrapeProblemHTML() {
    const problemStatement = document.querySelector('.problem-statement');

    if (!problemStatement) {
      throw new Error('Problem statement not found');
    }

    const urlInfo = parseProblemUrl(window.location.href);

    return {
      url: window.location.href,
      contestId: urlInfo?.contestId || null,
      problemId: urlInfo?.index || null,

      // Send raw HTML - preserves all formatting and math
      html: problemStatement.innerHTML,

      // Also extract clean examples separately
      examples: extractExamples(),

      // Metadata
      timeLimit: document.querySelector('.time-limit')?.textContent.trim() || '',
      memoryLimit: document.querySelector('.memory-limit')?.textContent.trim() || '',
      title: document.querySelector('.title')?.textContent.trim() || ''
    };
  }

  // Scrape problem data using simple DOM scraping
  function scrapeProblemData() {
    const problemStatement = document.querySelector('.problem-statement');
    if (!problemStatement) {
      return null;
    }

    // Extract statement - get the main description div (first div after header)
    const statementDiv = problemStatement.querySelector('.header + div') || 
                                  problemStatement.querySelector(':scope > div:not(.header)');
    const statement = statementDiv ? extractProblemWithMath(statementDiv) : '';

    // Extract input/output specifications (scoped to problemStatement)
    const inputSpecEl = problemStatement.querySelector('.input-specification');
    const inputSpec = inputSpecEl ? extractProblemWithMath(inputSpecEl) : '';
    const outputSpecEl = problemStatement.querySelector('.output-specification');
    const outputSpec = outputSpecEl ? extractProblemWithMath(outputSpecEl) : '';
    
    // Extract notes if present (scoped to problemStatement)
    const notesEl = problemStatement.querySelector('.note');
    const notes = notesEl ? extractProblemWithMath(notesEl) : '';

    // Combine statement and notes for full description
    let description = statement.trim();
    if (notes) {
      description += (description ? '\n\n' : '') + 'Note: ' + notes.trim();
    }

    // Extract title (scoped to problemStatement, with fallback to document)
    const titleEl = problemStatement.querySelector('.title') || document.querySelector('.title');
    const title = titleEl ? extractProblemWithMath(titleEl) : '';

    return {
      title: title,
      statement: statement,
      inputSpec: inputSpec,
      outputSpec: outputSpec,
      notes: notes,
      description: description,
      timeLimit: document.querySelector('.time-limit')?.textContent.trim() || '',
      memoryLimit: document.querySelector('.memory-limit')?.textContent.trim() || '',
      examples: extractExamples()
    };
  }

  async function extractProblemData() {
    // Pure DOM scraping - no API calls
    const titleEl = document.querySelector('.title');
    const problemStatement = document.querySelector('.problem-statement');
    
    if (!problemStatement) {
      throw new Error('Problem statement not found');
    }

    // Get HTML version (best for LLM - preserves all formatting and math)
    const htmlData = scrapeProblemHTML();
    
    // Get text version (for compatibility)
    const textData = scrapeProblemData();
    
    if (!textData && !htmlData) {
      throw new Error('Could not extract problem data from page');
    }

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
    
    // Get problem rating from DOM
    let problemRating = '';
      const ratingEl = document.querySelector('.tag-box[title*="Difficulty"]') || 
                       document.querySelector('[title*="rating"]');
      if (ratingEl) {
        problemRating = ratingEl.textContent.trim().replace('*', '');
    }
    
    // Get tags from DOM
    let tags = '';
      const tagElements = document.querySelectorAll('.tag-box a, [class*="tag"]');
      if (tagElements.length > 0) {
        tags = Array.from(tagElements)
          .map(el => el.textContent.trim())
          .filter(t => t.length > 0 && t.length < 30 && !t.match(/^\*?\d+$/)) // Exclude rating numbers
          .slice(0, 5)
          .join(', ');
    }

    // Format examples as string for LLM
    const examples = textData?.examples || htmlData?.examples || [];
    const examplesText = examples.map((ex, i) => {
      return `Example ${i + 1}:\n  Input:\n    ${(ex.input || '').split('\n').join('\n    ')}\n  Output:\n    ${(ex.output || '').split('\n').join('\n    ')}`;
    }).join('\n\n');

    // Extract constraints from time/memory limits
    const constraints = [];
    if (textData?.timeLimit) constraints.push(textData.timeLimit);
    if (textData?.memoryLimit) constraints.push(textData.memoryLimit);
    
    // Try to extract constraints from input spec (often contains constraint info)
    if (textData?.inputSpec) {
      const constraintMatches = textData.inputSpec.match(/\d+\s*≤\s*[^≤]+≤\s*\d+/g);
      if (constraintMatches && constraintMatches.length > 0) {
        constraints.push(...constraintMatches);
      }
    }

    // Build return object (compatible with existing code)
    const baseData = {
      title: textData?.title || htmlData?.title || '',
      description: textData?.description || textData?.statement || '',
      constraints: constraints.join('\n'),
      difficulty: difficulty,
      problemRating: problemRating,
      tags: tags,
      inputFormat: textData?.inputSpec || '',
      outputFormat: textData?.outputSpec || '',
      examples: examplesText,
      examplesCount: examples.length,
      url: window.location.href,
      // No API metadata - pure DOM scraping
      solvedCount: null,
      apiTags: null,
      // HTML version (best for LLM - preserves all formatting and LaTeX)
      html: htmlData?.html || (problemStatement ? problemStatement.innerHTML : null)
    };

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
        <h3 class="lch-settings-title">API Key Required</h3>
        <p class="lch-settings-message">
          To use LC Helper, please configure your API key in the extension settings.
        </p>
        <button class="lch-settings-btn" id="openSettingsBtn">Open Settings</button>
        ${currentProblemData ? `
        <div class="lch-favorite-section">
          <button class="lch-favorite-btn ${isFavorite ? 'active' : ''}" id="favoriteBtn">
            ${isFavorite ? '❤️' : '🤍'} ${isFavorite ? 'Remove from' : 'Add to'} Favorites
          </button>
        </div>
      </div>
      ` : ''}
    `;
    
    // Add event listeners
    const settingsBtn = body.querySelector('#openSettingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
      });
    }
    
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

    // Trigger MathJax rendering if available (Codeforces uses MathJax)
    const explanationContent = body.querySelector('.lch-explanation-content');
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
      
      const regenerateBtn = feedbackSection.querySelector('.lch-feedback-regenerate-btn');
      if (regenerateBtn) {
        regenerateBtn.addEventListener('click', () => {
          loadHints(true);
        });
      }
    }
  }
  
  // Format hint text professionally
  function formatHint(hint, hintIndex) {
    if (!hint) return '';
    
    // Parse markdown and escape HTML
    let formatted = parseMarkdown(hint);
    
    // Add visual indicators for different hint levels
    const indicators = ['💡', '🔍', '🎯'];
    const indicator = indicators[hintIndex] || '💡';
    
    return `<div class="lch-hint-text">${indicator} ${formatted}</div>`;
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function parseMarkdown(text) {
    if (!text) return '';
    
    // Process LaTeX notation - extract and replace with placeholders BEFORE escaping HTML
    // Convert \(...\) to inline math and \[...\] to display math
    // Use MathJax format that Codeforces already has loaded
    const mathPlaceholders = [];
    let processedText = text;
    
    // Process display math blocks \[...\] (non-greedy match)
    processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, function(match, content) {
      const placeholder = `__MATH_DISPLAY_${mathPlaceholders.length}__`;
      // Don't escape the LaTeX content - MathJax needs raw LaTeX
      mathPlaceholders.push(`<script type="math/tex; mode=display">${content.trim()}</script>`);
      return placeholder;
    });
    
    // Process inline math \(...\) (non-greedy, handle newlines in content)
    processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, function(match, content) {
      const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
      // Don't escape the LaTeX content - MathJax needs raw LaTeX
      mathPlaceholders.push(`<script type="math/tex">${content}</script>`);
      return placeholder;
    });
    
    // Now escape HTML (placeholders will be escaped, which is fine)
    let html = escapeHtml(processedText);
    
    // Restore MathJax script tags (unescaped, as they're proper HTML)
    mathPlaceholders.forEach((mathTag, index) => {
      // Replace the placeholder (which was escaped as regular text)
      // Try both display and inline placeholder patterns
      const displayPattern = escapeHtml(`__MATH_DISPLAY_${index}__`);
      const inlinePattern = escapeHtml(`__MATH_INLINE_${index}__`);
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
      let line = lines[i].trim();
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      // Headers
      if (line.startsWith('### ')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        processedLines.push(`<h3>${line.substring(4)}</h3>`);
        continue;
      } else if (line.startsWith('## ')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        processedLines.push(`<h2>${line.substring(3)}</h2>`);
        continue;
      } else if (line.startsWith('# ')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        processedLines.push(`<h1>${line.substring(2)}</h1>`);
        continue;
      }
      
      // Code blocks
      if (line.startsWith('```')) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        const language = line.substring(3).trim();
        let codeContent = '';
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeContent += lines[i] + '\n';
          i++;
        }
        processedLines.push(`<pre><code class="language-${language}">${escapeHtml(codeContent.trim())}</code></pre>`);
        continue;
      }
      
      // Inline code
      if (line.includes('`')) {
        line = line.replace(/`([^`]+)`/g, '<code>$1</code>');
      }
      
      // Bold and italic
      let processedLine = line
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
      
      // Links
      processedLine = processedLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      
      // Empty line - close paragraph if open
      if (!processedLine) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        continue;
      }
      
      // Regular line - start paragraph if needed
      if (!inParagraph) {
        processedLines.push('<p>');
        inParagraph = true;
      }
      
      processedLines.push(processedLine);
      
      // Close paragraph if next line is empty or a header
      if (!nextLine || nextLine.startsWith('#') || nextLine.startsWith('```')) {
        processedLines.push('</p>');
        inParagraph = false;
      }
    }
    
    // Close any open paragraph
    if (inParagraph) {
      processedLines.push('</p>');
    }
    
    return processedLines.join('\n');
  }
  
  function generateCacheKey(url) {
    if (!url) return '';
    return url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 100);
  }

})();
