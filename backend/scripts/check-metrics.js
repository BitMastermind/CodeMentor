#!/usr/bin/env node
// Script to check metrics and display analytics
import { getDatabase } from '../db/database.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = getDatabase();

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

// Get all metrics
const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const activeUsers = db.prepare(`
  SELECT COUNT(*) as count FROM users 
  WHERE last_login >= datetime('now', '-30 days')
`).get().count;
const newUsersThisMonth = db.prepare(`
  SELECT COUNT(*) as count FROM users 
  WHERE created_at >= datetime('now', 'start of month')
`).get().count;

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

const newSubscriptionsThisMonth = db.prepare(`
  SELECT COUNT(*) as count FROM subscriptions 
  WHERE created_at >= datetime('now', 'start of month')
  AND status = 'active'
`).get().count;

const totalUsageThisMonth = db.prepare(`
  SELECT COUNT(*) as count FROM usage_tracking 
  WHERE timestamp >= datetime('now', 'start of month')
`).get().count;

const cacheEntries = db.prepare('SELECT COUNT(*) as count FROM hints_cache').get().count;

const activeRateLimitWindows = db.prepare(`
  SELECT COUNT(*) as count FROM rate_limit_tracking 
  WHERE window_end > datetime('now')
`).get().count;

const dbSize = getDatabaseSize();
const estimatedMonthlyRevenue = (premiumSubscriptions * 4.99) + (proSubscriptions * 9.99);

// Check if migration needed
const shouldMigrate = totalUsers >= 200 || parseFloat(dbSize.sizeMB) >= 200 || totalSubscriptions >= 50;
const migrationReasons = [];
if (totalUsers >= 200) migrationReasons.push(`${totalUsers} users (threshold: 200)`);
if (parseFloat(dbSize.sizeMB) >= 200) migrationReasons.push(`Database ${dbSize.sizeMB}MB (threshold: 200MB)`);
if (totalSubscriptions >= 50) migrationReasons.push(`${totalSubscriptions} active subscriptions (threshold: 50)`);

// Display metrics
console.log('\n📊 LC Helper Analytics Dashboard');
console.log('═'.repeat(50));
console.log(`\n👥 USERS`);
console.log(`   Total Users: ${totalUsers}`);
console.log(`   Active Users (30 days): ${activeUsers} (${totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0}%)`);
console.log(`   New Users This Month: ${newUsersThisMonth}`);

console.log(`\n💳 SUBSCRIPTIONS`);
console.log(`   Total Active: ${totalSubscriptions}`);
console.log(`   Premium: ${premiumSubscriptions}`);
console.log(`   Pro: ${proSubscriptions}`);
console.log(`   New This Month: ${newSubscriptionsThisMonth}`);
console.log(`   Estimated Monthly Revenue: $${estimatedMonthlyRevenue.toFixed(2)}`);

console.log(`\n📈 USAGE`);
console.log(`   API Calls This Month: ${totalUsageThisMonth}`);
console.log(`   Average Per Day: ${(totalUsageThisMonth / new Date().getDate()).toFixed(1)}`);

console.log(`\n💾 CACHE`);
console.log(`   Cache Entries: ${cacheEntries}`);

console.log(`\n🔒 RATE LIMITING`);
console.log(`   Active Windows: ${activeRateLimitWindows}`);

console.log(`\n🗄️  DATABASE`);
console.log(`   Type: SQLite`);
console.log(`   Size: ${dbSize.sizeMB} MB (${dbSize.sizeGB} GB)`);
console.log(`   Path: ${process.env.DATABASE_PATH || 'backend/data/lchelper.db'}`);

console.log(`\n🚀 MIGRATION STATUS`);
if (shouldMigrate) {
  console.log(`   ⚠️  MIGRATION RECOMMENDED!`);
  console.log(`   Reasons: ${migrationReasons.join(', ')}`);
  console.log(`   Action: Consider migrating to PostgreSQL for better performance`);
} else {
  console.log(`   ✅ SQLite is sufficient for current scale`);
  console.log(`   Thresholds: 200+ users, 200MB+ database, or 50+ subscriptions`);
}

console.log('\n' + '═'.repeat(50));
console.log(`Generated: ${new Date().toISOString()}\n`);
