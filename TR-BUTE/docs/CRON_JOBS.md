# Cron Jobs Reference

All cron endpoints live in `api/cron/` and are registered in `vercel.json` under the `crons` array.
Authentication requires either the `x-vercel-cron` header (auto-set by Vercel) or `Authorization: Bearer <CRON_SECRET>`.

---

## Jobs

### 1. Process Giveaways

| Key | Value |
|-----|-------|
| File | `api/cron/process-giveaways.js` |
| Endpoint | `GET /api/cron/process-giveaways` |
| Schedule | `0 0 * * *` (daily at midnight UTC) |
| Purpose | Finds active giveaways past `end_time`, picks and announces winners |

**Note:** The in-file comment says `*/5 * * * *` (every 5 min), but `vercel.json` uses `0 0 * * *` (daily). On the Hobby plan only daily is allowed, so the daily schedule is correct. If upgrading to Pro and giveaways need faster resolution, change the `vercel.json` schedule.

### 2. Check IP Rights (FIPS)

| Key | Value |
|-----|-------|
| File | `api/cron/check-ip-rights.js` |
| Endpoint | `GET /api/cron/check-ip-rights` |
| Schedule | `0 3 * * 1` (Mondays at 03:00 UTC) |
| Purpose | Searches FIPS (Роспатент) trademark database for IP conflicts with product titles |

- Responds immediately with `{ ok: true }` and runs the scrape in the background (fire-and-forget).
- Progress stored in `app_settings` key `ip_rights_scan_status`; admin UI can poll for updates.
- Designed to run from a Russian IP (Yandex Cloud) to avoid FIPS geo-restrictions.
- Can be manually triggered via admin UI (`?partial=true` for incremental scan).

### 3. Update Tracking

| Key | Value |
|-----|-------|
| File | `api/cron/update-tracking.js` |
| Endpoint | `GET /api/cron/update-tracking` |
| Schedule | `0 9 * * *` (daily at 09:00 UTC) |
| Purpose | Polls CDEK and Pochta APIs for shipped-order tracking updates |

- Processes up to 50 orders per execution (only orders not updated in 4+ hours).
- Detects pickup-point arrival, delivery, return-to-sender events.
- Sends appropriate notifications (`PARCEL_AT_PICKUP_POINT`, `PARCEL_RETURNED_TO_SENDER`, `STORAGE_PICKUP_REMINDER`).
- 500 ms delay between API requests for rate limiting.
- In-file comment suggests `0 0,4,8,12,16,20 * * *` (every 4 hours); current `vercel.json` runs it once daily. Upgrade to Pro to increase frequency.

### 4. Cleanup Tokens

| Key | Value |
|-----|-------|
| File | `api/cron/cleanup-tokens.js` |
| Endpoint | `GET /api/cron/cleanup-tokens` |
| Schedule | `0 6 * * *` (daily at 06:00 UTC) |
| Purpose | Deletes expired rows from `auth_tokens` where `expires_at < NOW()` |

---

## Platform Limits

### Vercel

| | Hobby (Free) | Pro ($20/user/mo) | Enterprise |
|---|---|---|---|
| Max cron jobs per project | 100 | 100 | 100 |
| Minimum interval | Once per day | Once per minute | Once per minute |
| Scheduling precision | Hourly (±59 min) | Per-minute | Per-minute |

**Current usage: 4 registered jobs (well within the 100 limit)**

Key Hobby constraints:
- Cron expressions that run more than once per day **fail deployment**.
- **Schedules must not share the same hour** — Vercel Hobby has hourly precision (±59 min), so two jobs at the same hour may collide. Always pick a unique hour for each job.
- Timing is imprecise: a job set for 01:00 may fire anywhere between 01:00–01:59.
- Cron jobs invoke Vercel Functions — same execution time limits apply (default 10s, max 300s on Pro).

Key Pro benefits relevant to this project:
- `update-tracking` could run every 4 hours instead of daily (better tracking freshness).
- `process-giveaways` could run every 5 minutes instead of daily (faster winner selection).

Source: [Vercel Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)

### Yandex Cloud Functions (Timer Triggers)

| Limit | Value |
|-------|-------|
| Triggers per cloud | 100 (adjustable) |
| Functions per cloud | 10 (adjustable) |
| Max execution time | 10 min (up to 1 hour for long-lived functions) |
| Max RAM per instance | 8 GB |
| Concurrent calls per AZ | 10 (adjustable) |
| Request/response JSON size | 3.5 MB |

Timer triggers use standard cron syntax (6 fields: min, hr, dom, month, dow, year) and are **free** — you pay only for function invocations.

Currently `check-ip-rights` is the only job designed for Yandex Cloud (needs Russian IP for FIPS access). Its fire-and-forget pattern fits well within the 10-minute default timeout since it responds immediately and the background scrape runs in the same process.

Source: [Yandex Cloud Functions Limits](https://yandex.cloud/en/docs/functions/concepts/limits)

---

## Schedule Map (no-collision reference)

Each job must use a **unique hour** to avoid Hobby-plan timing collisions.

| UTC Hour | Job |
|----------|-----|
| 00 | `process-giveaways` |
| 03 (Mon only) | `check-ip-rights` |
| 06 | `cleanup-tokens` |
| 09 | `update-tracking` |
| 01, 02, 04, 05, 07, 08, 10–23 | **Available** |

When adding a new job, pick an hour from the "Available" row and update this table.

---

## Compliance Summary

| Check | Status |
|-------|--------|
| Total cron jobs ≤ 100 per project | **OK** (4 jobs) |
| All `vercel.json` schedules are daily or less frequent (Hobby) | **OK** (all 4 are daily/weekly) |
| No two jobs share the same hour | **OK** (00, 03, 06, 09) |
| Yandex trigger count ≤ 100 | **OK** (1 trigger needed) |
| No job exceeds Vercel function timeout | **OK** — `check-ip-rights` responds immediately; others are fast queries |

---

## Adding a New Cron Job

1. Create `api/cron/{job-name}.js` with the standard auth check pattern (see existing jobs).
2. Register the endpoint in `server/routes/index.js`.
3. **Pick a unique hour** from the Schedule Map above — no two jobs may share an hour.
4. Add the schedule to `vercel.json` `crons` array — on Hobby, only `0 H * * *` (daily) or less frequent.
5. Add an entry to this document **and** update the Schedule Map table.
6. If the job needs a Russian IP, note it for Yandex Cloud deployment.
7. Update `docs/ENV_VARS.md` if new env vars are required.
