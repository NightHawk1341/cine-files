# Direct Ad Sales: Film Company Partnerships

Implementation plan for monetizing CineFiles through direct partnerships with film studios, distributors, and cinema chains. Covers Russian legal compliance (ОРД/ERID), required technical changes, and the workflow for managing direct ad campaigns.

**Target partners:** film distributors (Central Partnership, Walt Disney CIS, Sony Pictures Russia, etc.), cinema chains (Kinomax, Cinema Park, Karo), streaming platforms (Kinopoisk, Okko, IVI), indie studios.

---

## Table of Contents

1. [Legal Requirements](#1-legal-requirements)
2. [Database Changes](#2-database-changes)
3. [Backend Changes](#3-backend-changes)
4. [Frontend Changes](#4-frontend-changes)
5. [Admin Panel Changes](#5-admin-panel-changes)
6. [Ad Placement Strategy](#6-ad-placement-strategy)
7. [Reporting and Analytics](#7-reporting-and-analytics)
8. [Workflow: Creating a Campaign](#8-workflow-creating-a-campaign)
9. [File Change Summary](#9-file-change-summary)

---

## 1. Legal Requirements

Since CineFiles sells ad placements directly (not through Yandex РСЯ), the site owner is responsible for full compliance with Federal Law No. 38-FZ "On Advertising" and its 2022 amendments (Article 18.1).

### 1.1. What Every Ad Must Display

Every paid placement on the site must show three things:

| Element | Requirement | Example |
|---------|------------|---------|
| **"Реклама"** label | Visible text, not hidden or tiny | `Реклама` in corner of banner |
| **Advertiser name** | Legal name or link to advertiser site | `ООО "Централ Партнершип"` |
| **ERID token** | Unique identifier from ОРД operator | `erid: 2VfnxvFJKa7` |

All three are mandatory. Missing any one triggers separate fines.

### 1.2. Fines (Per Violation, Cumulative)

| Violation | Legal entity fine |
|-----------|-----------------|
| Missing ОРД reporting | 200,000 -- 500,000 RUB |
| Missing ERID token | 200,000 -- 500,000 RUB |
| Missing "Реклама" label | up to 500,000 RUB |

Five unlabeled ads = up to 2.5M RUB. FAS and Roskomnadzor enforce independently.

### 1.3. ОРД Registration (One-Time Setup)

Choose one ОРД operator to register with. Recommended: **ОРД ВК** (free, has web UI) or **ОРД Яндекс** (free, API-only).

Steps:
1. Create account at the ОРД portal
2. Register cinefiles.ru as a placement platform
3. Register your contract template (contract number, parties, dates)

### 1.4. Per-Campaign ERID Flow

For each new ad campaign:

```
1. Sign contract with advertiser (film company)
2. Register contract details in ОРД
3. Upload each ad creative (image + text) to ОРД
4. Receive ERID token for each creative
5. Enter ERID into CineFiles admin when creating the integration
6. System auto-renders "Реклама" + advertiser name + ERID on every impression
7. Monthly: submit impression/click stats to ОРД by the 30th
```

Any change to the creative (different image, different text) requires a **new ERID**.

### 1.5. Monthly Reporting to ОРД

By the 30th of each month, submit to ОРД:
- Impression count per creative per placement
- Click count per creative
- Dates of display
- Revenue per creative

The existing `integrations` table already tracks `current_views`, `click_count`, and date ranges -- this data feeds the monthly report.

### 1.6. 3% Revenue Deduction (from April 2025)

Federal Law No. 479-FZ requires **3% of quarterly ad revenue** paid to the federal budget. Quarterly, first payment was due July 2025.

---

## 2. Database Changes

The existing `integrations` table needs new columns for legal compliance. **No new tables required.**

### 2.1. Migration SQL

File: `migrations/005_integrations_legal_fields.sql`

```sql
-- Add legal compliance fields to integrations table
ALTER TABLE "integrations"
  ADD COLUMN "erid"              VARCHAR(50),
  ADD COLUMN "advertiser_name"   VARCHAR(300),
  ADD COLUMN "advertiser_url"    TEXT,
  ADD COLUMN "contract_number"   VARCHAR(100),
  ADD COLUMN "contract_date"     DATE,
  ADD COLUMN "revenue_amount"    NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN "revenue_currency"  VARCHAR(3) DEFAULT 'RUB',
  ADD COLUMN "ord_reported_at"   TIMESTAMPTZ;

-- Index for filtering unreported campaigns (monthly reporting)
CREATE INDEX "integrations_ord_reported_at_idx" ON "integrations"("ord_reported_at");

COMMENT ON COLUMN "integrations"."erid" IS 'ERID token from ОРД operator, required by law for all paid placements';
COMMENT ON COLUMN "integrations"."advertiser_name" IS 'Legal name of the advertiser, displayed on the ad per 38-FZ';
COMMENT ON COLUMN "integrations"."ord_reported_at" IS 'Last date impression data was submitted to ОРД';
```

### 2.2. Update SQL_SCHEMA.sql

Add the new columns to the `integrations` table definition in `SQL_SCHEMA.sql`.

---

## 3. Backend Changes

### 3.1. API Changes (`api/promos.js`)

Update the integration CRUD to accept and return the new fields:

**Create/Update:** accept `erid`, `advertiser_name`, `advertiser_url`, `contract_number`, `contract_date`, `revenue_amount`, `revenue_currency`.

**Validation on create/update:**
- If `integration_type` is `partner` or `featured`, warn (not block) if `erid` is empty -- the admin should be reminded but not prevented from saving drafts
- `advertiser_name` required when `erid` is set

**Public GET `/api/integrations`:** Return `erid`, `advertiser_name`, `advertiser_url` alongside existing fields. These are needed by the frontend renderer to display the legal label.

### 3.2. Reporting Endpoint

New endpoint: `GET /api/admin/integrations/report`

Returns aggregated data for ОРД monthly reporting:

```json
{
  "period": { "from": "2026-03-01", "to": "2026-03-31" },
  "items": [
    {
      "id": 5,
      "title": "Кинопоиск - Март 2026",
      "erid": "2VfnxvFJKa7",
      "advertiser_name": "ООО Кинопоиск",
      "placement": "sidebar",
      "impressions": 12450,
      "clicks": 387,
      "start_date": "2026-03-01",
      "end_date": "2026-03-31",
      "revenue_amount": 15000.00,
      "revenue_currency": "RUB",
      "ord_reported_at": null
    }
  ]
}
```

Query: all integrations where `erid IS NOT NULL` and `start_date`/`end_date` overlaps the requested period.

Auth: `requireAdmin`.

### 3.3. Mark as Reported

New endpoint: `POST /api/admin/integrations/:id/mark-reported`

Sets `ord_reported_at = NOW()`. Used after manually submitting data to ОРД.

Auth: `requireAdmin`.

### 3.4. ads.txt

Serve a static `ads.txt` at the site root. For direct sales only (no programmatic), the file declares the site owner as the sole authorized seller:

```
# CineFiles - direct sales only
# Contact: [your email]
```

This file goes in `public/ads.txt`. Express static middleware already serves files from `public/`.

---

## 4. Frontend Changes

### 4.1. Legal Label Rendering (`integration-slot.js`)

The `buildItem()` function must render the mandatory legal label on every paid placement. Modify `integration-slot.js`:

```javascript
// After building the main element (image + link), append legal footer:
if (item.erid) {
  var legal = document.createElement('div');
  legal.className = 'integration-slot-legal';

  var reklama = document.createElement('span');
  reklama.className = 'integration-slot-reklama';
  reklama.textContent = 'Реклама';
  legal.appendChild(reklama);

  if (item.advertiser_url) {
    var advLink = document.createElement('a');
    advLink.className = 'integration-slot-advertiser';
    advLink.href = item.advertiser_url;
    advLink.target = '_blank';
    advLink.rel = 'noopener noreferrer sponsored';
    advLink.textContent = item.advertiser_name;
    legal.appendChild(advLink);
  } else if (item.advertiser_name) {
    var advSpan = document.createElement('span');
    advSpan.className = 'integration-slot-advertiser';
    advSpan.textContent = item.advertiser_name;
    legal.appendChild(advSpan);
  }

  var eridEl = document.createElement('span');
  eridEl.className = 'integration-slot-erid';
  eridEl.textContent = 'erid: ' + item.erid;
  legal.appendChild(eridEl);

  el.appendChild(legal);
}
```

For HTML-type integrations, add the legal footer to the wrapper div the same way (the HTML creative itself may or may not contain it -- the system should always append it).

### 4.2. ERID in Destination URL

Per ОРД guidelines, embed the ERID in click-through URLs:

```javascript
// In buildItem(), when setting el.href:
if (item.destination_url && item.erid) {
  var url = new URL(item.destination_url);
  url.searchParams.set('erid', item.erid);
  el.href = url.toString();
} else {
  el.href = item.destination_url || '#';
}
```

### 4.3. CSS for Legal Labels

New file: `public/css/integration-legal.css`

```css
.integration-slot-legal {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1.2;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border-color);
}

.integration-slot-reklama {
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.integration-slot-advertiser {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

a.integration-slot-advertiser {
  color: var(--link-color);
  text-decoration: none;
}

@media (hover: hover) {
  a.integration-slot-advertiser:hover {
    text-decoration: underline;
  }
}

.integration-slot-erid {
  margin-left: auto;
  white-space: nowrap;
  font-family: monospace;
  font-size: 10px;
  color: var(--text-tertiary);
  opacity: 0.7;
}

/* Mobile: stack vertically */
@media (max-width: 480px) {
  .integration-slot-legal {
    flex-wrap: wrap;
    gap: 2px 8px;
  }

  .integration-slot-erid {
    margin-left: 0;
    width: 100%;
  }
}
```

This CSS should be loaded globally (add to `index.html` stylesheets) since integrations render on multiple pages.

---

## 5. Admin Panel Changes

### 5.1. Integration Form (`public/js/pages/admin/integrations.js`)

Add fields to the create/edit form:

| Field | Type | Notes |
|-------|------|-------|
| ERID | text input | Paste from ОРД after registering creative |
| Advertiser Name | text input | Legal name, required when ERID is set |
| Advertiser URL | text input | Optional link to advertiser site |
| Contract Number | text input | Internal reference |
| Contract Date | date input | When contract was signed |
| Revenue Amount | number input | Campaign price in RUB |

Group these under a collapsible "Юридические данные" (Legal Data) section in the form.

### 5.2. Compliance Status Indicator

In the integrations list, show a status badge:

| State | Badge | Meaning |
|-------|-------|---------|
| No ERID | -- | Not a paid placement (editorial/internal) |
| ERID set, all fields filled | Green "ОРД" | Compliant |
| ERID set, missing advertiser_name | Red "!" | Non-compliant, needs fix |
| Active, not reported this month | Orange "Отчёт" | Needs monthly ОРД reporting |

### 5.3. Reporting Page

New admin page or tab: `/admin/integrations/report`

Shows a monthly summary table with:
- All integrations with ERID, their impressions/clicks for the selected month
- Revenue per campaign
- "Reported" checkbox -- marks as submitted to ОРД
- Export as CSV for manual ОРД upload (ОРД ВК accepts CSV)

---

## 6. Ad Placement Strategy

Placements optimized for film company campaigns. The existing `placement` field supports these values:

### 6.1. Current Placements (Already Implemented)

| Placement | Location | Best For |
|-----------|----------|----------|
| `header` | Above main content | Major releases, premiere announcements |
| `sidebar` | Right column (desktop) | Movie posters, "now in cinemas" |
| `between` | Between article cards in feed | Native-style promos |
| `footer` | Below content | Secondary campaigns |

### 6.2. Current Page Usage

| Page | File | Placement | Method |
|------|------|-----------|--------|
| Home | `public/js/pages/home.js` | `between` | `injectBetween()` after article feed |
| Category | `public/js/pages/category.js` | `between` | `injectBetween()` after article grid |
| Article | `public/js/pages/article.js` | `footer` | `render()` below article body |

### 6.3. New Placement: `in-article`

Film companies often want placement inside review/news articles about their films. Add a new placement type that inserts between article body blocks.

Implementation in `article-body.js`: after rendering the 3rd-4th block, check for active `in-article` integrations matching the article's category. If found, inject the integration slot.

This leverages the existing `target_categories` filter -- a distributor promoting a horror film can target only the "horror" or "reviews" category.

### 6.4. Pricing Model Suggestions

For the commercial offer to film companies:

| Model | How It Works | When to Use |
|-------|-------------|-------------|
| **CPM** (cost per 1000 views) | Charge per `current_views` / 1000 | Standard banners |
| **Fixed period** | Flat fee for date range | Premiere campaigns (1-2 weeks) |
| **Fixed views** | Flat fee, runs until `max_views` reached | Budget-conscious clients |

The `integrations` table already supports all three via `start_date`/`end_date` (period) and `max_views` (view cap). The new `revenue_amount` field stores the agreed price.

---

## 7. Reporting and Analytics

### 7.1. Data Already Tracked

The `integrations` table tracks:
- `current_views` -- total impressions (incremented by `POST /api/integrations/:id/view`)
- `click_count` -- total clicks (incremented by `POST /api/integrations/:id/click`)

### 7.2. What's Missing for ОРД Reports

ОРД requires monthly breakdowns, but `current_views` and `click_count` are running totals. Two options:

**Option A (Simple):** Snapshot approach. Store the view/click counts at month boundaries in `app_settings`:

```json
{
  "key": "integration_snapshots_2026_03",
  "value": {
    "5": { "views": 8200, "clicks": 245 },
    "7": { "views": 3100, "clicks": 98 }
  }
}
```

Monthly impressions = current total minus previous snapshot. Cron job on the 1st of each month saves the snapshot.

**Option B (Precise):** New `integration_stats` table with daily rows. More accurate but adds schema complexity.

**Recommendation:** Start with Option A. It uses the existing `app_settings` table, requires no migration, and is sufficient for ОРД reporting at the current scale.

### 7.3. Client-Facing Reports

Film companies will want proof of delivery. Generate a simple report page (or PDF export) showing:

- Campaign name, dates, creative preview
- Total impressions and clicks
- CTR (click-through rate)
- Placement breakdown
- Daily trend (if using Option B)

---

## 8. Workflow: Creating a Campaign

End-to-end flow for a new film company partnership:

```
OFFLINE
  1. Film company contacts you about promoting their release
  2. Agree on: placement, dates, creative, price
  3. Sign contract

ОРД PORTAL
  4. Log into ОРД (e.g., ord.vk.com)
  5. Register the contract (number, dates, parties, amounts)
  6. Upload the ad creative (image + text)
  7. Copy the assigned ERID token

CINEFILES ADMIN
  8. Go to /admin/integrations -> Create
  9. Fill in:
     - Title: "Кинопоиск - Март 2026"
     - Type: partner
     - Placement: sidebar (or header, between, etc.)
     - Image: upload banner to media library
     - Destination URL: link to the film/platform
     - Start/End dates
     - Max views (if applicable)
     - Target categories (if applicable)
     - ERID: paste from step 7
     - Advertiser name: legal name from contract
     - Advertiser URL: their site
     - Contract number + date
     - Revenue amount
  10. Save and activate

AUTOMATIC
  11. Integration appears on matching pages
  12. "Реклама" + advertiser name + ERID rendered automatically
  13. Views and clicks tracked automatically
  14. ERID appended to click-through URL automatically

MONTHLY (by the 30th)
  15. Go to /admin/integrations/report
  16. Review impression/click data for the month
  17. Export or manually enter into ОРД portal
  18. Mark as reported in CineFiles
  19. Transfer 3% of ad revenue to federal budget (quarterly)
```

---

## 9. File Change Summary

### Database
| Change | File |
|--------|------|
| Migration SQL | `migrations/005_integrations_legal_fields.sql` |
| Schema reference | `SQL_SCHEMA.sql` (update integrations table) |

### Backend
| Change | File |
|--------|------|
| Add legal fields to CRUD | `api/promos.js` |
| Reporting endpoint | `api/promos.js` (add `report()` handler) |
| Mark-reported endpoint | `api/promos.js` (add `markReported()` handler) |
| Register routes | `server/routes/index.js` |
| ads.txt | `public/ads.txt` |

### Frontend
| Change | File |
|--------|------|
| Legal label rendering | `public/js/components/integration-slot.js` |
| ERID in URLs | Same file |
| Legal label styles | `public/css/integration-legal.css` (new) |
| Load CSS globally | `public/index.html` |
| In-article placement | `public/js/components/article-body.js` |

### Admin
| Change | File |
|--------|------|
| Legal fields in form | `public/js/pages/admin/integrations.js` |
| Compliance badges | Same file |
| Reporting page | New page or tab in admin |

### Documentation
| Change | File |
|--------|------|
| This document | `docs/DIRECT_ADS_IMPLEMENTATION.md` |
| Conditional visibility | `docs/CONDITIONAL_VISIBILITY.md` (if new toggles added) |

---

## References

- [Federal Law 38-FZ "On Advertising"](http://www.consultant.ru/document/cons_doc_LAW_58968/)
- [Article 18.1 — Internet advertising marking](https://erir.grfc.ru/)
- [ОРД ВК portal](https://ord.vk.com/)
- [ОРД Яндекс (API)](https://partner.yandex.com/)
- [Fines: Article 14.3 Administrative Code](https://www.consultant.ru/document/cons_doc_LAW_34661/e1a83d7f4b6078e65d02edcfe7774fe69e17d24e/)
- [3% revenue deduction — Law 479-FZ](https://acsour.com/en/news-and-articles/tpost/l267h080e1-from-april-1-advertising-distributors-wi)
