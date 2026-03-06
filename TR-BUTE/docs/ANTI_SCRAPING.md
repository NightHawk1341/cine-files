# Anti-Scraping Protection

> **Last Updated:** February 9, 2026

This document describes the measures in place to prevent automated scraping of the TR-BUTE platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Defense Layers](#defense-layers)
3. [Bot Guard Middleware](#bot-guard-middleware)
4. [Rate Limiting](#rate-limiting)
5. [robots.txt](#robotstxt)
6. [Configuration](#configuration)
7. [Monitoring](#monitoring)
8. [Adding New Rules](#adding-new-rules)

---

## Overview

TR-BUTE is a Telegram Web App storefront — not a public SEO-driven website. There is no reason for external crawlers or scraping tools to access the API. The anti-scraping system uses a layered approach:

| Layer | What it blocks | File |
|-------|---------------|------|
| `robots.txt` | Compliant crawlers | `public/robots.txt` |
| Bot Guard (UA filter) | Known scraping libraries, SEO bots, AI crawlers | `server/middleware/bot-guard.js` |
| Bot Guard (headless detection) | Headless browsers (Puppeteer, Playwright, PhantomJS) | `server/middleware/bot-guard.js` |
| Scraping rate limiter | Automated enumeration of products/images | `server/middleware/bot-guard.js` |
| General rate limiter | Brute force on any API route (100 req/15min) | `server.js` |
| Auth rate limiter | Credential stuffing (20 req/15min) | `server.js` |
| Telegram validation | Unauthorized access to authenticated endpoints | `server/middleware/telegram-validation.js` |

---

## Bot Guard Middleware

**File:** `server/middleware/bot-guard.js`

The `botGuard` middleware runs on all `/api` requests (after the general rate limiter) and performs two checks:

### 1. User-Agent Blocklist

Blocks requests whose `User-Agent` matches known scraping tools:

- **Scraping frameworks:** Scrapy, python-requests, python-urllib, curl, wget, axios, node-fetch, Go HTTP client, Java HTTP client, PHP, libwww-perl, Mechanize, PycURL, HTTPie, rest-client
- **SEO/marketing crawlers:** AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot, PetalBot, MegaIndex, Bytespider, ZoomInfoBot, SeznamBot
- **AI training crawlers:** GPTBot, CCBot, anthropic-ai, ClaudeBot, cohere-ai, Google-Extended
- **Generic patterns:** `spider`, `crawler`, `scraper`, `bot` (word boundary)
- **Headless tools:** PhantomJS, HeadlessChrome, Selenium, Puppeteer, Playwright
- **Empty User-Agent:** Requests with no `User-Agent` header are also blocked

### 2. Allowlist (Exemptions)

The following bots are explicitly allowed even though they match generic patterns:

| Bot | Reason |
|-----|--------|
| TelegramBot | Telegram link previews |
| Googlebot | Google search indexing |
| Bingbot | Bing search indexing |
| YandexBot | Yandex search indexing |
| T-Bank | Payment webhook callbacks |
| CDEK | Shipping webhook callbacks |

### 3. Headless Browser Detection

Checks for header anomalies that indicate automated browser tools:

- `HeadlessChrome` in User-Agent string
- `PhantomJS` in User-Agent string
- Missing both `Accept-Language` and `Accept` headers while claiming to be Mozilla-based (real browsers always send these)
- Requests with `x-telegram-init-data` header skip this check (legitimate Telegram Mini App traffic)

### Skipped Endpoints

The bot guard does **not** run on:

- `/api/webhooks/*` — server-to-server webhook calls
- `/api/payment/webhook` — payment provider callbacks
- `/api/payment/tbank/webhook` — T-Bank payment callbacks
- `/api/cron/*` — scheduled task endpoints

---

## Rate Limiting

### Scraping-Specific Limiter

**30 requests per minute per IP**, applied to the public data endpoints most commonly targeted by scrapers:

| Endpoint | Description |
|----------|-------------|
| `/api/products` | Product catalog API |
| `/api/catalogs` | Catalog listings API |
| `/api/all-images` | Product image index |
| `/products` | Public product list page |

This is separate from and **in addition to** the general rate limiter (100 req/15min) and auth limiter (20 req/15min).

### Full Rate Limiting Stack

A single IP hits these limits in order:

1. **General limiter:** 100 requests per 15 minutes across all `/api` routes
2. **Scraping limiter:** 30 requests per minute on product/catalog/image endpoints
3. **Auth limiter:** 20 requests per 15 minutes on login endpoints
4. **Sensitive limiter:** 10 requests per hour on account deletion

---

## robots.txt

**File:** `public/robots.txt`

Disallows all crawlers from accessing:

- `/api/` — all API endpoints
- `/admin/` — admin panel
- `/admin-miniapp/` — Telegram Mini App admin
- `/pages/` — SPA page templates
- `/js/` — JavaScript source
- `/css/` — stylesheets

Additionally blocks the following crawlers from the entire site:

AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot, PetalBot, MegaIndex.ru, Bytespider, GPTBot, CCBot, anthropic-ai, ClaudeBot, cohere-ai

> **Note:** `robots.txt` is advisory — only well-behaved crawlers respect it. The bot guard middleware enforces the actual blocking.

---

## Configuration

### Middleware Registration (server.js)

The middleware is registered in `server.js` in this order:

```
Helmet → CORS → Site Lock → Static Files → General Rate Limiter → Bot Guard → Scraping Limiter → Auth Limiter → Routes
```

```javascript
// Block known scrapers, bots, and headless browsers from API
app.use('/api', botGuard);

// Stricter rate limit for public data endpoints targeted by scrapers
app.use('/api/products', scrapingLimiter);
app.use('/api/catalogs', scrapingLimiter);
app.use('/api/all-images', scrapingLimiter);
app.use('/products', scrapingLimiter);
```

### Environment

No environment variables are required. The bot guard works out of the box with sensible defaults.

---

## Monitoring

Blocked requests are logged to console with the `[Bot Guard]` prefix:

```
[Bot Guard] Blocked bot: python-requests/2.28.0 | IP: 1.2.3.4 | Path: /products
[Bot Guard] Blocked headless browser: Mozilla/5.0 HeadlessChrome/120.0 | IP: 5.6.7.8
```

To monitor scraping attempts in production, search logs for `[Bot Guard]`.

Rate-limited requests return standard `429 Too Many Requests` with `RateLimit-*` headers.

---

## Adding New Rules

### Block a New Bot

Add a regex pattern to `BLOCKED_UA_PATTERNS` in `server/middleware/bot-guard.js`:

```javascript
const BLOCKED_UA_PATTERNS = [
  // ... existing patterns
  /newbotname/i,
];
```

### Allow a Legitimate Service

Add a regex pattern to `ALLOWED_UA_PATTERNS` (checked before the blocklist):

```javascript
const ALLOWED_UA_PATTERNS = [
  // ... existing patterns
  /newservice/i,  // Reason for allowing
];
```

### Protect a New Public Endpoint

Add a `scrapingLimiter` entry in `server.js`:

```javascript
app.use('/api/new-public-endpoint', scrapingLimiter);
```
