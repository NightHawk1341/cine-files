# Shipping Integration

> **Last Updated:** December 25, 2024
> **Location:** `/server/services/shipping/`

This document describes the shipping integration for the TR-BUTE platform.

---

## Overview

The platform supports two shipping providers:
- **CDEK** - Direct API v2 integration
- **Pochta Russia** - Via ApiShip aggregator

---

## Supported Delivery Types

| Code | Provider | Service | Description |
|------|----------|---------|-------------|
| `cdek_pvz` | CDEK | Pickup Point | Delivery to CDEK PVZ |
| `cdek_courier` | CDEK | Courier | Home delivery via CDEK |
| `pochta` | Pochta | Standard | Regular mail |
| `pochta_standard` | Pochta | Standard | Same as pochta |
| `pochta_first_class` | Pochta | 1st Class | Priority mail |
| `pochta_courier` | Pochta | Courier | Home delivery |
| `courier_ems` | Pochta | EMS | Express mail |

---

## Architecture

```
server/services/shipping/
├── index.js              # Unified interface
├── cdek.js               # CDEK API v2
├── apiship.js            # ApiShip (Pochta)
└── parcel-calculator.js  # Packaging logic
```

### Unified Interface (`index.js`)

```javascript
// Calculate shipping rates
const rates = await calculateShipping({
  from: { city: 'Moscow', postal_code: '101000' },
  to: { city: 'Kazan', postal_code: '420000' },
  parcels: [{ weight: 500, length: 30, width: 20, height: 5 }]
});

// Get pickup points
const points = await getPickupPoints({
  city: 'Moscow',
  postal_code: '101000'
});

// Track shipment
const tracking = await getTracking(trackingNumber, provider);
```

---

## CDEK Integration

### API Version

**CDEK API v2** with OAuth2 authentication.

### Configuration

Environment variables:
```
CDEK_CLIENT_ID=xxx
CDEK_CLIENT_SECRET=xxx
CDEK_TEST_MODE=false
```

Sender info stored in `shipping_providers` table.

### Authentication

OAuth2 token flow:
1. Request token with client credentials
2. Token cached for reuse
3. Auto-refresh on expiry

```javascript
// In cdek.js
async function getToken() {
  // Check cache
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  // Request new token
  const response = await axios.post(TOKEN_URL, {
    grant_type: 'client_credentials',
    client_id: CDEK_CLIENT_ID,
    client_secret: CDEK_CLIENT_SECRET
  });

  // Cache token
  tokenCache.token = response.data.access_token;
  tokenCache.expiresAt = Date.now() + (response.data.expires_in * 1000);

  return tokenCache.token;
}
```

### Rate Calculation

**Single Tariff:**
```javascript
const tariff = await cdek.calculateTariff({
  type: 1, // 1 = pvz-pvz, 2 = pvz-door, etc.
  from_location: { code: 44 }, // City code
  to_location: { code: 137 },
  packages: [{ weight: 500, length: 30, width: 20, height: 5 }]
});

// Returns: { total_sum, period_min, period_max }
```

**Batch Tariffs:**
```javascript
const tariffs = await cdek.calculateTariffs({
  from_location: { code: 44 },
  to_location: { code: 137 },
  packages: [...],
  tariff_codes: [136, 137, 138] // Multiple tariff types
});
```

### Pickup Points (PVZ)

```javascript
const points = await cdek.getPickupPoints({
  city_code: 44,
  // or
  postal_code: '101000'
});

// Returns array of:
// { code, name, address, work_time, phone, location: { lat, lon } }
```

### Shipment Tracking

```javascript
const status = await cdek.getOrderStatus(cdekUuid);

// Returns:
// { statuses: [{ code, name, date, city }], current_status }
```

### Order Creation

```javascript
const order = await cdek.createOrder({
  tariff_code: 136,
  sender: { company, contact, phone, address },
  recipient: { name, phone, address },
  packages: [{ number, weight, length, width, height, items: [...] }],
  to_location: { code, address }
});

// Returns: { uuid, number, cdek_number }
```

---

## Pochta Russia (ApiShip)

### API Provider

Uses **ApiShip** aggregator for Pochta Russia services.

### Configuration

Two authentication methods are supported:

**Method 1: Direct Token (Recommended)**
```
APISHIP_TOKEN=your_api_token
```

Get your API token from [APIShip Dashboard](https://a.apiship.ru/). Tokens don't expire and work directly.

**Method 2: Login/Password**
```
APISHIP_LOGIN=your_email@example.com
APISHIP_PASSWORD=your_account_password
```

This calls the login endpoint to obtain a token. Note: The password is your **account password**, NOT your API token.

**Test Mode**
```
APISHIP_TEST_MODE=true
```

When enabled, uses test API at `api.dev.apiship.ru` (test credentials: test/test).

### Rate Calculation

```javascript
const rates = await apiship.calculateTariffs({
  from: { countryCode: 'RU', city: 'Moscow', index: '101000' },
  to: { countryCode: 'RU', city: 'Kazan', index: '420000' },
  weight: 500,
  length: 30,
  width: 20,
  height: 5
});

// Returns array of:
// { providerId, tariffId, tariffName, cost, daysMin, daysMax }
```

### Available Tariffs

| Tariff ID | Service |
|-----------|---------|
| pochta_standard | Standard mail |
| pochta_first_class | 1st class mail |
| pochta_courier | Courier delivery |
| pochta_ems | EMS express |

### Shipment Tracking

```javascript
const tracking = await apiship.getTracking(trackingNumber);

// Returns:
// { events: [{ date, status, location }], isDelivered }
```

### Order Creation

```javascript
const order = await apiship.createOrder({
  providerId: 'pochta',
  tariffId: 'standard',
  sender: { ... },
  recipient: { ... },
  places: [{ weight, length, width, height }]
});
```

---

## Parcel Calculator

### Purpose

Calculates optimal packaging for orders based on:
- Product formats (A3, A2, A1)
- Frame type (frameless, framed)
- Quantity of items

### Packaging Types

| Code | Type | Use Case |
|------|------|----------|
| `tube_a3` | Tube | A3 frameless |
| `tube_a2` | Tube | A2 frameless |
| `tube_a1` | Tube | A1 frameless |
| `box_a3` | Box | A3 framed |
| `box_a2` | Box | A2 framed |
| `box_a1` | Box | A1 framed |

### Configuration

Packaging config stored in `packaging_config` table:
- `code` - Packaging type code
- `cost` - Packaging cost
- `weight_grams` - Packaging weight
- `dimensions_*` - Dimensions

### Split Logic

**When to split into multiple parcels:**
- Mixed formats that don't fit together
- Framed items of different sizes
- Weight limits exceeded

```javascript
const parcels = calculateParcels(orderItems);
// Returns: [{ items: [...], packaging: 'tube_a3', weight: 500, dimensions: {...} }]
```

### Weight Calculation

```javascript
// Per item weight from product_prices table
// + Packaging weight from packaging_config
// = Total parcel weight
```

---

## API Endpoints

### Calculate Shipping

**POST /api/shipping/calculate**

```javascript
// Request
{
  "city": "Kazan",
  "postal_code": "420000",
  "items": [
    { "product_id": 123, "property": "A3_frameless", "quantity": 2 }
  ]
}

// Response
{
  "success": true,
  "data": {
    "cdek": {
      "pvz": { "cost": 450, "min_days": 3, "max_days": 5 },
      "courier": { "cost": 650, "min_days": 2, "max_days": 4 }
    },
    "pochta": {
      "standard": { "cost": 350, "min_days": 5, "max_days": 10 },
      "first_class": { "cost": 500, "min_days": 3, "max_days": 7 }
    },
    "parcels": [
      { "packaging": "tube_a3", "weight": 500, "items": [...] }
    ]
  }
}
```

### List Services

**GET /api/shipping/services**

```javascript
// Response
{
  "success": true,
  "data": [
    { "code": "cdek_pvz", "name": "CDEK Pickup Point", "provider": "cdek" },
    { "code": "cdek_courier", "name": "CDEK Courier", "provider": "cdek" },
    { "code": "pochta_standard", "name": "Pochta Standard", "provider": "pochta" },
    // ...
  ]
}
```

### Get Pickup Points

**GET /api/shipping/points**

```javascript
// Request
?city=Moscow&postal_code=101000

// Response
{
  "success": true,
  "data": [
    {
      "code": "MSK123",
      "name": "CDEK Office on Tverskaya",
      "address": "Tverskaya st, 1",
      "work_time": "09:00-21:00",
      "location": { "lat": 55.75, "lon": 37.61 }
    }
  ]
}
```

### Get Tracking

**GET /api/orders/tracking**

```javascript
// Request
?order_id=123

// Response
{
  "success": true,
  "data": {
    "tracking_number": "1234567890",
    "provider": "cdek",
    "events": [
      { "date": "2024-12-20", "status": "Accepted", "location": "Moscow" },
      { "date": "2024-12-21", "status": "In transit", "location": "Kazan" }
    ],
    "current_status": "In transit",
    "is_delivered": false
  }
}
```

---

## Auto-Tracking (CRON)

### Purpose

Automatically update tracking status for shipped orders.

### Implementation

**File:** `api/cron/update-tracking.js`

### Workflow

1. CRON job runs every 2-4 hours
2. Fetches orders with status `shipped`
3. For each order:
   - Get tracking from appropriate provider
   - Update `tracking_history` JSON
   - Update `last_tracking_status`
   - If delivered, change status to `delivered`
4. Rate limiting: 500ms delay between requests

### CRON Authorization

- Vercel CRON signature
- Or `CRON_SECRET` header

```javascript
// In update-tracking.js
if (!verifyCronAuth(req)) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

---

## Database Schema

### Orders Table (shipping fields)

```sql
orders (
  tracking_number TEXT,
  delivery_type VARCHAR,
  delivery_cost NUMERIC,
  shipping_provider_id INT,
  shipping_service_id INT,
  shipment_date DATE,
  estimated_delivery_min DATE,
  estimated_delivery_max DATE,
  estimated_min_days INT,
  estimated_max_days INT,
  last_tracking_status VARCHAR(100),
  last_tracking_update TIMESTAMP,
  tracking_history JSONB
)
```

### Shipping Providers Table

```sql
shipping_providers (
  id SERIAL PRIMARY KEY,
  code VARCHAR NOT NULL UNIQUE,  -- 'cdek', 'pochta'
  display_name VARCHAR,
  is_active BOOLEAN,
  credentials JSONB,             -- API credentials
  sender_info JSONB,             -- Sender address/contact
  settings JSONB
)
```

### Shipping Services Table

```sql
shipping_services (
  id SERIAL PRIMARY KEY,
  provider_id INT REFERENCES shipping_providers(id),
  code VARCHAR,                  -- 'pvz', 'courier', 'standard'
  internal_code VARCHAR,         -- Provider's tariff code
  display_name VARCHAR,
  is_visible BOOLEAN,
  is_active BOOLEAN,
  priority INT
)
```

### Order Parcels Table

```sql
order_parcels (
  id SERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id),
  parcel_number INT,
  packaging_type VARCHAR,
  total_weight_grams INT,
  packaging_cost NUMERIC,
  length_cm, width_cm, height_cm INT,
  provider_id, service_id INT,
  shipping_cost NUMERIC,
  estimated_min_days, estimated_max_days INT,
  provider_shipment_id VARCHAR,
  tracking_number VARCHAR,
  label_url TEXT,
  status VARCHAR
)
```

### Packaging Config Table

```sql
packaging_config (
  id SERIAL PRIMARY KEY,
  code VARCHAR NOT NULL UNIQUE,
  display_name VARCHAR,
  cost NUMERIC,
  weight_grams INT,
  max_frameless_format VARCHAR,
  is_carton BOOLEAN,
  dimensions_length_cm, dimensions_width_cm, dimensions_height_cm INT,
  is_active BOOLEAN
)
```

---

## Cost Calculation Flow

```
1. User enters delivery address
   ↓
2. Frontend calls POST /api/shipping/calculate
   ↓
3. Backend:
   a. Calculate parcels from cart items
   b. Get packaging weights/costs
   c. Call CDEK API for CDEK rates
   d. Call ApiShip for Pochta rates
   e. Add packaging costs to rates
   ↓
4. Return combined rates to frontend
   ↓
5. User selects delivery option
   ↓
6. Order created with:
   - delivery_type
   - delivery_cost (rate + packaging)
   - shipping_provider_id
   - shipping_service_id
   - estimated dates
```

---

## Error Handling

### Provider Errors

```javascript
try {
  const rates = await cdek.calculateTariff(...);
} catch (error) {
  if (error.response?.status === 401) {
    // Token expired, refresh and retry
  }
  if (error.response?.status === 400) {
    // Invalid request
  }
  // Fallback or show error to user
}
```

### Fallback Strategy

If one provider fails:
1. Log error
2. Return rates from available providers
3. Show "unavailable" for failed provider

---

## Rate Limit Handling

### ShipAPI (Pochta) Rate Limits

ShipAPI may impose daily rate limits on API calls. The system handles this gracefully.

### Detection

```javascript
// In apiship.js
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
    this.isRateLimit = true;
  }
}

// Detected via:
// 1. HTTP 429 status code
// 2. Error messages containing "rate limit", "too many requests", etc.
```

### Caching

Tariff results are cached for 30 minutes to reduce API calls:
- Cache key: `fromPostalCode-toPostalCode-weight-dimensions`
- Automatic cleanup when cache exceeds 1000 entries

### Manual Mode

When rate limits are hit or API becomes unreliable, admin can switch Pochta to manual calculation mode.

**Location:** Project Management → Способы доставки → Ручной расчёт доставки

When enabled:
- API calculation for Pochta is skipped entirely
- Admin must manually enter delivery cost in each order
- `pochtaManualMode: true` flag returned in calculate API response

**Settings path:** `delivery_methods.pochta.manual_mode`

---

## Cost Rounding

### Purpose

Round delivery costs to "nice" numbers that are customer-friendly.

### Configuration

Rounding settings are configurable in Project Management → Округление стоимости доставки.

**Settings path:** `delivery_rounding` in `app_settings` table.

### Default Settings

```javascript
{
  small_order_threshold: 1500,      // Orders under this are "small"
  small_order_step: 50,             // Round to 50₽ for small orders
  big_order_step: 50,               // Round UP to 50₽ for big orders
  high_ratio_threshold: 0.5,        // 50% - floor to 100₽
  high_ratio_step: 100,
  very_high_ratio_threshold: 0.7,   // 70% - floor to 200₽ (very aggressive)
  very_high_ratio_step: 200
}
```

### Rounding Rules (Priority Order)

For **small orders** (< 1500₽):

1. **Very High Ratio** (delivery > 70% of order):
   - Floor to 200₽ step
   - Example: 450₽ delivery on 500₽ order → 400₽

2. **High Ratio** (delivery > 50% of order):
   - Floor to 100₽ step
   - Example: 450₽ → 400₽, 490₽ → 400₽, 410₽ → 400₽

3. **Normal** (ratio < 50%):
   - Standard round to 50₽
   - Example: 310₽ → 300₽, 340₽ → 350₽, 370₽ → 350₽, 380₽ → 400₽

For **big orders** (≥ 1500₽):
- Always round UP (ceil) to 50₽
- Example: 310₽ → 350₽, 340₽ → 350₽, 370₽ → 400₽, 380₽ → 400₽

### Implementation

```javascript
// In shipping/index.js
function roundDeliveryCost(deliveryCost, options = {}) {
  const { orderTotal, settings } = options;

  // For small orders, check delivery ratio
  if (orderTotal > 0 && orderTotal < settings.small_order_threshold) {
    const ratio = deliveryCost / orderTotal;

    // Very high ratio: aggressive floor to 200₽
    if (ratio >= settings.very_high_ratio_threshold) {
      return Math.floor(deliveryCost / settings.very_high_ratio_step) * settings.very_high_ratio_step;
    }

    // High ratio: floor to 100₽
    if (ratio >= settings.high_ratio_threshold) {
      return Math.floor(deliveryCost / settings.high_ratio_step) * settings.high_ratio_step;
    }

    // Normal: standard round to 50₽
    return Math.round(deliveryCost / settings.small_order_step) * settings.small_order_step;
  }

  // Big orders: always round UP
  return Math.ceil(deliveryCost / settings.big_order_step) * settings.big_order_step;
}
```

### API Response

The calculate endpoint returns both raw and rounded prices:

```javascript
{
  options: [{
    price: 487,              // Provider rate only
    rawTotalPrice: 587,      // Provider + packaging (unrounded)
    totalPrice: 550,         // Rounded (shown to customer)
    // ...
  }]
}
```

---

## Frontend Integration

### Checkout Page

Shipping calculation and selection is handled on the dedicated checkout page (`/checkout`).

```javascript
// Calculate shipping when address changes
async function updateShipping() {
  const rates = await fetch('/api/shipping/calculate', {
    method: 'POST',
    body: JSON.stringify({
      city: addressForm.city,
      postal_code: addressForm.postalCode,
      items: cartItems
    })
  });

  displayRates(rates);
}
```

### Order Page

```javascript
// Display tracking on shipped orders
async function loadTracking(orderId) {
  const tracking = await fetch(`/api/orders/tracking?order_id=${orderId}`);
  renderTrackingTimeline(tracking.events);
}
```

---

## Testing

### Test Mode

CDEK provides test environment:
```
CDEK_TEST_MODE=true
CDEK_CLIENT_ID=<test_id>
CDEK_CLIENT_SECRET=<test_secret>
```

### Test Credentials

Contact CDEK/ApiShip for sandbox credentials.

---

## Related Files

| File | Purpose |
|------|---------|
| `server/services/shipping/index.js` | Unified interface |
| `server/services/shipping/cdek.js` | CDEK API v2 |
| `server/services/shipping/apiship.js` | ApiShip/Pochta |
| `server/services/shipping/parcel-calculator.js` | Packaging logic |
| `api/shipping/calculate.js` | Rate calculation endpoint |
| `api/shipping/services.js` | List services endpoint |
| `api/shipping/points.js` | Pickup points endpoint |
| `api/orders/tracking.js` | Tracking endpoint |
| `api/cron/update-tracking.js` | Auto-tracking CRON |
| `public/js/pages/checkout.js` | Checkout page (order form, shipping) |
| `public/js/pages/cart/shipping.js` | Shipping calculation module |
