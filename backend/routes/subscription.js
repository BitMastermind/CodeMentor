// Subscription management routes with multi-gateway support (Stripe + Razorpay)
import express from 'express';
import Stripe from 'stripe';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth.js';
import { Subscription } from '../models/Subscription.js';
import { standardRateLimiter } from '../middleware/rateLimiter.js';
import { detectGateway, getCountryFromRequest } from '../utils/gatewayDetector.js';

const router = express.Router();

// Initialize payment gateways
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) 
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })
  : null;

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
      cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
      gateway: subscription.gateway || 'stripe'
    });
  } catch (error) {
    next(error);
  }
});

// Create checkout session (supports both Stripe and Razorpay)
router.post('/create-checkout', authenticateToken, standardRateLimiter, async (req, res, next) => {
  try {
    const { tier = 'premium', gateway: preferredGateway = 'auto' } = req.body;

    if (!['premium', 'pro'].includes(tier)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Tier must be either "premium" or "pro"'
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

    // Detect which gateway to use
    const countryCode = getCountryFromRequest(req);
    const gateway = detectGateway(countryCode, preferredGateway);

    if (gateway === 'razorpay' && !razorpay) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Razorpay is not configured'
      });
    }

    if (gateway === 'stripe' && !stripe) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Stripe is not configured'
      });
    }

    // Route to appropriate gateway
    if (gateway === 'razorpay') {
      return await createRazorpayCheckout(req, res, tier);
    } else {
      return await createStripeCheckout(req, res, tier);
    }
  } catch (error) {
    next(error);
  }
});

// Create Stripe checkout session
async function createStripeCheckout(req, res, tier) {
  const priceId = tier === 'pro' 
    ? process.env.STRIPE_PRICE_ID_PRO 
    : process.env.STRIPE_PRICE_ID_PREMIUM;

  if (!priceId) {
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'Stripe price ID not configured'
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
    gateway: 'stripe',
    sessionId: session.id,
    url: session.url
  });
}

// Create Razorpay checkout session
async function createRazorpayCheckout(req, res, tier) {
  const planId = tier === 'pro' 
    ? process.env.RAZORPAY_PLAN_ID_PRO 
    : process.env.RAZORPAY_PLAN_ID_PREMIUM;

  if (!planId) {
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'Razorpay plan ID not configured'
    });
  }

  try {
    // Create a Razorpay subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12, // 12 months subscription
      notes: {
        userId: req.user.userId.toString(),
        tier: tier,
        email: req.user.email
      }
    });

    res.json({
      gateway: 'razorpay',
      subscriptionId: subscription.id,
      shortUrl: subscription.short_url,
      url: `https://razorpay.com/payment-button/pl_${planId}/#subscription`,
      // For Razorpay, you'll need to redirect user to payment page
      // The frontend should handle opening this URL
    });
  } catch (error) {
    console.error('Razorpay subscription creation error:', error);
    return res.status(500).json({
      error: 'Payment Gateway Error',
      message: error.message || 'Failed to create Razorpay subscription'
    });
  }
}

// Handle Stripe webhook
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  
  if (!stripe) {
    console.error('Stripe not initialized');
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleStripeCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleStripeSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleStripeSubscriptionDeleted(event.data.object);
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

// Handle Razorpay webhook
router.post('/webhook/razorpay', express.json(), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('RAZORPAY_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  
  if (!razorpay) {
    console.error('Razorpay not initialized');
    return res.status(500).json({ error: 'Razorpay not configured' });
  }
  
  const receivedSignature = req.headers['x-razorpay-signature'];
  
  if (!receivedSignature) {
    return res.status(400).json({ error: 'Missing signature header' });
  }

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (receivedSignature !== expectedSignature) {
    console.error('Razorpay webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const event = req.body.event;
    const payload = req.body.payload;

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged':
        await handleRazorpaySubscriptionActivated(payload.subscription.entity);
        break;
      case 'subscription.updated':
        await handleRazorpaySubscriptionUpdated(payload.subscription.entity);
        break;
      case 'subscription.cancelled':
        await handleRazorpaySubscriptionCancelled(payload.subscription.entity);
        break;
      default:
        console.log(`Unhandled Razorpay event: ${event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Legacy webhook endpoint (for backward compatibility - Stripe only)
// Note: This endpoint is kept for backward compatibility but should use /webhook/stripe directly
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  // Stripe webhooks have stripe-signature header
  if (req.headers['stripe-signature']) {
    // Forward to Stripe webhook handler by re-routing
    req.url = '/webhook/stripe';
    return router.handle(req, res, next);
  }
  
  // If no stripe signature, it's not a valid webhook
  return res.status(400).json({ error: 'Invalid webhook - missing signature header' });
});

// Stripe webhook handlers
async function handleStripeCheckoutCompleted(session) {
  const userId = parseInt(session.metadata.userId);
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  Subscription.create(userId, {
    gateway: 'stripe',
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    tier: session.metadata.tier,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end !== null
  });
}

async function handleStripeSubscriptionUpdated(subscription) {
  const existing = Subscription.findByStripeSubscriptionId(subscription.id);
  if (!existing) return;

  Subscription.update(existing.id, {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end !== null
  });
}

async function handleStripeSubscriptionDeleted(subscription) {
  const existing = Subscription.findByStripeSubscriptionId(subscription.id);
  if (!existing) return;

  Subscription.update(existing.id, {
    status: 'canceled'
  });
}

// Razorpay webhook handlers
async function handleRazorpaySubscriptionActivated(razorpaySubscription) {
  const userId = parseInt(razorpaySubscription.notes?.userId);
  if (!userId) {
    console.error('No userId found in Razorpay subscription notes');
    return;
  }

  Subscription.create(userId, {
    gateway: 'razorpay',
    razorpay_customer_id: razorpaySubscription.customer_id,
    razorpay_subscription_id: razorpaySubscription.id,
    status: razorpaySubscription.status === 'active' ? 'active' : 'inactive',
    tier: razorpaySubscription.notes?.tier || 'premium',
    current_period_start: new Date(razorpaySubscription.current_start * 1000).toISOString(),
    current_period_end: new Date(razorpaySubscription.current_end * 1000).toISOString(),
    cancel_at_period_end: razorpaySubscription.end_at !== null
  });
}

async function handleRazorpaySubscriptionUpdated(razorpaySubscription) {
  const existing = Subscription.findByRazorpaySubscriptionId(razorpaySubscription.id);
  if (!existing) return;

  Subscription.update(existing.id, {
    status: razorpaySubscription.status === 'active' ? 'active' : 'inactive',
    current_period_start: new Date(razorpaySubscription.current_start * 1000).toISOString(),
    current_period_end: new Date(razorpaySubscription.current_end * 1000).toISOString(),
    cancel_at_period_end: razorpaySubscription.end_at !== null
  });
}

async function handleRazorpaySubscriptionCancelled(razorpaySubscription) {
  const existing = Subscription.findByRazorpaySubscriptionId(razorpaySubscription.id);
  if (!existing) return;

  Subscription.update(existing.id, {
    status: 'canceled'
  });
}

// Cancel subscription (works for both gateways)
router.post('/cancel', authenticateToken, standardRateLimiter, async (req, res, next) => {
  try {
    const subscription = Subscription.findByUserId(req.user.userId);
    
    if (!subscription) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active subscription found'
      });
    }

    const gateway = subscription.gateway || 'stripe';

    if (gateway === 'razorpay') {
      // Cancel Razorpay subscription
      if (!subscription.razorpay_subscription_id) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No Razorpay subscription ID found'
        });
      }

      try {
        await razorpay.subscriptions.cancel(subscription.razorpay_subscription_id);
        Subscription.update(subscription.id, {
          cancel_at_period_end: true
        });

        res.json({
          message: 'Subscription will be canceled at the end of the current period'
        });
      } catch (error) {
        console.error('Razorpay cancel error:', error);
        return res.status(500).json({
          error: 'Payment Gateway Error',
          message: 'Failed to cancel Razorpay subscription'
        });
      }
    } else {
      // Cancel Stripe subscription
      if (!subscription.stripe_subscription_id) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No Stripe subscription ID found'
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
    }
  } catch (error) {
    next(error);
  }
});

export default router;
