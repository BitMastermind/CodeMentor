# Error Tracking & Analytics Setup Guide

This guide explains how to configure error tracking (Sentry) and analytics (Google Analytics 4) for the LC Helper extension.

## Error Tracking (Sentry)

### Setup Steps

1. **Create a Sentry Account**
   - Go to [sentry.io](https://sentry.io) and sign up for a free account
   - Create a new project and select "JavaScript" as the platform
   - Copy your DSN (Data Source Name)

2. **Configure Sentry in the Extension**
   - Open `utils/errorTracking.js`
   - Replace the empty `SENTRY_DSN` constant with your Sentry DSN:
   ```javascript
   const SENTRY_DSN = 'https://your-sentry-dsn@sentry.io/project-id';
   ```

3. **Optional: Install Sentry SDK**
   - For more advanced features, you can include the Sentry browser SDK
   - Download `@sentry/browser` and include it in your extension
   - Update `utils/errorTracking.js` to use the full SDK

### Features

- Automatic error capture (unhandled errors, promise rejections)
- Error context (user agent, extension version, URL)
- Sensitive data filtering (API keys are automatically removed)
- Error buffering for offline scenarios
- Breadcrumb tracking for debugging

## Analytics (Google Analytics 4)

### Setup Steps

1. **Create a GA4 Property**
   - Go to [Google Analytics](https://analytics.google.com)
   - Create a new GA4 property
   - Get your Measurement ID (format: `G-XXXXXXXXXX`)

2. **Configure GA4 in the Extension**
   - Open `utils/analytics.js`
   - Replace the empty `GA4_MEASUREMENT_ID` constant with your Measurement ID:
   ```javascript
   const GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';
   ```

3. **Enable Analytics in Extension Settings**
   - Users can toggle analytics on/off in the Settings tab
   - Analytics are enabled by default (if GA4_MEASUREMENT_ID is configured)

### Tracked Events

The extension automatically tracks:
- `extension_installed` - When extension is installed/updated
- `session_start` - When extension popup is opened
- `popup_opened` - When popup is opened
- `feedback_submitted` - When user submits feedback
- `feedback_modal_opened` - When feedback modal is opened
- `analytics_toggled` - When user enables/disables analytics
- `page_view` - When content scripts load on problem pages
- `user_action` - Various user actions (hint requests, problem solved, etc.)
- `feature_used` - Feature usage tracking
- `error_occurred` - Error events
- `performance_metric` - Performance measurements

### Privacy

- Analytics are opt-in (users can disable in settings)
- No personally identifiable information is collected
- Client ID is generated locally and stored in browser storage
- All data is sent to Google Analytics servers

## User Feedback

### How It Works

1. Users can submit feedback from the Settings tab
2. Feedback is stored locally in `chrome.storage.local`
3. Feedback can optionally be sent to your backend API (commented out in code)
4. Feedback includes:
   - Type (bug, feature request, improvement, other)
   - Email (optional)
   - Message
   - Extension version
   - Timestamp
   - User agent

### Backend Integration (Optional)

To send feedback to your backend:

1. Uncomment the backend API call in `background/service-worker.js`:
   ```javascript
   // In submitFeedback function
   const { authToken } = await chrome.storage.sync.get('authToken');
   if (authToken) {
     await fetch(`${API_BASE_URL}/feedback`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${authToken}`
       },
       body: JSON.stringify(feedback)
     });
   }
   ```

2. Create a feedback endpoint in your backend
3. Store feedback in your database

## Testing

### Test Error Tracking

1. Open browser console
2. Trigger an error (e.g., try to load hints without API key)
3. Check Sentry dashboard for the error

### Test Analytics

1. Enable analytics in extension settings
2. Perform actions (open popup, submit feedback, etc.)
3. Check Google Analytics Real-Time reports

### Test Feedback

1. Open extension popup
2. Go to Settings tab
3. Click "Send Feedback"
4. Submit a test feedback
5. Check `chrome.storage.local` for stored feedback

## Disabling Features

### Disable Error Tracking

- Leave `SENTRY_DSN` empty in `utils/errorTracking.js`
- Errors will still be logged to console but not sent to Sentry

### Disable Analytics

- Leave `GA4_MEASUREMENT_ID` empty in `utils/analytics.js`
- Analytics will be completely disabled

## Best Practices

1. **Error Tracking**
   - Review Sentry dashboard regularly
   - Set up alerts for critical errors
   - Filter out noise (e.g., extension context invalidation errors)

2. **Analytics**
   - Respect user privacy preferences
   - Don't track sensitive information
   - Use event names consistently

3. **Feedback**
   - Respond to feedback promptly
   - Use feedback to prioritize features
   - Thank users for their input

## Troubleshooting

### Errors not appearing in Sentry
- Check that `SENTRY_DSN` is correctly set
- Verify network requests in browser DevTools
- Check Sentry project settings

### Analytics not working
- Verify `GA4_MEASUREMENT_ID` is set
- Check that analytics are enabled in user settings
- Look for network errors in browser DevTools
- Verify GA4 property is active

### Feedback not saving
- Check browser storage permissions
- Verify `chrome.storage.local` is accessible
- Check browser console for errors

