// CodeMentor - Error Tracking with Sentry
// Lightweight error tracking that works in Chrome extensions

(function () {
  'use strict';

  // Configuration - Set your Sentry DSN here
  const SENTRY_DSN = ''; // Leave empty to disable Sentry
  const SENTRY_ENABLED = !!SENTRY_DSN;

  // In-memory error buffer (for offline scenarios)
  let errorBuffer = [];
  const MAX_BUFFER_SIZE = 50;

  // Initialize Sentry if DSN is provided
  let Sentry = null;
  const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  if (SENTRY_ENABLED && globalScope.Sentry) {
    Sentry = globalScope.Sentry;
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: chrome.runtime.getManifest().version,
      release: chrome.runtime.getManifest().version,
      beforeSend(event, hint) {
        // Filter out sensitive information
        if (event.request) {
          // Remove API keys from URLs
          if (event.request.url) {
            event.request.url = event.request.url.replace(/api[_-]?key=[^&]*/gi, 'api[_-]?key=***');
          }
          // Remove headers with sensitive data
          if (event.request.headers) {
            Object.keys(event.request.headers).forEach(key => {
              if (/api[_-]?key|authorization|token/i.test(key)) {
                event.request.headers[key] = '***';
              }
            });
          }
        }
        return event;
      },
      integrations: [
        // Only include browser integration if in content script context (has window)
        ...(typeof window !== 'undefined' && Sentry.BrowserClient ? [new Sentry.BrowserClient()] : [])
      ]
    });
  }

  /**
   * Track an error
   * @param {Error|string} error - Error object or error message
   * @param {Object} context - Additional context (tags, extra data, etc.)
   */
  function trackError(error, context = {}) {
    const errorData = {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        userAgent: navigator.userAgent,
        extensionVersion: chrome.runtime.getManifest().version,
        url: typeof window !== 'undefined' ? window.location.href : 'background'
      }
    };

    // Filter out benign errors
    const ignorePatterns = [
      'ResizeObserver loop',
      'message channel closed',
      'receiving end does not exist'
    ];

    if (ignorePatterns.some(pattern =>
      (typeof error === 'string' && error.includes(pattern)) ||
      (error.message && error.message.includes(pattern))
    )) {
      return;
    }

    // Log to console (always)
    console.error('CodeMentor Error:', errorData);

    // Send to Sentry if enabled
    if (SENTRY_ENABLED && Sentry) {
      try {
        Sentry.captureException(error instanceof Error ? error : new Error(error), {
          tags: context.tags || {},
          extra: context.extra || {},
          level: context.level || 'error'
        });
      } catch (e) {
        console.error('Failed to send error to Sentry:', e);
        // Buffer error for later
        bufferError(errorData);
      }
    } else {
      // Buffer error if Sentry is not enabled (for manual review)
      bufferError(errorData);
    }
  }

  /**
   * Track a message/info event
   * @param {string} message - Message to track
   * @param {Object} context - Additional context
   */
  function trackMessage(message, context = {}) {
    if (SENTRY_ENABLED && Sentry) {
      try {
        Sentry.captureMessage(message, {
          level: context.level || 'info',
          tags: context.tags || {},
          extra: context.extra || {}
        });
      } catch (e) {
        console.error('Failed to send message to Sentry:', e);
      }
    }
  }

  /**
   * Buffer error for later sending (when offline or Sentry disabled)
   */
  function bufferError(errorData) {
    errorBuffer.push(errorData);
    if (errorBuffer.length > MAX_BUFFER_SIZE) {
      errorBuffer.shift(); // Remove oldest
    }
  }

  /**
   * Get buffered errors (for debugging or manual review)
   */
  function getBufferedErrors() {
    return [...errorBuffer];
  }

  /**
   * Clear error buffer
   */
  function clearErrorBuffer() {
    errorBuffer = [];
  }

  /**
   * Set user context for error tracking
   * @param {Object} user - User information (id, email, etc.)
   */
  function setUserContext(user) {
    if (SENTRY_ENABLED && Sentry) {
      try {
        Sentry.setUser({
          id: user.id,
          email: user.email,
          username: user.username
        });
      } catch (e) {
        console.error('Failed to set user context:', e);
      }
    }
  }

  /**
   * Clear user context
   */
  function clearUserContext() {
    if (SENTRY_ENABLED && Sentry) {
      try {
        Sentry.setUser(null);
      } catch (e) {
        console.error('Failed to clear user context:', e);
      }
    }
  }

  /**
   * Add breadcrumb for debugging
   * @param {string} message - Breadcrumb message
   * @param {string} category - Category (navigation, user, console, etc.)
   * @param {string} level - Level (info, warning, error)
   */
  function addBreadcrumb(message, category = 'default', level = 'info') {
    if (SENTRY_ENABLED && Sentry) {
      try {
        Sentry.addBreadcrumb({
          message,
          category,
          level
        });
      } catch (e) {
        console.error('Failed to add breadcrumb:', e);
      }
    }
  }

  /**
   * Wrap async function with error tracking
   * @param {Function} fn - Function to wrap
   * @param {string} context - Context name for error tracking
   */
  function wrapAsync(fn, context = 'async') {
    return async function (...args) {
      try {
        addBreadcrumb(`Starting ${context}`, 'function', 'info');
        const result = await fn.apply(this, args);
        addBreadcrumb(`Completed ${context}`, 'function', 'info');
        return result;
      } catch (error) {
        trackError(error, {
          tags: { function: context },
          extra: { args: args.length }
        });
        throw error;
      }
    };
  }

  // Global error handler for unhandled errors
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      trackError(event.error || event.message, {
        tags: { type: 'unhandled_error' },
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      trackError(event.reason, {
        tags: { type: 'unhandled_promise_rejection' }
      });
    });
  }

  // Export for use in other scripts
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      trackError,
      trackMessage,
      setUserContext,
      clearUserContext,
      addBreadcrumb,
      wrapAsync,
      getBufferedErrors,
      clearErrorBuffer
    };
  } else {
    // Make available globally (works in both window and service worker contexts)
    const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
    globalScope.LCHErrorTracking = {
      trackError,
      trackMessage,
      setUserContext,
      clearUserContext,
      addBreadcrumb,
      wrapAsync,
      getBufferedErrors,
      clearErrorBuffer
    };
  }
})();

