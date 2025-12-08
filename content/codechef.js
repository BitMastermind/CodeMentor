// LC Helper - CodeChef Content Script

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

  async function explainProblem() {
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

  async function extractProblemData() {
    const titleEl = document.querySelector('h1') || document.querySelector('.problem-name') ||
                    document.querySelector('[class*="problem-title"]');
    const descEl = document.querySelector('.problem-statement') || 
                   document.querySelector('[class*="problem"]') ||
                   document.querySelector('#problem-statement');
    
    // Extract difficulty (CodeChef shows stars or difficulty level)
    let difficulty = 'Unknown';
    const difficultyEl = document.querySelector('.difficulty, [class*="difficulty"]') ||
                         document.querySelector('[class*="star"]');
    if (difficultyEl) {
      difficulty = difficultyEl.textContent.trim();
    }
    
    // Also check for difficulty in breadcrumbs or sidebar
    const breadcrumbDifficulty = document.querySelector('[href*="easy"], [href*="medium"], [href*="hard"]');
    if (breadcrumbDifficulty && difficulty === 'Unknown') {
      const href = breadcrumbDifficulty.getAttribute('href') || '';
      if (href.includes('easy')) difficulty = 'Easy';
      else if (href.includes('medium')) difficulty = 'Medium';
      else if (href.includes('hard')) difficulty = 'Hard';
    }
    
    // Extract tags
    let tags = '';
    const tagElements = document.querySelectorAll('.tags a, [class*="tag"], [class*="topic"]');
    if (tagElements.length > 0) {
      tags = Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 5)
        .join(', ');
    }
    
    // Extract constraints
    let constraints = '';
    const constraintsSection = document.querySelector('[class*="constraints"]') ||
                                Array.from(document.querySelectorAll('h3, h4, strong')).find(el => 
                                  el.textContent.toLowerCase().includes('constraint'));
    if (constraintsSection) {
      const nextEl = constraintsSection.nextElementSibling;
      if (nextEl) {
        constraints = nextEl.textContent.trim().slice(0, 500);
      }
    }
    
    // Extract input/output format
    let inputFormat = '';
    let outputFormat = '';
    
    const inputHeader = Array.from(document.querySelectorAll('h3, h4, strong, b')).find(el => 
      el.textContent.toLowerCase().includes('input format') || el.textContent.toLowerCase() === 'input');
    if (inputHeader) {
      const nextEl = inputHeader.nextElementSibling;
      if (nextEl) inputFormat = nextEl.textContent.trim().slice(0, 500);
    }
    
    const outputHeader = Array.from(document.querySelectorAll('h3, h4, strong, b')).find(el => 
      el.textContent.toLowerCase().includes('output format') || el.textContent.toLowerCase() === 'output');
    if (outputHeader) {
      const nextEl = outputHeader.nextElementSibling;
      if (nextEl) outputFormat = nextEl.textContent.trim().slice(0, 300);
    }
    
    // Helper function to extract text with proper line breaks from pre elements
    function extractPreText(preEl) {
      if (!preEl) return '';
      
      // Method 1: Check for nested divs
      const divs = preEl.querySelectorAll('div');
      if (divs.length > 0) {
        return Array.from(divs).map(d => d.textContent.trim()).join('\n');
      }
      
      // Method 2: Check for <br> tags
      const html = preEl.innerHTML;
      if (html.includes('<br')) {
        return html
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

    // Extract sample test cases
    const examples = [];
    
    // Method 1: Look for "Sample Input" / "Sample Output" sections
    const sampleInputHeaders = Array.from(document.querySelectorAll('h3, h4, strong, b, p')).filter(el => 
      el.textContent.toLowerCase().includes('sample input') || 
      el.textContent.toLowerCase().includes('example input'));
    
    sampleInputHeaders.forEach((inputHeader, idx) => {
      let inputText = '';
      let outputText = '';
      
      // Find the pre/code block after input header
      let nextEl = inputHeader.nextElementSibling;
      while (nextEl && !nextEl.textContent.toLowerCase().includes('output')) {
        if (nextEl.tagName === 'PRE' || nextEl.tagName === 'CODE') {
          inputText = extractPreText(nextEl);
          break;
        }
        nextEl = nextEl.nextElementSibling;
      }
      
      // Find corresponding output
      const outputHeader = Array.from(document.querySelectorAll('h3, h4, strong, b, p')).find(el => 
        el.textContent.toLowerCase().includes('sample output') || 
        el.textContent.toLowerCase().includes('example output'));
      
      if (outputHeader) {
        let outEl = outputHeader.nextElementSibling;
        while (outEl) {
          if (outEl.tagName === 'PRE' || outEl.tagName === 'CODE') {
            outputText = extractPreText(outEl);
            break;
          }
          outEl = outEl.nextElementSibling;
        }
      }
      
      if (inputText || outputText) {
        examples.push({
          index: idx + 1,
          input: inputText,
          output: outputText
        });
      }
    });
    
    // Method 2: Fallback - look for all pre blocks in problem statement
    if (examples.length === 0 && descEl) {
      const preBlocks = descEl.querySelectorAll('pre');
      const preArray = Array.from(preBlocks);
      
      // Assume alternating input/output pattern
      for (let i = 0; i < preArray.length - 1; i += 2) {
        const inputPre = preArray[i];
        const outputPre = preArray[i + 1];
        
        if (inputPre && outputPre) {
          examples.push({
            index: Math.floor(i / 2) + 1,
            input: extractPreText(inputPre),
            output: extractPreText(outputPre)
          });
        }
      }
    }
    
    // Method 3: Check for table-based examples (some CodeChef problems use tables)
    if (examples.length === 0) {
      const exampleTable = document.querySelector('table[class*="sample"], table[class*="example"]');
      if (exampleTable) {
        const rows = exampleTable.querySelectorAll('tr');
        rows.forEach((row, idx) => {
          if (idx === 0) return; // Skip header row
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            examples.push({
              index: idx,
              input: cells[0].innerText?.trim() || cells[0].textContent.trim(),
              output: cells[1].innerText?.trim() || cells[1].textContent.trim()
            });
          }
        });
      }
    }

    // Format examples as string for LLM
    const examplesText = examples.map(ex => {
      return `Example ${ex.index}:\n  Input:\n    ${ex.input.split('\n').join('\n    ')}\n  Output:\n    ${ex.output.split('\n').join('\n    ')}`;
    }).join('\n\n');

    const baseData = {
      title: titleEl?.textContent?.trim() || '',
      description: descEl?.textContent?.trim().slice(0, 2000) || '',
      constraints: constraints,
      difficulty: difficulty,
      tags: tags,
      inputFormat: inputFormat,
      outputFormat: outputFormat,
      examples: examplesText,
      examplesCount: examples.length,
      url: window.location.href
    };
    
    // Console log extracted data for accuracy testing
    console.log('='.repeat(60));
    console.log('LC Helper - Extracted Problem Data (CodeChef)');
    console.log('='.repeat(60));
    console.log('📌 Title:', baseData.title);
    console.log('📊 Difficulty:', baseData.difficulty);
    console.log('🏷️ Tags:', baseData.tags || 'None found');
    console.log('-'.repeat(60));
    console.log('📝 Description (first 500 chars):');
    console.log(baseData.description.slice(0, 500) + (baseData.description.length > 500 ? '...' : ''));
    console.log('-'.repeat(60));
    console.log('📥 Input Format:', inputFormat.slice(0, 200) || 'None found');
    console.log('📤 Output Format:', outputFormat.slice(0, 200) || 'None found');
    console.log('📏 Constraints:', baseData.constraints.slice(0, 200) || 'None found');
    console.log('-'.repeat(60));
    console.log(`📋 Sample Test Cases (${examples.length} found):`);
    examples.forEach(ex => {
      console.log(`  Example ${ex.index}:`);
      console.log(`    Input:`);
      ex.input.split('\n').forEach(line => console.log(`      ${line}`));
      console.log(`    Output:`);
      ex.output.split('\n').forEach(line => console.log(`      ${line}`));
    });
    console.log('-'.repeat(60));
    console.log('🔗 URL:', baseData.url);
    console.log('='.repeat(60));

    // Check if problem has images/graphs and capture them
    if (descEl && typeof html2canvas !== 'undefined') {
      const hasImages = descEl.querySelectorAll('img, svg, canvas').length > 0;
      
      if (hasImages) {
        try {
          // Capture the problem description element as an image
          const canvas = await html2canvas(descEl, {
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
        <button class="lch-retry-btn">Try Again</button>
      </div>`;
    
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
                <span class="lch-hint-badge ${classes[i]}">${i + 1}</span>
                <span class="lch-hint-title">${labels[i]}</span>
              </div>
              <button class="lch-hint-reveal-btn">Reveal</button>
            </div>
            <div class="lch-hint-content" data-hint="${i}">${formatHint(hint, i)}</div>
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
      </div>`;

    body.querySelectorAll('.lch-hint-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx = header.dataset.hint;
        const content = body.querySelector(`.lch-hint-content[data-hint="${idx}"]`);
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
        const id = `codechef_${generateCacheKey(currentProblemData.url)}`;
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

