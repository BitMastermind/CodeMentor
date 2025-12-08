/**
 * LC Helper - 30-Minute Timer Notification Test Script
 * 
 * HOW TO USE:
 * 1. Navigate to a problem page (LeetCode, Codeforces, or CodeChef)
 * 2. Open DevTools Console (F12 or Cmd+Option+I on Mac)
 * 3. Copy and paste this entire script into the console
 * 4. Press Enter to run the test
 * 
 * WHAT IT DOES:
 * - Checks if a timer is already active
 * - Starts a timer if needed
 * - Triggers the 30-minute notification immediately for testing
 * - Shows detailed feedback about what's happening
 */

(function() {
  'use strict';
  
  console.log('🧪 LC Helper - 30-Minute Timer Notification Test');
  console.log('='.repeat(60));
  console.log('📍 Current URL:', location.href);
  console.log('-'.repeat(60));
  
  // Check if we're on a supported platform
  const platform = (() => {
    if (location.hostname.includes('leetcode.com')) return 'leetcode';
    if (location.hostname.includes('codeforces.com')) return 'codeforces';
    if (location.hostname.includes('codechef.com')) return 'codechef';
    return null;
  })();
  
  if (!platform) {
    console.error('❌ This page is not supported.');
    console.log('💡 Please navigate to a problem page on:');
    console.log('   - LeetCode (leetcode.com/problems/*)');
    console.log('   - Codeforces (codeforces.com/problemset/problem/*)');
    console.log('   - CodeChef (codechef.com/problems/*)');
    return;
  }
  
  console.log('✅ Platform detected:', platform);
  
  // Helper function to send messages - tries chrome.runtime first, falls back to postMessage
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      // Try direct chrome.runtime access first (works in content script context)
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(message)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      // Fallback: use postMessage to communicate with content script
      console.log('⚠️  Using postMessage fallback (chrome.runtime not directly available)');
      
      // Set up listener for response
      const messageHandler = (event) => {
        if (event.data && event.data.type === 'LCH_TEST_RESPONSE') {
          window.removeEventListener('message', messageHandler);
          if (event.data.success !== undefined) {
            resolve({
              success: event.data.success,
              error: event.data.error || null,
              timer: event.data.timer || null
            });
          } else {
            resolve(event.data);
          }
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Send message to content script
      window.postMessage({
        type: 'LCH_FORWARD_MESSAGE',
        originalMessage: message
      }, '*');
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        reject(new Error('Timeout waiting for response from content script'));
      }, 5000);
    });
  }
  
  // Check if extension is available (either direct or via content script)
  const hasExtensionAccess = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  if (!hasExtensionAccess) {
    console.log('⚠️  Chrome extension context not directly available.');
    console.log('💡 Using postMessage to communicate with content script...');
    console.log('   (This is normal when running from page console)');
  } else {
    console.log('✅ Extension context found (direct access)');
  }
  console.log('-'.repeat(60));
  
  // Step 1: Check if timer exists, if not start one
  async function checkAndStartTimer() {
    console.log('📋 Step 1: Checking for active timer...');
    
    try {
      // Try to get current timer
      const response = await sendMessage({
        type: 'GET_TIMER',
        url: location.href
      });
      
      if (response && response.timer) {
        console.log('✅ Timer already active for this problem');
        console.log('   Title:', response.timer.title);
        console.log('   Started:', new Date(response.timer.startTime).toLocaleString());
        return true;
      } else {
        console.log('⚠️  No active timer found');
        console.log('📋 Step 2: Starting a new timer...');
        
        // Extract problem data to start timer
        let problemData = {
          url: location.href,
          title: document.title || 'Test Problem',
          platform: platform
        };
        
        // Try to get better title from page
        if (platform === 'leetcode') {
          const titleEl = document.querySelector('[data-cy="question-title"]');
          if (titleEl) problemData.title = titleEl.textContent.trim();
        } else if (platform === 'codeforces') {
          const titleEl = document.querySelector('.title');
          if (titleEl) problemData.title = titleEl.textContent.trim();
        } else if (platform === 'codechef') {
          const titleEl = document.querySelector('h1, .problem-name');
          if (titleEl) problemData.title = titleEl.textContent.trim();
        }
        
        // Start timer
        const startResponse = await sendMessage({
          type: 'START_TIMER',
          problem: problemData
        });
        
        if (startResponse && startResponse.timer) {
          console.log('✅ Timer started successfully!');
          console.log('   Title:', startResponse.timer.title);
          return true;
        } else {
          console.error('❌ Failed to start timer');
          return false;
        }
      }
    } catch (error) {
      console.error('❌ Error checking/starting timer:', error);
      console.log('💡 Make sure the extension is installed and the page has been refreshed');
      return false;
    }
  }
  
  // Step 2: Test the notification
  async function testNotification() {
    console.log('-'.repeat(60));
    console.log('📋 Step 3: Triggering 30-minute notification...');
    
    try {
      const response = await sendMessage({
        type: 'TEST_TIMER_NOTIFICATION',
        url: location.href
      });
      
      if (response && response.success) {
        console.log('✅ Notification triggered successfully!');
        console.log('');
        console.log('📢 What to check:');
        console.log('   1. A browser notification should appear (check system notification area)');
        console.log('   2. Title: "⏰ 30 Minutes Elapsed!"');
        console.log('   3. Two buttons: "💡 Take a Hint" and "📺 Watch Solution"');
        console.log('   4. A modal popup on the page (30 Minutes Elapsed!)');
        console.log('   5. The icon should display correctly (no image download errors)');
        console.log('');
        console.log('✅ Test completed! If you see the notification, the fix is working.');
        return true;
      } else {
        console.error('❌ Failed to trigger notification');
        console.log('Error:', response?.error || 'Unknown error');
        console.log('');
        console.log('💡 Troubleshooting:');
        console.log('   1. Make sure the timer is active (refresh and run again)');
        console.log('   2. Check the extension background console for errors');
        console.log('   3. Verify the icon file exists at: assets/icon128.png');
        console.log('   4. Make sure notifications are enabled in browser settings');
        return false;
      }
    } catch (error) {
      console.error('❌ Error testing notification:', error);
      console.log('');
      console.log('💡 Make sure:');
      console.log('   1. Extension is installed and enabled');
      console.log('   2. Page has been refreshed after extension installation');
      console.log('   3. You have notifications permission enabled');
      console.log('   4. Content script is loaded (check for extension icon in toolbar)');
      return false;
    }
  }
  
  // Run the test
  (async function() {
    const timerReady = await checkAndStartTimer();
    if (timerReady) {
      await testNotification();
    } else {
      console.log('');
      console.log('❌ Cannot proceed without an active timer');
      console.log('💡 Try refreshing the page and running this script again');
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('🏁 Test script finished');
    console.log('='.repeat(60));
  })();
})();
