// Favorite model
import { getDatabase } from '../db/database.js';
import { Subscription } from './Subscription.js';

// Free tier limit for favorites
const FREE_TIER_FAVORITES_LIMIT = 50;

export class Favorite {
  static generateProblemId(url) {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/\?.*$/, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .slice(0, 100);
  }

  static countByUserId(userId) {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM favorites 
      WHERE user_id = ?
    `).get(userId);
    return result.count;
  }

  static create(userId, problemData) {
    const db = getDatabase();
    
    // Check user subscription tier for limits
    const subscription = Subscription.findByUserId(userId);
    const tier = Subscription.getTier(subscription);
    
    // Check current favorite count for free users
    if (tier === 'free') {
      const currentCount = this.countByUserId(userId);
      if (currentCount >= FREE_TIER_FAVORITES_LIMIT) {
        throw new Error(`Free tier limited to ${FREE_TIER_FAVORITES_LIMIT} favorites. Upgrade to premium for unlimited favorites!`);
      }
    }
    
    const problemId = `${problemData.platform}_${this.generateProblemId(problemData.url)}`;
    
    // Check if already exists
    const existing = this.findByUserAndProblemId(userId, problemId);
    if (existing) {
      return existing;
    }
    
    const result = db.prepare(`
      INSERT INTO favorites (user_id, problem_id, url, title, platform, difficulty)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      problemId,
      problemData.url,
      problemData.title,
      problemData.platform,
      problemData.difficulty || 'Unknown'
    );
    
    return this.findById(result.lastInsertRowid);
  }

  static findByUserId(userId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM favorites 
      WHERE user_id = ? 
      ORDER BY added_at DESC
    `).all(userId);
  }

  static findByUserAndProblemId(userId, problemId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM favorites 
      WHERE user_id = ? AND problem_id = ?
    `).get(userId, problemId);
  }

  static findByUserAndUrl(userId, url) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM favorites 
      WHERE user_id = ? AND url = ?
    `).get(userId, url);
  }

  static delete(userId, problemId) {
    const db = getDatabase();
    return db.prepare(`
      DELETE FROM favorites 
      WHERE user_id = ? AND problem_id = ?
    `).run(userId, problemId);
  }

  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM favorites WHERE id = ?').get(id);
  }

  static toSafeFavorite(favorite) {
    if (!favorite) return null;
    return {
      id: favorite.problem_id,
      url: favorite.url,
      title: favorite.title,
      platform: favorite.platform,
      difficulty: favorite.difficulty,
      addedAt: new Date(favorite.added_at).getTime()
    };
  }
}

