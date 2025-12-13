// Subscription model
import { getDatabase } from '../db/database.js';

export class Subscription {
  static create(userId, subscriptionData) {
    const db = getDatabase();
    const {
      stripe_customer_id,
      stripe_subscription_id,
      status = 'active',
      tier = 'premium',
      current_period_start,
      current_period_end,
      cancel_at_period_end = false
    } = subscriptionData;

    const result = db.prepare(`
      INSERT INTO subscriptions (
        user_id, stripe_customer_id, stripe_subscription_id, 
        status, tier, current_period_start, current_period_end, cancel_at_period_end
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      tier,
      current_period_start,
      current_period_end,
      cancel_at_period_end ? 1 : 0
    );

    return this.findById(result.lastInsertRowid);
  }

  static findByUserId(userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
  }

  static findByStripeSubscriptionId(stripeSubscriptionId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubscriptionId);
  }

  static update(id, updates) {
    const db = getDatabase();
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (key === 'cancel_at_period_end') {
        fields.push(`${key} = ?`);
        values.push(updates[key] ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`
      UPDATE subscriptions 
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return this.findById(id);
  }

  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  }

  static isActive(subscription) {
    if (!subscription) return false;
    if (subscription.status !== 'active') return false;
    if (subscription.cancel_at_period_end) return false;
    
    // Check if subscription is still within period
    if (subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      return periodEnd > new Date();
    }
    
    return true;
  }

  static getTier(subscription) {
    if (!this.isActive(subscription)) return 'free';
    return subscription.tier || 'free';
  }
}

