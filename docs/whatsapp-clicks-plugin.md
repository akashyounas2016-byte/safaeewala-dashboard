# WhatsApp Clicks plugin → CRM webhook

What the WordPress plugin "WhatsApp Clicks" (`wact`) must do so every click reaches CRM → **WhatsApp Clicks** (rules R-MKT-03, R-MKT-05).

## What is wrong now (19 Nov 2026)

- The plugin dashboard shows 27 clicks (6 on 17 Nov, 11 on 18 Nov, 2 on 19 Nov).
- The CRM has only the 7 clicks of 16 Nov. Those 7 arrived together at 23:28 Dubai time, when the webhook was set up and tested.
- The CRM server has logged **no request at all** to the webhook for 46 hours (container log, 17–19 Nov). Clicks are not rejected — they are never sent.
- So the plugin saves each click in WordPress but does not send it. Real-time delivery is either off, or it waits for WP-Cron. WP-Cron only runs on site visits, and caching plugins such as WP Rocket can stop it.

## 1. Settings to check first (no code)

WordPress → WhatsApp Clicks → **Settings & Webhook**:

1. **Enable webhook delivery** is ticked, then **Save**.
2. Webhook URL is exactly `https://crm.safaeewala.com/api/webhook/whatsapp-clicks` (no space, no `/` at the end).
3. Bearer token is empty.
4. The **Signing secret** is the same value as `WACT_SIGNING_SECRET` in the VPS file `/var/www/safaeewala/.env`.
5. Press **Send test webhook**. Then check CRM → WhatsApp Clicks → "Website connection" line: it shows the last delivery and, if it was refused, why (for example "Signature does not match").

If the test click arrives but real clicks still do not, the plugin needs the change in section 3.

## 2. What the CRM accepts

- **URL:** `POST https://crm.safaeewala.com/api/webhook/whatsapp-clicks`
- **Headers:**
  - `Content-Type: application/json`
  - `X-WACT-Signature: sha256=<hex>`, where `<hex>` = HMAC-SHA256 of the **raw request body**, with the signing secret as key.
- **Body:** one click, or a batch of up to 500 clicks.
  - A batch is either `{ "clicks": [ … ] }` or a plain array `[ … ]`.
  - Use a batch to resend missed clicks. A click is stored once per `site.url` + `id`, so sending the same click again does not count it twice.

One click:

```json
{
  "id": 1234,
  "timestamp": "2026-11-18T09:15:00+04:00",
  "local_time": "2026-11-18 09:15:00",
  "site": { "name": "Safaeewala", "url": "https://safaeewala.com" },
  "page": { "url": "https://safaeewala.com/deep-cleaning-dubai/", "title": "Deep Cleaning Dubai" },
  "button": { "text": "WhatsApp Now", "location": "content" },
  "whatsapp": { "number": "9715XXXXXXXX", "message": "Hi, I'd like a cleaning quote." },
  "visitor": { "device": "mobile", "referrer": "https://google.com/", "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "deep-cleaning", "ip": "" }
}
```

**Answers:**

| Code | Meaning |
|---|---|
| `201` | Saved. The reply is `{ ok: true, id, saved: <count> }`. |
| `401` | Signature missing or wrong — the secret differs. |
| `503` | The secret is not set on the CRM server. |
| `400` | The body is not valid JSON. |
| `413` | The body is larger than 1 MB. |
| `502` | The CRM database did not save it. Send it again later. |

## 3. Plugin change (done: version 1.0.1, 20 Nov 2026)

The plugin is "WhatsApp Click Tracker" 1.0.0 (`whatsapp-click-tracker`). It already sends each click at the end of the visitor's request and retries every hour. The gap:

- The retry sent only clicks with status **failed**.
- Clicks saved while "Enable webhook delivery" was off got status **off**. Clicks whose send never ran stayed **pending**. Neither was ever sent.
- That is how the clicks of 17–19 Nov were missed.

Version 1.0.1 (zip: `Downloads\whatsapp-click-tracker-1.1.0.zip — 1.1.0 includes all of 1.0.1` on the owner's PC) changes three files:

- `includes/class-wact-db.php → failed_webhooks()`: also picks clicks with status **off**, and **pending** clicks older than 5 minutes (still at most 3 attempts each). The missed clicks are sent once delivery is on. The CRM stores each click once (`site.url` + `id`), so resending is safe.
- `whatsapp-click-tracker.php`: the retry job runs **every 5 minutes** (new schedule `wact_5min`), set up again on load, so no re-activation is needed. Version 1.0.1.
- `includes/class-wact-admin.php`: a **Send all missed clicks now** button under Settings & Webhook sends every click not yet received (any status except Sent, up to 500) at once. The click list also shows **Resend** on Off and Pending clicks, not only on Failed ones.
- 20 Nov check: the website still runs 1.0.0 (`readme.txt` Stable tag 1.0.0). The CRM has clicks 1–11 of 16 Nov and the new clicks 31–33; clicks 12–30 are still waiting in WordPress.

**Install:** WordPress → Plugins → Add New → Upload Plugin → choose the zip → **Replace current with uploaded**. Settings and clicks are kept. Then press **Send all missed clicks now** once.

WP-Cron only runs on site visits, and caching (e.g. WP Rocket) can stop it. A server cron on the hosting makes the 5-minute retry reliable: `*/5 * * * * wget -q -O - https://safaeewala.com/wp-cron.php?doing_wp_cron >/dev/null 2>&1`.

## 3b. Form Entries screen (version 1.1.0, 20 Nov 2026)

WordPress → WhatsApp Clicks → **Form Entries** shows the Fluent Forms submissions. It reads the Fluent Forms tables (`wp_fluentform_submissions`, `wp_fluentform_forms`) directly; nothing is copied. New file: `includes/class-wact-forms.php` (plus styles in `assets/css/admin.css`).

- **Cards:** Today, Yesterday, Last 7 days, Last 30 days, Unread, Starred. Click a card to filter by it. They follow the chosen form.
- **Chart:** entries per day for 14 days (click a day to see its entries). Beside it, entries per form and the top pages.
- **Filters:** form, dates (today, yesterday, 7 / 30 days, this month, last month, all, custom from–to), status (unread, read, starred, spam, trash), and search (name, phone, email, any answer, entry number).
- **Table:** entry number, date, form, name, phone (call or WhatsApp link), email, the first answers, and **View all** for every answer plus device and IP.
- **Actions:** mark read / unread, star, trash, restore, and **Open** in Fluent Forms. Bulk actions on ticked rows. Trash is the same trash as in Fluent Forms: nothing is deleted for good.
- **Export CSV (filtered):** the entries of the current filters, one column per question.

Tested on 20 Nov on a WordPress stand-in with 40 test entries (all filters, actions and the CSV). Not yet tested on the real site.

## 4. How to check it works

1. Click a WhatsApp button on the website.
2. Within a few seconds, CRM → WhatsApp Clicks shows it. The "Website connection" line says "last click received …" with the time. The screen refreshes every minute.
3. If the line says a delivery was **refused**, it gives the reason. Fix the setting it names (usually the secret).
