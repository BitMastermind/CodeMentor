// Admin analytics routes
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getDatabase } from '../db/database.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple admin check - verify user email matches admin email from env
function requireAdmin(req, res, next) {
  const adminEmail = process.env.ADMIN_EMAIL;
  
  if (!adminEmail) {
    return res.status(500).json({
      error: 'Admin not configured',
      message: 'ADMIN_EMAIL environment variable not set'
    });
  }
  
  if (req.user.email.toLowerCase() !== adminEmail.toLowerCase()) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
  
  next();
}

// Get database file size
function getDatabaseSize() {
  try {
    const dbPath = process.env.DATABASE_PATH || join(__dirname, '../data/lchelper.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      return {
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        sizeGB: (stats.size / 1024 / 1024 / 1024).toFixed(4)
      };
    }
    return { sizeBytes: 0, sizeMB: '0', sizeGB: '0' };
  } catch (error) {
    return { sizeBytes: 0, sizeMB: '0', sizeGB: '0', error: error.message };
  }
}

// Get all analytics/metrics
router.get('/metrics', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDatabase();
    
    // User metrics
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const activeUsers = db.prepare(`
      SELECT COUNT(*) as count FROM users 
      WHERE last_login >= datetime('now', '-30 days')
    `).get().count;
    const newUsersThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM users 
      WHERE created_at >= datetime('now', 'start of month')
    `).get().count;
    
    // Subscription metrics
    const totalSubscriptions = db.prepare(`
      SELECT COUNT(*) as count FROM subscriptions 
      WHERE status = 'active' 
      AND cancel_at_period_end = 0
      AND (current_period_end IS NULL OR current_period_end > datetime('now'))
    `).get().count;
    
    const premiumSubscriptions = db.prepare(`
      SELECT COUNT(*) as count FROM subscriptions 
      WHERE tier = 'premium' 
      AND status = 'active'
      AND cancel_at_period_end = 0
      AND (current_period_end IS NULL OR current_period_end > datetime('now'))
    `).get().count;
    
    const proSubscriptions = db.prepare(`
      SELECT COUNT(*) as count FROM subscriptions 
      WHERE tier = 'pro' 
      AND status = 'active'
      AND cancel_at_period_end = 0
      AND (current_period_end IS NULL OR current_period_end > datetime('now'))
    `).get().count;
    
    const subscriptionsByTier = db.prepare(`
      SELECT 
        tier,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' 
          AND cancel_at_period_end = 0 
          AND (current_period_end IS NULL OR current_period_end > datetime('now')) 
          THEN 1 ELSE 0 END) as active
      FROM subscriptions
      GROUP BY tier
    `).all();
    
    const newSubscriptionsThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM subscriptions 
      WHERE created_at >= datetime('now', 'start of month')
      AND status = 'active'
    `).get().count;
    
    // Usage metrics
    const totalUsageToday = db.prepare(`
      SELECT COUNT(*) as count FROM usage_tracking 
      WHERE timestamp >= datetime('now', 'start of day')
    `).get().count;
    
    const totalUsageThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM usage_tracking 
      WHERE timestamp >= datetime('now', 'start of month')
    `).get().count;
    
    // Cache metrics
    const cacheEntries = db.prepare('SELECT COUNT(*) as count FROM hints_cache').get().count;
    const cacheSize = db.prepare(`
      SELECT SUM(LENGTH(hints_data)) as size FROM hints_cache
    `).get().size || 0;
    
    // Rate limit metrics
    const activeRateLimitWindows = db.prepare(`
      SELECT COUNT(*) as count FROM rate_limit_tracking 
      WHERE window_end > datetime('now')
    `).get().count;
    
    // Database size
    const dbSize = getDatabaseSize();
    
    // Calculate revenue (estimated)
    const estimatedMonthlyRevenue = (premiumSubscriptions * 4.99) + (proSubscriptions * 9.99);
    
    // Migration recommendation
    const shouldMigrate = totalUsers >= 200 || parseFloat(dbSize.sizeMB) >= 200 || totalSubscriptions >= 50;
    const migrationReasons = [];
    if (totalUsers >= 200) migrationReasons.push(`${totalUsers} users (threshold: 200)`);
    if (parseFloat(dbSize.sizeMB) >= 200) migrationReasons.push(`Database ${dbSize.sizeMB}MB (threshold: 200MB)`);
    if (totalSubscriptions >= 50) migrationReasons.push(`${totalSubscriptions} active subscriptions (threshold: 50)`);
    
    res.json({
      timestamp: new Date().toISOString(),
      users: {
        total: totalUsers,
        active: activeUsers,
        newThisMonth: newUsersThisMonth,
        activePercentage: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0
      },
      subscriptions: {
        totalActive: totalSubscriptions,
        premium: premiumSubscriptions,
        pro: proSubscriptions,
        newThisMonth: newSubscriptionsThisMonth,
        byTier: subscriptionsByTier,
        estimatedMonthlyRevenue: estimatedMonthlyRevenue.toFixed(2)
      },
      usage: {
        today: totalUsageToday,
        thisMonth: totalUsageThisMonth,
        averagePerDay: (totalUsageThisMonth / new Date().getDate()).toFixed(1)
      },
      cache: {
        entries: cacheEntries,
        sizeBytes: cacheSize,
        sizeMB: (cacheSize / 1024 / 1024).toFixed(2)
      },
      rateLimiting: {
        activeWindows: activeRateLimitWindows
      },
      database: {
        size: dbSize,
        type: 'SQLite',
        path: process.env.DATABASE_PATH || 'backend/data/lchelper.db'
      },
      migration: {
        recommended: shouldMigrate,
        reasons: migrationReasons,
        message: shouldMigrate 
          ? `⚠️ Consider migrating to PostgreSQL: ${migrationReasons.join(', ')}`
          : '✅ SQLite is sufficient for current scale'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get detailed subscription breakdown
router.get('/subscriptions', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDatabase();
    
    const subscriptions = db.prepare(`
      SELECT 
        s.id,
        s.user_id,
        u.email,
        s.tier,
        s.status,
        s.gateway,
        s.current_period_start,
        s.current_period_end,
        s.cancel_at_period_end,
        s.created_at
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 100
    `).all();
    
    res.json({
      count: subscriptions.length,
      subscriptions
    });
  } catch (error) {
    next(error);
  }
});

// Get user growth over time
router.get('/user-growth', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDatabase();
    const { days = 30 } = req.query;
    
    const growth = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all(days);
    
    res.json({
      period: `${days} days`,
      growth
    });
  } catch (error) {
    next(error);
  }
});

// Get subscription growth over time
router.get('/subscription-growth', authenticateToken, requireAdmin, (req, res, next) => {
  try {
    const db = getDatabase();
    const { days = 30 } = req.query;
    
    const growth = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        tier,
        COUNT(*) as count
      FROM subscriptions
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      AND status = 'active'
      GROUP BY DATE(created_at), tier
      ORDER BY date, tier
    `).all(days);
    
    res.json({
      period: `${days} days`,
      growth
    });
  } catch (error) {
    next(error);
  }
});

export default router;
