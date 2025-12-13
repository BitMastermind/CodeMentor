// Subscription management routes
import express from 'express';
import Stripe from 'stripe';
import { authenticateToken } from '../middleware/auth.js';
import { Subscription } from '../models/Subscription.js';
import { standardRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Get current subscription status
router.get('/status', authenticateToken, async (req, res, next) => {
  try {
    const subscription = Subscription.findByUserId(req.user.userId);
    
    if (!subscription) {
      return res.json({
        hasSubscription: false,
        tier: 'free',
        status: 'inactive'
      });
    }

    const isActive = Subscription.isActive(subscription);
    const tier = Subscription.getTier(subscription);

    res.json({
      hasSubscription: true,
      tier,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === 1
    });
  } catch (error) {
    next(error);
  }
});

// Create checkout session
router.post('/create-checkout', authenticateToken, standardRateLimiter, async (req, res, next) => {
  try {
    const { tier = 'premium' } = req.body;

    if (!['premium', 'pro'].includes(tier)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Tier must be either "premium" or "pro"'
      });
    }

    const priceId = tier === 'pro' 
      ? process.env.STRIPE_PRICE_ID_PRO 
      : process.env.STRIPE_PRICE_ID_PREMIUM;

    if (!priceId) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Stripe price ID not configured'
      });
    }

    // Check for existing subscription
    const existingSubscription = Subscription.findByUserId(req.user.userId);
    if (existingSubscription && Subscription.isActive(existingSubscription)) {
      return res.status(400).json({
        error: 'Already Subscribed',
        message: 'You already have an active subscription'
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer_email: req.user.email,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/cancel`,
      metadata: {
        userId: req.user.userId.toString(),
        tier: tier
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    next(error);
  }
});

// Handle Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handleCheckoutCompleted(session) {
  const userId = parseInt(session.metadata.userId);
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  Subscription.create(userId, {
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    tier: session.metadata.tier,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end !== null
  });
}

async function handleSubscriptionUpdated(subscription) {
  const existing = Subscription.findByStripeSubscriptionId(subscription.id);
  if (!existing) return;

  Subscription.update(existing.id, {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end !== null
  });
}

async function handleSubscriptionDeleted(subscription) {
  const existing = Subscription.findByStripeSubscriptionId(subscription.id);
  if (!existing) return;

  Subscription.update(existing.id, {
    status: 'canceled'
  });
}

// Cancel subscription
router.post('/cancel', authenticateToken, standardRateLimiter, async (req, res, next) => {
  try {
    const subscription = Subscription.findByUserId(req.user.userId);
    
    if (!subscription || !subscription.stripe_subscription_id) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active subscription found'
      });
    }

    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true
    });

    Subscription.update(subscription.id, {
      cancel_at_period_end: true
    });

    res.json({
      message: 'Subscription will be canceled at the end of the current period'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

