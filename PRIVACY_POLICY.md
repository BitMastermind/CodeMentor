# Privacy Policy for CodeMentor

**Last Updated:** December 2024

## Introduction

CodeMentor ("we", "our", or "the extension") is a Chrome extension that provides AI-powered hints, contest tracking, and streak management for coding platforms. This Privacy Policy explains how we handle your data.

## Data Collection and Storage

### Data Stored Locally

All data is stored **locally in your browser** using Chrome's storage APIs:

- **API Keys**: Your AI provider API keys are stored encrypted in `chrome.storage.sync` (encrypted by Chrome)
- **Usernames**: Platform usernames (LeetCode, Codeforces, CodeChef) are stored locally
- **Favorites**: Problems you mark as favorites are stored locally
- **Hints Cache**: Generated hints are cached locally to reduce API calls
- **Streak Data**: Your problem-solving streak statistics are stored locally
- **Contest Data**: Upcoming contest information is cached locally
- **Settings**: Your preferences (notifications, reminders, etc.) are stored locally

**We do not have access to any of this data.** It remains on your device.

### Data Transmitted

The extension only transmits data in the following scenarios:

1. **AI Provider APIs** (when you request hints):

   - Problem descriptions and your API key are sent directly to your chosen AI provider (OpenAI, Google Gemini, Claude, etc.)
   - **Your API key is transmitted securely via HTTPS headers** (never in URLs)
   - We do not intercept, store, or have access to your API key or the responses
   - This communication is direct between your browser and the AI provider

2. **Contest APIs** (for contest tracking):

   - Public contest data is fetched from:
     - Codeforces API (`api.codeforces.com`)
     - Kontests.net API (`kontests.net`)
     - CodeChef API (`codechef.com/api`)
   - Only public contest information is requested
   - No personal data is transmitted

3. **Platform APIs** (for streak tracking, if usernames are configured):

   - If you provide your usernames, the extension fetches your public activity data from:
     - LeetCode GraphQL API
     - Codeforces REST API
     - CodeChef Community API
   - Only publicly available data is accessed
   - This data is used locally for streak calculation

4. **Analytics** (optional, currently disabled):

   - If enabled, anonymous usage analytics may be sent to Google Analytics
   - Analytics can be disabled in Settings
   - No personal information is collected

5. **Error Tracking** (optional, currently disabled):
   - If enabled, error reports may be sent to Sentry
   - Error reports are sanitized to remove sensitive information (API keys, etc.)
   - Error tracking can be disabled

## Third-Party Services

### AI Providers

When you use AI-powered hints, your data is sent directly to your chosen AI provider:

- **OpenAI**: [Privacy Policy](https://openai.com/policies/privacy-policy)
- **Google Gemini**: [Privacy Policy](https://policies.google.com/privacy)
- **Anthropic Claude**: [Privacy Policy](https://www.anthropic.com/privacy)
- **Groq**: [Privacy Policy](https://groq.com/privacy)
- **Together AI**: [Privacy Policy](https://together.ai/privacy)
- **Hugging Face**: [Privacy Policy](https://huggingface.co/privacy)
- **OpenRouter**: [Privacy Policy](https://openrouter.ai/privacy)

We are not responsible for how these providers handle your data. Please review their privacy policies.

### Contest Data Providers

- **Kontests.net**: Public contest data aggregator
- **Codeforces**: Public contest API
- **CodeChef**: Public contest API

## Data Security

- API keys are stored encrypted using Chrome's built-in encryption (`chrome.storage.sync`)
- All API communications use HTTPS
- API keys are never logged or exposed in URLs
- No data is sent to our servers (we don't operate any servers)

## User Rights

You have full control over your data:

- **Delete Data**: Uninstall the extension to remove all stored data
- **Export Data**: Use Chrome's storage inspection tools to export your data
- **Disable Features**: Turn off analytics, error tracking, or any feature you don't want to use
- **Clear Cache**: Hints cache can be cleared by refreshing hints

## Children's Privacy

This extension is not intended for users under 13 years of age. We do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. The "Last Updated" date at the top indicates when changes were made. Continued use of the extension after changes constitutes acceptance.

## Contact

For privacy-related questions or concerns:

- Open an issue on [GitHub](https://github.com/BitMastermind/LC-Helper)
- Review our [Security Documentation](SECURITY.md)

## Compliance

This extension complies with:

- Chrome Web Store Privacy Requirements
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

---

**Key Points:**

- ✅ All data stored locally on your device
- ✅ No data sent to our servers (we don't have servers)
- ✅ API keys encrypted and transmitted securely
- ✅ Optional analytics can be disabled
- ✅ You control all your data
