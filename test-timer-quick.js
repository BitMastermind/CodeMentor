// QUICK TEST - Copy and paste this ONE line into console:
chrome.runtime.sendMessage({type:'TEST_TIMER_NOTIFICATION',url:location.href}).then(r=>console.log(r?.success?'✅ Notification triggered! Check for browser notification.':'❌ Error:',r?.error||'No active timer. Refresh page first.')).catch(e=>console.error('❌ Failed:',e));
