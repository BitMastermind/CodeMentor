// LC Helper - LeetCode Content Script

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

  // Safe wrapper for chrome.storage.local operations
  async function safeStorageGet(key) {
    if (!isExtensionContextValid()) {
      console.log('LC Helper: Extension context invalidated, using fallback');
      return {};
    }
    try {
      return await chrome.storage.local.get(key);
    } catch (e) {
      console.log('LC Helper: Storage access failed:', e.message);
      return {};
    }
  }

  async function safeStorageSet(data) {
    if (!isExtensionContextValid()) {
      console.log('LC Helper: Extension context invalidated, cannot save');
      return false;
    }
    try {
      await chrome.storage.local.set(data);
      return true;
    } catch (e) {
      console.log('LC Helper: Storage save failed:', e.message);
      return false;
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
    
    // Wait for LeetCode to fully load, but also check if body is ready
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
        platform: 'leetcode',
        difficulty: problemData.difficulty
      };
      
      const response = await safeSendMessage({
        type: 'START_TIMER',
        problem: currentProblemData
      });
      
      if (response?.timer) {
        timerStartTime = response.timer.startTime;
        startTimerDisplay();
        
        // Check if reminder was already sent
        if (response.timer.reminderSent) {
          showTimerReminderModal();
        }
      }
    } catch (e) {
      console.log('LC Helper: Timer init failed:', e.message);
    }
  }

  // Start timer display update
  function startTimerDisplay() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
      updateTimerDisplay();
    }, 1000);
    
    // Initial update
    updateTimerDisplay();
  }

  // Update timer display in panel
  function updateTimerDisplay() {
    const timerEl = document.querySelector('.lch-timer-display');
    if (!timerEl || !timerStartTime) return;
    
    const elapsed = Date.now() - timerStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Add warning class if over 30 minutes
    if (minutes >= 30) {
      timerEl.classList.add('warning');
    }
  }

  // Show 30-minute reminder modal
  function showTimerReminderModal() {
    // Check if modal already exists
    if (document.querySelector('.lch-timer-modal')) return;
    
    const modal = document.createElement('div');
    modal.className = 'lch-timer-modal';
    modal.innerHTML = `
      <div class="lch-timer-modal-content">
        <div class="lch-timer-modal-icon">⏰</div>
        <h3 class="lch-timer-modal-title">30 Minutes Elapsed!</h3>
        <p class="lch-timer-modal-text">You've been working on this problem for a while. Consider:</p>
        <div class="lch-timer-modal-buttons">
          <button class="lch-timer-modal-btn hint" id="timerHintBtn">💡 Take a Hint</button>
          <button class="lch-timer-modal-btn solution" id="timerSolutionBtn">📺 Watch Solution</button>
        </div>
        <button class="lch-timer-modal-close" id="timerModalClose">Keep Trying</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('timerHintBtn').addEventListener('click', () => {
      modal.remove();
      // Open hints panel
      if (!panel) createPanel();
      panel.classList.add('active');
      loadHints();
    });
    
    document.getElementById('timerSolutionBtn').addEventListener('click', () => {
      modal.remove();
      // Open solution tab (LeetCode specific)
      const solutionTab = document.querySelector('[data-cy="solutions-tab"]') || 
                          document.querySelector('a[href*="/solutions"]');
      if (solutionTab) solutionTab.click();
    });
    
    document.getElementById('timerModalClose').addEventListener('click', () => {
      modal.remove();
    });
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
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
    fab.title = 'LC Helper - Get Hints (Right-click to mark as solved)';
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
        <div class="lch-loading">
          <div class="lch-spinner"></div>
          <span class="lch-loading-text">Analyzing problem...</span>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    
    // Update timer display if already running
    if (timerStartTime) {
      updateTimerDisplay();
    }
  }

  function togglePanel() {
    if (!panel) {
      createPanel();
    }

    panel.classList.toggle('active');

    if (panel.classList.contains('active') && !isLoading) {
      loadHints();
    }
  }

  async function checkAutoShow() {
    if (!isExtensionContextValid()) return;
    
    try {
      const { autoShowPanel } = await chrome.storage.sync.get('autoShowPanel');
      if (autoShowPanel) {
        createPanel();
        panel.classList.add('active');
        loadHints();
      }
    } catch (e) {
      console.log('LC Helper: Could not check auto-show setting');
    }
  }

  async function loadHints(forceRefresh = false) {
    if (!isExtensionContextValid()) {
      showError('Extension was reloaded. Please refresh the page.');
      return;
    }
    
    try {
      const { apiKey } = await chrome.storage.sync.get('apiKey');

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
        platform: 'leetcode',
        difficulty: problem.difficulty
      };

      // Add force refresh flag
      problem.forceRefresh = forceRefresh;

      const response = await safeSendMessage({
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

  async function extractProblemData() {
    // LeetCode problem page selectors
    const titleEl = document.querySelector('[data-cy="question-title"]') || 
                    document.querySelector('.text-title-large') ||
                    document.querySelector('h4[data-cy="question-title"]') ||
                    document.querySelector('[class*="title"]');
    
    const descriptionEl = document.querySelector('[data-cy="question-content"]') ||
                          document.querySelector('.elfjS') ||
                          document.querySelector('[class*="question-content"]') ||
                          document.querySelector('[class*="description"]');

    // Extract difficulty
    let difficulty = 'Unknown';
    const difficultyEl = document.querySelector('[diff]') ||
                         document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
                         document.querySelector('[class*="difficulty"]');
    if (difficultyEl) {
      difficulty = difficultyEl.textContent.trim();
    }
    
    // Extract existing tags
    let tags = '';
    const tagElements = document.querySelectorAll('[class*="topic-tag"], .tag, a[href*="/tag/"]');
    if (tagElements.length > 0) {
      tags = Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 5) // Limit to 5 tags
        .join(', ');
    }

    // Try to get constraints
    let constraints = '';
    const constraintsHeader = Array.from(document.querySelectorAll('strong, b'))
      .find(el => el.textContent.toLowerCase().includes('constraints'));
    
    if (constraintsHeader) {
      const constraintsList = constraintsHeader.closest('p')?.nextElementSibling;
      if (constraintsList) {
        constraints = constraintsList.textContent;
      }
    }

    const baseData = {
      title: titleEl?.textContent?.trim() || '',
      description: descriptionEl?.textContent?.trim().slice(0, 2000) || '', // Limit description length
      constraints: constraints,
      difficulty: difficulty,
      tags: tags,
      url: window.location.href
    };

    // Check if problem has images/graphs and capture them
    if (descriptionEl && typeof html2canvas !== 'undefined') {
      const hasImages = descriptionEl.querySelectorAll('img, svg, canvas').length > 0;
      
      if (hasImages) {
        try {
          // Capture the problem description element as an image
          const canvas = await html2canvas(descriptionEl, {
            allowTaint: true,
            useCORS: true,
            scale: 1.5, // Balance between quality and size
            logging: false,
            backgroundColor: '#ffffff'
          });
          
          // Optimize image size - resize if too large
          const optimizedImage = optimizeImageData(canvas);
          
          return {
            ...baseData,
            hasImages: true,
            imageData: optimizedImage // Base64 encoded image
          };
        } catch (error) {
          console.error('LC Helper: Failed to capture image:', error);
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
      
      // Use JPEG for better compression (unless transparency is needed)
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
    
    let actionButton = '';
    if (isQuotaError) {
      actionButton = '<button class="lch-settings-btn" style="margin-top: 8px;">Get New API Key</button>';
    } else if (isApiKeyError) {
      actionButton = '<button class="lch-settings-btn" style="margin-top: 8px;">Open Settings</button>';
    }
    
    body.innerHTML = `
      <div class="lch-error">
        <div class="lch-error-icon">${isQuotaError ? '⚠️' : '😕'}</div>
        <p class="lch-error-message">${escapeHtml(message)}</p>
        <button class="lch-retry-btn">Try Again</button>
        ${actionButton}
      </div>
    `;

    body.querySelector('.lch-retry-btn').addEventListener('click', loadHints);
    
    if (actionButton) {
      const actionBtn = body.querySelector('.lch-settings-btn');
      actionBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      });
    }
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
            platform: 'leetcode',
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
          To use smart hints, please add your OpenAI API key in the extension settings.
        </p>
        <button class="lch-settings-btn">Open Settings</button>
      </div>
      ${currentProblemData ? `
      <div class="lch-actions-section">
        <button class="lch-favorite-btn ${isFavorite ? 'active' : ''}" id="favoriteBtn">
          ${isFavorite ? '❤️ Favorited' : '🤍 Add to Favorites'}
        </button>
      </div>
      ` : ''}
    `;

    body.querySelector('.lch-settings-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });
    
    // Add favorite button handler if button exists
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
    
    // Check if hints are from cache
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
      <div class="lch-topic-section">
        <div class="lch-topic-label">Problem Topic</div>
        <div class="lch-topic-badge">${escapeHtml(data.topic)}</div>
        ${cacheInfo}
      </div>
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
              ${escapeHtml(hint)}
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
    
    // Add refresh handler if cached
    const refreshBtn = body.querySelector('.lch-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadHints(true); // Force refresh
      });
    }
    
    // Add feedback handlers
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
    
    // Add solved button
    addSolvedButton();
  }
  
  // Toggle favorite status
  async function toggleFavorite(btn) {
    if (!isExtensionContextValid() || !currentProblemData) return;
    
    const isCurrentlyFavorite = btn.classList.contains('active');
    
    try {
      if (isCurrentlyFavorite) {
        // Remove from favorites
        const id = `leetcode_${generateCacheKey(currentProblemData.url)}`;
        await safeSendMessage({ type: 'REMOVE_FAVORITE', id });
        btn.classList.remove('active');
        btn.innerHTML = '🤍 Add to Favorites';
      } else {
        // Add to favorites
        await safeSendMessage({ type: 'ADD_FAVORITE', problem: currentProblemData });
        btn.classList.add('active');
        btn.innerHTML = '❤️ Favorited';
      }
    } catch (e) {
      console.log('LC Helper: Favorite toggle failed:', e.message);
    }
  }

  function addSolvedButton() {
    const body = panel.querySelector('.lch-panel-body');
    const problemKey = generateCacheKey(window.location.href);
    
    safeStorageGet(`solved_${problemKey}`).then((result) => {
      const isSolved = result[`solved_${problemKey}`];
      
      if (!body.querySelector('.lch-solved-section')) {
        const solvedSection = document.createElement('div');
        solvedSection.className = 'lch-solved-section';
        solvedSection.innerHTML = `
          <button class="lch-mark-solved-btn ${isSolved ? 'solved' : ''}">
            ${isSolved ? '✓ Solved' : '✓ Mark as Solved'}
          </button>
        `;
        
        const feedbackSection = body.querySelector('.lch-feedback-section');
        if (feedbackSection) {
          body.insertBefore(solvedSection, feedbackSection);
        } else {
          body.appendChild(solvedSection);
        }
        
        const solvedBtn = solvedSection.querySelector('.lch-mark-solved-btn');
        if (!isSolved) {
          solvedBtn.addEventListener('click', async () => {
            await markProblemAsSolved(solvedBtn);
          });
        } else {
          solvedBtn.disabled = true;
        }
      }
    });
  }

  async function markProblemAsSolved(button) {
    console.log('Mark as Solved button clicked!');
    
    try {
      const problemData = await extractProblemData();
      const problemKey = generateCacheKey(window.location.href);
      
      const saveData = {
        title: problemData.title,
        url: window.location.href,
        difficulty: problemData.difficulty,
        tags: problemData.tags,
        solvedAt: Date.now(),
        platform: 'leetcode'
      };
      
      await safeStorageSet({ [`solved_${problemKey}`]: saveData });
      console.log('Problem saved to local storage');
      
      // Increment daily count
      await safeSendMessage({
        type: 'INCREMENT_DAILY_COUNT',
        problemUrl: window.location.href
      });
      
      // Stop the timer for this problem
      await safeSendMessage({
        type: 'STOP_TIMER',
        url: window.location.href
      });
      
      button.textContent = '✓ Solved';
      button.classList.add('solved');
      button.disabled = true;
      
      // Show celebration
      showStreakCelebration({ currentStreak: 1 });
      
    } catch (error) {
      console.error('Error marking problem as solved:', error);
      button.textContent = '✓ Solved';
      button.classList.add('solved');
      button.disabled = true;
    }
  }

  function showStreakCelebration(streakData) {
    const currentStreak = streakData?.currentStreak || 1;
    
    const celebration = document.createElement('div');
    celebration.className = 'lch-celebration';
    
    celebration.innerHTML = `
      <div class="lch-celebration-content">
        <div class="lch-celebration-icon">🎉</div>
        <div class="lch-celebration-title">Problem Solved!</div>
        <div class="lch-celebration-streak">
          🔥 Keep it up!
        </div>
        <div class="lch-celebration-subtitle">Great work on solving this problem!</div>
      </div>
    `;
    document.body.appendChild(celebration);
    
    setTimeout(() => celebration.remove(), 3000);
  }
  
  function handleFeedback(rating, hintData) {
    const feedbackSection = panel.querySelector('#feedbackSection');
    
    if (rating === 'up') {
      // Positive feedback
      feedbackSection.innerHTML = `
        <div class="lch-feedback-thanks">
          <div class="lch-feedback-thanks-text">
            ✨ Thanks for your feedback!
          </div>
        </div>
      `;
      
      // Log feedback (could be sent to analytics)
      console.log('Positive feedback for hints:', hintData.topic);
      
    } else {
      // Negative feedback - offer to regenerate
      feedbackSection.innerHTML = `
        <div class="lch-feedback-thanks">
          <div class="lch-feedback-improve">
            <div class="lch-feedback-improve-text">Sorry the hints weren't helpful.</div>
            <button class="lch-feedback-regenerate-btn">🔄 Try Different Hints</button>
          </div>
        </div>
      `;
      
      // Log feedback
      console.log('Negative feedback for hints:', hintData.topic);
      
      // Add regenerate handler
      feedbackSection.querySelector('.lch-feedback-regenerate-btn').addEventListener('click', () => {
        loadHints(true); // Force refresh with new hints
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function generateCacheKey(url) {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 100);
  }

})();

