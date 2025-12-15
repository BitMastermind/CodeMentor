// Gateway detection utility
// Determines which payment gateway to use based on user location or preferences

/**
 * Detect payment gateway based on user's country or preferences
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (e.g., 'IN', 'US')
 * @param {string} preferredGateway - User's preferred gateway ('stripe' | 'razorpay' | 'auto')
 * @returns {'stripe' | 'razorpay'}
 */
export function detectGateway(countryCode, preferredGateway = 'auto') {
  // If user has a preferred gateway, use it
  if (preferredGateway === 'stripe' || preferredGateway === 'razorpay') {
    return preferredGateway;
  }

  // Auto-detect based on country
  // Use Razorpay for India, Stripe for all other countries
  if (countryCode && countryCode.toUpperCase() === 'IN') {
    return 'razorpay';
  }

  // Default to Stripe for international users
  return 'stripe';
}

/**
 * Extract country code from request headers or IP
 * @param {Object} req - Express request object
 * @returns {string|null} Country code or null
 */
export function getCountryFromRequest(req) {
  // Try to get country from headers (if using a service like Cloudflare)
  const countryCode = req.headers['cf-ipcountry'] || req.headers['x-country-code'];
  
  if (countryCode) {
    return countryCode.toUpperCase();
  }

  // You can integrate with GeoIP service here if needed
  // For now, return null to use default (Stripe)
  return null;
}
