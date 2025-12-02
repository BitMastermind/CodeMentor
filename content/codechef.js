// LC Helper - CodeChef Content Script

(function() {
  'use strict';

  let panel = null;
  let fab = null;
  let isLoading = false;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
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
    if (!panel) createPanel();
    panel.classList.toggle('active');
    if (panel.classList.contains('active') && !isLoading) loadHints();
  }

  async function checkAutoShow() {
    const { autoShowPanel } = await chrome.storage.sync.get('autoShowPanel');
    if (autoShowPanel) {
      createPanel();
      panel.classList.add('active');
      loadHints();
    }
  }

  async function loadHints(forceRefresh = false) {
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    if (!apiKey) { showSettingsPrompt(); return; }

    isLoading = true;
    showLoading();

    const problem = extractProblemData();
    if (!problem.title || !problem.description) {
      showError('Could not extract problem data.');
      isLoading = false;
      return;
    }

    problem.forceRefresh = forceRefresh;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_HINTS', problem });
      if (response.error) showError(response.error);
      else showHints(response);
    } catch (error) {
      showError(error.message);
    }
    isLoading = false;
  }

  function extractProblemData() {
    const titleEl = document.querySelector('h1') || document.querySelector('.problem-name');
    const descEl = document.querySelector('.problem-statement') || 
                   document.querySelector('[class*="problem"]');
    
    // Extract difficulty
    let difficulty = 'Unknown';
    const difficultyEl = document.querySelector('.difficulty, [class*="difficulty"]');
    if (difficultyEl) {
      difficulty = difficultyEl.textContent.trim();
    }
    
    // Extract tags
    let tags = '';
    const tagElements = document.querySelectorAll('.tags a, [class*="tag"]');
    if (tagElements.length > 0) {
      tags = Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 5)
        .join(', ');
    }
    
    return {
      title: titleEl?.textContent?.trim() || '',
      description: descEl?.textContent?.trim().slice(0, 2000) || '',
      constraints: '',
      difficulty: difficulty,
      tags: tags,
      url: window.location.href
    };
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
    body.innerHTML = `
      <div class="lch-error">
        <div class="lch-error-icon">😕</div>
        <p class="lch-error-message">${escapeHtml(message)}</p>
        <button class="lch-retry-btn">Try Again</button>
      </div>`;
    body.querySelector('.lch-retry-btn').addEventListener('click', loadHints);
  }

  function showSettingsPrompt() {
    panel.querySelector('.lch-panel-body').innerHTML = `
      <div class="lch-settings-prompt">
        <div class="lch-settings-icon">🔑</div>
        <p class="lch-settings-message">Add your OpenAI API key in extension settings.</p>
        <button class="lch-settings-btn">Open Settings</button>
      </div>`;
  }

  function showHints(data) {
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
                <span class="lch-hint-badge ${classes[i]}">${i + 1}</span>
                <span class="lch-hint-title">${labels[i]}</span>
              </div>
              <button class="lch-hint-reveal-btn">Reveal</button>
            </div>
            <div class="lch-hint-content" data-hint="${i}">${escapeHtml(hint)}</div>
          </div>
        `).join('')}
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

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();

