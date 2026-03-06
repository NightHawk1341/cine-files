# Yandex Cloud Postbox — Setup Guide

This guide walks through configuring Yandex Cloud Postbox as the primary email
provider for TR/BUTE. The existing Yandex SMTP (`smtp.yandex.ru`) stays as an
automatic fallback — if Postbox is unreachable the system retries via SMTP.

---

## Prerequisites

- A Yandex Cloud account with an active billing account
- A domain you control (for sender address verification)
- `yc` CLI installed and authenticated (`yc init`)

---

## Step 1 — Create a Service Account

```bash
# Create a service account in the folder where Postbox will run
yc iam service-account create --name postbox-sender

# Note the service account ID from the output
# Grant it the postbox.sender role
yc resource-manager folder add-access-binding <FOLDER_ID> \
  --role postbox.sender \
  --subject serviceAccount:<SERVICE_ACCOUNT_ID>
```

---

## Step 2 — Generate DKIM Key

Postbox requires a DKIM private key to sign outgoing emails.

```bash
openssl genrsa -out postbox-privatekey.pem 2048
```

Keep `postbox-privatekey.pem` — you'll paste it in the next step.

---

## Step 3 — Create a Postbox Address (Identity)

1. Open the [Yandex Cloud Console](https://console.yandex.cloud/)
2. Navigate to **Postbox** in the left sidebar
3. Click **Create address**
4. Fill in:
   - **Sending domain**: your domain (e.g. `buy-tribute.com`)
   - **Selector**: `postbox` (or any identifier you prefer)
   - **Private key**: paste the contents of `postbox-privatekey.pem`
5. Click **Create**

> The address status will be "Pending" until DNS verification completes.

---

## Step 4 — Configure DNS Records

After creating the address, the console shows DNS records you need to add.
Add them to your domain's DNS provider:

| Type  | Name                                  | Value                          |
|-------|---------------------------------------|--------------------------------|
| TXT   | `postbox._domainkey.buy-tribute.com`  | *(shown in console — DKIM)*    |
| TXT   | `_postbox-challenge.buy-tribute.com`  | *(shown in console)*           |
| TXT   | `buy-tribute.com`                     | `v=spf1 redirect=_spf.mail.yandex.net` |

Wait for DNS propagation (usually 5–30 minutes). The address status in the
console will change to **Active** once verification succeeds.

---

## Step 5 — Create an API Key

The TR/BUTE integration uses SMTP with API key authentication.

```bash
yc iam api-key create \
  --service-account-name postbox-sender \
  --scope yc.postbox.send \
  --description "TR/BUTE Postbox SMTP"
```

Output:

```
api_key:
  id: aje...abc          ← this is POSTBOX_API_KEY_ID
  ...
secret: AQVN...xyz       ← this is POSTBOX_API_KEY_SECRET
```

> **Save both values immediately** — the secret is shown only once.

---

## Step 6 — Set Environment Variables

Add these to your Yandex Cloud container (or `.env` for local dev):

```env
POSTBOX_API_KEY_ID=aje...abc
POSTBOX_API_KEY_SECRET=AQVN...xyz
POSTBOX_FROM_ADDRESS=noreply@buy-tribute.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTBOX_API_KEY_ID` | yes | API key ID from Step 5 |
| `POSTBOX_API_KEY_SECRET` | yes | API key secret from Step 5 |
| `POSTBOX_FROM_ADDRESS` | no | Sender address. Must match the verified domain. Falls back to `YANDEX_EMAIL` |

Keep the existing `YANDEX_EMAIL` and `YANDEX_EMAIL_PASSWORD` variables —
they power the automatic fallback to Yandex SMTP if Postbox is unavailable.

---

## Step 7 — Deploy & Verify

1. Deploy the updated application
2. Check the logs for email send attempts:
   - `[Postbox] Email sent to ...` — Postbox is working
   - `[SMTP fallback] Email sent to ...` — fell back to Yandex SMTP
3. Trigger a test notification (e.g. place a test order) and confirm the email
   arrives

---

## How It Works (Architecture)

```
sendEmailNotification()
        │
        ▼
  lib/postbox.js ─── sendEmail()
        │
        ├── Try Postbox SMTP (postbox.cloud.yandex.net:465)
        │       auth: API key ID + secret
        │       ↓ success → return { provider: 'postbox' }
        │       ↓ failure → log error, continue
        │
        └── Fallback: Yandex SMTP (smtp.yandex.ru:465)
                auth: YANDEX_EMAIL + YANDEX_EMAIL_PASSWORD
                ↓ success → return { provider: 'smtp' }
                ↓ failure → throw error
```

Both `lib/notifications.js` (typed notification system) and
`api/notifications/send.js` (legacy endpoint) use the same `postbox.js` module.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[Postbox] Failed to send` then `[SMTP fallback] Email sent` | Postbox credentials wrong or address not verified | Check `POSTBOX_API_KEY_ID`/`SECRET`, verify DNS in console |
| Both providers fail | Neither is configured | Ensure env vars are set for at least one provider |
| Emails land in spam | SPF/DKIM not set up | Add DNS records from Step 4, check in console that status is Active |
| `No email provider configured` | Both sets of env vars missing | Set `POSTBOX_*` or `YANDEX_EMAIL`+`YANDEX_EMAIL_PASSWORD` |

---

## Limits

| Provider | Daily Limit | Notes |
|----------|------------|-------|
| Postbox | ~10M/day | First 2,000/month free, then pay-per-email |
| Yandex SMTP (fallback) | 500/day | Per-mailbox limit |

---

## References

- [Yandex Cloud Postbox docs](https://yandex.cloud/en/docs/postbox/)
- [SendEmail API reference](https://yandex.cloud/en/docs/postbox/aws-compatible-api/api-ref/send-email)
- [Postbox quickstart](https://yandex.cloud/en/docs/postbox/quickstart)
- [Postbox pricing](https://yandex.cloud/en/docs/postbox/pricing)
