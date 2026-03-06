# Domain & Content Security Features

> **Last Updated:** March 5, 2026

This document tracks all security features that protect the site from domain theft, content scraping, hotlinking, and traffic hijacking. Use it to troubleshoot when external resources fail to load.

> **Deployment note:** The app runs on both **Vercel** (Telegram Mini App) and **Yandex Cloud** (web). All security features in this doc apply to both deployments since they are configured in `server.js` / Express middleware, which runs on both platforms.

---

## Table of Contents

1. [Security Headers](#security-headers)
2. [Hotlink Protection](#hotlink-protection)
3. [Canonical URLs](#canonical-urls)
4. [Content Security Policy (CSP)](#content-security-policy-csp)
5. [Anti-Scraping](#anti-scraping)
6. [Troubleshooting](#troubleshooting)

---

## Security Headers

**File:** `server.js` (Helmet configuration)

| Header | Value | Purpose | Added |
|--------|-------|---------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year | Pre-existing |
| `Content-Security-Policy` | (see CSP section) | Controls which resources can load | Pre-existing |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing attacks | 2026-03 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Prevents leaking full URLs to external sites | 2026-03 |
| `Permissions-Policy` | (see below) | Restricts browser API access | 2026-03 |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Allows OAuth popups | Pre-existing |
| `Cross-Origin-Resource-Policy` | `cross-origin` | Allows Supabase/CDN images | Pre-existing |

### Permissions-Policy Details

| Feature | Policy | Why |
|---------|--------|-----|
| `camera` | `self, *` | AR view needs camera access inside Telegram/VK/Max iframes |
| `microphone` | `()` (blocked) | Not used |
| `geolocation` | `self` | Delivery address widgets |
| `payment` | `self, *` | T-Bank payment iframes |
| `gyroscope` | `self` | AR view device orientation |
| `accelerometer` | `self` | AR view device motion |
| `magnetometer` | `()` (blocked) | Not used |
| `usb` | `()` (blocked) | Not used |
| `midi` | `()` (blocked) | Not used |
| `display-capture` | `()` (blocked) | Not used |

**If something breaks in a mini app iframe:** Check if the blocked feature is in Permissions-Policy. Add the needed domain to the feature's allowlist.

---

## Hotlink Protection

**File:** `server/middleware/hotlink-guard.js`
**Registered in:** `server.js` (before `express.static`)

Blocks external sites from embedding our images/videos/assets directly by checking the `Referer` header.

### Protected File Types

`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.avif`, `.ico`, `.mp4`, `.webm`

### Whitelisted Domains

| Domain | Reason |
|--------|--------|
| Own domain (from `APP_URL`) | Self |
| `web.telegram.org`, `t.me`, `telegram.org` | Telegram Mini App |
| `vk.com`, `m.vk.com`, `vk.ru` | VK Mini App |
| `max.ru`, `web.max.ru` | Max Mini App |
| `google.com`, `google.ru` | Search image previews |
| `yandex.ru`, `yandex.com` | Yandex search image previews |
| `bing.com` | Bing search image previews |
| `tbank.ru`, `tinkoff.ru` | Payment receipt pages |

### Requests Without Referrer

Allowed through (direct access from bookmarks, address bar, mobile apps).

### If an Image Fails to Load from a New Platform

1. Check browser DevTools — look for `403` responses on image requests
2. Check server logs for `[Hotlink Guard] Blocked: <domain> → <path>`
3. Add the domain to `ALLOWED_REFERRER_HOSTS` array in `server/middleware/hotlink-guard.js`

---

## Canonical URLs

**Tags in:** All `public/pages/*.html` files + `admin-login.html`
**Format:** `<link rel="canonical" href="..." id="canonical-url">`

Canonical tags tell search engines which URL is the "original" version of a page, preventing cloned sites from outranking us. Pages with pre-filled hrefs:

| Page | Canonical URL |
|------|---------------|
| `/info` | `https://buy-tribute.com/info` |
| `/faq` | `https://buy-tribute.com/faq` |
| `/customers` | `https://buy-tribute.com/customers` |
| `/picker` | `https://buy-tribute.com/picker` |

Other pages have empty `href=""` — these should be populated dynamically by JS based on the current route.

---

## Content Security Policy (CSP)

See `server.js` lines 19–160 for the full CSP configuration. Key points:

- All CSP entries are tagged with `// csp=YYYYMM` comments
- `frame-ancestors` allows VK iframe embedding
- `frameguard` is disabled so CSP `frame-ancestors` takes precedence

### If a Resource Fails to Load

1. Open browser DevTools → Console tab
2. Look for `Refused to load` or `blocked by Content Security Policy` errors
3. Identify which CSP directive is blocking (e.g., `script-src`, `img-src`, `connect-src`)
4. Add the domain to the appropriate directive in `server.js`
5. Tag with `// csp=YYYYMM` comment

---

## Anti-Scraping

See `docs/ANTI_SCRAPING.md` for the full anti-scraping documentation, including:

- Bot guard middleware (User-Agent blocking + headless detection)
- Rate limiting (3-tier + scraping limiter)
- `robots.txt` configuration

---

## Troubleshooting

### Image not loading in Telegram/VK/Max Mini App

**Cause:** Hotlink protection blocking the request.
**Fix:** Add the platform domain to `ALLOWED_REFERRER_HOSTS` in `server/middleware/hotlink-guard.js`.

### Feature not working in mini app iframe (camera, payment, etc.)

**Cause:** Permissions-Policy blocking the browser API.
**Fix:** Update the feature's allowlist in the `permissionsPolicy` config in `server.js`.

### External script/image/font blocked

**Cause:** CSP blocking the domain.
**Fix:** Add the domain to the appropriate CSP directive in `server.js`. Tag with `// csp=YYYYMM`.

### Cloned site outranking in search results

**Cause:** Missing or incorrect canonical URL.
**Fix:** Ensure the page has `<link rel="canonical">` pointing to `https://buy-tribute.com/<path>`. File DMCA takedown via Google Search Console.

### External site embedding our images

**Cause:** Domain not in hotlink blocklist (new referrer pattern).
**Fix:** Check `[Hotlink Guard]` logs and verify the referrer is not in the whitelist.
