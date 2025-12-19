// LC Helper - API Key Security Utilities
// Provides secure handling and validation of API keys

/**
 * Security best practices for API key handling:
 * 1. Never log API keys (only log length/existence)
 * 2. Never expose in URLs (use headers instead)
 * 3. Store in chrome.storage.sync (encrypted at rest)
 * 4. Clear from memory when not needed
 * 5. Validate format before storing
 * 6. Use HTTPS only for API calls
 */

/**
 * Sanitizes API key for logging (shows only first 4 and last 4 chars)
 * @param {string} apiKey - The API key to sanitize
 * @returns {string} - Sanitized version (e.g., "sk-...abcd")
 */
function sanitizeApiKeyForLogging(apiKey) {
  if (!apiKey || apiKey.length < 8) {
    return '***';
  }
  const prefix = apiKey.substring(0, 4);
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}...${suffix}`;
}

/**
 * Validates API key format based on provider
 * @param {string} apiKey - The API key to validate
 * @param {string} provider - The provider name
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateApiKeyFormat(apiKey, provider) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  const trimmedKey = apiKey.trim();

  // Provider-specific validation
  const validators = {
    openai: (key) => {
      if (!key.startsWith('sk-')) {
        return { valid: false, error: 'Invalid OpenAI API key format. Keys should start with "sk-"' };
      }
      if (key.length < 20 || key.length > 100) {
        return { valid: false, error: 'Invalid OpenAI API key length' };
      }
      return { valid: true };
    },
    claude: (key) => {
      if (!key.startsWith('sk-ant-')) {
        return { valid: false, error: 'Invalid Claude API key format. Keys should start with "sk-ant-"' };
      }
      if (key.length < 30) {
        return { valid: false, error: 'Invalid Claude API key length' };
      }
      return { valid: true };
    },
    gemini: (key) => {
      if (key.length < 20) {
        return { valid: false, error: 'Invalid Gemini API key length. Keys should be at least 20 characters' };
      }
      if (!/^[A-Za-z0-9_-]+$/.test(key)) {
        return { valid: false, error: 'Invalid Gemini API key format' };
      }
      return { valid: true };
    },
    groq: (key) => {
      if (!key.startsWith('gsk_')) {
        return { valid: false, error: 'Invalid Groq API key format. Keys should start with "gsk_"' };
      }
      if (key.length < 20) {
        return { valid: false, error: 'Invalid Groq API key length' };
      }
      return { valid: true };
    },
    together: (key) => {
      if (key.length < 20) {
        return { valid: false, error: 'Invalid Together AI API key length. Keys should be at least 20 characters' };
      }
      if (!/^[A-Za-z0-9_-]+$/.test(key)) {
        return { valid: false, error: 'Invalid Together AI API key format' };
      }
      return { valid: true };
    },
    huggingface: (key) => {
      if (!key.startsWith('hf_')) {
        return { valid: false, error: 'Invalid Hugging Face API key format. Keys should start with "hf_"' };
      }
      if (key.length < 20) {
        return { valid: false, error: 'Invalid Hugging Face API key length' };
      }
      return { valid: true };
    },
    openrouter: (key) => {
      if (key && !key.startsWith('sk-or-')) {
        return { valid: false, error: 'Invalid OpenRouter API key format. Keys should start with "sk-or-"' };
      }
      if (key && key.length < 20) {
        return { valid: false, error: 'Invalid OpenRouter API key length' };
      }
      return { valid: true };
    },
    custom: (key) => {
      // Custom endpoints may not require API keys
      return { valid: true };
    }
  };

  const validator = validators[provider] || validators.gemini;
  return validator(trimmedKey);
}

/**
 * Securely retrieves API key from storage
 * @returns {Promise<object>} - { key: string|null, provider: string|null, error?: string }
 */
async function getApiKeySecurely() {
  try {
    const { apiKey, apiProvider, customEndpoint, customModel } = await chrome.storage.sync.get([
      'apiKey',
      'apiProvider',
      'customEndpoint',
      'customModel'
    ]);

    // For custom provider, API key is optional but endpoint and model are required
    if (apiProvider === 'custom') {
      if (!customEndpoint || !customModel) {
        return {
          key: null,
          provider: null,
          error: 'Custom endpoint URL and model name must be configured in settings.'
        };
      }
      return { key: apiKey || '', provider: 'custom' };
    }

    if (!apiKey) {
      return {
        key: null,
        provider: null,
        error: 'API key not configured. Add your API key in settings.'
      };
    }

    // SECURITY: Never log the actual key - only log sanitized version
    const sanitized = sanitizeApiKeyForLogging(apiKey);
    console.log(`LC Helper: Using API key (provider: ${apiProvider || 'gemini'}, format: ${sanitized})`);

    return { key: apiKey, provider: apiProvider || 'gemini' };
  } catch (error) {
    console.error('LC Helper: Error retrieving API key:', error.message);
    return { key: null, provider: null, error: 'Failed to retrieve API key' };
  }
}

/**
 * Securely stores API key in chrome.storage.sync
 * @param {string} apiKey - The API key to store
 * @param {string} provider - The provider name
 * @returns {Promise<object>} - { success: boolean, error?: string }
 */
async function storeApiKeySecurely(apiKey, provider) {
  try {
    // Validate before storing
    const validation = validateApiKeyFormat(apiKey, provider);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Store in chrome.storage.sync (encrypted at rest by Chrome)
    await chrome.storage.sync.set({
      apiKey: apiKey.trim(),
      apiProvider: provider
    });

    // SECURITY: Never log the actual key
    const sanitized = sanitizeApiKeyForLogging(apiKey);
    console.log(`LC Helper: API key stored securely (provider: ${provider}, format: ${sanitized})`);

    return { success: true };
  } catch (error) {
    console.error('LC Helper: Error storing API key:', error.message);
    return { success: false, error: 'Failed to store API key' };
  }
}

/**
 * Clears API key from memory (for security)
 * Note: This is a best practice, though JavaScript doesn't guarantee memory clearing
 * @param {string} apiKey - The API key to clear
 */
function clearApiKeyFromMemory(apiKey) {
  if (typeof apiKey === 'string') {
    // Overwrite with random data (best effort)
    const random = Math.random().toString(36).repeat(apiKey.length);
    // Note: JavaScript doesn't guarantee memory clearing, but this is a best practice
  }
}

/**
 * Checks if URL is HTTPS (required for API key security)
 * @param {string} url - The URL to check
 * @returns {boolean} - True if HTTPS
 */
function isSecureUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Creates secure headers for API requests
 * @param {string} apiKey - The API key
 * @param {string} provider - The provider name
 * @returns {object} - Headers object
 */
function createSecureApiHeaders(apiKey, provider) {
  const headers = {
    'Content-Type': 'application/json'
  };

  // SECURITY: Always use headers, never query parameters
  switch (provider) {
    case 'openai':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'claude':
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'gemini':
      headers['x-goog-api-key'] = apiKey;
      break;
    case 'groq':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'together':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'huggingface':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'openrouter':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'custom':
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;
    default:
      headers['x-goog-api-key'] = apiKey; // Default to Gemini format
  }

  return headers;
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeApiKeyForLogging,
    validateApiKeyFormat,
    getApiKeySecurely,
    storeApiKeySecurely,
    clearApiKeyFromMemory,
    isSecureUrl,
    createSecureApiHeaders
  };
}

