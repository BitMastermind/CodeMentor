# LC Helper - Competitive Programming Assistant

A powerful Chrome extension that provides AI-powered hints, topic classification, contest tracking, and streak management for competitive programming platforms (LeetCode, Codeforces, and CodeChef).

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/chrome-extension-brightgreen.svg)

## ✨ Features

### 🤖 AI-Powered Smart Hints
- **Progressive Hints**: Get three levels of hints (Gentle Push → Stronger Nudge → Almost There)
- **Topic Classification**: Automatically identifies problem topics with time complexity analysis
- **Multi-Provider Support**: Works with OpenAI (GPT-4o-mini) or Google Gemini (Gemini 2.0 Flash)
- **Image Support**: Analyzes problems with images/graphs using vision models
- **Smart Caching**: Caches hints to reduce API calls and costs

### 📊 Contest Tracking
- **Multi-Platform**: Tracks contests from LeetCode, Codeforces, and CodeChef
- **Smart Notifications**: Get notified before contests start (configurable reminder time)
- **Filter & Search**: Filter contests by platform and search by name
- **Auto-Refresh**: Automatically fetches latest contests every 6 hours

### 🔥 Streak Management
- **Unified Streak**: Combines activity from all platforms into one streak
- **API-Based Tracking**: Automatically syncs with LeetCode, Codeforces, and CodeChef APIs
- **Daily Counter**: Tracks problems solved today with auto-refresh every 15 minutes
- **Motivational Messages**: Encouraging messages based on your streak milestones
- **Progress Tracking**: Visual progress bars for streak milestones (7, 30, 50, 100, 365 days)

### ⏱️ Problem Timer
- **Automatic Tracking**: Starts timer when you open a problem
- **30-Minute Reminder**: Get notified if you've been stuck for 30 minutes
- **Visual Display**: See elapsed time in the hints panel
- **Smart Suggestions**: Get hints or solution links when timer hits 30 minutes

### ❤️ Favorites System
- **Save Problems**: Mark problems as favorites across all platforms
- **Quick Access**: View all favorites in the extension popup
- **One-Click Open**: Click any favorite to open it in a new tab

### 📈 Daily Statistics
- **Today's Count**: See how many problems you've solved today
- **API Integration**: Automatically syncs from LeetCode and Codeforces APIs
- **Background Refresh**: Updates every 15 minutes even when popup is closed
- **Manual Refresh**: Click refresh button for immediate update

## 🚀 Installation

### From Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/BitMastermind/LC-Helper.git
   cd LC-Helper
   ```

2. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `LC-Helper` directory

3. **Configure API Key**
   - Click the extension icon
   - Go to Settings tab
   - Choose your AI provider (OpenAI or Gemini)
   - Enter your API key
   - Save settings

## 📖 Usage

### Getting Hints

1. Navigate to any problem on LeetCode, Codeforces, or CodeChef
2. Click the floating action button (⚡) in the bottom-right corner
3. Wait for AI to analyze the problem and generate hints
4. Click "Reveal" on each hint to see progressive guidance

### Tracking Streaks

1. Go to Settings and enter your usernames for each platform
2. The extension automatically syncs your activity from APIs
3. View your streak in the Streak tab of the popup
4. Get daily reminders to maintain your streak

### Managing Favorites

1. Open the hints panel on any problem
2. Click "Add to Favorites" button
3. View all favorites in the Favorites tab
4. Click any favorite to open it instantly

### Contest Notifications

1. Go to Settings tab
2. Enable "Contest Reminders"
3. Set your preferred reminder time (15 min, 30 min, 1 hour, etc.)
4. Get notified before contests start

## ⚙️ Configuration

### API Keys

**OpenAI:**
- Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Supports GPT-4o-mini (default) and GPT-4o (for image analysis)

**Google Gemini:**
- Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Uses Gemini 2.0 Flash model

### Platform Usernames

Enter your usernames in Settings to enable:
- Automatic streak tracking
- Daily problem count sync
- Activity-based reminders

## 🏗️ Architecture

### Core Components

- **Background Service Worker** (`background/service-worker.js`): Handles API calls, caching, alarms, and data sync
- **Content Scripts** (`content/*.js`): Platform-specific scripts that inject UI and extract problem data
- **Popup** (`popup/`): Extension popup with tabs for Contests, Streak, Favorites, and Settings
- **Styles** (`styles/hints-panel.css`): Modern dark theme with gradient accents

### Data Storage

- **chrome.storage.local**: Large data (contests, hints cache, streak data, daily stats)
- **chrome.storage.sync**: User settings (API keys, preferences, usernames)

### API Integration

**LeetCode:**
- GraphQL API for user activity and submissions
- `recentAcSubmissions` query for today's solved problems
- `userProfileCalendar` for streak data

**Codeforces:**
- REST API (`user.status`) for submissions
- `contest.list` for upcoming contests
- Rate-limited (2-second delay between calls)

**CodeChef:**
- Community API (`codechef-api.vercel.app`) for user stats
- Heatmap data for activity tracking

## 🛠️ Development

### Project Structure

```
LC-Helper/
├── background/
│   └── service-worker.js    # Background service worker
├── content/
│   ├── leetcode.js          # LeetCode content script
│   ├── codeforces.js        # Codeforces content script
│   └── codechef.js          # CodeChef content script
├── popup/
│   ├── popup.html           # Popup UI
│   ├── popup.js             # Popup logic
│   └── popup.css            # Popup styles
├── styles/
│   └── hints-panel.css      # Hints panel styles
├── assets/
│   └── icons/               # Extension icons
├── manifest.json            # Extension manifest
└── README.md               # This file
```

### Key Features Implementation

- **Hints Generation**: Uses OpenAI/Gemini APIs with optimized prompts for competitive programming
- **Caching**: Stores hints by problem URL to reduce API calls
- **Auto-Refresh**: Background alarms sync data every 15 minutes
- **Timer System**: Chrome alarms track 30-minute problem timers
- **Notifications**: Chrome notifications API for reminders

## 🧪 Testing

See `TEST-INSTRUCTIONS.md` for detailed testing guide, including:
- How to test timer notifications
- Testing API sync functionality
- Manual testing procedures

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues, feature requests, or questions, please open an issue on GitHub.

## 🙏 Acknowledgments

- LeetCode, Codeforces, and CodeChef for providing amazing platforms
- OpenAI and Google for AI APIs
- Community contributors

---

**Made with ❤️ for competitive programmers**
