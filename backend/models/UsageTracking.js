// Usage tracking model
import { getDatabase } from '../db/database.js';

export class UsageTracking {
  static record(userId, endpoint, metadata = {}) {
    const db = getDatabase();
    const metadataJson = JSON.stringify(metadata);
    
    db.prepare(`
      INSERT INTO usage_tracking (user_id, endpoint, metadata)
      VALUES (?, ?, ?)
    `).run(userId, endpoint, metadataJson);
  }

  static getUsageCount(userId, startDate, endDate) {
    const db = getDatabase();
    return db.prepare(`
      SELECT COUNT(*) as count
      FROM usage_tracking
      WHERE user_id = ? 
      AND timestamp >= ? 
      AND timestamp <= ?
    `).get(userId, startDate, endDate);
  }

  static getDailyUsage(userId, date) {
    const db = getDatabase();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return db.prepare(`
      SELECT endpoint, COUNT(*) as count
      FROM usage_tracking
      WHERE user_id = ? 
      AND timestamp >= ? 
      AND timestamp <= ?
      GROUP BY endpoint
    `).all(userId, startOfDay.toISOString(), endOfDay.toISOString());
  }

  static getMonthlyUsage(userId, year, month) {
    const db = getDatabase();
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return db.prepare(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as count
      FROM usage_tracking
      WHERE user_id = ? 
      AND timestamp >= ? 
      AND timestamp <= ?
      GROUP BY DATE(timestamp)
      ORDER BY date
    `).all(userId, startDate.toISOString(), endDate.toISOString());
  }
}

