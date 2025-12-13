// LC Helper - Analytics with Google Analytics 4
// Privacy-friendly analytics implementation

(function() {
  'use strict';

  // Configuration - Set your GA4 Measurement ID here
  const GA4_MEASUREMENT_ID = ''; // Leave empty to disable analytics
  const GA4_ENABLED = !!GA4_MEASUREMENT_ID;
  const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
  const GA4_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

  // Client ID (persistent identifier)
  let clientId = null;
  const CLIENT_ID_KEY = 'lch_analytics_client_id';

  // Session ID
  let sessionId = null;
  const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  // Initialize analytics
  async function init() {
    if (!GA4_ENABLED) {
      return;
    }

    // Get or create client ID
    const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
    if (stored[CLIENT_ID_KEY]) {
      clientId = stored[CLIENT_ID_KEY];
    } else {
      clientId = generateClientId();
      await chrome.storage.local.set({ [CLIENT_ID_KEY]: clientId });
    }

    // Initialize session
    sessionId = Date.now().toString();

    // Track extension install/update
    const { lastAnalyticsInit } = await chrome.storage.local.get('lastAnalyticsInit');
    const extensionVersion = chrome.runtime.getManifest().version;
    if (!lastAnalyticsInit || lastAnalyticsInit !== extensionVersion) {
      trackEvent('extension_installed', {
        version: extensionVersion
      });
      await chrome.storage.local.set({ lastAnalyticsInit: extensionVersion });
    }

    // Track session start
    trackEvent('session_start', {
      extension_version: extensionVersion
    });
  }

  /**
   * Generate a unique client ID
   */
  function generateClientId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Track an event
   * @param {string} eventName - Event name
   * @param {Object} eventParams - Event parameters
   */
  async function trackEvent(eventName, eventParams = {}) {
    if (!GA4_ENABLED) {
      return;
    }

    try {
      const payload = {
        client_id: clientId || await getClientId(),
        events: [{
          name: eventName,
          params: {
            ...eventParams,
            session_id: sessionId || Date.now().toString(),
            engagement_time_msec: 100,
            timestamp_micros: Date.now() * 1000
          }
        }]
      };

      // Send to GA4
      await fetch(GA4_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(err => {
        console.log('LC Helper: Analytics request failed (non-blocking):', err);
      });
    } catch (error) {
      // Silently fail - analytics should never break the extension
      console.log('LC Helper: Analytics error (non-blocking):', error);
    }
  }

  /**
   * Track page view (for content scripts)
   * @param {string} pagePath - Page path
   * @param {string} pageTitle - Page title
   */
  function trackPageView(pagePath, pageTitle) {
    trackEvent('page_view', {
      page_path: pagePath,
      page_title: pageTitle
    });
  }

  /**
   * Track user action
   * @param {string} action - Action name (e.g., 'hint_requested', 'problem_solved')
   * @param {Object} params - Additional parameters
   */
  function trackAction(action, params = {}) {
    trackEvent('user_action', {
      action_name: action,
      ...params
    });
  }

  /**
   * Track feature usage
   * @param {string} feature - Feature name
   * @param {Object} params - Feature-specific parameters
   */
  function trackFeatureUsage(feature, params = {}) {
    trackEvent('feature_used', {
      feature_name: feature,
      ...params
    });
  }

  /**
   * Track error (complementary to error tracking)
   * @param {string} errorType - Error type
   * @param {string} errorMessage - Error message
   */
  function trackError(errorType, errorMessage) {
    trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage.substring(0, 100) // Limit length
    });
  }

  /**
   * Track performance metric
   * @param {string} metricName - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Unit (ms, bytes, etc.)
   */
  function trackPerformance(metricName, value, unit = 'ms') {
    trackEvent('performance_metric', {
      metric_name: metricName,
      metric_value: value,
      metric_unit: unit
    });
  }

  /**
   * Set user properties
   * @param {Object} properties - User properties
   */
  async function setUserProperties(properties) {
    if (!GA4_ENABLED) {
      return;
    }

    // Store user properties
    await chrome.storage.local.set({ lch_user_properties: properties });

    // Track user properties update
    trackEvent('user_properties_set', properties);
  }

  /**
   * Get client ID
   */
  async function getClientId() {
    if (clientId) {
      return clientId;
    }

    const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
    if (stored[CLIENT_ID_KEY]) {
      clientId = stored[CLIENT_ID_KEY];
      return clientId;
    }

    clientId = generateClientId();
    await chrome.storage.local.set({ [CLIENT_ID_KEY]: clientId });
    return clientId;
  }

  /**
   * Check if analytics is enabled
   */
  function isEnabled() {
    return GA4_ENABLED;
  }

  /**
   * Enable/disable analytics (user preference)
   */
  async function setEnabled(enabled) {
    await chrome.storage.sync.set({ analyticsEnabled: enabled });
    if (enabled && !GA4_ENABLED) {
      console.log('LC Helper: Analytics is disabled in code. Set GA4_MEASUREMENT_ID to enable.');
    }
  }

  /**
   * Get analytics enabled status from user preference
   */
  async function getEnabled() {
    const { analyticsEnabled } = await chrome.storage.sync.get('analyticsEnabled');
    return analyticsEnabled !== false && GA4_ENABLED; // Default to true if GA4 is configured
  }

  // Initialize on load
  if (typeof chrome !== 'undefined' && chrome.storage) {
    init();
  }

  // Export for use in other scripts
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      init,
      trackEvent,
      trackPageView,
      trackAction,
      trackFeatureUsage,
      trackError,
      trackPerformance,
      setUserProperties,
      isEnabled,
      setEnabled,
      getEnabled
    };
  } else {
    // Make available globally (works in both window and service worker contexts)
    const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
    globalScope.LCAnalytics = {
      init,
      trackEvent,
      trackPageView,
      trackAction,
      trackFeatureUsage,
      trackError,
      trackPerformance,
      setUserProperties,
      isEnabled,
      setEnabled,
      getEnabled
    };
  }
})();

