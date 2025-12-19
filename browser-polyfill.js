/**
 * Browser API Polyfill for Chrome/Safari/Firefox compatibility
 * This ensures the extension works across all browsers
 */
(function() {
  'use strict';

  // Check if we're in a browser extension context
  const isBrowserExtension = typeof chrome !== 'undefined' || typeof browser !== 'undefined';
  
  if (!isBrowserExtension) {
    console.warn('CodeMentor: Not running in browser extension context');
    return;
  }

  // Create unified API
  if (typeof globalThis.browser === 'undefined') {
    if (typeof chrome !== 'undefined') {
      globalThis.browser = chrome;
    }
  }

  // Promisify callback-based APIs for Safari compatibility
  const promisifyAPI = (api, methodName) => {
    const original = api[methodName];
    if (typeof original !== 'function') return;
    
    return function(...args) {
      return new Promise((resolve, reject) => {
        try {
          // Check if already returns a promise (MV3)
          const result = original.apply(api, [...args, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }]);
          
          // If it returned a promise, use that instead
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          }
        } catch (e) {
          reject(e);
        }
      });
    };
  };

  // Log browser detection
  const detectBrowser = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      return 'Safari';
    } else if (ua.includes('Firefox')) {
      return 'Firefox';
    } else if (ua.includes('Chrome')) {
      return 'Chrome';
    }
    return 'Unknown';
  };

  console.log(`CodeMentor: Running in ${detectBrowser()}`);
})();

