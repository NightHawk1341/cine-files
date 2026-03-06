# TR-BUTE

E-commerce platform for art posters with AR visualization, integrated as a Telegram Web App.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js, Express, PostgreSQL (Supabase) |
| **Frontend** | Vanilla JS SPA, Three.js, TensorFlow.js |
| **Payments** | T-Bank |
| **Shipping** | CDEK API v2, Pochta Russia (ApiShip) |
| **Deploy** | Vercel (serverless), Docker (Yandex Cloud) |

## Key Features

**AR Poster Visualization** - TensorFlow.js depth estimation for wall detection, Three.js rendering, real-time camera or photo upload, manual perspective mode

**Telegram Integration** - Native Web App auth, bot notifications, seamless user experience without separate account creation

**Full Order Lifecycle** - 10 order statuses, user-editable before confirmation, real-time tracking integration, refund workflow

**Multi-Provider Shipping** - Live rate calculation, PVZ/courier selection, package dimension optimization, tracking webhooks

## Architecture

```
├── api/              # 102 serverless endpoints
├── server/           # Express middleware, services, utils
├── public/           # SPA frontend (14 pages, 32 CSS modules)
├── admin-miniapp/    # Telegram Mini App admin panel
└── docs/             # Technical documentation
```

**Codebase:** ~80k+ lines across 269 JS files

## Highlights

- **Zero-framework frontend** - Custom SPA router, state management, component system
- **ML in browser** - Depth estimation model for AR wall detection
- **Dual auth** - Telegram Web App validation + Yandex OAuth fallback
- **Real-time sync** - Cart/favorites sync across devices via background jobs

## Documentation

Detailed docs in `/docs/`:
- `STRUCTURE.md` - Codebase organization and CSS architecture
- `FEATURES.md` - Feature specifications
- `ORDER_FLOW.md` - Order state machine
- `SHIPPING.md` - Carrier integrations
- `AR_VIEW.md` - AR implementation details
- `ADMIN_MINIAPP.md` - Admin panel architecture
- `THEMING.md` - Design system and theme variables
- `ANTI_SCRAPING.md` - Bot protection and rate limiting

## License

Proprietary - All rights reserved
