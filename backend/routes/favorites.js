// Favorites routes
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { Favorite } from '../models/Favorite.js';
import { Subscription } from '../models/Subscription.js';

const router = express.Router();

// Get all favorites for user
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const favorites = Favorite.findByUserId(req.user.userId);
    const safeFavorites = (favorites || []).map(fav => Favorite.toSafeFavorite(fav));
    
    // Get subscription info for limit info
    const subscription = Subscription.findByUserId(req.user.userId);
    const tier = Subscription.getTier(subscription);
    const count = Favorite.countByUserId(req.user.userId);
    const limit = tier === 'free' ? 50 : null; // Unlimited for premium
    
    res.json({ 
      favorites: safeFavorites,
      limit,
      count,
      tier
    });
  } catch (error) {
    next(error);
  }
});

// Add favorite
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { url, title, platform, difficulty } = req.body;
    
    if (!url || !title || !platform) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'url, title, and platform are required'
      });
    }

    try {
      const favorite = Favorite.create(req.user.userId, {
        url,
        title,
        platform,
        difficulty
      });

      res.status(201).json({
        success: true,
        favorite: Favorite.toSafeFavorite(favorite)
      });
    } catch (error) {
      // Handle limit exceeded error
      if (error.message.includes('limited to')) {
        return res.status(403).json({
          error: 'Limit Exceeded',
          message: error.message
        });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Remove favorite
router.delete('/:problemId', authenticateToken, async (req, res, next) => {
  try {
    const { problemId } = req.params;
    Favorite.delete(req.user.userId, problemId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Check if URL is favorited
router.get('/check', authenticateToken, async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'url query parameter is required'
      });
    }

    const favorite = Favorite.findByUserAndUrl(req.user.userId, url);
    res.json({ isFavorite: !!favorite });
  } catch (error) {
    next(error);
  }
});

export default router;

