# Testing 30-Minute Timer Notification

## Quick Test (Recommended)

### Step 1: Reload Extension

**IMPORTANT:** After the code changes, you need to reload the extension:

1. Go to `chrome://extensions/` (or `edge://extensions/`)
2. Find "LC Helper" extension
3. Click the reload button 🔄

### Step 2: Run the Test

1. Open a problem page (LeetCode, Codeforces, or CodeChef)
2. Wait a few seconds for the extension to load
3. Open browser console (F12 or Cmd+Option+I)
4. **Right-click in the console** and select "Paste" (or use Cmd+V / Ctrl+V)
5. Copy and paste this code from `test-timer-page-context.js`:

```javascript
(function () {
  console.log("🧪 Testing 30-minute timer notification...");
  const isSupported =
    location.hostname.includes("leetcode.com") ||
    location.hostname.includes("codeforces.com") ||
    location.hostname.includes("codechef.com");
  if (!isSupported) {
    console.error(
      "❌ This page is not supported. Please run this on a problem page."
    );
    return;
  }
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    chrome.runtime
      .sendMessage({ type: "TEST_TIMER_NOTIFICATION", url: location.href })
      .then((r) =>
        console.log(
          r?.success ? "✅ Notification triggered!" : "❌ Error:",
          r?.error || r
        )
      )
      .catch((e) => console.error("❌ Failed:", e));
    return;
  }
  const handler = function (event) {
    if (event.data && event.data.type === "LCH_TEST_RESPONSE") {
      window.removeEventListener("message", handler);
      console.log(
        event.data.success ? "✅ Notification triggered!" : "❌ Error:",
        event.data.error
      );
    }
  };
  window.addEventListener("message", handler);
  window.postMessage({ type: "LCH_TEST_TIMER", url: location.href }, "*");
  console.log("📤 Message sent. Waiting for response...");
})();
```

3. Press Enter

You should see:

- ✅ Browser notification (system notification)
- ✅ Modal popup on the page

**Note:** If you get a "pasting" warning, just **right-click in the console** and select "Paste" instead of using keyboard shortcuts.

---

## Method 2: Type Manually (No Pasting)

If pasting doesn't work, just type this code manually:

1. Open console on a problem page
2. Type this (you can copy-paste each line or type it all):

```javascript
chrome.runtime
  .sendMessage({
    type: "TEST_TIMER_NOTIFICATION",
    url: location.href,
  })
  .then(function (response) {
    if (response && response.success) {
      console.log("✅ Notification triggered!");
    } else {
      console.log("❌ Error:", response?.error || "Unknown error");
    }
  })
  .catch(function (error) {
    console.error("❌ Failed:", error);
  });
```

---

## What You Should See

1. **Browser Notification** (system notification):

   - Title: "⏰ 30 Minutes Elapsed!"
   - Message with problem title
   - Buttons: "💡 Take a Hint" and "📺 Watch Solution"

2. **Page Modal**:
   - Overlay modal on the problem page
   - Options to take hint, watch solution, or keep trying

---

## Troubleshooting

- **"No active timer found"**: Refresh the page and wait a few seconds for timer to start
- **No notification**: Check browser notification permissions
- **No modal**: Refresh the page - it should appear automatically

---

## Note

The timer must be active for this to work. The timer starts automatically when you open a problem page on LeetCode, Codeforces, or CodeChef.
