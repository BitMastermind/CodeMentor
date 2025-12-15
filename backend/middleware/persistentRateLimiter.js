// Persistent database-backed rate limiter
// Prevents rate limit bypass on server restart
import { getDatabase } from '../db/database.js';
import { Subscription } from '../models/Subscription.js';

// Configuration
const baseWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 86400000; // 24 hours
const maxFree = parseInt(process.env.RATE_LIMIT_MAX_FREE) || 10;
const maxPremium = parseInt(process.env.RATE_LIMIT_MAX_PREMIUM) || 25;
const maxPro = parseInt(process.env.RATE_LIMIT_MAX_PRO) || 60;

// Cleanup old rate limit records (runs periodically)
function cleanupOldRecords() {
  const db = getDatabase();
  try {
    // Delete records older than the window
    db.prepare(`
      DELETE FROM rate_limit_tracking 
      WHERE window_end < datetime('now', '-1 day')
    `).run();
  } catch (error) {
    console.error('Error cleaning up rate limit records:', error);
  }
}

// Run cleanup every hour
setInterval(cleanupOldRecords, 3600000);

/**
 * Get current request count for an identifier
 * Sums all active windows to handle edge cases with rounded window_start
 */
function getCurrentRequestCount(identifier, endpoint = 'default') {
  const db = getDatabase();

  try {
    // Sum all active windows (in case there are multiple due to rounding)
    // This ensures accurate count even if requests span multiple hours
    const result = db.prepare(`
      SELECT SUM(request_count) as total FROM rate_limit_tracking
      WHERE identifier = ? 
      AND endpoint = ?
      AND window_end > datetime('now')
    `).get(identifier, endpoint);

    return result && result.total ? parseInt(result.total, 10) : 0;
  } catch (error) {
    console.error('Error getting request count:', error);
    return 0;
  }
}

/**
 * Atomically increment request count for an identifier
 * Uses transaction to prevent race conditions
 * Returns the new count after increment
 */
function incrementRequestCount(identifier, endpoint = 'default', maxRequests) {
  const db = getDatabase();
  const windowSeconds = Math.floor(baseWindowMs / 1000);

  try {
    // Use transaction for atomicity - prevents race conditions
    const transaction = db.transaction(() => {
      // Try to find existing active record
      const existing = db.prepare(`
        SELECT * FROM rate_limit_tracking
        WHERE identifier = ? 
        AND endpoint = ?
        AND window_end > datetime('now')
        ORDER BY window_start DESC
        LIMIT 1
      `).get(identifier, endpoint);

      if (existing) {
        // Atomically increment existing record
        // Use UPDATE with RETURNING would be ideal but SQLite doesn't support it in older versions
        // So we update and then select
        db.prepare(`
          UPDATE rate_limit_tracking
          SET request_count = request_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id);
        
        // Get the updated count
        const updated = db.prepare(`
          SELECT request_count FROM rate_limit_tracking WHERE id = ?
        `).get(existing.id);
        
        return updated ? updated.request_count : existing.request_count + 1;
      } else {
        // Create new record
        // Round window_start to nearest hour to prevent too many unique records
        // This groups requests within the same hour
        const roundedWindowStart = db.prepare(`
          SELECT datetime(datetime('now'), 'start of hour') as rounded
        `).get().rounded;
        
        try {
          db.prepare(`
            INSERT INTO rate_limit_tracking 
            (identifier, endpoint, request_count, window_start, window_end)
            VALUES (?, ?, 1, ?, datetime('now', '+' || ? || ' seconds'))
          `).run(identifier, endpoint, roundedWindowStart, windowSeconds);
          return 1;
        } catch (insertError) {
          // If unique constraint violation, another concurrent request created it
          // This can happen with rounded window_start - try to update instead
          if (insertError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            const existingAfterRace = db.prepare(`
              SELECT * FROM rate_limit_tracking
              WHERE identifier = ? 
              AND endpoint = ?
              AND window_start = ?
              LIMIT 1
            `).get(identifier, endpoint, roundedWindowStart);
            
            if (existingAfterRace && existingAfterRace.window_end > new Date().toISOString()) {
              db.prepare(`
                UPDATE rate_limit_tracking
                SET request_count = request_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(existingAfterRace.id);
              
              const updated = db.prepare(`
                SELECT request_count FROM rate_limit_tracking WHERE id = ?
              `).get(existingAfterRace.id);
              
              return updated ? updated.request_count : existingAfterRace.request_count + 1;
            }
          }
          throw insertError;
        }
      }
    });

    return transaction();
  } catch (error) {
    console.error('Error incrementing request count:', error);
    throw error; // Re-throw to handle in middleware (fail closed)
  }
}

/**
 * Get rate limit info (for headers)
 */
function getRateLimitInfo(identifier, endpoint = 'default', maxRequests) {
  const current = getCurrentRequestCount(identifier, endpoint);
  const remaining = Math.max(0, maxRequests - current);
  const resetTime = new Date(Date.now() + baseWindowMs);
  
  return {
    limit: maxRequests,
    remaining,
    reset: Math.floor(resetTime.getTime() / 1000)
  };
}

/**
 * Persistent rate limiter middleware
 */
export function createPersistentRateLimiter(endpoint = 'default') {
  return async (req, res, next) => {
    try {
      let maxRequests = maxFree;
      let identifier = req.ip; // Default: IP address
      let tierKey = 'free';

      // Use user ID if authenticated
      if (req.user && req.user.userId) {
        identifier = `user:${req.user.userId}`;
        
        // Get subscription tier
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

      // ATOMIC CHECK-AND-INCREMENT PATTERN
      // Increment first, then check - prevents race conditions
      // This ensures atomicity: no two requests can see the same count
      let newCount;
      try {
        newCount = incrementRequestCount(identifier, endpoint, maxRequests);
      } catch (incrementError) {
        console.error('Rate limit increment error:', incrementError);
        // FAIL CLOSED: If increment fails, deny request for security
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Rate limit check failed. Please try again later.',
          retryAfter: 60 // Suggest retry in 1 minute
        });
      }

      // Check if limit exceeded AFTER atomic increment
      if (newCount > maxRequests) {
        // We already incremented, attempt to rollback (best effort)
        try {
          const db = getDatabase();
          // Find the record to update (SQLite doesn't support ORDER BY in UPDATE)
          const recordToUpdate = db.prepare(`
            SELECT id FROM rate_limit_tracking
            WHERE identifier = ? 
            AND endpoint = ?
            AND window_end > datetime('now')
            ORDER BY window_start DESC
            LIMIT 1
          `).get(identifier, endpoint);
          
          if (recordToUpdate) {
            db.prepare(`
              UPDATE rate_limit_tracking
              SET request_count = request_count - 1
              WHERE id = ?
            `).run(recordToUpdate.id);
          }
        } catch (rollbackError) {
          // Non-fatal - the increment happened but request is denied
          console.error('Rate limit rollback error (non-fatal):', rollbackError);
        }

        const rateLimitInfo = getRateLimitInfo(identifier, endpoint, maxRequests);
        
        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': rateLimitInfo.limit,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': rateLimitInfo.reset,
          'Retry-After': Math.ceil(baseWindowMs / 1000)
        });

        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. You can make ${maxRequests} requests per day. Please try again tomorrow or upgrade your plan.`,
          retryAfter: Math.ceil(baseWindowMs / 1000),
          limitType: 'daily',
          requestsRemaining: 0,
          resetAt: new Date(rateLimitInfo.reset * 1000).toISOString()
        });
      }

      // Set rate limit headers with accurate count
      const rateLimitInfo = getRateLimitInfo(identifier, endpoint, maxRequests);
      res.set({
        'X-RateLimit-Limit': rateLimitInfo.limit,
        'X-RateLimit-Remaining': Math.max(0, rateLimitInfo.limit - newCount),
        'X-RateLimit-Reset': rateLimitInfo.reset
      });

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // FAIL CLOSED: On any unexpected error, deny request for security
      // This prevents bypass if something goes wrong
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Rate limit check failed. Please try again later.',
        retryAfter: 60
      });
    }
  };
}

// Note: Registration rate limiting is now handled by simple express-rate-limit
// in auth.js. We don't need strict database-backed limits because:
// 1. API requires paid subscription (free accounts can't abuse API)
// 2. Multiple paying accounts = more revenue (good for business!)
// 3. Simple rate limiting (10 per 15 min) prevents spam/DoS only
