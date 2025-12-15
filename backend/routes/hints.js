// Hints generation routes with aggressive caching
import express from 'express';
import { authenticateToken, requireSubscription } from '../middleware/auth.js';
import { createPersistentRateLimiter } from '../middleware/persistentRateLimiter.js';
import { trackUsage } from '../middleware/usageTracking.js';
import { generateHints } from '../services/hintsService.js';
import { getDatabase } from '../db/database.js';
import crypto from 'crypto';

const router = express.Router();
// Use persistent database-backed rate limiter to prevent bypass on server restart
const rateLimiter = createPersistentRateLimiter('/api/v1/hints');

// Generate cache key from problem data
function generateCacheKey(problem) {
  const url = problem.url || '';
  const title = problem.title || '';
  const key = `${url}_${title}`.toLowerCase();
  return crypto.createHash('md5').update(key).digest('hex').slice(0, 32);
}

// Get cached hints
function getCachedHints(cacheKey) {
  const db = getDatabase();
  const cached = db.prepare(`
    SELECT * FROM hints_cache 
    WHERE cache_key = ? 
    AND created_at > datetime('now', '-30 days')
  `).get(cacheKey);
  
  if (cached) {
    try {
      return {
        ...JSON.parse(cached.hints_data),
        cached: true,
        cachedAt: cached.created_at
      };
    } catch (error) {
      console.error('Error parsing cached hints:', error);
      return null;
    }
  }
  
  return null;
}

// Store hints in cache
function cacheHints(cacheKey, hintsData) {
  const db = getDatabase();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO hints_cache (cache_key, hints_data, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(cacheKey, JSON.stringify(hintsData));
  } catch (error) {
    console.error('Error caching hints:', error);
    // Non-fatal - continue even if caching fails
  }
}

// Generate hints for a problem
router.post('/generate', 
  authenticateToken, 
  requireSubscription,
  rateLimiter,
  trackUsage('/api/v1/hints/generate'),
  async (req, res, next) => {
    try {
      const { problem, platform, forceRefresh } = req.body;

      if (!problem || !problem.title) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Problem data is required'
        });
      }

      // Validate request size to prevent DoS attacks
      const requestSize = JSON.stringify(req.body).length;
      const MAX_REQUEST_SIZE = 500000; // 500KB limit
      if (requestSize > MAX_REQUEST_SIZE) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request body too large. Maximum size is ${MAX_REQUEST_SIZE / 1000}KB.`
        });
      }

      // Sanitize problem description length (prevent excessive API costs)
      if (problem.description && problem.description.length > 50000) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Problem description too long. Maximum length is 50,000 characters.'
        });
      }

      // Generate cache key
      const cacheKey = generateCacheKey(problem);
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedHints(cacheKey);
        if (cached) {
          console.log('LC Helper: Returning cached hints for:', problem.title);
          return res.json({
            success: true,
            ...cached
          });
        }
      }

      // Generate new hints (not in cache or force refresh)
      const result = await generateHints(problem, platform || 'leetcode');
      
      // Cache the result
      if (result && !result.error) {
        cacheHints(cacheKey, result);
      }

      res.json({
        success: true,
        ...result,
        cached: false
      });
    } catch (error) {
      next(error);
    }
  }
);

// Explain problem
router.post('/explain',
  authenticateToken,
  requireSubscription,
  rateLimiter,
  trackUsage('/api/v1/hints/explain'),
  async (req, res, next) => {
    try {
      const { problem, platform, forceRefresh } = req.body;

      if (!problem || !problem.title) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Problem data is required'
        });
      }

      // Validate request size to prevent DoS attacks
      const requestSize = JSON.stringify(req.body).length;
      const MAX_REQUEST_SIZE = 500000; // 500KB limit
      if (requestSize > MAX_REQUEST_SIZE) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request body too large. Maximum size is ${MAX_REQUEST_SIZE / 1000}KB.`
        });
      }

      // Sanitize problem description length (prevent excessive API costs)
      if (problem.description && problem.description.length > 50000) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Problem description too long. Maximum length is 50,000 characters.'
        });
      }

      // Generate cache key (separate for explanations)
      const cacheKey = generateCacheKey(problem) + '_explain';
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedHints(cacheKey);
        if (cached) {
          console.log('LC Helper: Returning cached explanation for:', problem.title);
          return res.json({
            success: true,
            ...cached
          });
        }
      }

      // Generate new explanation (not in cache or force refresh)
      const result = await generateHints(problem, platform || 'leetcode', true);
      
      // Cache the result
      if (result && !result.error) {
        cacheHints(cacheKey, result);
      }

      res.json({
        success: true,
        ...result,
        cached: false
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

