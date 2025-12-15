// LC Helper Backend API Server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import routes
import authRoutes from './routes/auth.js';
import hintsRoutes from './routes/hints.js';
import subscriptionRoutes from './routes/subscription.js';
import userRoutes from './routes/user.js';
import favoritesRoutes from './routes/favorites.js';
import adminRoutes from './routes/admin.js';

// Import database
import { initDatabase } from './db/database.js';
import { addRazorpayFields } from './db/migrations/add_razorpay_fields.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(o => o);
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, require ALLOWED_ORIGINS to be configured
    if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
      console.error('❌ ERROR: ALLOWED_ORIGINS must be configured in production');
      return callback(new Error('CORS not configured for production'));
    }
    
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'LC Helper API',
    environment: process.env.NODE_ENV || 'development',
    database: 'connected',
    stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not configured',
    razorpay: process.env.RAZORPAY_KEY_ID ? 'configured' : 'not configured'
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/hints', hintsRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/favorites', favoritesRoutes);
app.use('/api/v1/admin', adminRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Validate environment variables
function validateEnvironment() {
  const required = ['JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  // Check for default JWT_SECRET (security risk)
  if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    console.error('❌ ERROR: JWT_SECRET must be changed from default value');
    process.exit(1);
  }
  
  // Warn about payment gateway configs
  if (!process.env.STRIPE_SECRET_KEY && !process.env.RAZORPAY_KEY_ID) {
    console.warn('⚠️  WARNING: No payment gateway configured (Stripe or Razorpay)');
  }
}

// Initialize database and start server
async function startServer() {
  try {
    // Validate environment before starting
    validateEnvironment();
    
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Run migrations
    try {
      addRazorpayFields();
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      // Migration errors are non-fatal (e.g., columns already exist)
      console.log('ℹ️  Migration note:', migrationError.message);
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 LC Helper API Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();

