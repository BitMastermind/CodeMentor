
(async function testTimerNotification() {
  console.log('🧪 Testing 30-minute timer notification...');
  
  // Get current page URL
  const currentUrl = window.location.href;
  console.log('📍 Current URL:', currentUrl);
  
  try {
    // Send message to background script to trigger notification
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_TIMER_NOTIFICATION',
      url: currentUrl
    });
    
    if (response && response.success) {
      console.log('✅ Notification and modal triggered successfully!');
      console.log('📢 You should see:');
      console.log('   1. A browser notification (check your system notifications)');
      console.log('   2. A modal popup on the page (30 Minutes Elapsed!)');
      console.log('');
      console.log('💡 If you don\'t see the modal, try refreshing the page.');
      
    } else if (response && response.error) {
      console.error('❌ Error:', response.error);
      console.log('💡 Tip: Make sure you have started a timer on this problem first.');
      console.log('   The timer starts automatically when you open a problem page.');
    } else {
      console.error('❌ Unexpected response:', response);
    }
  } catch (error) {
    console.error('❌ Failed to trigger notification:', error);
    console.log('💡 Make sure the extension is installed and enabled.');
  }
})();
