# CodeMentor - API Key Security

## Overview

CodeMentor takes API key security seriously. This document outlines the security measures implemented to protect your API keys.

## Security Measures Implemented

### 1. **Encrypted Storage**

- API keys are stored in `chrome.storage.sync`, which is **encrypted at rest** by Chrome
- Data is synced across your devices using Google's secure sync infrastructure
- Keys are never stored in plain text

### 2. **No URL Exposure**

- **Fixed**: All API keys are now transmitted via HTTP headers, never in URL query parameters
- Previously, Gemini API keys were exposed in URLs (fixed in latest version)
- URLs can be logged in browser history, server logs, and referrer headers - headers are more secure

### 3. **Content Security Policy (CSP)**

- Added strict CSP to `manifest.json` to prevent XSS attacks
- Only allows connections to trusted API endpoints
- Prevents malicious scripts from accessing stored API keys

### 4. **Secure Logging**

- API keys are **never logged** in full
- Only sanitized versions are logged (e.g., `sk-...abcd`)
- Logs show provider and format, not the actual key

### 5. **Input Validation**

- API keys are validated before storage
- Format validation based on provider (OpenAI, Gemini, Claude, etc.)
- Prevents storing invalid or malicious input

### 6. **HTTPS Only**

- All API calls use HTTPS exclusively
- No API keys are transmitted over insecure connections
- Browser enforces HTTPS for all external API requests

### 7. **Memory Security**

- Best practices for clearing sensitive data from memory
- API keys are only kept in memory during active use
- No persistent storage of keys in JavaScript variables

## How Your API Key is Protected

### Storage Flow

```
User Input → Validation → chrome.storage.sync (encrypted) → Memory (temporary) → HTTPS Headers → API Provider
```

### Security Layers

1. **Browser-level encryption** (chrome.storage.sync)
2. **Transport encryption** (HTTPS)
3. **Header-based transmission** (not URLs)
4. **Input validation** (format checking)
5. **CSP protection** (XSS prevention)

## What We Don't Do

❌ **Never** log full API keys  
❌ **Never** send API keys to third-party servers (only to your chosen AI provider)  
❌ **Never** expose keys in URLs  
❌ **Never** store keys in localStorage  
❌ **Never** transmit over HTTP  
❌ **Never** include keys in error messages

## Best Practices for Users

### ✅ Do:

- Keep your API key private
- Use API keys with appropriate rate limits
- Monitor your API usage regularly
- Rotate keys if you suspect compromise
- Use separate keys for different projects

### ❌ Don't:

- Share your API key with anyone
- Commit API keys to version control
- Use the same key across multiple projects
- Leave keys in screenshots or documentation
- Use keys with excessive permissions

## API Key Format by Provider

| Provider     | Format                   | Example            |
| ------------ | ------------------------ | ------------------ |
| OpenAI       | `sk-...`                 | `sk-proj-...`      |
| Gemini       | Alphanumeric (20+ chars) | `AIza...`          |
| Claude       | `sk-ant-...`             | `sk-ant-api03-...` |
| Groq         | `gsk_...`                | `gsk_...`          |
| Together     | Alphanumeric (20+ chars) | `...`              |
| Hugging Face | `hf_...`                 | `hf_...`           |
| OpenRouter   | `sk-or-...`              | `sk-or-v1-...`     |

## Technical Details

### Storage Location

- **Location**: `chrome.storage.sync`
- **Encryption**: AES-256 (Chrome's built-in encryption)
- **Sync**: Encrypted sync across user's Chrome instances
- **Quota**: 100KB per extension (sufficient for API keys)

### Transmission Method

- **Method**: HTTP Headers (Authorization, x-goog-api-key, etc.)
- **Protocol**: HTTPS only
- **Headers used**:
  - OpenAI: `Authorization: Bearer <key>`
  - Gemini: `x-goog-api-key: <key>`
  - Claude: `x-api-key: <key>`
  - Others: Provider-specific headers

### Validation

- Format validation before storage
- Length checks
- Prefix validation (where applicable)
- Character set validation

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **Do not** create a public GitHub issue
2. Email security concerns privately
3. Include steps to reproduce
4. Allow time for fix before disclosure

## Compliance

This extension follows:

- Chrome Extension Security Best Practices
- OWASP API Security Guidelines
- Google Chrome Storage Security Standards

## Updates

Security improvements are continuously implemented. Recent updates:

- ✅ Moved Gemini API keys from URLs to headers
- ✅ Added Content Security Policy
- ✅ Enhanced logging sanitization
- ✅ Created secure API key utilities

---

**Last Updated**: 2024  
**Version**: 1.0.0
