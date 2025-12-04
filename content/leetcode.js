// LC Helper - LeetCode Content Script

(function() {
  'use strict';

  let panel = null;
  let fab = null;
  let isLoading = false;

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
    }, 1500);
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
    fab.title = 'LC Helper - Get Hints';
    fab.addEventListener('click', togglePanel);

    document.body.appendChild(fab);
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
    
    body.innerHTML = `
      <div class="lch-loading">
        <div class="lch-spinner"></div>
        <span class="lch-loading-text">Analyzing problem...</span>
      </div>
    `;
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

