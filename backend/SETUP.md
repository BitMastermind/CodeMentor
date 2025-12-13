# Backend Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your actual values
   ```

3. **Start the server:**
   ```bash
   npm run dev  # Development mode
   # or
   npm start    # Production mode
   ```

## Required Environment Variables

### Minimum Required:
- `JWT_SECRET` - Any random string (use a strong secret in production)
- `OPENAI_API_KEY` OR `GEMINI_API_KEY` - At least one AI provider

### For Full Functionality:
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `STRIPE_PRICE_ID_PREMIUM` - Stripe price ID for premium tier
- `STRIPE_PRICE_ID_PRO` - Stripe price ID for pro tier

## Stripe Setup

1. Create account at https://stripe.com
2. Go to Developers > API keys
3. Copy your Secret key (starts with `sk_test_` for test mode)
4. Create products:
   - Premium: $9.99/month
   - Pro: $19.99/month
5. Copy the Price IDs (start with `price_`)
6. Set up webhook:
   - URL: `https://your-domain.com/api/v1/subscription/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy webhook signing secret (starts with `whsec_`)

## Testing the API

### Register a user:
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Login:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Generate hints (requires subscription):
```bash
curl -X POST http://localhost:3000/api/v1/hints/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "problem": {
      "title": "Two Sum",
      "description": "Find two numbers that add up to target",
      "difficulty": "Easy"
    },
    "platform": "leetcode"
  }'
```

## Database

The database is automatically created on first run. SQLite is used by default (stored in `data/lchelper.db`).

For production, consider using PostgreSQL:
1. Install `pg`: `npm install pg`
2. Update `db/database.js` to use PostgreSQL
3. Set `DATABASE_URL` environment variable

## Troubleshooting

### Port already in use:
Change `PORT` in `.env` file

### Database errors:
Delete `data/` folder and restart server to recreate database

### Stripe webhook not working:
- Make sure webhook URL is publicly accessible
- Use ngrok for local testing: `ngrok http 3000`
- Verify webhook secret matches in `.env`

