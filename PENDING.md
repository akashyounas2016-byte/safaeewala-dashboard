# Safaeewala CRM — Pending List

One list of what is still open, for the owner, Claude and Antigravity. **Update it in the same commit** whenever something is finished (remove it) or added. Finished items go to [CHANGELOG.md](CHANGELOG.md), not here.

Last updated: 2026-11-26 · Live on crm.safaeewala.com: `a90a3af` (26 Nov: standard invoice pop-up R-FIN-25..27, map R-OPS-25, folded widgets R-OPS-26, R-CLI-18, R-FIN-24) · Test APK: GitHub Releases `android-test-3` · 2026-11-15: all 174 test-period jobs deleted on owner's request ; duplicate "Villa# 06 - Zayan" + TEST clients (TEST Villa, Test 2- NH bldg, ABC Test 1) deleted with their contracts (backups in ../Safaeewala-backups)

---

## A. Owner actions (keys, settings, data)

Never paste keys or tokens in chat — put them in `/var/www/safaeewala/.env` on the VPS yourself.

| # | What | Why it matters | Where |
|---|---|---|---|
| A1 | **Fluent Forms webhook secret** — set `FLUENT_WEBHOOK_SECRET` in the VPS `.env` and add it (https URL + `?secret=` or header `X-Webhook-Secret`) on every Fluent form | Until then anyone can post fake leads to the CRM. **Do this before go-live.** | `webhookServer.cjs` (SEC-04), [docs/setup-auth.md](docs/setup-auth.md) |
| A4 | **WhatsApp (Meta Cloud API)** — five `WHATSAPP_*` keys in the VPS `.env`, Meta webhook, then a test message | WhatsApp send / receive has never been tested. Facebook + Instagram (via GHL) already work. | [prod.md §8](prod.md) |
| A5 | **GHL key: Social Planner scopes** | Needed for social posting from the CRM | GHL → Settings → Private Integrations |
| A6 | **AI Bot** — set `ANTHROPIC_API_KEY` on the VPS | Until then `/ai-bot` answers from rules only (no AI chat) | [prod.md](prod.md) |
| A7 | **Google review link** in Settings | Review-request messages need it | Settings |
| A15 | **Settings → Backup → This computer → Choose folder** on the office computer (Chrome / Edge), then "Allow on every visit" | Daily copy of all data on that computer, 30 days kept | Settings → Backup |
| A11 | **Check today's new screens on the live site** (Excel sheet, Add Job, Employee popup, Agency popup) | Built and tested in code, not yet clicked through in a browser | crm.safaeewala.com |
| A21 | ~~WhatsApp Clicks from the website~~ — done 2026-11-17: secret on the VPS, table made, clicks arriving | — | — |
| A22 | ~~Edit / delete WhatsApp clicks migration~~ — owner ran it 2026-11-17 | — | — |
| A27 | **Two cleaners look the same on the sheet:** "Ambika" (added 17 Nov) and "Ambika Devi Tharu" (short name "Ambika") both show as **Ambika**. If they are one person, delete the extra employee; if two, give one a different short name (Employees → Edit) | The team may book the wrong Ambika | Owner (confirming with the client) |
| A37 | **64 jobs with AED 0 charges and nothing received** — mostly Bi-Weekly visits without a rate: 306 Bldg 8B (24), Villa 13B St 57 (13), Villa 24 St 75 A (9), Villa 87b St 63d (8), 105 P1 Bldg (5). Enter the charges, and set Charges / Hr in each client's schedule (R-SCHED-27). Settings → Data health now lists them (R-OPS-11) | Billed and pending look too low | Team |
| A46 | **Run `supabase/migrations/2026-11-26_job_proofs.sql`** (Supabase → SQL Editor → paste → Run) — makes the private bucket for job photos and client signatures (R-APP-04). Until then the app's photo / signature say "not saved" (the job step itself is saved) | Proof photos not saved | Owner |
| A45 | **App signing key → GitHub secrets** (one time, 2 min): open `Safaeewala-backups/android-signing/GITHUB-SECRETS (keep private).txt`; GitHub → safaeewala-dashboard → Settings → Secrets and variables → Actions → New repository secret: `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEYSTORE_B64` (copy from the file). Then tell Claude to build — after that new app versions install over the old one (R-APP-02) | Each test build needs the old app removed first | Owner |
| A44 | **Test app (R-APP-01):** started 25 Nov (Capacitor, APK on GitHub Releases after the push). Owner: install on a phone and try Share my location with the screen off. Later: push notifications (a free Firebase project from the owner), a fixed signing key (so updates install over the old app), own app icon, offline step queue | Background location only in the app | Owner |
| A40 | **Live map needs staff to share:** each cleaner / driver / CSR needs a login linked to their employee record (Settings → Users; now only 2), then opens My Duties on the phone and presses **Share my location** at shift start (R-OPS-14). All-day tracking with the page closed needs the Android app | Live map stays empty | Owner / Team |
| A38 | **Villa 87b St 63d: AED 540 Pending Received (1 Oct) with nothing pending** — now counted as advance. If it was not a real payment, delete it in the Pending Received widget (the 3 test jobs were deleted 22 Nov) | Advance AED 580 may be wrong | Team |

---

## B. Code / design work (Claude or Antigravity)

### B1. Corner radii & spacing on all screens (CLR-04)
- **Done:** `src/pages/Expenses.tsx` is the specimen page.
- **Scale:**

| Tier | Radius | Class | Covers |
|---|---|---|---|
| 1 Outer surfaces | 24px | `rounded-[24px]` | PageHero, table containers, toolbars, filter bars, sidebar cards |
| 2 Inner cards & modals | 16px | `rounded-2xl` | KPI cards, date panels, sub-widgets, dropdown menus, dialogs |
| 3 Controls & inputs | 12px | `rounded-xl` | Buttons, preset pills, search inputs, selects, form inputs, KPI icon boxes |
| 4 Badges & pills | full | `rounded-full` | Count badges, status pills, tags, progress bars, dots |
| 5 Compact table actions | 8px | `rounded-lg` | Row edit / delete icons, calendar arrows |

- **Screens still to do:** Bookings · Clients · Employees · PendingPayments · MonthlyClients · DailyJobSheet · Overview · BusinessAnalytics · Invoices + MonthlyInvoices · PaymentProcessing · Inventory · Agencies · FluentFormsLeads · CustomerFeedback · WhatsAppCRM · MarketingDashboard · Settings

### B2. Advance auto-deduction — remaining cases (R-FIN-10)
- Jobs typed straight into the Excel grid are not paid from advance automatically (only Add Job is).
- A partly covering advance is shown, not deducted.

### B3. AI Bot with Claude (after A6)
- Server route (e.g. `/api/ai/chat` in `webhookServer.cjs`) + the "Ask the CRM" panel in `src/pages/AIBot.tsx`; bookings only after the user clicks Confirm.

### B4. Security header
- The Content-Security-Policy is still `Report-Only`. Since 2026-11-16 the browsers' reports are collected: Settings → Data health → *Security header (report only)*. After about a week, add any needed source to `nginx.conf` and rename the header to `Content-Security-Policy` to enforce it.

### B5. Lint warnings
- ~800 ESLint warnings (mostly `any` types). No errors; clean up gradually when a file is touched.


### B6. Contracts and money data in real tables (audit 2026-11-15)
- **Done 2026-11-16 (R-SYNC-19):** deletions leave shared delete markers, so a deleted item no longer comes back from another computer.
- **Still open (optional, larger):** these lists are one JSON value each in `app_state` (no per-row history, whole list sent on each change). Move contracts and money lists to their own tables when the data grows.

### B7. Load only recent jobs at start-up
- The whole Job Sheet is loaded into the browser. Fine now (empty after the 2026-11-15 wipe); after a year (15–20k rows) start-up will be slow on phones. Load the last 2–3 months, older months on demand (reports, client history).

### B8. Browser tests of the main flows
- All 1,244 checks run in code; none clicks the real screens. Add Playwright tests for: add monthly client → visit on the sheet → edit / move → payment; Add Job; booking → job → complete. Needs a TEST database or TEST records (localhost uses live data) — owner to decide.

### B9. One logic for the two job sheets
- Daily Job Sheet (4.5k lines) and Excel Job Sheet (5.7k lines) repeat the same work, so every fix is needed twice. Move the shared logic to `src/lib/` step by step; later decide if one sheet is enough.

---

## C. Later / decided

- **Android app** — at the end, after the web CRM is stable (owner, 2026-11-06).
- **Not wanted:** Supabase Pro (nightly VPS backup instead), OCR of documents (owner, 2026-11-06).
- **Keep:** "Delete All Data" on the Daily Job Sheet is intentional (AUD-45). The TEST-AUDIT login stays.
- **Testing:** localhost uses live data — test only with `TEST …` records (K-01, [prod.md §5](prod.md)).
