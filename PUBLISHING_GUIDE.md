# Chrome Web Store Publishing Guide - CodeMentor

**Quick Status:** ✅ 85% Ready - Just need 3 things before submission!

## 🚀 Step-by-Step Publishing Process

### Step 1: Host Privacy Policy (CRITICAL - 30 minutes)

**Why:** Chrome Web Store requires a publicly accessible privacy policy URL.

**Option A: GitHub Pages (Recommended - Free & Easy)**

**⚠️ IMPORTANT:** GitHub Pages requires your repository to be **public** (or GitHub Enterprise). Since your extension will be public anyway, this is usually fine.

**If your repo is private:**

- **Option 1:** Make it public (recommended for open-source extensions)
  - Go to **Settings** → **General** → Scroll to **"Danger Zone"**
  - Click **"Change visibility"** → **"Make public"**
- **Option 2:** Use Option B or C below instead

**Steps:**

1. ✅ **`docs` folder already exists** with `index.html` (already done!)

2. **Enable GitHub Pages:**

   - Go to your GitHub repo: `https://github.com/BitMastermind/LC-Helper`
   - Click **Settings** → **Pages**
   - If you see "Upgrade or make this repository public":
     - Either make repo public (Settings → General → Danger Zone → Make public)
     - OR use Option B or C below
   - Under "Source", select **"Deploy from a branch"**
   - Select branch: **`main`** (or `master`)
   - Select folder: **`/docs`**
   - Click **Save**

3. **Wait 1-2 minutes**, then your privacy policy will be available at:

   ```
   https://bitmastermind.github.io/LC-Helper/
   ```

4. ✅ **manifest.json already updated** with privacy policy URL (already done!)

**Option B: Netlify Drop (Free - No Account Needed)**

1. Go to: `https://app.netlify.com/drop`
2. Drag and drop your `docs` folder
3. Copy the generated URL (e.g., `https://random-name-123.netlify.app`)
4. Update `manifest.json`:
   ```json
   "privacy_policy": "https://your-netlify-url.netlify.app",
   ```

**Option C: Raw GitHub (Quick Temporary Solution)**

1. Use this URL directly:

   ```
   https://raw.githubusercontent.com/BitMastermind/LC-Helper/main/PRIVACY_POLICY.md
   ```

2. Update manifest.json:
   ```json
   "privacy_policy": "https://raw.githubusercontent.com/BitMastermind/LC-Helper/main/PRIVACY_POLICY.md",
   ```

**Note:** Chrome prefers HTML, but Markdown may work. Option A (GitHub Pages) is best long-term.

---

### Step 2: Create Screenshots (IMPORTANT - 1-2 hours)

**Why:** Screenshots are required for store listing and help users understand your extension.

**Required:** 1-5 screenshots  
**Recommended Size:** 1280x800 pixels (or 640x400)  
**Format:** PNG or JPEG

**Screenshot Ideas:**

1. **Hints Panel on LeetCode** (Most Important)

   - Open a LeetCode problem (e.g., "Two Sum")
   - Click the CodeMentor FAB button
   - Show the hints panel with progressive hints visible
   - **What to show:** Problem title, hints panel open, maybe one hint revealed

2. **Contest Tracking in Popup**

   - Click extension icon
   - Show the "Contests" tab
   - Display upcoming contests from multiple platforms
   - **What to show:** List of contests with filters visible

3. **Streak Dashboard**

   - Click extension icon
   - Show the "Streak" tab
   - Display streak statistics and progress
   - **What to show:** Current streak, problems solved today, motivational message

4. **Settings Page**

   - Click extension icon → Settings tab
   - Show API key configuration (blur the actual key!)
   - Show notification settings
   - **What to show:** Settings form with options visible

5. **Codeforces/CodeChef Integration** (Optional)
   - Show hints panel working on Codeforces or CodeChef
   - Demonstrates multi-platform support

**How to Take Screenshots:**

1. **Chrome DevTools Method:**

   - Press `F12` to open DevTools
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "screenshot" and select "Capture full size screenshot"
   - Crop to 1280x800 if needed

2. **Browser Extension Method:**

   - Use a screenshot extension like "Awesome Screenshot"
   - Capture the visible area
   - Edit to 1280x800 if needed

3. **Mac Method:**
   - `Cmd+Shift+4` → Select area
   - Or use Preview app to resize

**Save screenshots as:**

- `screenshot1.png` - Hints panel
- `screenshot2.png` - Contest tracking
- `screenshot3.png` - Streak dashboard
- `screenshot4.png` - Settings page

---

### Step 3: Write Store Listing Description (IMPORTANT - 1 hour)

**Why:** This is what users see when browsing the Chrome Web Store.

#### Short Description (132 characters max)

```
AI-powered hints, contest tracking & streak management for LeetCode, Codeforces & CodeChef. Improve your coding skills efficiently!
```

_(132 characters exactly)_

#### Detailed Description (Up to 16,000 characters)

Use this template and customize:

```
CodeMentor - AI Coding Assistant

Transform your competitive programming journey with AI-powered hints, smart contest tracking, and comprehensive streak management for LeetCode, Codeforces, and CodeChef.

✨ KEY FEATURES:

🤖 AI-Powered Smart Hints
• Get progressive hints (Gentle Push → Stronger Nudge → Almost There)
• Topic classification with time complexity analysis
• Support for multiple AI providers (OpenAI GPT-4, Google Gemini, Claude, Groq, Together AI, HuggingFace, OpenRouter, Custom Endpoints)
• Vision model support for problems with images/graphs
• Smart caching to reduce API calls and costs

📊 Contest Tracking
• Never miss a contest with smart notifications
• Track contests from LeetCode, Codeforces, and CodeChef
• Filter and search contests by platform
• Configurable reminder time before contests start
• Auto-refresh every 6 hours

🔥 Streak Management
• Unified streak across all platforms
• Automatic sync with LeetCode, Codeforces, and CodeChef APIs
• Daily problem counter with auto-refresh
• Motivational messages for streak milestones
• Visual progress bars for goals (7, 30, 50, 100, 365 days)

⏱️ Problem Timer
• Automatic timer when you open a problem
• 30-minute reminder if you're stuck
• Visual elapsed time display
• Smart suggestions when timer hits 30 minutes

❤️ Favorites System
• Save problems for later practice
• Quick access from extension popup
• One-click open in new tab

🔒 PRIVACY-FIRST DESIGN:
• All data stored locally on your device
• Your API keys are encrypted and never shared
• No data sent to our servers (we don't have any!)
• Optional analytics can be disabled
• Full GDPR and CCPA compliance

🚀 GET STARTED:
1. Install the extension
2. Add your API key in Settings (OpenAI, Gemini, or others)
3. Start solving problems with smart hints!

Perfect for competitive programmers, coding interview prep, and anyone looking to improve their algorithmic problem-solving skills efficiently.

📚 SUPPORTED PLATFORMS:
• LeetCode (leetcode.com)
• Codeforces (codeforces.com)
• CodeChef (codechef.com)

🔧 TECHNICAL DETAILS:
• Manifest V3 compliant
• Works offline (cached hints)
• Cross-browser compatible (Chrome, Edge, Safari)
• Lightweight and fast
• Open source (MIT License)

For questions, issues, or feature requests, visit our GitHub repository.
```

#### Single Purpose Description

```
CodeMentor provides AI-powered coding hints, contest tracking, and streak management to help competitive programmers improve their problem-solving skills on LeetCode, Codeforces, and CodeChef platforms.
```

#### Permissions Justification

```
• storage: Store API keys, settings, favorites, hints cache, and streak data locally
• alarms: Schedule contest reminders and daily streak checks
• notifications: Show contest reminders and timer notifications
• activeTab: Access problem data from current tab to generate contextual hints
• tabs: Open contest URLs and manage tabs for notifications
• Host permissions: Access coding platforms to extract problem data and fetch user activity, contest APIs for tracking, and AI provider APIs for generating hints (using user's own API key)
```

---

### Step 4: Package Extension (15 minutes)

**Why:** Chrome Web Store requires a ZIP file of your extension.

1. **Create a clean package** - Exclude unnecessary files:

   ```bash
   # Create a list of files to exclude
   # Exclude: .git, .DS_Store, node_modules, development files
   ```

2. **Manual Method:**

   - Select all files EXCEPT:
     - `.git/` folder
     - `.DS_Store` files
     - `node_modules/` (if any)
     - `CHROME_STORE_READINESS_REPORT.md`
     - `STORE_READINESS.md`
     - `VALUE_PROPOSITION_ANALYSIS.md`
     - Any other documentation files you don't need
   - Right-click → Compress (Mac) or Send to → Compressed folder (Windows)
   - Name it: `codementor-extension-v1.0.0.zip`

3. **Command Line Method (Mac/Linux):**

   ```bash
   zip -r codementor-extension-v1.0.0.zip . \
     -x "*.git*" \
     -x "*.DS_Store" \
     -x "node_modules/*" \
     -x "CHROME_STORE_READINESS_REPORT.md" \
     -x "STORE_READINESS.md" \
     -x "VALUE_PROPOSITION_ANALYSIS.md"
   ```

4. **Test the package:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select your extension folder
   - Verify everything works
   - Then create the ZIP

---

### Step 5: Submit to Chrome Web Store (30 minutes)

1. **Go to Chrome Web Store Developer Dashboard:**

   ```
   https://chrome.google.com/webstore/devconsole
   ```

2. **Pay Developer Fee** (One-time $5):

   - If you haven't already, you'll need to pay the one-time $5 developer registration fee
   - This is required to publish extensions

3. **Click "New Item"** button

4. **Upload ZIP file:**

   - Click "Upload" and select your `codementor-extension-v1.0.0.zip`
   - Wait for upload to complete

5. **Fill out Store Listing:**

   **Basic Information:**

   - **Name:** `CodeMentor - AI Coding Assistant`
   - **Summary:** (Use short description from Step 3)
   - **Description:** (Use detailed description from Step 3)
   - **Category:** Select `Productivity` or `Developer Tools`
   - **Language:** `English`

   **Graphics:**

   - **Screenshots:** Upload 1-5 screenshots (from Step 2)
   - **Promotional Images:** (Optional - can add later)

   **Privacy:**

   - **Privacy Policy:** Enter your privacy policy URL (from Step 1)
   - **Single Purpose:** (Use single purpose description from Step 3)
   - **Permissions Justification:** (Use permissions justification from Step 3)

   **Additional Information:**

   - **Website:** `https://github.com/BitMastermind/LC-Helper` (Your GitHub repo URL)
   - **Support URL:** `https://github.com/BitMastermind/LC-Helper/issues` (GitHub issues URL - users can report bugs and request features here)

6. **Review and Submit:**
   - Review all information
   - Check that privacy policy URL is accessible
   - Click **"Submit for Review"**

---

### Step 6: Wait for Review (1-3 days)

**What to Expect:**

- Review typically takes 1-3 business days
- You'll receive email notifications about status
- Check Developer Dashboard for updates

**Common Review Feedback:**

- Privacy policy URL not accessible → Fix URL
- Permissions not justified → Update justification
- Screenshots unclear → Replace with better screenshots
- Description needs improvement → Update description

**If Rejected:**

- Read the feedback carefully
- Address each point
- Resubmit with fixes

---

### Step 7: After Approval 🎉

Once approved:

1. **Your extension will be live!**

   - Share the Chrome Web Store link
   - Update README.md with store link

2. **Monitor User Feedback:**

   **How You'll Receive Feedback:**

   - **GitHub Issues:** When users submit feedback through the extension's "Send Feedback" button in Settings, they'll be directed to create a GitHub Issue with their feedback pre-filled. You'll receive notifications for new issues.

   - **Chrome Web Store Reviews:** Users can leave reviews directly on the Chrome Web Store listing. Check your Developer Dashboard regularly.

   - **Support URL:** Users can also click the "Support" link on your Chrome Web Store listing, which directs them to your GitHub Issues page.

   **To Monitor:**

   - Set up GitHub notifications for new issues: Go to your repo → Settings → Notifications
   - Check Chrome Web Store Developer Dashboard for reviews and ratings
   - Respond to feedback promptly to build trust

3. **Update GitHub:**

   - Add Chrome Web Store badge to README
   - Update installation instructions
   - Consider adding a CONTRIBUTING.md file for feature requests

4. **Consider Codeforces Blog Post:**
   - Write a blog post on Codeforces
   - Share with the competitive programming community

---

## ✅ Pre-Submission Checklist

Before submitting, verify:

- [ ] Privacy policy URL added to `manifest.json`
- [ ] Privacy policy is publicly accessible (test the URL)
- [ ] Screenshots prepared (1-5 images, 1280x800 recommended)
- [ ] Store description written (short + detailed)
- [ ] Single purpose description ready
- [ ] Permissions justification ready
- [ ] Extension packaged as ZIP file
- [ ] Tested packaged extension loads correctly
- [ ] All features tested and working
- [ ] No console errors in normal usage
- [ ] Version number is correct in `manifest.json`

---

## 🆘 Troubleshooting

### Privacy Policy URL Not Working

- **Issue:** Chrome can't access the URL
- **Fix:** Make sure GitHub Pages is enabled and URL is correct
- **Test:** Open URL in incognito window

### Screenshots Rejected

- **Issue:** Screenshots don't meet requirements
- **Fix:** Use recommended size (1280x800), ensure they're clear and show features

### Permissions Rejected

- **Issue:** Permissions not justified enough
- **Fix:** Be more specific about why each permission is needed

### Extension Rejected

- **Issue:** Extension doesn't work as described
- **Fix:** Test thoroughly before submitting, fix bugs

---

## 📞 Resources

- **Chrome Web Store Developer Dashboard:** https://chrome.google.com/webstore/devconsole
- **Chrome Web Store Policies:** https://developer.chrome.com/docs/webstore/program-policies/
- **GitHub Repository:** https://github.com/BitMastermind/LC-Helper
- **Privacy Policy:** (Add your URL after Step 1)

---

## ⏱️ Estimated Timeline

- **Step 1 (Privacy Policy):** 30 minutes
- **Step 2 (Screenshots):** 1-2 hours
- **Step 3 (Description):** 1 hour
- **Step 4 (Package):** 15 minutes
- **Step 5 (Submit):** 30 minutes
- **Step 6 (Review):** 1-3 days (waiting)

**Total Active Time:** 3-4 hours  
**Total Time to Live:** 1-4 days

---

**You're almost there! Follow these steps and your extension will be live on the Chrome Web Store! 🚀**
