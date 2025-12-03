// LC Helper - LeetCode Content Script

(function() {
  'use strict';

  let panel = null;
  let fab = null;
  let isLoading = false;
  let hasAutoDetectedSolve = false; // Prevent multiple triggers
  let fetchInterceptorInstalled = false;

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

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Wait for LeetCode to fully load
    setTimeout(() => {
      createFAB();
      checkAutoShow();
      setupFetchInterceptor();   // API-based detection (monitors /submissions/detail/{id}/check/)
      setupMessageListener();     // Listen for background script events
      checkIfAlreadySolved();     // Check if problem was already solved
    }, 1500);
  }

  // Check if this problem is already marked as solved
  async function checkIfAlreadySolved() {
    const problemKey = generateCacheKey(window.location.href);
    const result = await safeStorageGet(`solved_${problemKey}`);
    if (result[`solved_${problemKey}`]) {
      console.log('LC Helper: Problem already marked as solved');
      hasAutoDetectedSolve = true;
    }
  }

  // ============================================
  // API-BASED SUBMISSION DETECTION (PRIMARY METHOD)
  // ============================================

  // Listen for messages from background script about submission API events
  function setupMessageListener() {
    if (!isExtensionContextValid()) return;
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.event === 'submissionCheckCompleted') {
        console.log('LC Helper: Received submission check event from background');
      } else if (message.event === 'submissionStarted') {
        console.log('LC Helper: Submission started');
      }
      sendResponse({ received: true });
      return true;
    });
    
    console.log('LC Helper: Message listener active');
  }

  // Set up listener for messages from injected page script
  function setupPageScriptListener() {
    window.addEventListener('message', (event) => {
      // Only accept messages from the same window
      if (event.source !== window) return;
      
      if (event.data?.type === 'LC_HELPER_SUBMISSION_ACCEPTED') {
        console.log('LC Helper: Received Accepted event from page script', event.data);
        
        if (!hasAutoDetectedSolve) {
          hasAutoDetectedSolve = true;
          setTimeout(() => handleAutoSolveDetection(), 300);
        }
      } else if (event.data?.type === 'LC_HELPER_SUBMISSION_RESULT') {
        console.log('LC Helper: Submission result:', event.data.status);
      }
    });
    
    console.log('LC Helper: Page script listener active');
  }

  // Inject fetch interceptor into page context (content scripts run in isolated world)
  function setupFetchInterceptor() {
    if (fetchInterceptorInstalled) return;
    fetchInterceptorInstalled = true;
    
    // This script will run in the page's context, not the content script's isolated world
    const interceptorScript = document.createElement('script');
    interceptorScript.textContent = `
      (function() {
        // Don't install twice
        if (window.__lcHelperInterceptorInstalled) return;
        window.__lcHelperInterceptorInstalled = true;
        
        const originalFetch = window.fetch;
        
        window.fetch = async function(...args) {
          const response = await originalFetch.apply(this, args);
          
          try {
            // Get the URL from the request
            const url = args[0]?.url || args[0] || '';
            
            // Check if this is a submission check endpoint
            // LeetCode polls: GET /submissions/detail/{submission_id}/check/
            if (typeof url === 'string' && 
                url.includes('/submissions/detail/') && 
                url.includes('/check/')) {
              
              // Clone the response so we can read it without affecting the original
              const clonedResponse = response.clone();
              
              try {
                const data = await clonedResponse.json();
                
                // Check if submission was accepted
                // LeetCode returns: { state: "SUCCESS", status_display: "Accepted", ... }
                if (data.state === 'SUCCESS') {
                  const status = data.status_display || data.status_msg;
                  
                  if (status === 'Accepted') {
                    console.log('[LC Helper] Detected Accepted submission via API!', {
                      state: data.state,
                      status: status,
                      runtime: data.status_runtime || data.runtime,
                      memory: data.status_memory || data.memory
                    });
                    
                    // Send message to content script
                    window.postMessage({
                      type: 'LC_HELPER_SUBMISSION_ACCEPTED',
                      status: status,
                      runtime: data.status_runtime || data.runtime,
                      memory: data.status_memory || data.memory
                    }, '*');
                  } else {
                    // Other results: Wrong Answer, TLE, MLE, RE, etc.
                    console.log('[LC Helper] Submission result:', status);
                    window.postMessage({
                      type: 'LC_HELPER_SUBMISSION_RESULT',
                      status: status
                    }, '*');
                  }
                }
                // state === 'PENDING' or 'STARTED' means still judging, ignore
                
              } catch (e) {
                // JSON parse error, ignore
              }
            }
            
            // Also check GraphQL responses for submission results
            if (typeof url === 'string' && url.includes('/graphql')) {
              const clonedResponse = response.clone();
              
              try {
                const data = await clonedResponse.json();
                
                // Check various possible GraphQL response structures
                const checkResult = data?.data?.submissionDetails ||
                                    data?.data?.submissionResult || 
                                    data?.data?.checkSubmission ||
                                    data?.data?.submission;
                
                if (checkResult) {
                  const status = checkResult.statusDisplay || 
                                 checkResult.status || 
                                 checkResult.status_display;
                  
                  if (status === 'Accepted') {
                    console.log('[LC Helper] Detected Accepted via GraphQL!', checkResult);
                    
                    window.postMessage({
                      type: 'LC_HELPER_SUBMISSION_ACCEPTED',
                      status: status,
                      runtime: checkResult.runtime || checkResult.runtimeDisplay,
                      memory: checkResult.memory || checkResult.memoryDisplay
                    }, '*');
                  }
                }
              } catch (e) {
                // Not the response we're looking for
              }
            }
          } catch (e) {
            // Ignore errors in our interceptor
          }
          
          return response;
        };
        
        console.log('[LC Helper] Fetch interceptor installed in page context');
      })();
    `;
    
    // Inject the script into the page
    (document.head || document.documentElement).appendChild(interceptorScript);
    interceptorScript.remove(); // Clean up the script tag
    
    // Set up listener to receive messages from the injected script
    setupPageScriptListener();
    
    console.log('LC Helper: Fetch interceptor injected into page context');
  }

  // Handle auto-detection of solved problem (called when API returns "Accepted")
  async function handleAutoSolveDetection() {
    const problemKey = generateCacheKey(window.location.href);
    
    // Check if already solved to prevent duplicates
    const result = await safeStorageGet(`solved_${problemKey}`);
    if (result[`solved_${problemKey}`]) {
      console.log('LC Helper: Problem already marked as solved, skipping auto-detection');
      return;
    }
    
    console.log('LC Helper: Auto-marking problem as solved!');
    
    const problemData = extractProblemData();
    
    const saveData = {
      title: problemData.title,
      url: window.location.href,
      difficulty: problemData.difficulty,
      tags: problemData.tags,
      solvedAt: Date.now(),
      platform: 'leetcode',
      autoDetected: true // Flag to indicate this was auto-detected
    };
    
    // Mark as solved locally
    const saved = await safeStorageSet({ [`solved_${problemKey}`]: saveData });
    if (saved) {
      console.log('LC Helper: Problem auto-saved to local storage');
    }
    
    // Update streak system (may fail if extension was reloaded, but that's okay)
    const response = await safeSendMessage({
      type: 'MARK_SOLVED',
      problemData: saveData
    });
    
    if (response && response.success) {
      // Show celebration
      showStreakCelebration(response.streakData);
    } else {
      // Still show a basic celebration since we detected success
      showQuickNotification('🎉 Problem Solved!');
    }
    
    // Update button if panel is open
    updateSolvedButtonInPanel();
  }

  function updateSolvedButtonInPanel() {
    if (!panel) return;
    
    const solvedBtn = panel.querySelector('.lch-mark-solved-btn');
    if (solvedBtn && !solvedBtn.classList.contains('solved')) {
      solvedBtn.textContent = '✓ Solved';
      solvedBtn.classList.add('solved');
      solvedBtn.disabled = true;
    }
  }

  function createFAB() {
    if (document.querySelector('.lch-fab')) return;

    fab = document.createElement('button');
    fab.className = 'lch-fab';
    fab.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    `;
    fab.title = 'LC Helper - Get Hints (Right-click to mark as solved)';
    fab.addEventListener('click', togglePanel);
    
    // Add context menu for quick "Mark as Solved"
    fab.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      await quickMarkAsSolved();
    });

    document.body.appendChild(fab);
  }

  // Quick mark as solved without opening panel
  async function quickMarkAsSolved() {
    const problemKey = generateCacheKey(window.location.href);
    const result = await safeStorageGet(`solved_${problemKey}`);
    
    if (result[`solved_${problemKey}`]) {
      // Already solved - show a quick notification
      showQuickNotification('✓ Already marked as solved!');
      return;
    }
    
    // Mark as solved
    const problemData = extractProblemData();
    
    const saveData = {
      title: problemData.title,
      url: window.location.href,
      difficulty: problemData.difficulty,
      tags: problemData.tags,
      solvedAt: Date.now(),
      platform: 'leetcode'
    };
    
    // Save locally first (this works even if extension context is invalid for messaging)
    const saved = await safeStorageSet({ [`solved_${problemKey}`]: saveData });
    
    if (!saved) {
      showQuickNotification('✓ Marked as solved!');
      updateSolvedButtonInPanel();
      return;
    }
    
    // Try to update streak system
    const response = await safeSendMessage({
      type: 'MARK_SOLVED',
      problemData: saveData
    });
    
    if (response && response.success) {
      showStreakCelebration(response.streakData);
      updateSolvedButtonInPanel();
    } else {
      // Still show success since we saved locally
      showQuickNotification('✓ Marked as solved!');
      updateSolvedButtonInPanel();
    }
  }

  function showQuickNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'lch-quick-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  function createPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.className = 'lch-panel';
    panel.innerHTML = `
      <div class="lch-panel-header">
        <h3 class="lch-panel-title">LC Helper</h3>
        <p class="lch-panel-subtitle">Smart hints & topic analysis</p>
      </div>
      <div class="lch-panel-body">
        <div class="lch-loading">
          <div class="lch-spinner"></div>
          <span class="lch-loading-text">Analyzing problem...</span>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    
    // Add solved button immediately (before hints load)
    addSolvedButton();
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

      const problem = extractProblemData();

      if (!problem.title || !problem.description) {
        showError('Could not extract problem data. Please refresh the page.');
        isLoading = false;
        return;
      }

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
        showHints(response);
      }
    } catch (error) {
      showError(error.message || 'An error occurred. Please refresh the page.');
    }

    isLoading = false;
  }

  function extractProblemData() {
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

    return {
      title: titleEl?.textContent?.trim() || '',
      description: descriptionEl?.textContent?.trim().slice(0, 2000) || '', // Limit description length
      constraints: constraints,
      difficulty: difficulty,
      tags: tags,
      url: window.location.href
    };
  }

  function showLoading() {
    const body = panel.querySelector('.lch-panel-body');
    
    // Check if solved button exists before clearing
    const hadSolvedButton = body.querySelector('.lch-solved-section');
    
    body.innerHTML = `
      <div class="lch-loading">
        <div class="lch-spinner"></div>
        <span class="lch-loading-text">Analyzing problem...</span>
      </div>
    `;
    
    // Always add solved button at the top (before loading indicator)
    addSolvedButton();
  }

  function showError(message) {
    const body = panel.querySelector('.lch-panel-body');
    
    body.innerHTML = `
      <div class="lch-error">
        <div class="lch-error-icon">😕</div>
        <p class="lch-error-message">${escapeHtml(message)}</p>
        <button class="lch-retry-btn">Try Again</button>
      </div>
    `;

    body.querySelector('.lch-retry-btn').addEventListener('click', loadHints);
    
    // Add solved button at the top
    addSolvedButton();
  }

  function showSettingsPrompt() {
    const body = panel.querySelector('.lch-panel-body');
    
    body.innerHTML = `
      <div class="lch-settings-prompt">
        <div class="lch-settings-icon">🔑</div>
        <p class="lch-settings-message">
          To use smart hints, please add your OpenAI API key in the extension settings.
        </p>
        <button class="lch-settings-btn">Open Settings</button>
      </div>
    `;

    body.querySelector('.lch-settings-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });
    
    // Add solved button at the top
    addSolvedButton();
  }

  function showHints(data) {
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
    
    // Add solved button
    addSolvedButton();
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

  // Add Mark as Solved button to panel
  async function addSolvedButton() {
    const body = panel?.querySelector('.lch-panel-body');
    if (!body) return;
    
    // Don't add duplicate buttons
    if (body.querySelector('.lch-solved-section')) return;
    
    const problemKey = generateCacheKey(window.location.href);
    
    // Check if already solved using safe wrapper
    const result = await safeStorageGet(`solved_${problemKey}`);
    const isSolved = result[`solved_${problemKey}`];
    
    const solvedSection = document.createElement('div');
    solvedSection.className = 'lch-solved-section';
    solvedSection.innerHTML = `
      <button class="lch-mark-solved-btn ${isSolved ? 'solved' : ''}">
        ${isSolved ? '✓ Solved' : '✓ Mark as Solved'}
      </button>
    `;
    
    // Insert as the FIRST child (at the top of the panel)
    body.insertBefore(solvedSection, body.firstChild);
    
    // Add click handler
    const solvedBtn = solvedSection.querySelector('.lch-mark-solved-btn');
    if (!isSolved) {
      solvedBtn.addEventListener('click', async () => {
        await markProblemAsSolved(solvedBtn);
      });
    } else {
      solvedBtn.disabled = true;
    }
  }

  async function markProblemAsSolved(button) {
    console.log('Mark as Solved button clicked!');
    
    const problemData = extractProblemData();
    const problemKey = generateCacheKey(window.location.href);
    
    console.log('Problem data:', problemData);
    console.log('Problem key:', problemKey);
    
    const saveData = {
      title: problemData.title,
      url: window.location.href,
      difficulty: problemData.difficulty,
      tags: problemData.tags,
      solvedAt: Date.now(),
      platform: 'leetcode'
    };
    
    // Mark as solved locally using safe wrapper
    const saved = await safeStorageSet({ [`solved_${problemKey}`]: saveData });
    console.log('Problem saved to local storage:', saved);
    
    // Update button immediately for better UX
    button.textContent = '✓ Solved';
    button.classList.add('solved');
    button.disabled = true;
    
    // Try to update streak system
    console.log('Sending MARK_SOLVED message to background...');
    const response = await safeSendMessage({
      type: 'MARK_SOLVED',
      problemData: saveData
    });
    
    console.log('Response from background:', response);
    
    if (response && response.success) {
      // Show celebration with streak info
      console.log('Showing celebration with streak:', response.streakData);
      showStreakCelebration(response.streakData);
    } else {
      // Still show a notification since we saved locally
      showQuickNotification('✓ Marked as solved!');
    }
  }

  function generateCacheKey(url) {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 100);
  }

  function showStreakCelebration(streakData) {
    // Handle undefined or missing streak data
    const currentStreak = streakData?.currentStreak || 1;
    
    const celebration = document.createElement('div');
    celebration.className = 'lch-celebration';
    
    const { icon, title, subtitle } = getCelebrationContent(currentStreak);
    
    celebration.innerHTML = `
      <div class="lch-celebration-content">
        <div class="lch-celebration-icon">${icon}</div>
        <div class="lch-celebration-title">${title}</div>
        <div class="lch-celebration-streak">
          🔥 ${currentStreak} Day Streak
        </div>
        <div class="lch-celebration-subtitle">${subtitle}</div>
      </div>
    `;
    document.body.appendChild(celebration);
    
    setTimeout(() => celebration.remove(), 3000);
  }

  function getCelebrationContent(streak) {
    if (streak === 1) {
      return {
        icon: '🎉',
        title: 'Awesome Start!',
        subtitle: 'First step to greatness! Come back tomorrow!'
      };
    } else if (streak === 7) {
      return {
        icon: '🏅',
        title: 'Week Warrior!',
        subtitle: 'You\'ve built an amazing 7-day habit!'
      };
    } else if (streak === 30) {
      return {
        icon: '🏆',
        title: 'Month Master!',
        subtitle: '30 days of dedication! You\'re unstoppable!'
      };
    } else if (streak === 50) {
      return {
        icon: '💎',
        title: 'Elite Status!',
        subtitle: '50 days! You\'re in the top 1%!'
      };
    } else if (streak === 100) {
      return {
        icon: '👑',
        title: 'CENTURY LEGEND!',
        subtitle: '100 days! You\'re absolutely incredible!'
      };
    } else if (streak < 7) {
      return {
        icon: '🌟',
        title: 'Problem Solved!',
        subtitle: `${streak} days and counting! Keep going!`
      };
    } else if (streak < 30) {
      return {
        icon: '🔥',
        title: 'On Fire!',
        subtitle: `${streak} days! You\'re building something special!`
      };
    } else if (streak < 100) {
      return {
        icon: '⚡',
        title: 'Crushing It!',
        subtitle: `${streak} days of pure dedication!`
      };
    } else {
      return {
        icon: '🚀',
        title: 'LEGENDARY!',
        subtitle: `${streak} days! You\'re a coding machine!`
      };
    }
  }
})();

