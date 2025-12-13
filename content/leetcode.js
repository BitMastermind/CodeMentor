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

  async function explainProblem() {
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
      if (!currentProblemData) {
        currentProblemData = {
          url: window.location.href,
          title: problem.title,
          platform: 'leetcode',
          difficulty: problem.difficulty
        };
      }

      const response = await safeSendMessage({
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
      console.log('LC Helper: Failed to parse LeetCode URL:', e.message);
    }
    return null;
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
        console.log('LC Helper: LeetCode GraphQL API request failed:', response.status);
        return null;
      }

      const data = await response.json();
      
      if (data.errors || !data.data || !data.data.question) {
        console.log('LC Helper: LeetCode GraphQL API returned error:', data.errors || 'No question data');
        return null;
      }

      const question = data.data.question;
      
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
        fromAPI: true // Flag to indicate this came from API
      };
    } catch (error) {
      console.log('LC Helper: Error fetching from LeetCode GraphQL API:', error.message);
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

  async function extractProblemData() {
    // First, try to fetch from GraphQL API if we can parse the URL
    const titleSlug = parseTitleSlugFromUrl(window.location.href);
    if (titleSlug) {
      const apiData = await fetchProblemFromGraphQL(titleSlug);
      if (apiData) {
        // Log API fetch success
        console.log('='.repeat(60));
        console.log('LC Helper - Problem Data from GraphQL API (LeetCode)');
        console.log('='.repeat(60));
        console.log('📌 Title:', apiData.title);
        console.log('📊 Difficulty:', apiData.difficulty);
        console.log('🏷️ Tags:', apiData.tags || 'None');
        console.log('📏 Constraints:', apiData.constraints || 'None found');
        console.log('-'.repeat(60));
        console.log('📝 Description (first 500 chars):');
        console.log(apiData.description.slice(0, 500) + (apiData.description.length > 500 ? '...' : ''));
        console.log('-'.repeat(60));
        console.log(`📋 Sample Test Cases (${apiData.examplesCount} found)`);
        console.log('-'.repeat(60));
        console.log('🔗 URL:', apiData.url);
        console.log('='.repeat(60));
        return apiData;
      }
    }
    
    // Fallback to DOM scraping if API fails
    console.log('LC Helper: Falling back to DOM scraping for LeetCode problem');
    
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
        constraints = extractTextWithSuperscripts(constraintsList);
      }
    }

    // Extract sample test cases from <pre> blocks
    const examples = [];
    if (descriptionEl) {
      // Method 1: Look for Example sections with pre blocks
      const preBlocks = descriptionEl.querySelectorAll('pre');
      preBlocks.forEach((pre, index) => {
        const text = extractPreText(pre);
        if (text) {
          // Parse Input/Output format (LeetCode uses "Input: ... Output: ..." format)
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
          } else {
            // Fallback: just capture the raw pre content
            examples.push({
              index: index + 1,
              raw: text,
              input: '',
              output: '',
              explanation: ''
            });
          }
        }
      });

      // Method 2: Also check for structured example divs (newer LeetCode layout)
      const exampleDivs = descriptionEl.querySelectorAll('[class*="example"]');
      exampleDivs.forEach((div, index) => {
        if (!div.querySelector('pre')) { // Avoid duplicates
          const text = div.innerText?.trim() || div.textContent.trim();
          const inputMatch = text.match(/Input[:\s]*([^\n]*(?:\n(?!Output)[^\n]*)*)/i);
          const outputMatch = text.match(/Output[:\s]*([^\n]*(?:\n(?!Explanation)[^\n]*)*)/i);
          if (inputMatch || outputMatch) {
            examples.push({
              index: examples.length + 1,
              raw: text,
              input: inputMatch ? inputMatch[1].trim() : '',
              output: outputMatch ? outputMatch[1].trim() : '',
              explanation: ''
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
      if (!ex.input && !ex.output && ex.raw) str += `  ${ex.raw}\n`;
      return str;
    }).join('\n');

    // Extract description with superscript handling
    const description = descriptionEl ? extractTextWithSuperscripts(descriptionEl).slice(0, 2000) : '';
    
    const baseData = {
      title: titleEl?.textContent?.trim() || '',
      description: description,
      constraints: constraints,
      difficulty: difficulty,
      tags: tags,
      examples: examplesText,
      examplesCount: examples.length,
      url: window.location.href
    };
    
    // Console log extracted data for accuracy testing
    console.log('='.repeat(80));
    console.log('LC Helper - DOM Scraped Problem Data (LeetCode)');
    console.log('='.repeat(80));
    console.log('📡 Data Source: DOM Scraping (GraphQL API was unavailable or failed)');
    console.log('📌 Title:', baseData.title);
    console.log('📊 Difficulty:', baseData.difficulty);
    console.log('🏷️ Tags:', baseData.tags || 'None found');
    console.log('📏 Constraints:', baseData.constraints || 'None found');
    console.log('-'.repeat(80));
    console.log('📝 FULL DESCRIPTION (' + baseData.description.length + ' chars):');
    console.log(baseData.description);
    console.log('-'.repeat(80));
    console.log(`📋 Sample Test Cases (${examples.length} found):`);
    examples.forEach(ex => {
      console.log(`  Example ${ex.index}:`);
      if (ex.input) {
        console.log(`    Input:`);
        ex.input.split('\n').forEach(line => console.log(`      ${line}`));
      }
      if (ex.output) {
        console.log(`    Output:`);
        ex.output.split('\n').forEach(line => console.log(`      ${line}`));
      }
      if (ex.explanation) {
        console.log(`    Explanation:`);
        console.log(ex.explanation);
      }
      if (!ex.input && !ex.output && ex.raw) {
        console.log(`    Raw:`);
        ex.raw.split('\n').forEach(line => console.log(`      ${line}`));
      }
    });
    console.log('-'.repeat(80));
    console.log('🔗 URL:', baseData.url);
    console.log('='.repeat(80));
    console.log('\n📦 COMPLETE EXTRACTED DATA OBJECT:');
    console.log(JSON.stringify(baseData, null, 2));

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
    
    // Check if problem is in favorites
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

