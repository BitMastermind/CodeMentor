// Authentication middleware
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'No authentication token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Invalid token'
    });
  }
}

export async function requireSubscription(req, res, next) {
  try {
    const { Subscription } = await import('../models/Subscription.js');
    const subscription = Subscription.findByUserId(req.user.userId);
    
    if (!Subscription.isActive(subscription)) {
      return res.status(402).json({
        error: 'Payment Required',
        message: 'Active subscription required. Please subscribe to use this service.',
        requiresPayment: true
      });
    }
    
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify subscription'
    });
  }
}

