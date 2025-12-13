// User routes
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { UsageTracking } from '../models/UsageTracking.js';
import { Subscription } from '../models/Subscription.js';

const router = express.Router();

// Get user usage statistics
router.get('/usage', authenticateToken, async (req, res, next) => {
  try {
    const { period = 'day' } = req.query;
    const userId = req.user.userId;
    const now = new Date();

    let usage;

    if (period === 'day') {
      usage = UsageTracking.getDailyUsage(userId, now);
    } else if (period === 'month') {
      usage = UsageTracking.getMonthlyUsage(userId, now.getFullYear(), now.getMonth() + 1);
    } else {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Period must be "day" or "month"'
      });
    }

    res.json({
      period,
      usage
    });
  } catch (error) {
    next(error);
  }
});

// Get user profile with subscription info
router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    const subscription = Subscription.findByUserId(req.user.userId);
    const tier = Subscription.getTier(subscription);
    const isActive = Subscription.isActive(subscription);

    // Get today's usage
    const todayUsage = UsageTracking.getDailyUsage(req.user.userId, new Date());
    const totalToday = todayUsage.reduce((sum, item) => sum + item.count, 0);

    res.json({
      userId: req.user.userId,
      email: req.user.email,
      subscription: {
        tier,
        isActive,
        status: subscription?.status || 'inactive',
        currentPeriodEnd: subscription?.current_period_end || null
      },
      usage: {
        today: totalToday
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

