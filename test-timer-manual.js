// Type this code manually in the console (no pasting needed)
// Just copy each line and type it in, or copy all and use right-click paste

chrome.runtime.sendMessage({
  type: 'TEST_TIMER_NOTIFICATION',
  url: location.href
}).then(function(response) {
  if (response && response.success) {
    console.log('✅ Notification triggered!');
    console.log('Check for browser notification and page modal');
  } else {
    console.log('❌ Error:', response?.error || 'Unknown error');
    console.log('💡 Make sure timer is active - refresh page and try again');
  }
}).catch(function(error) {
  console.error('❌ Failed:', error);
});
