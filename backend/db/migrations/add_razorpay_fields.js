// Migration: Add Razorpay fields to subscriptions table
import { getDatabase } from '../database.js';

export function addRazorpayFields() {
  const db = getDatabase();
  
  try {
    // Add gateway column to track which payment gateway is used
    db.exec(`
      ALTER TABLE subscriptions 
      ADD COLUMN gateway TEXT DEFAULT 'stripe' CHECK(gateway IN ('stripe', 'razorpay'))
    `);
  } catch (error) {
    // Column might already exist
    if (!error.message.includes('duplicate column')) {
      throw error;
    }
  }

  try {
    // Add Razorpay-specific fields
    db.exec(`
      ALTER TABLE subscriptions 
      ADD COLUMN razorpay_customer_id TEXT UNIQUE
    `);
  } catch (error) {
    if (!error.message.includes('duplicate column')) {
      throw error;
    }
  }

  try {
    db.exec(`
      ALTER TABLE subscriptions 
      ADD COLUMN razorpay_subscription_id TEXT UNIQUE
    `);
  } catch (error) {
    if (!error.message.includes('duplicate column')) {
      throw error;
    }
  }

  try {
    db.exec(`
      ALTER TABLE subscriptions 
      ADD COLUMN razorpay_order_id TEXT
    `);
  } catch (error) {
    if (!error.message.includes('duplicate column')) {
      throw error;
    }
  }

  console.log('✅ Razorpay fields added to subscriptions table');
}
