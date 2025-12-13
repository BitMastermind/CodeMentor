// User model
import { getDatabase } from '../db/database.js';
import bcrypt from 'bcryptjs';

export class User {
  static async create(email, password) {
    const db = getDatabase();
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = db.prepare(`
      INSERT INTO users (email, password_hash)
      VALUES (?, ?)
    `).run(email.toLowerCase(), passwordHash);
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  static findByEmail(email) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  }

  static async verifyPassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
  }

  static updateLastLogin(userId) {
    const db = getDatabase();
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  }

  static toSafeUser(user) {
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }
}

