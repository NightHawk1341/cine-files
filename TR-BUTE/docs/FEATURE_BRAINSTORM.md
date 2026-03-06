# TR/BUTE Feature Brainstorm

Generated from a full codebase review on 2026-03-05.

## 1. Customer Experience

- **Product Recommendations / "You May Also Like"** — Surface recommendations on home and product pages based on viewed products, favorites, and purchase history.
- **Product Comparison** — Let users select 2-3 products and compare side-by-side (format options, pricing, quality tiers).
- **Wishlist Sharing** — Shareable link for favorites so users can send their wishlist to friends.
- **Back-in-Stock Alerts Expansion** — Extend `product_release_notifications` to notify when a specific format/variation is restocked.
- **Order Tracking Page Improvements** — Visual map/timeline showing package location using stored `tracking_history` data.
- **Saved Addresses** — Store multiple addresses per user for faster repeat checkouts.
- **Recently Viewed Products Section** — Surface `viewed-products.js` data as a visible section on home/product pages.
- **Social Proof / Live Activity Feed** — "X just purchased Y" or "Z people are viewing this" notifications.
- **Product Q&A** — Structured Q&A section separate from reviews/comments.

## 2. Marketing & Growth

- **Referral Program** — Referral codes with discounts for both referrer and new customer.
- **Loyalty Points / Rewards** — Points per purchase redeemable as discounts, complementing promo codes and certificates.
- **Abandoned Cart Recovery** — Multi-channel reminders (Telegram, email, VK) when a cart has items but no order after X hours.
- **Flash Sales / Time-Limited Offers** — Countdown timers on products with temporary price reductions.
- **Bundle Deals** — "Buy 2, get 10% off" or curated bundles. Natural extension of existing `product_link_groups`.
- **Email Newsletter / Digest** — Periodic digest of new products, restocks, and promotions via Nodemailer.
- **SEO / Open Graph Improvements** — Dynamic OG meta tags per product page for better social sharing and search visibility.

## 3. Product & Content

- **Product Videos** — Support video media on product pages alongside the image carousel.
- **User-Generated Content Gallery** — Customer photos of products in their space, beyond review images.
- **Blog / Articles Section** — Artist stories, behind-the-scenes, styling tips for organic traffic.
- **Size Guide / Room Visualizer** — Enhance AR view with room mockup tool (upload wall photo, overlay poster).
- **Collections / Seasonal Themes** — Curated seasonal/thematic collections with custom landing pages.
- **Product Availability by Region** — Show estimated delivery dates on product pages based on user location.

## 4. Admin & Operations

- **Inventory Management** — Stock/quantity tracking with low-stock alerts to prevent overselling.
- **Customer Segmentation & CRM** — Group customers by purchase frequency, spend, or preferences for targeted promotions.
- **Automated Order Workflow Rules** — Configurable rules (auto-confirm, auto-assign shipping provider).
- **Admin Audit Log** — Track all admin actions beyond `order_edit_history`.
- **Bulk Product Import/Export** — CSV/spreadsheet import/export for catalog management.
- **Returns Management** — Formal returns workflow (request, return label, restocking).
- **Financial Reports / Export** — Revenue reports, tax summaries, transaction exports (CSV/PDF).
- **Multi-Language Support** — English support to open international sales.
- **Admin Mobile Push Notifications** — Proactive alerts for new orders, low stock, refund requests.
- **Supplier / Print Partner Integration** — API integration with print suppliers for automatic fulfillment.

## 5. Technical / Platform

- **PWA / Offline Support** — Service worker for offline browsing and cart persistence.
- **Image Optimization (WebP)** — Auto-generate WebP versions via Sharp, serve with `<picture>` elements.
- **Search Improvements** — Full-text fuzzy search, autocomplete suggestions, search analytics.
- **A/B Testing Framework** — Test layouts, pricing displays, CTAs with conversion tracking.
- **Webhooks / Event System** — External services subscribe to events (new order, payment, shipment).
- **Per-User Rate Limiting** — Authenticated endpoint rate limits beyond IP-based.
- **Redis Caching Layer** — Cache hot endpoints (product listings, catalog data) using existing ioredis dependency.

## 6. Social & Community

- **Product Reviews Photo Gallery** — Prominent photo gallery per product from review images.
- **Community Forum / Discussion Board** — Space for customers to discuss products and share setups.
- **Artist Profiles** — Dedicated artist pages with bio, portfolio, and product listings.
- **Social Login Expansion** — Google/Apple sign-in for non-Russian markets.
