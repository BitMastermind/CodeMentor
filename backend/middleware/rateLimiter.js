// Rate limiting middleware
import rateLimit from 'express-rate-limit';
import { Subscription } from '../models/Subscription.js';

// Base rate limit configuration
const baseWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute
const maxFree = parseInt(process.env.RATE_LIMIT_MAX_FREE) || 10;
const maxPremium = parseInt(process.env.RATE_LIMIT_MAX_PREMIUM) || 30;
const maxPro = parseInt(process.env.RATE_LIMIT_MAX_PRO) || 50;

// Dynamic rate limiter based on user subscription tier
export function createRateLimiter() {
  // Create a store to cache rate limiters per tier
  const limiters = new Map();

  return async (req, res, next) => {
    let maxRequests = maxFree;
    let tierKey = 'free';
    
    if (req.user) {
      const subscription = Subscription.findByUserId(req.user.userId);
      const tier = Subscription.getTier(subscription);
      tierKey = tier;
      
      switch (tier) {
        case 'premium':
          maxRequests = maxPremium;
          break;
        case 'pro':
          maxRequests = maxPro;
          break;
        default:
          maxRequests = maxFree;
      }
    }

    // Get or create limiter for this tier
    if (!limiters.has(tierKey)) {
      limiters.set(tierKey, rateLimit({
        windowMs: baseWindowMs,
        max: maxRequests,
        message: {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. You can make ${maxRequests} requests per minute. Please try again later.`,
          retryAfter: Math.ceil(baseWindowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          // Use user ID if authenticated, otherwise IP address
          return req.user ? `user:${req.user.userId}` : req.ip;
        }
      }));
    }

    const limiter = limiters.get(tierKey);
    return limiter(req, res, next);
  };
}

// Standard rate limiter for public endpoints
export const standardRateLimiter = rateLimit({
  windowMs: baseWindowMs,
  max: maxFree,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil(baseWindowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

