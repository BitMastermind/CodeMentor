# ⚡ LC Helper - Competitive Programming Assistant

A Chrome extension that helps you solve problems on **LeetCode**, **Codeforces**, and **CodeChef** with smart AI-powered hints, precise topic classification, and contest tracking.

![LC Helper](https://img.shields.io/badge/version-1.0.0-blue) ![Chrome](https://img.shields.io/badge/Chrome-Extension-green)

## ✨ Features

### 🎯 Smart Hints (AI-Powered)
- **3 Progressive Hints**: Get hints in increasing order of specificity
  - **Hint 1 - Gentle Push**: A subtle observation pointing you in the right direction
  - **Hint 2 - Stronger Nudge**: More specific guidance about approach/data structure
  - **Hint 3 - Almost There**: Near-complete approach without full implementation
- Hints are revealed one at a time - challenge yourself before peeking!

### 🏷️ Exact Topic Classification
- Not just "DP" but **"DP on Trees"**
- Not just "Binary Search" but **"Binary Search on Answer"**
- Examples: "Two Pointers + Sliding Window", "BFS on Implicit Graph", "Segment Tree with Lazy Propagation"

### 📅 Contest Tracker
- **Unified calendar** showing contests from all 3 platforms
- **Desktop notifications** before contests start
- **One-click registration** links
- Customizable reminder times (15min to 1 day before)

## 🚀 Installation

### Step 1: Generate Icons
1. Open `create-icons.html` in your browser
2. Icons will be generated automatically
3. Click "Download All" to save them
4. Move the 3 PNG files to the `assets/` folder in your extension directory

### Step 2: Load Extension in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `LC Helper` folder

### Step 3: Configure API Key
1. Click the LC Helper extension icon
2. Go to **Settings** tab
3. Choose your AI provider:
   - **Gemini** (Recommended for free tier): Get API key at [aistudio.google.com/apikey](https://aistudio.google.com/app/apikey)
   - **OpenAI** (Paid): Get API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Enter your API key
5. Click **Save Settings**

### ⚡ Quick Start with Gemini 2.0 (FREE)
Gemini 2.0 Flash is recommended - it's faster and smarter:
- Free tier: 15 requests per minute
- Model: **Gemini 2.0 Flash** - Latest stable release
- 2048 max tokens for detailed hints
- Get your key: [Google AI Studio](https://aistudio.google.com/app/apikey)

## 📖 Usage

### Getting Hints on Problem Pages
1. Navigate to any problem on LeetCode, Codeforces, or CodeChef
2. Click the **floating ⚡ button** in the bottom-right corner
3. View the **exact topic** classification
4. Reveal hints progressively by clicking each hint card

### Tracking Contests
1. Click the extension icon to open the popup
2. View upcoming contests from all platforms
3. Click **Remind Me** to set a notification
4. Filter by platform using the filter buttons

## 🔧 Configuration Options

| Setting | Description |
|---------|-------------|
| **AI Provider** | Choose between Gemini (free) or OpenAI (paid) |
| **API Key** | Required for AI-powered hints |
| **Contest Reminders** | Enable/disable desktop notifications |
| **Reminder Time** | How long before contest to notify |
| **Auto-show Panel** | Automatically open hints on problem pages |

## 🆚 API Provider Comparison

| Feature | Gemini 2.0 Flash | GPT-4o-mini |
|---------|------------------|-------------|
| **Free Tier** | ✅ 15 RPM | ❌ Paid only |
| **Cost** | Free / $0.35 per 1M tokens | $0.15 per 1M input tokens |
| **Speed** | ⚡⚡ Ultra Fast | ⚡ Fast |
| **Quality** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Excellent |
| **Max Tokens** | 2048 | 2048 |
| **Best For** | **Testing & Personal Use** | Production Use |
| **Version** | Gemini 2.0 (Stable) | GPT-4o mini |

## 🏗️ Project Structure

```
LC Helper/
├── manifest.json           # Extension configuration
├── background/
│   └── service-worker.js   # Background tasks, API calls, notifications
├── content/
│   ├── leetcode.js         # LeetCode content script
│   ├── codeforces.js       # Codeforces content script
│   └── codechef.js         # CodeChef content script
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic
├── styles/
│   └── hints-panel.css     # Injected styles for hints panel
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 💡 Tips

- **Start with Hint 1**: Try solving with minimal help first
- **Use topic tags**: Knowing the exact topic can help you recall techniques
- **Set reminders early**: Don't miss contests!
- **API costs**: 
  - Gemini (Free tier): ~500 free hints per day
  - GPT-4o-mini: ~$0.001-0.002 per hint
- **Contest data**: If LeetCode/CodeChef contests aren't showing, it's due to API limitations. Codeforces contests always work!

## 🔒 Privacy

- Your API key is stored locally in Chrome's secure storage
- Problem data is sent only to OpenAI for hint generation
- No data is collected or stored on external servers
- Contest data is fetched from public APIs

## 📝 License

MIT License - Feel free to modify and distribute!

---

Made with ❤️ for competitive programmers

