# LC Helper - Competitive Programming Assistant 🚀

A powerful Chrome extension that enhances your competitive programming experience across **LeetCode**, **Codeforces**, and **CodeChef** with smart hints, unified streak tracking, and contest notifications.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Chrome-yellow.svg)

## ✨ Features

### 🔥 Unified Streak Tracking
- Track your coding activity across **all three platforms** in one place
- Any activity on LeetCode, Codeforces, or CodeChef counts toward your streak
- Automatic sync every 6 hours via platform APIs
- View current streak, longest streak, and total active days
- Beautiful UI with motivational messages

### 💡 Smart Hints System
- AI-powered progressive hints for problem solving
- Three-level hint system: Gentle Push → Stronger Nudge → Almost There
- Topic classification with complexity analysis
- Support for both OpenAI (GPT-4o-mini) and Google Gemini (2.0 Flash)
- Cached hints for faster loading

### 📅 Contest Tracker
- Unified contest calendar for all platforms
- Customizable reminder notifications (15min to 1 day before)
- Filter contests by platform
- Quick access to contest links
- Auto-refresh every hour

### 🎨 Beautiful Dark UI
- Modern gradient design with smooth animations
- Motivational status messages based on your progress
- Progress tracking toward milestones (Week Warrior, Month Master, etc.)
- Platform-specific color coding

## 🚀 Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Search for "LC Helper"
3. Click "Add to Chrome"

### Manual Installation (Developer Mode)
1. Clone this repository:
```bash
git clone https://github.com/BitMastermind/LC-Helper.git
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the `LC Helper` folder

5. The extension icon should appear in your toolbar!

## ⚙️ Setup & Configuration

### 1. Configure Platform Usernames

Open the extension popup → Settings tab → Enter your usernames:

- **LeetCode Username** (e.g., `tourist`)
- **Codeforces Handle** (e.g., `tourist`)
- **CodeChef Username** (e.g., `gennady.korotkevich`)

> 💡 You don't need all three! Only configure the platforms you use.

### 2. Add AI API Key (Optional - For Hints)

To enable smart hints, add your AI API key:

**Option A: Google Gemini (Recommended - Free Tier Available)**
1. Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Select "Gemini" as provider in settings
3. Paste your API key
4. Save settings

**Option B: OpenAI**
1. Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Select "OpenAI" as provider in settings
3. Paste your API key
4. Save settings

### 3. Enable Contest Notifications (Optional)

- Toggle "Contest Reminders" in settings
- Choose reminder time (15 min - 1 day before)
- Click the bell icon on specific contests to get notified

## 📖 How to Use

### Unified Streak Tracking

1. **Configure your usernames** in settings (one-time setup)
2. **Solve problems** on any platform (LeetCode, Codeforces, CodeChef)
3. **View your streak** in the extension popup
4. Streak automatically updates every 6 hours via platform APIs

**How it works:**
- Activity on ANY platform counts toward your unified streak
- Solve on LeetCode Monday → Codeforces Tuesday → CodeChef Wednesday = **3-day streak!**
- Streak only breaks if you have ZERO activity across all platforms for a day

### Smart Hints

1. Navigate to a LeetCode/Codeforces/CodeChef problem
2. Click the **💡 LC Helper** floating button
3. View AI-generated topic classification
4. Reveal hints progressively as needed
5. Give feedback to improve future hints

### Contest Tracking

1. Open extension popup → **Contests** tab
2. Browse upcoming contests from all platforms
3. Filter by platform (All/LeetCode/Codeforces/CodeChef)
4. Click 🔔 **Remind Me** to get notified before a contest
5. Click any contest card to open it directly

## 🏆 Streak Milestones

Achieve these milestones to unlock special celebrations:

- 🏅 **7 days** - Week Warrior
- 🏆 **30 days** - Month Master
- 💎 **50 days** - Elite Solver
- 👑 **100 days** - Century Club
- 🌟 **365 days** - Legend Status

## 🛠️ Technical Details

### Built With
- **Manifest V3** - Latest Chrome extension standard
- **Vanilla JavaScript** - No frameworks, lightweight and fast
- **Chrome APIs** - Storage, Alarms, Notifications
- **Platform APIs** - LeetCode GraphQL, Codeforces REST, CodeChef Unofficial API
- **AI Integration** - OpenAI & Google Gemini

### Architecture

```
┌─────────────────────────────────────────┐
│  Background Service Worker              │
│  • API fetching (LeetCode/CF/CC)        │
│  • Unified streak calculation           │
│  • Contest tracking & notifications     │
│  • 6-hour automatic sync                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Content Scripts (Problem Pages)        │
│  • Smart hints panel injection          │
│  • FAB (Floating Action Button)         │
│  • Problem data extraction              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Popup Interface                         │
│  • Streak dashboard                      │
│  • Contest calendar                      │
│  • Settings management                   │
└─────────────────────────────────────────┘
```

### Permissions Required

- `storage` - Save settings and cached data
- `alarms` - Periodic sync and contest reminders
- `notifications` - Contest and streak notifications
- `activeTab` - Inject hints panel on problem pages

### API Rate Limits

- **LeetCode**: No official limit
- **Codeforces**: 1 request per 2 seconds (automatically handled)
- **CodeChef**: Via unofficial API (best effort)

## 🔒 Privacy & Security

- ✅ **No data collection** - All processing happens locally
- ✅ **No external servers** - Only calls official platform APIs
- ✅ **No tracking** - Your usernames and API keys stay private
- ✅ **Open source** - Fully transparent code
- ✅ **Minimal permissions** - Only what's necessary

Your data never leaves your browser except for:
1. API calls to LeetCode/Codeforces/CodeChef (to fetch your public data)
2. API calls to OpenAI/Gemini (if you use hints feature)

## 📝 FAQ

### Q: Do I need API keys for all features?
**A:** No! Streak tracking and contest notifications work without any API keys. You only need an AI API key if you want to use the smart hints feature.

### Q: Why isn't my streak updating?
**A:** Make sure you've configured your usernames correctly in settings. The streak syncs every 6 hours automatically. You can also save settings again to trigger an immediate sync.

### Q: Can I use this on multiple computers?
**A:** Yes! Your settings sync via Chrome if you're signed in, but streak data is fetched fresh from platform APIs on each device.

### Q: Which AI provider should I choose?
**A:** Google Gemini is recommended as it has a generous free tier. OpenAI (GPT-4o-mini) is also good but requires payment.

### Q: Does this work on mobile?
**A:** Not currently. This is a Chrome desktop extension. Mobile support may come in the future.

## 🐛 Troubleshooting

### Streak shows 0 despite activity
1. Verify usernames are correct in settings
2. Ensure your profiles are public on all platforms
3. Click "Save Settings" to trigger immediate sync
4. Check browser console for API errors (F12 → Console)

### Hints not loading
1. Verify you've added a valid API key
2. Check internet connection
3. Try selecting a different AI provider
4. Clear cache and reload the problem page

### Contest notifications not working
1. Enable "Contest Reminders" in settings
2. Click the 🔔 icon on specific contests
3. Check Chrome notification permissions
4. Ensure the extension is not paused/disabled

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** - Open an issue with details
2. **Suggest features** - Share your ideas
3. **Submit PRs** - Fix bugs or add features
4. **Improve docs** - Help others understand the extension

### Development Setup

```bash
# Clone the repo
git clone https://github.com/BitMastermind/LC-Helper.git
cd LC-Helper

# Load unpacked extension in Chrome
# chrome://extensions/ → Developer mode → Load unpacked

# Make your changes
# Test thoroughly
# Submit a PR!
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **LeetCode**, **Codeforces**, **CodeChef** - For their amazing platforms
- **OpenAI** & **Google** - For AI API access
- **Kontests.net** - For contest aggregation API
- All competitive programmers who inspire us!

## 📬 Contact & Support

- **GitHub Issues**: [Report a bug or request a feature](https://github.com/BitMastermind/LC-Helper/issues)
- **Email**: your-email@example.com
- **Star this repo** if you find it helpful! ⭐

---

<div align="center">
Made with ❤️ for competitive programmers

**Happy Coding! 🚀**
</div>

