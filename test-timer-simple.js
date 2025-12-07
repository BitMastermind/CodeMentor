// Simple one-liner test - Just copy and paste this single line:
chrome.runtime.sendMessage({type:'TEST_TIMER_NOTIFICATION',url:location.href}).then(r=>console.log(r?.success?'✅ Notification triggered!':'❌ Error:',r?.error||r)).catch(e=>console.error('❌ Failed:',e));
