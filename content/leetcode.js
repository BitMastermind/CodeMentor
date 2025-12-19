// CodeMentor - LeetCode Content Script

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

  // Safe wrapper for chrome.storage.local operations
  async function safeStorageGet(key) {
    if (!isExtensionContextValid()) {
      return {};
    }
    try {
      return await chrome.storage.local.get(key);
    } catch (e) {
      return {};
    }
  }

  async function safeStorageSet(data) {
    if (!isExtensionContextValid()) {
      return false;
    }
    try {
      await chrome.storage.local.set(data);
      return true;
    } catch (e) {
      return false;
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

    // Stop timer if it reaches 1 hour (60 minutes)
    if (minutes >= 60) {
      stopTimerDisplay();
      timerEl.textContent = '60:00';
      timerEl.classList.add('warning');
      return;
    }

    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Add warning class if over 30 minutes
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

  // Show 30-minute reminder modal
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
      console.log('CodeMentor: Failed to append FAB:', e);
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

    // Update timer display if already running
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
            platform: 'leetcode',
            difficulty: problemData.difficulty
          };
        }
      } catch (e) {
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

    try {
      const { autoShowPanel } = await chrome.storage.sync.get('autoShowPanel');
      if (autoShowPanel) {
        createPanel();
        panel.classList.add('active');
        loadHints();
      }
    } catch (e) {
    }
  }

  async function loadHints(forceRefresh = false) {
    if (!isExtensionContextValid()) {
      console.log('[CodeMentor] loadHints: Extension context invalidated');
      showError('Extension was reloaded. Please refresh the page.');
      return;
    }

    try {
      console.log('[CodeMentor] loadHints: Starting hint generation');
      const { apiKey } = await chrome.storage.sync.get('apiKey');

      if (!apiKey) {
        console.log('[CodeMentor] loadHints: No API key configured');
        showSettingsPrompt();
        return;
      }

      isLoading = true;
      showLoading();

      console.log('[CodeMentor] loadHints: Extracting problem data...');
      const problem = await extractProblemData();

      if (!problem.title || !problem.description) {
        console.log('CodeMentor: Failed to extract problem data (GET_HINTS)');
        console.log('Problem object:', problem);
        showError('Could not extract problem data. Please refresh the page and try again.');
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
        console.log('[CodeMentor] loadHints: No response from background script');
        showError('Extension was reloaded. Please refresh the page.');
      } else if (response.error) {
        console.log('[CodeMentor] loadHints: Error from background script:', response.error);
        showError(response.error);
      } else {
        console.log('[CodeMentor] loadHints: Successfully received hints');
        await showHints(response);
      }
    } catch (error) {
      console.log('[CodeMentor] loadHints: Exception occurred:', error);
      if (typeof LCHErrorTracking !== 'undefined') {
        LCHErrorTracking.trackError(error, {
          tags: { type: 'hint_loading', platform: 'leetcode' }
        });
      }
      if (typeof LCAnalytics !== 'undefined') {
        LCAnalytics.trackError('hint_loading', error.message);
      }
      showError(error.message || 'An error occurred. Please refresh the page.');
    }

    isLoading = false;
  }

  async function explainProblem(forceRefresh = false) {
    if (!isExtensionContextValid()) {
      console.log('[CodeMentor] explainProblem: Extension context invalidated');
      showError('Extension was reloaded. Please refresh the page.');
      return;
    }

    try {
      console.log('[CodeMentor] explainProblem: Starting problem explanation');
      const { apiKey } = await chrome.storage.sync.get('apiKey');

      if (!apiKey) {
        console.log('[CodeMentor] explainProblem: No API key configured');
        showSettingsPrompt();
        return;
      }

      isLoading = true;
      showLoading();

      console.log('[CodeMentor] explainProblem: Extracting problem data...');
      const problem = await extractProblemData();

      if (!problem.title || !problem.description) {
        console.log('CodeMentor: Failed to extract problem data (EXPLAIN_PROBLEM)');
        console.log('Problem object:', problem);
        showError('Could not extract problem data. Please refresh the page and try again.');
        isLoading = false;
        return;
      }

      // Set currentProblemData for favorite button functionality
      if (!currentProblemData) {
        currentProblemData = {
          url: window.location.href,
          title: problem.title,
          platform: 'leetcode',
          difficulty: problem.difficulty
        };
      }

      // Add force refresh flag
      problem.forceRefresh = forceRefresh;

      const response = await safeSendMessage({
        type: 'EXPLAIN_PROBLEM',
        problem
      });

      if (!response) {
        console.log('[CodeMentor] explainProblem: No response from background script');
        showError('Extension was reloaded. Please refresh the page.');
      } else if (response.error) {
        console.log('[CodeMentor] explainProblem: Error from background script:', response.error);
        showError(response.error);
      } else {
        console.log('[CodeMentor] explainProblem: Successfully received explanation');
        showExplanation(response);
      }
    } catch (error) {
      console.log('[CodeMentor] explainProblem: Exception occurred:', error);
      showError(error.message || 'An error occurred. Please refresh the page.');
    }

    isLoading = false;
  }

  // Helper function to extract text with superscript and subscript handling
  function extractTextWithSuperscripts(element) {
    if (!element) return '';

    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true);

    // Remove empty or hidden spans that might contain MathML artifacts
    clone.querySelectorAll('span:empty, span[style*="display:none"], span[class*="math"]').forEach(el => {
      if (!el.textContent.trim() || el.style.display === 'none') {
        el.remove();
      }
    });

    // Map Unicode superscript characters to their numeric equivalents
    const superscriptMap = {
      '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
      '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0',
      '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
      'ⁿ': 'n', 'ⁱ': 'i', 'ᵏ': 'k'
    };

    // Map Unicode subscript characters
    const subscriptMap = {
      '𝑖': 'i', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5',
      '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₀': '0',
      'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k',
      'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r',
      'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x'
    };

    // Convert all <sub> tags to _ notation FIRST (process in reverse order)
    const subElements = Array.from(clone.querySelectorAll('sub')).reverse();
    subElements.forEach(sub => {
      const subText = sub.textContent.trim();
      // Convert Unicode subscripts to regular characters if needed
      const normalizedText = subText.split('').map(char => subscriptMap[char] || char).join('');
      // Replace <sub>content</sub> with _content
      const replacement = document.createTextNode('_' + normalizedText);
      if (sub.parentNode) {
        sub.parentNode.replaceChild(replacement, sub);
      }
    });

    // Convert all <sup> tags to ^ notation
    // Process in reverse order to avoid index issues when replacing
    const supElements = Array.from(clone.querySelectorAll('sup')).reverse();
    supElements.forEach(sup => {
      const supText = sup.textContent.trim();
      // Convert Unicode superscripts to regular numbers if needed
      const normalizedText = supText.split('').map(char => superscriptMap[char] || char).join('');
      // Replace <sup>content</sup> with ^content
      const replacement = document.createTextNode('^' + normalizedText);
      if (sup.parentNode) {
        sup.parentNode.replaceChild(replacement, sup);
      }
    });

    // Now extract the text after processing <sup> tags
    let text = clone.textContent || clone.innerText || '';

    // Also handle Unicode superscript characters directly in text (in case they weren't in <sup> tags)
    // Handle multi-character superscripts first (e.g., ¹⁸ -> ^18)
    const supChars = Object.keys(superscriptMap).join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const multiSupPattern = new RegExp(`([a-zA-Z0-9])([${supChars}]+)(?![${supChars}])`, 'g');
    text = text.replace(multiSupPattern, (match, base, sups) => {
      const normalized = sups.split('').map(char => superscriptMap[char] || char).join('');
      return base + '^' + normalized;
    });

    // Then handle single superscript characters (only those not already converted)
    Object.keys(superscriptMap).forEach(supChar => {
      const num = superscriptMap[supChar];
      const escapedChar = supChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace superscript character with ^num, but only if it's not already part of ^ notation
      // Pattern: letter/number followed by superscript character (not already after ^ or part of another superscript)
      const regex = new RegExp(`([a-zA-Z0-9])${escapedChar}(?![0-9^${supChars}])`, 'g');
      text = text.replace(regex, `$1^${num}`);
    });

    // Handle subscript duplication: unicode subscript + ASCII equivalent (e.g., "𝑠𝑖si" -> "s_i")
    const subscriptChars = Object.keys(subscriptMap).join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    Object.keys(subscriptMap).forEach(subUnicode => {
      const ascii = subscriptMap[subUnicode];
      // Escape special regex characters in ascii value
      const escapedAscii = ascii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Pattern: letter + unicode subscript + same letter + same ascii (e.g., "s𝑖si" -> "s_i")
      text = text.replace(new RegExp(`([a-zA-Z])(${subUnicode})\\1(${escapedAscii})(?![a-z0-9₀-₉ᵢ-ₓ])`, 'gi'), `$1_${ascii}`);
      // Pattern: just unicode subscript + ascii (e.g., "𝑖i" -> "_i")
      text = text.replace(new RegExp(`(${subUnicode})(${escapedAscii})(?![a-z0-9₀-₉])`, 'gi'), `_${ascii}`);
    });

    // Handle superscript duplication: unicode superscript + ASCII equivalent (e.g., "2𝑘k" -> "2^k")
    Object.keys(superscriptMap).forEach(supUnicode => {
      const ascii = superscriptMap[supUnicode];
      // Escape special regex characters in ascii value
      const escapedAscii = ascii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Pattern: number/letter + unicode superscript + same number/letter + same ascii (e.g., "2𝑘k" -> "2^k")
      text = text.replace(new RegExp(`([a-zA-Z0-9])(${supUnicode})\\1(${escapedAscii})(?![a-z0-9⁰-⁹ᵃ-ᶻ])`, 'gi'), `$1^${ascii}`);
    });

    // Remove leading "ss" prefix (common HTML artifact)
    text = text.replace(/^ss\s*/i, '');
    text = text.replace(/([.!?]\s*)ss\s+/gi, '$1');

    return text.trim();
  }

  // Extract titleSlug from LeetCode URL
  // Examples:
  // - https://leetcode.com/problems/two-sum/
  // - https://leetcode.com/problems/two-sum/description/
  // - https://leetcode.cn/problems/two-sum/ (Chinese version)
  function parseTitleSlugFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const match = urlObj.pathname.match(/\/problems\/([^\/]+)/);
      if (match && match[1]) {
        return match[1];
      }
    } catch (e) {
    }
    return null;
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
            src = 'https://leetcode.com' + src;
          } else {
            src = 'https://leetcode.com/' + src;
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

  // Fetch problem data from LeetCode GraphQL API
  // Returns: Full problem data or null if API call fails
  async function fetchProblemFromGraphQL(titleSlug) {
    try {
      const query = `
        query questionContent($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            questionId
            questionFrontendId
            title
            titleSlug
            content
            difficulty
            topicTags {
              name
              slug
            }
            codeSnippets {
              lang
              langSlug
              code
            }
            exampleTestcases
            sampleTestCase
            metaData
            hints
          }
        }
      `;

      const response = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'Origin': 'https://leetcode.com'
        },
        body: JSON.stringify({
          query: query,
          variables: { titleSlug: titleSlug },
          operationName: 'questionContent'
        })
      });

      if (!response.ok) {
        console.log('[CodeMentor] fetchProblemFromGraphQL: API request failed with status:', response.status);
        return null;
      }

      const data = await response.json();

      if (data.errors || !data.data || !data.data.question) {
        console.log('[CodeMentor] fetchProblemFromGraphQL: API returned error or no question data:', data.errors || 'No question data');
        return null;
      }

      const question = data.data.question;

      // Extract images from HTML content first (before text extraction)
      let imageUrls = [];
      if (question.content) {
        imageUrls = extractImagesFromHTML(question.content);
      }

      // Parse HTML content to extract text
      // The content field contains HTML, so we need to extract text from it
      let description = '';
      let examples = [];
      let constraints = '';

      if (question.content) {
        // Create a temporary DOM element to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = question.content;

        // Extract description (everything before examples)
        const exampleSections = tempDiv.querySelectorAll('strong, b');
        let exampleStartIndex = -1;
        exampleSections.forEach((el, idx) => {
          if (el.textContent.toLowerCase().includes('example') && exampleStartIndex === -1) {
            exampleStartIndex = idx;
          }
        });

        // Get all paragraphs and process them
        const allElements = Array.from(tempDiv.children);
        const descriptionParts = [];
        let foundExample = false;

        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          const lowerText = text.toLowerCase();

          // Check if this is the start of examples
          if (lowerText.includes('example') && !foundExample) {
            foundExample = true;
            // Include the example header but break after extracting it
          }

          // Check if this is constraints section
          if (lowerText.includes('constraints') && !constraints) {
            const constraintsEl = el.nextElementSibling || el;
            constraints = extractTextWithSuperscripts(constraintsEl);
            continue;
          }

          if (!foundExample && text && !lowerText.includes('constraints')) {
            descriptionParts.push(extractTextWithSuperscripts(el));
          }
        }

        description = descriptionParts.join('\n\n');

        // Extract examples from the HTML content
        // LeetCode examples are usually in <pre> tags or specific div structures
        const preBlocks = tempDiv.querySelectorAll('pre');
        preBlocks.forEach((pre, index) => {
          const text = extractPreText(pre);
          if (text) {
            const inputMatch = text.match(/Input[:\s]*([^\n]*(?:\n(?!Output)[^\n]*)*)/i);
            const outputMatch = text.match(/Output[:\s]*([^\n]*(?:\n(?!Explanation)[^\n]*)*)/i);
            const explanationMatch = text.match(/Explanation[:\s]*([\s\S]*)/i);

            if (inputMatch || outputMatch) {
              examples.push({
                index: index + 1,
                raw: text,
                input: inputMatch ? inputMatch[1].trim() : '',
                output: outputMatch ? outputMatch[1].trim() : '',
                explanation: explanationMatch ? explanationMatch[1].trim() : ''
              });
            }
          }
        });
      }

      // Format examples as string for LLM
      const examplesText = examples.map(ex => {
        let str = `Example ${ex.index}:\n`;
        if (ex.input) str += `  Input: ${ex.input}\n`;
        if (ex.output) str += `  Output: ${ex.output}\n`;
        if (ex.explanation) str += `  Explanation: ${ex.explanation}\n`;
        return str;
      }).join('\n');

      // Get tags
      const tags = question.topicTags?.map(t => t.name).join(', ') || '';

      return {
        title: question.title || '',
        description: description.slice(0, 5000),
        constraints: constraints,
        difficulty: question.difficulty || 'Unknown',
        tags: tags,
        examples: examplesText,
        examplesCount: examples.length,
        url: window.location.href,
        questionId: question.questionId,
        questionFrontendId: question.questionFrontendId,
        fromAPI: true, // Flag to indicate this came from API
        imageUrls: imageUrls, // Array of image URL objects
        hasImages: imageUrls.length > 0 // Boolean flag for easy checking
      };
    } catch (error) {
      console.log('[CodeMentor] fetchProblemFromGraphQL: Exception occurred:', error);
      return null;
    }
  }

  // Helper function to extract text from pre elements (used by both API and DOM)
  function extractPreText(preEl) {
    if (!preEl) return '';

    // First handle superscripts, then extract text
    const textWithSuperscripts = extractTextWithSuperscripts(preEl);
    if (textWithSuperscripts) return textWithSuperscripts;

    // Method 1: Check for nested divs
    const divs = preEl.querySelectorAll('div');
    if (divs.length > 0) {
      return Array.from(divs).map(d => extractTextWithSuperscripts(d) || d.textContent.trim()).join('\n');
    }

    // Method 2: Check for <br> tags
    const html = preEl.innerHTML;
    if (html.includes('<br')) {
      // Clone and process superscripts before extracting
      const clone = preEl.cloneNode(true);
      clone.querySelectorAll('sup').forEach(sup => {
        const supText = sup.textContent.trim();
        const replacement = document.createTextNode('^' + supText);
        sup.parentNode.replaceChild(replacement, sup);
      });
      return clone.textContent
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
    }

    // Method 3: Use innerText which preserves line breaks
    if (preEl.innerText) {
      return preEl.innerText.trim();
    }

    // Fallback: textContent
    return preEl.textContent.trim();
  }


  // Utility function to wait for DOM elements with retry logic (handles slow networks)
  async function waitForElement(selectors, options = {}) {
    const {
      timeout = 10000, // 10 seconds default timeout
      retryInterval = 500, // Start with 500ms intervals
      minContentLength = 0, // Minimum text content length
      checkContent = null // Custom function to check if element is ready
    } = options;

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

  // Wait for LeetCode content to load dynamically (enhanced for slow networks)
  async function waitForLeetCodeContent() {
    try {
      // Wait for description content with proper retry logic
      await waitForElement([
        '[data-track-load="description_content"]',
        '[data-cy="question-content"]',
        '.elfjS'
      ], {
        timeout: 15000, // 15 seconds for slow networks
        minContentLength: 100 // Ensure it has actual content, not just empty element
      });
    } catch (error) {
      console.log('[CodeMentor] waitForLeetCodeContent: Content not fully loaded, proceeding anyway:', error.message);
      // Don't throw - allow extraction to proceed with whatever is available
    }
  }

  async function extractProblemData() {
    try {
      // Method 1: Try GraphQL API (most reliable)
      const titleSlug = parseTitleSlugFromUrl(window.location.href);
      if (titleSlug) {
        const apiData = await fetchProblemFromGraphQL(titleSlug);
        if (apiData && apiData.title && apiData.description) {
          return apiData;
        } else {
          console.log('[CodeMentor] extractProblemData: GraphQL API returned incomplete data');
        }
      } else {
        console.log('[CodeMentor] extractProblemData: Could not parse title slug from URL:', window.location.href);
      }

      // Method 2: Fallback to DOM scraping with enhanced waiting
      console.log('[CodeMentor] extractProblemData: Falling back to DOM scraping...');
      await waitForLeetCodeContent();

      // Additional wait for slow networks (with exponential backoff)
      let waitTime = 500;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        const domData = await scrapeLeetCodeDOM();

        // Check if we got valid data
        if (domData.title && domData.description && domData.description.length > 100) {
          return domData;
        }

        attempts++;
        waitTime *= 1.5; // Exponential backoff: 500ms, 750ms, 1125ms
      }

      // Final attempt
      const domData = await scrapeLeetCodeDOM();

      // Debug: Log what we found
      if (!domData.title || !domData.description) {
        console.log('[CodeMentor] extractProblemData: DOM scraping failed - Title found:', !!domData.title, 'Description found:', !!domData.description);
        console.log('[CodeMentor] extractProblemData: Title value:', domData.title?.substring(0, 50) || 'empty');
        console.log('[CodeMentor] extractProblemData: Description length:', domData.description?.length || 0);
        console.log('[CodeMentor] extractProblemData: Current URL:', window.location.href);
        console.log('[CodeMentor] extractProblemData: Page ready state:', document.readyState);

        // Try one more time with additional wait
        console.log('[CodeMentor] extractProblemData: Retrying DOM scraping after 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryData = await scrapeLeetCodeDOM();
        if (retryData.title && retryData.description) {
          return retryData;
        } else {
          console.log('[CodeMentor] extractProblemData: Retry also failed');
        }
      }

      return domData;
    } catch (error) {
      console.log('[CodeMentor] extractProblemData: Exception occurred:', error);
      console.log('[CodeMentor] extractProblemData: Stack trace:', error.stack);
      // Return empty object structure so calling code can handle it
      return {
        title: '',
        description: '',
        difficulty: 'Unknown',
        tags: '',
        examples: '',
        examplesCount: 0,
        constraints: '',
        url: window.location.href
      };
    }
  }

  // DOM scraping function using HTML-based approach (future-proof, LLM handles parsing)
  async function scrapeLeetCodeDOM() {
    // Extract title (for metadata)
    let titleEl = document.querySelector('[data-cy="question-title"]') ||
      document.querySelector('h1[data-cy="question-title"]') ||
      document.querySelector('h4[data-cy="question-title"]') ||
      document.querySelector('.text-title-large') ||
      document.querySelector('h1.text-title-large') ||
      document.querySelector('[class*="question-title"]');

    // If still not found, try finding any heading with reasonable length
    if (!titleEl) {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
      titleEl = headings.find(h => {
        const text = h.textContent?.trim() || '';
        return text.length > 5 && text.length < 100;
      });
    }

    // Last resort: any element with title-like class
    if (!titleEl) {
      titleEl = document.querySelector('[class*="title"]');
    }
    const title = titleEl?.textContent?.trim() || '';

    // Find description container (multiple fallbacks for different LeetCode layouts)
    let descriptionEl = document.querySelector('[data-track-load="description_content"]') ||
      document.querySelector('[data-cy="question-content"]') ||
      document.querySelector('.elfjS') ||
      document.querySelector('[class*="question-content"]') ||
      document.querySelector('[class*="description"]');

    // If still not found, try more generic selectors
    if (!descriptionEl) {
      // Try to find the main content area
      const possibleSelectors = [
        'div[class*="content"]',
        'div[class*="problem"]',
        'div[class*="statement"]',
        'main div[class*="content"]',
        '#question-detail-main-content',
        '[role="main"]'
      ];

      for (const selector of possibleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent && el.textContent.length > 200) {
          descriptionEl = el;
          break;
        }
      }
    }

    // Extract difficulty (for metadata)
    let difficulty = 'Unknown';
    const difficultyEl = document.querySelector('[diff]') ||
      document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
      document.querySelector('[class*="difficulty"]');
    if (difficultyEl) {
      difficulty = difficultyEl.textContent.trim();
    }

    // Extract tags (for metadata)
    let tags = '';
    const tagElements = document.querySelectorAll('[class*="topic-tag"], .tag, a[href*="/tag/"]');
    if (tagElements.length > 0) {
      tags = Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 5)
        .join(', ');
    }

    if (!descriptionEl) {
      console.log('[CodeMentor] scrapeLeetCodeDOM: Description element not found');
      return {
        title: title,
        description: '',
        difficulty: difficulty,
        tags: tags,
        examples: '',
        examplesCount: 0,
        constraints: '',
        url: window.location.href
      };
    }

    // Clean HTML to reduce token usage (aggressive cleaning for LeetCode)
    function cleanHTML(clone) {
      // Remove script tags (except math/tex which we need), style tags, noscript
      clone.querySelectorAll('script:not([type*="math"]), style, noscript, link').forEach(el => el.remove());

      // Remove LeetCode-specific non-problem elements
      // Navigation and header elements
      clone.querySelectorAll('[class*="group/nav"], [aria-label="Prev Question"], [aria-label="Next Question"], [aria-label="Pick one"]').forEach(el => el.remove());

      // Run/Submit buttons
      clone.querySelectorAll('button[aria-label="Run"], button[aria-label="Submit"], [class*="_run"], [class*="_submit"]').forEach(el => el.remove());

      // Note/Ask Leet buttons
      clone.querySelectorAll('[aria-label="Note"], [aria-label="Ask Leet"], [class*="ask-leet"]').forEach(el => el.remove());

      // Layout and settings buttons
      clone.querySelectorAll('#qd-layout-manager-btn, #nav-setting-btn, [class*="layout-btn"]').forEach(el => el.remove());

      // Premium/Subscribe links
      clone.querySelectorAll('[href*="/subscribe"], [class*="premium"]').forEach(el => el.remove());

      // All tabs (Description, Editorial, Solutions, Submissions, Code, Testcase, etc.)
      clone.querySelectorAll('[role="tablist"], [role="tab"], [class*="tab-item"]').forEach(el => el.remove());

      // Topics section (contains topic tags - already extracted separately)
      clone.querySelectorAll('[class*="topic-tag"], [class*="topics"]').forEach(el => el.remove());

      // Companies section
      clone.querySelectorAll('[class*="company-tag"], [class*="companies"]').forEach(el => el.remove());

      // Hint button
      clone.querySelectorAll('[class*="hint"], button:has(svg[class*="hint"])').forEach(el => el.remove());

      // Like/Dislike/Share buttons and their containers
      clone.querySelectorAll('[class*="like-btn"], [class*="dislike"], [class*="share-btn"], [aria-label*="like"], [aria-label*="share"]').forEach(el => el.remove());

      // Difficulty badge (already extracted separately)
      clone.querySelectorAll('[class*="difficulty"], [class*="text-difficulty"]').forEach(el => el.remove());

      // Code editor and related elements
      clone.querySelectorAll('[class*="monaco-editor"], [class*="CodeMirror"], [class*="ace_editor"], [class*="code-area"]').forEach(el => el.remove());

      // Test case and result areas
      clone.querySelectorAll('[class*="testcase"], [class*="test-result"]').forEach(el => el.remove());

      // Navigation, sidebar, drawer, footer
      clone.querySelectorAll('nav, button, .nav, .navigation, .menu, .sidebar, [class*="sidebar"], [class*="drawer"], [class*="modal"], .footer').forEach(el => el.remove());

      // Remove hidden elements
      clone.querySelectorAll('[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"], .hidden, [hidden]').forEach(el => el.remove());

      // Remove MathJax rendered output (keep only our converted LaTeX)
      clone.querySelectorAll('.MathJax, .MathJax_Preview, .MathJax_Display, .mjx-chtml, .mjx-math, [class*="MathJax"]').forEach(el => el.remove());

      // Remove SVG icons (not problem figures)
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

    // Convert <sub>/<sup> tags and MathJax to LaTeX notation (for LLM)
    function convertMathToLaTeX(element) {
      if (!element) return '';

      const clone = element.cloneNode(true);

      // Convert <sub> tags to LaTeX subscript notation: _{content}
      const subElements = Array.from(clone.querySelectorAll('sub')).reverse();
      subElements.forEach(sub => {
        const subText = sub.textContent.trim();
        const span = document.createElement('span');
        span.textContent = `_{${subText}}`;
        if (sub.parentNode) {
          sub.parentNode.replaceChild(span, sub);
        }
      });

      // Convert <sup> tags to LaTeX superscript notation: ^{content}
      const supElements = Array.from(clone.querySelectorAll('sup')).reverse();
      supElements.forEach(sup => {
        const supText = sup.textContent.trim();
        const span = document.createElement('span');
        span.textContent = `^{${supText}}`;
        if (sup.parentNode) {
          sup.parentNode.replaceChild(span, sup);
        }
      });

      // Convert MathJax script tags if present (LeetCode sometimes uses MathJax)
      const mathScripts = clone.querySelectorAll('script[type="math/tex"]');
      mathScripts.forEach(script => {
        const latex = script.textContent;
        const span = document.createElement('span');
        span.textContent = `$${latex}$`;
        if (script.parentNode) {
          script.parentNode.replaceChild(span, script);
        }
      });

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

      console.log(`[CodeMentor] HTML Reduction: ${originalLength} chars -> ${cleanHtml.length} chars (-${Math.round((1 - cleanHtml.length / originalLength) * 100)}%)`);

      return cleanHtml;
    }

    // Get HTML with math converted to LaTeX
    const originalLength = descriptionEl.innerHTML.length;
    const problemHTML = convertMathToLaTeX(descriptionEl);

    // Check if problem has images/graphs
    const hasImages = descriptionEl.querySelectorAll('img, svg, canvas').length > 0;

    // Extract examples (for reference, but LLM will parse from HTML)
    const examples = [];
    const preBlocks = descriptionEl.querySelectorAll('pre');
    preBlocks.forEach((pre, index) => {
      const text = pre.textContent?.trim() || '';
      if (text) {
        const inputMatch = text.match(/Input[:\s]*([^\n]*(?:\n(?!Output)[^\n]*)*)/i);
        const outputMatch = text.match(/Output[:\s]*([^\n]*(?:\n(?!Explanation)[^\n]*)*)/i);
        if (inputMatch || outputMatch) {
          examples.push({
            index: index + 1,
            input: inputMatch ? inputMatch[1].trim() : '',
            output: outputMatch ? outputMatch[1].trim() : ''
          });
        }
      }
    });

    const examplesText = examples.map(ex => {
      return `Example ${ex.index}:\n  Input: ${ex.input}\n  Output: ${ex.output}`;
    }).join('\n\n');

    const baseData = {
      title: title,
      description: problemHTML, // Send HTML as description (LLM will parse it)
      html: problemHTML, // Also include in html field for consistency
      difficulty: difficulty,
      tags: tags,
      examples: examplesText,
      examplesCount: examples.length,
      constraints: '', // LLM will extract from HTML
      url: window.location.href,
      hasImages: hasImages
    };

    // Log extracted data
    console.log('[CodeMentor] scrapeLeetCodeDOM: HTML-based extraction');
    console.log('📌 Title:', baseData.title);
    console.log('📊 Difficulty:', baseData.difficulty);
    console.log('🏷️ Tags:', baseData.tags || 'None found');
    console.log('📝 HTML Length:', problemHTML.length, 'characters');
    console.log('🖼️ Has Images:', hasImages);

    // Capture images if available
    if (hasImages && typeof html2canvas !== 'undefined') {
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
        console.error('CodeMentor: Failed to capture image from LeetCode:', error);
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
            platform: 'leetcode',
            difficulty: problemData.difficulty
          };
        }
      } catch (e) {
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

  async function showExplanation(data) {
    const body = panel.querySelector('.lch-panel-body');
    const header = panel.querySelector('.lch-panel-header');

    // Hide the panel header when showing explanation
    if (header) {
      header.style.display = 'none';
    }

    // Check if problem is in favorites
    let isFavorite = false;
    try {
      const favResponse = await safeSendMessage({ type: 'IS_FAVORITE', url: window.location.href });
      isFavorite = favResponse?.isFavorite || false;
    } catch (e) { }

    // Parse response if it's a JSON string
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
      
      // Helper function to extract clean text from potential JSON/markdown content
      const extractCleanExplanation = (str) => {
        // Remove markdown code blocks and try to extract JSON
        let cleaned = str;
        
        // Try to extract from markdown code blocks first
        const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          cleaned = codeBlockMatch[1].trim();
        } else {
          // Check for unclosed code blocks
          const unclosedMatch = str.match(/```(?:json)?\s*([\s\S]*)/);
          if (unclosedMatch) {
            cleaned = unclosedMatch[1].trim();
          }
        }
        
        // If cleaned looks like JSON, try to parse it
        if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
          try {
            const parsed = JSON.parse(cleaned);
            if (parsed && parsed.explanation) {
              return parsed;
            }
          } catch (e) {
            // Try to extract explanation field with regex
            const explanationMatch = cleaned.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (explanationMatch) {
              try {
                const extractedExplanation = JSON.parse('"' + explanationMatch[1] + '"');
                return { explanation: extractedExplanation };
              } catch (e2) {
                // Return decoded string
                return { explanation: explanationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') };
              }
            }
          }
        }
        
        return null;
      };
      
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
            console.log('[CodeMentor] Explanation is not JSON, using as markdown:', e.message);
          }
        }
      }
    }

    const formattedExplanation = parseMarkdown(explanationData.explanation || '');

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
          ${explanationData.keyPoints && Array.isArray(explanationData.keyPoints) && explanationData.keyPoints.length > 0 ? `
          <div class="lch-key-points-reader">
            <h4 class="lch-key-points-heading">Key Points</h4>
            <ul class="lch-key-points-items">
              ${explanationData.keyPoints.map(point => `<li>${parseMarkdown(point)}</li>`).join('')}
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

    // Add event listeners
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

    // Add refresh handler if cached
    const refreshBtn = body.querySelector('#refreshHints');
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
            platform: 'leetcode',
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
        // Remove from favorites
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
        // Add to favorites
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
      // Positive feedback
      feedbackSection.innerHTML = `
        <div class="lch-feedback-thanks">
          <div class="lch-feedback-thanks-text">
            ✨ Thanks for your feedback!
          </div>
        </div>
      `;

      // Log feedback (could be sent to analytics)

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

      // Add regenerate handler
      feedbackSection.querySelector('.lch-feedback-regenerate-btn').addEventListener('click', () => {
        loadHints(true); // Force refresh with new hints
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
      const htmlContent = convertMathToHtml(content.trim());
      mathPlaceholders.push(`<span class="lch-math-display">${htmlContent}</span>`);
      return placeholder;
    });

    // Process inline math \(...\) (non-greedy, handle newlines in content)
    // Handle both single and double-escaped backslashes from JSON
    processedText = processedText.replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, function (match, content) {
      const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
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

    // STEP 2: Now convert literal \n strings to actual newlines (AFTER extracting math)
    // This handles cases where AI returns escaped newlines that weren't properly unescaped
    processedText = processedText
      .replace(/\\n/g, '\n')  // Convert literal \n to actual newline
      .replace(/\\"/g, '"');   // Convert escaped quotes
    // Note: We don't replace \\\\ -> \\ anymore as it can corrupt math notation

    // STEP 3: Apply LaTeX-to-Unicode conversion to remaining text (for LaTeX not wrapped in math delimiters)
    // This handles cases like "1 \le t \le 10^5" that aren't inside $...$ or \(...\)
    // We use Unicode conversion here (not HTML) so it survives the escapeHtml step
    processedText = convertLatexToUnicode(processedText);

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

  // Intercept GraphQL requests as a backup method (optional enhancement)
  // This can capture problem data when LeetCode makes its own GraphQL calls
  function setupGraphQLInterceptor() {
    if (window.__lch_graphql_intercepted) return; // Already set up
    window.__lch_graphql_intercepted = true;

    const originalFetch = window.fetch;

    window.fetch = function (...args) {
      const promise = originalFetch.apply(this, args);

      // Check if it's a GraphQL request
      if (args[0] && typeof args[0] === 'string' && args[0].includes('graphql')) {
        promise.then(response => {
          // Clone response to read it without consuming it
          const clonedResponse = response.clone();

          clonedResponse.json().then(data => {
            // Check if it contains question data
            if (data.data?.question) {

              // Store intercepted data for potential use
              if (!window.__lch_intercepted_data) {
                window.__lch_intercepted_data = data.data.question;

                // Send to extension if needed
                if (isExtensionContextValid()) {
                  safeSendMessage({
                    type: 'LEETCODE_PROBLEM_DATA_INTERCEPTED',
                    data: data.data.question
                  }).catch(() => { });
                }
              }
            }
          }).catch(() => {
            // Ignore JSON parse errors
          });
        }).catch(() => {
          // Ignore fetch errors
        });
      }

      return promise;
    };
  }

  // Initialize GraphQL interceptor on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGraphQLInterceptor);
  } else {
    setupGraphQLInterceptor();
  }

})();

