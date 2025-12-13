# LC Helper Backend API

Backend service for LC Helper Chrome Extension premium features.

## Features

- 🔐 JWT-based authentication
- 💳 Stripe subscription management
- ⚡ Rate limiting based on subscription tier
- 📊 Usage tracking and analytics
- 🤖 AI-powered hints generation (OpenAI/Gemini)
- 🛡️ Security best practices (Helmet, CORS)

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `JWT_SECRET` - Secret key for JWT tokens
- `OPENAI_API_KEY` or `GEMINI_API_KEY` - AI provider API key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `STRIPE_PRICE_ID_PREMIUM` - Stripe price ID for premium tier
- `STRIPE_PRICE_ID_PRO` - Stripe price ID for pro tier

### 3. Initialize Database

The database will be automatically created on first run. SQLite is used by default.

### 4. Start Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/refresh` - Refresh JWT token

### Hints

- `POST /api/v1/hints/generate` - Generate hints for a problem (requires subscription)
- `POST /api/v1/hints/explain` - Explain a problem (requires subscription)

### Subscription

- `GET /api/v1/subscription/status` - Get subscription status
- `POST /api/v1/subscription/create-checkout` - Create Stripe checkout session
- `POST /api/v1/subscription/cancel` - Cancel subscription
- `POST /api/v1/subscription/webhook` - Stripe webhook endpoint

### User

- `GET /api/v1/user/profile` - Get user profile with subscription info
- `GET /api/v1/user/usage` - Get usage statistics

## Stripe Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard
3. Create products and prices for Premium and Pro tiers
4. Set up webhook endpoint: `https://your-domain.com/api/v1/subscription/webhook`
5. Add webhook events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

## Rate Limiting

Rate limits are applied based on subscription tier:
- Free: 10 requests/minute
- Premium: 30 requests/minute
- Pro: 50 requests/minute

## Database Schema

- `users` - User accounts
- `subscriptions` - Subscription information
- `usage_tracking` - API usage tracking
- `user_api_keys` - User's own API keys (for BYOK)

## Security

- JWT tokens for authentication
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- CORS protection
- Helmet for security headers
- Input validation

## Deployment

### Recommended Platforms

- **Vercel** - Easy deployment with serverless functions
- **Railway** - Simple deployment with database
- **Render** - Free tier available
- **Heroku** - Traditional PaaS
- **AWS/GCP/Azure** - For enterprise scale

### Environment Variables for Production

Make sure to set all required environment variables in your hosting platform.

### Database

For production, consider using PostgreSQL instead of SQLite:
1. Install `pg` package: `npm install pg`
2. Update database connection in `db/database.js`
3. Update environment variables

## License

MIT

