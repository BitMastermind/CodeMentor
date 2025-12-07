// Test script that works from the page console
// This script communicates with the content script via postMessage

(function() {
  console.log('🧪 Testing 30-minute timer notification...');
  console.log('📍 Current URL:', location.href);
  
  // Check if we're on a supported platform
  const isSupported = location.hostname.includes('leetcode.com') || 
                      location.hostname.includes('codeforces.com') || 
                      location.hostname.includes('codechef.com');
  
  if (!isSupported) {
    console.error('❌ This page is not supported. Please run this on a LeetCode, Codeforces, or CodeChef problem page.');
    return;
  }
  
  // Method 1: Try to access chrome.runtime directly (works if extension context is available)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    console.log('✅ Extension context found, using direct API...');
    chrome.runtime.sendMessage({
      type: 'TEST_TIMER_NOTIFICATION',
      url: location.href
    }).then(function(response) {
      if (response && response.success) {
        console.log('✅ Notification triggered!');
        console.log('📢 Check for browser notification and page modal');
      } else {
        console.log('❌ Error:', response?.error || 'Unknown error');
        console.log('💡 Make sure timer is active - refresh page and try again');
      }
    }).catch(function(error) {
      console.error('❌ Failed:', error);
    });
    return;
  }
  
  // Method 2: Use postMessage to communicate with content script
  console.log('⚠️ Extension context not directly available, trying postMessage...');
  
  // Create a message listener
  const messageHandler = function(event) {
    if (event.data && event.data.type === 'LCH_TEST_RESPONSE') {
      window.removeEventListener('message', messageHandler);
      if (event.data.success) {
        console.log('✅ Notification triggered!');
        console.log('📢 Check for browser notification and page modal');
      } else {
        console.log('❌ Error:', event.data.error || 'Unknown error');
      }
    }
  };
  
  window.addEventListener('message', messageHandler);
  
  // Send message to content script
  window.postMessage({
    type: 'LCH_TEST_TIMER',
    url: location.href
  }, '*');
  
  console.log('📤 Message sent to content script. Waiting for response...');
  console.log('💡 If this doesn\'t work, try:');
  console.log('   1. Make sure you\'re on a problem page');
  console.log('   2. Refresh the page and wait a few seconds');
  console.log('   3. Check if the extension icon appears in the toolbar');
})();
