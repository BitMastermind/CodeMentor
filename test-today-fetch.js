/**
 * LC Helper - Today Count Fetching Test Script
 * 
 * HOW TO USE:
 * 1. Open Chrome DevTools (F12 or Cmd+Option+I)
 * 2. Go to the Extensions page (chrome://extensions)
 * 3. Find "LC Helper" and click "Inspect views: service worker"
 * 4. Copy and paste this entire script into the service worker console
 * 5. Press Enter to run the test
 * 
 * WHAT IT DOES:
 * - Tests the syncTodayCountFromAPIs function
 * - Checks if usernames are configured
 * - Verifies date handling
 * - Tests API fetching from all platforms
 * - Shows detailed results
 */

(async function() {
  'use strict';
  
  console.log('🧪 LC Helper - Today Count Fetching Test');
  console.log('='.repeat(60));
  
  // Helper function to get today's date string (same as in service worker)
  function getTodayDateString() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Step 1: Check current daily stats
  console.log('📋 Step 1: Checking current daily stats...');
  const { dailyStats } = await chrome.storage.local.get('dailyStats');
  const today = getTodayDateString();
  
  console.log('Today date string:', today);
  console.log('Current daily stats:', dailyStats);
  
  if (dailyStats) {
    console.log('  - Date:', dailyStats.date);
    console.log('  - Count:', dailyStats.count);
    console.log('  - Problems:', dailyStats.problems?.length || 0);
    console.log('  - API Synced:', dailyStats.apiSynced || false);
    console.log('  - Last API Sync:', dailyStats.lastApiSync ? new Date(dailyStats.lastApiSync).toLocaleString() : 'Never');
    
    if (dailyStats.date !== today) {
      console.log('⚠️  Daily stats are from a different day!');
      console.log('   Expected:', today);
      console.log('   Found:', dailyStats.date);
    } else {
      console.log('✅ Daily stats are for today');
    }
  } else {
    console.log('⚠️  No daily stats found (will be created on first sync)');
  }
  
  console.log('-'.repeat(60));
  
  // Step 2: Check usernames
  console.log('📋 Step 2: Checking configured usernames...');
  const { leetcodeUsername, codeforcesUsername, codechefUsername } = 
    await chrome.storage.sync.get(['leetcodeUsername', 'codeforcesUsername', 'codechefUsername']);
  
  console.log('LeetCode username:', leetcodeUsername || '❌ Not configured');
  console.log('Codeforces username:', codeforcesUsername || '❌ Not configured');
  console.log('CodeChef username:', codechefUsername || '❌ Not configured');
  
  if (!leetcodeUsername && !codeforcesUsername && !codechefUsername) {
    console.log('');
    console.log('❌ No usernames configured!');
    console.log('💡 Please configure at least one username in the extension popup settings.');
    console.log('   The today count will not fetch from APIs without usernames.');
    return;
  }
  
  console.log('-'.repeat(60));
  
  // Step 3: Test the sync function
  console.log('📋 Step 3: Testing syncTodayCountFromAPIs...');
  console.log('   (This will make actual API calls)');
  console.log('');
  
  try {
    // Call the sync function via message
    const response = await chrome.runtime.sendMessage({ 
      type: 'SYNC_TODAY_COUNT_FROM_APIS' 
    });
    
    if (response && response.dailyStats) {
      const stats = response.dailyStats;
      console.log('✅ Sync completed successfully!');
      console.log('');
      console.log('📊 Results:');
      console.log('  - Date:', stats.date);
      console.log('  - Count:', stats.count);
      console.log('  - Problems:', stats.problems?.length || 0);
      console.log('  - API Synced:', stats.apiSynced || false);
      console.log('  - Last API Sync:', stats.lastApiSync ? new Date(stats.lastApiSync).toLocaleString() : 'Never');
      
      if (stats.problems && stats.problems.length > 0) {
        console.log('');
        console.log('📝 Problems solved today:');
        stats.problems.slice(0, 10).forEach((url, i) => {
          console.log(`   ${i + 1}. ${url}`);
        });
        if (stats.problems.length > 10) {
          console.log(`   ... and ${stats.problems.length - 10} more`);
        }
      } else {
        console.log('');
        console.log('ℹ️  No problems found for today');
        console.log('   This could mean:');
        console.log('   - You haven\'t solved any problems today');
        console.log('   - The APIs are not returning today\'s submissions');
        console.log('   - There was an error fetching from the APIs');
      }
      
      // Check if count matches problems array
      if (stats.count !== (stats.problems?.length || 0)) {
        console.log('');
        console.log('⚠️  WARNING: Count mismatch!');
        console.log(`   Count: ${stats.count}`);
        console.log(`   Problems array length: ${stats.problems?.length || 0}`);
        console.log('   These should match. This might indicate a bug.');
      } else {
        console.log('');
        console.log('✅ Count matches problems array length');
      }
      
    } else {
      console.error('❌ Sync failed - no dailyStats in response');
      console.log('Response:', response);
    }
    
  } catch (error) {
    console.error('❌ Error during sync:', error);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('   1. Check the service worker console for detailed error messages');
    console.log('   2. Verify your usernames are correct');
    console.log('   3. Check if the APIs are accessible (network issues?)');
    console.log('   4. Make sure the extension service worker is running');
  }
  
  console.log('');
  console.log('-'.repeat(60));
  
  // Step 4: Check alarms
  console.log('📋 Step 4: Checking auto-refresh alarms...');
  const alarms = await chrome.alarms.getAll();
  const refreshAlarm = alarms.find(a => a.name === 'refreshTodayCount');
  
  if (refreshAlarm) {
    console.log('✅ Auto-refresh alarm is set');
    console.log('   Next refresh:', new Date(refreshAlarm.scheduledTime).toLocaleString());
    console.log('   Period:', refreshAlarm.periodInMinutes, 'minutes');
  } else {
    console.log('⚠️  Auto-refresh alarm not found');
    console.log('   The today count will not auto-refresh every 15 minutes');
    console.log('   This might happen if the extension was just installed');
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('🏁 Test completed');
  console.log('='.repeat(60));
  console.log('');
  console.log('💡 Tips:');
  console.log('   - The today count refreshes automatically every 15 minutes');
  console.log('   - You can also manually refresh by clicking the refresh icon in the popup');
  console.log('   - The count includes problems from all configured platforms');
  console.log('   - Manual "Mark as Solved" actions are also counted');
})();
