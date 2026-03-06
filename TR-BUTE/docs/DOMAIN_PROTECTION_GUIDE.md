# Domain & Brand Protection — External Steps

> **Last Updated:** March 5, 2026

This guide covers steps **outside the codebase** to protect buy-tribute.com from domain squatting, content theft, and traffic hijacking. These are manual actions that require access to external services.

---

## 1. Register Similar Domains

**Priority: High**
**One-time action**

Register variations of your domain to prevent typosquatting and phishing:

| Domain | Why | Status |
|--------|-----|--------|
| `buy-tribute.ru` | Primary TLD variant | ☐ Register |
| `buytribute.com` | Without hyphen | ☐ Register |
| `buytribute.ru` | Without hyphen, .ru | ☐ Register |
| `buy-tribute.net` | Common TLD | ☐ Register |
| `buy-tribute.store` | E-commerce TLD | ☐ Register |
| `buy-tribut.com` | Common typo | ☐ Register |
| `buy-tribute.shop` | E-commerce TLD | ☐ Register |

**How to:** Register through your current domain registrar. Set up 301 redirects to `https://buy-tribute.com` for all of them.

**Cost:** ~$10-15/year per domain. Prioritize `.ru` and the no-hyphen variant first.

---

## 2. Google Search Console

**Priority: High**
**Setup once, check monthly**

### Initial Setup

1. Go to [Google Search Console](https://search.google.com/search-console/)
2. Add `https://buy-tribute.com` as a property
3. Verify ownership (DNS TXT record or HTML file upload)
4. Submit `https://buy-tribute.com/sitemap.xml`

### Ongoing Monitoring

- **Coverage report** — check for crawl errors monthly
- **Links report** — watch for suspicious backlinks from clone sites
- **Security issues** — Google flags if your site is compromised

### If You Find a Clone

1. Go to [Google DMCA Dashboard](https://support.google.com/legal/troubleshooter/1114905)
2. File a removal request for each infringing URL
3. Include evidence: your domain registration date, original content timestamps

---

## 3. Yandex Webmaster

**Priority: High** (if targeting Russian audience)
**Setup once, check monthly**

### Initial Setup

1. Go to [Yandex Webmaster](https://webmaster.yandex.ru/)
2. Add `https://buy-tribute.com`
3. Verify ownership (DNS TXT record or meta tag)
4. Submit sitemap

### Mark as Original

1. In Yandex Webmaster → Site Settings → "Original texts"
2. Add your key product descriptions and page content
3. This helps Yandex identify YOUR site as the original when clones appear

### If You Find a Clone in Yandex

1. Use Yandex Webmaster → "Complaint about search results"
2. Report the clone URL with evidence of your original content

---

## 4. Google Alerts for Brand Monitoring

**Priority: Medium**
**Setup once, runs automatically**

1. Go to [Google Alerts](https://www.google.com/alerts)
2. Create alerts for:
   - `"buy-tribute"` — your exact brand name
   - `"TR/BUTE"` — brand variations
   - `"buy-tribute.com"` — your domain mentioned elsewhere
   - Unique product descriptions (pick 2-3 sentences that are uniquely yours)
3. Set delivery to: email, as-it-happens or once-a-day
4. Review alerts for unauthorized copies of your content

---

## 5. CDN / WAF (Cloudflare or Yandex Cloud CDN)

**Priority: Medium-High**
**Ongoing cost: Free tier available (Cloudflare) / included (Yandex Cloud)**

A CDN/WAF adds a security layer in front of your server that is far more effective than application-level protection alone. Choose based on your deployment:

### What It Provides

| Feature | Free Tier | Pro ($20/mo) |
|---------|-----------|--------------|
| DDoS protection | Yes | Yes |
| Bot detection (managed rules) | Basic | Advanced |
| SSL/TLS management | Yes | Yes |
| Hotlink protection (edge-level) | Yes | Yes |
| Web Application Firewall (WAF) | 5 rules | Full ruleset |
| Rate limiting | Basic | Advanced |
| Page caching | Yes | Yes |

### Setup Steps

1. Sign up at [cloudflare.com](https://www.cloudflare.com/)
2. Add `buy-tribute.com`
3. Update your domain's nameservers to Cloudflare's (registrar settings)
4. Enable "Under Attack Mode" if you're actively being scraped
5. Enable "Hotlink Protection" in Scrape Shield settings
6. Set SSL mode to "Full (Strict)"

### Alternative: Yandex Cloud CDN + Smart Web Security

If the Yandex Cloud deployment is your primary:

1. Enable **Yandex Cloud CDN** in the Yandex Cloud Console for static asset caching
2. Enable **Yandex Smart Web Security** (WAF) — provides DDoS protection, bot detection, and rate limiting
3. Configure CDN origin to point to your Yandex Cloud Compute or Serverless Container
4. Set up SSL certificates via Yandex Certificate Manager

### If Using a CDN/WAF

You can simplify the application-level hotlink guard since the CDN handles it at the edge. But keep it as a defense-in-depth layer.

---

## 6. WHOIS Privacy

**Priority: Low** (probably already enabled)

Check that your domain registration has WHOIS privacy enabled so your personal details aren't publicly visible:

```
whois buy-tribute.com
```

If personal info is visible, enable privacy protection through your registrar.

---

## 7. SSL Certificate Monitoring

**Priority: Low**

If someone creates a clone site, they may obtain an SSL certificate for a similar domain. Monitor this using Certificate Transparency logs:

1. Go to [crt.sh](https://crt.sh/?q=buy-tribute)
2. Search for `%buy-tribute%`
3. Check periodically for certificates issued to domains you don't own

---

## Checklist Summary

| Step | Priority | Frequency | Status |
|------|----------|-----------|--------|
| Register similar domains | High | One-time | ☐ |
| Google Search Console setup | High | Setup + monthly check | ☐ |
| Yandex Webmaster setup | High | Setup + monthly check | ☐ |
| Google Alerts for brand | Medium | Setup once (automatic) | ☐ |
| CDN/WAF (Cloudflare or Yandex Cloud) | Medium-High | Setup + configure | ☐ |
| WHOIS privacy check | Low | One-time check | ☐ |
| SSL certificate monitoring | Low | Quarterly check | ☐ |

---

## What to Do If Your Site Is Cloned

1. **Document everything** — screenshot the clone, save URLs, note the date
2. **WHOIS lookup** on the clone domain — find the registrar
3. **File DMCA takedown** with Google Search Console and Yandex Webmaster
4. **Contact the clone's hosting provider** — most have abuse@ email addresses
5. **Contact the clone's domain registrar** — file a UDRP complaint if the domain is confusingly similar to yours
6. **Report to search engines** — request de-indexing of the clone
7. **Consider legal action** if the clone persists and causes financial harm
