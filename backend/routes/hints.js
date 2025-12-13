// Hints generation routes
import express from 'express';
import { authenticateToken, requireSubscription } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { trackUsage } from '../middleware/usageTracking.js';
import { generateHints } from '../services/hintsService.js';

const router = express.Router();
const rateLimiter = createRateLimiter();

// Generate hints for a problem
router.post('/generate', 
  authenticateToken, 
  requireSubscription,
  rateLimiter,
  trackUsage('/api/v1/hints/generate'),
  async (req, res, next) => {
    try {
      const { problem, platform } = req.body;

      if (!problem || !problem.title) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Problem data is required'
        });
      }

      const result = await generateHints(problem, platform || 'leetcode');

      res.json({
        success: true,
        ...result
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
      const { problem, platform } = req.body;

      if (!problem || !problem.title) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Problem data is required'
        });
      }

      const result = await generateHints(problem, platform || 'leetcode', true);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

