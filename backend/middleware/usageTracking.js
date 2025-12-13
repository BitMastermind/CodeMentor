// Usage tracking middleware
import { UsageTracking } from '../models/UsageTracking.js';

export function trackUsage(endpoint) {
  return (req, res, next) => {
    // Track usage after response is sent
    const originalSend = res.send;
    res.send = function(data) {
      // Only track successful requests
      if (res.statusCode < 400 && req.user) {
        try {
          UsageTracking.record(req.user.userId, endpoint, {
            method: req.method,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          // Don't fail the request if tracking fails
          console.error('Usage tracking error:', error);
        }
      }
      return originalSend.call(this, data);
    };
    next();
  };
}

