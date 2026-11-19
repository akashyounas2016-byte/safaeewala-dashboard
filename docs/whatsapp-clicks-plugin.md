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

## 3. Plugin change: send each click at once, retry what failed

Two parts:

- **Send at once.** Where the plugin stores a click (its AJAX / REST handler), send it straight away with a short timeout. A failure must not break the visitor's click.
- **Retry.** Keep a "delivered" flag per click, and resend undelivered clicks in batches every 5 minutes. This also brings the 20 clicks of 17–19 Nov into the CRM.

```php
// 1) Right after the click row is inserted ($click = the array above, $row_id = its DB id)
function wact_send_to_crm( array $payload ) {
    $opt    = get_option( 'wact_settings', [] );
    $url    = $opt['webhook_url'] ?? '';
    $secret = $opt['signing_secret'] ?? '';
    if ( empty( $opt['webhook_enabled'] ) || ! $url || ! $secret ) return false;
    $body = wp_json_encode( $payload );
    $res  = wp_remote_post( $url, [
        'timeout' => 5,
        'headers' => [
            'Content-Type'     => 'application/json',
            'X-WACT-Signature' => 'sha256=' . hash_hmac( 'sha256', $body, $secret ),
        ],
        'body'    => $body,
    ] );
    return ! is_wp_error( $res ) && (int) wp_remote_retrieve_response_code( $res ) === 201;
}
if ( wact_send_to_crm( $click ) ) {
    $wpdb->update( "{$wpdb->prefix}wact_clicks", [ 'delivered' => 1 ], [ 'id' => $row_id ] );
}

// 2) Retry undelivered clicks every 5 minutes (also sends the old ones once)
add_filter( 'cron_schedules', fn( $s ) => $s + [ 'wact_5min' => [ 'interval' => 300, 'display' => 'Every 5 minutes' ] ] );
if ( ! wp_next_scheduled( 'wact_resend' ) ) wp_schedule_event( time(), 'wact_5min', 'wact_resend' );
add_action( 'wact_resend', function () {
    global $wpdb;
    $rows = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}wact_clicks WHERE delivered = 0 ORDER BY id LIMIT 200", ARRAY_A );
    if ( ! $rows ) return;
    $clicks = array_map( 'wact_click_payload', $rows ); // builds the JSON shape above from a DB row
    if ( wact_send_to_crm( [ 'clicks' => $clicks ] ) ) {
        $ids = implode( ',', array_map( 'intval', array_column( $rows, 'id' ) ) );
        $wpdb->query( "UPDATE {$wpdb->prefix}wact_clicks SET delivered = 1 WHERE id IN ($ids)" );
    }
} );
```

Notes for the plugin developer:

- Table, option and function names (`wact_clicks`, `wact_settings`, `wact_click_payload`) are examples — use the plugin's own.
- The table needs a `delivered TINYINT DEFAULT 0` column. Mark the existing rows `0` once, so the old clicks are sent.
- WP-Cron only runs on page visits, and WP Rocket can stop it. Add a real server cron on the hosting: `*/5 * * * * wget -q -O - https://safaeewala.com/wp-cron.php?doing_wp_cron >/dev/null 2>&1`.
- Sign the **exact** string that is sent. Encoding the JSON again after signing breaks the signature (401).

## 4. How to check it works

1. Click a WhatsApp button on the website.
2. Within a few seconds, CRM → WhatsApp Clicks shows it. The "Website connection" line says "last click received …" with the time. The screen refreshes every minute.
3. If the line says a delivery was **refused**, it gives the reason. Fix the setting it names (usually the secret).
