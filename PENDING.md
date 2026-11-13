# Safaeewala CRM — Pending List

One list of what is still open, for the owner, Claude and Antigravity. **Update it in the same commit** whenever something is finished (remove it) or added. Finished items go to [CHANGELOG.md](CHANGELOG.md), not here.

Last updated: 2026-11-13 · Live on crm.safaeewala.com: `586adfb`

---

## A. Owner actions (keys, settings, data)

Never paste keys or tokens in chat — put them in `/var/www/safaeewala/.env` on the VPS yourself.

| # | What | Why it matters | Where |
|---|---|---|---|
| A1 | **Fluent Forms webhook secret** — set `FLUENT_WEBHOOK_SECRET` in the VPS `.env` and add it (https URL + `?secret=` or header `X-Webhook-Secret`) on every Fluent form | Until then anyone can post fake leads to the CRM. **Do this before go-live.** | `webhookServer.cjs` (SEC-04), [docs/setup-auth.md](docs/setup-auth.md) |
| A2 | **Google Drive copy of the nightly backup** (rclone + `BACKUP_RCLONE_REMOTE`, Google login) | Today the backup is only on the VPS — if the VPS is lost, so is the backup. Owner: do it at the end of the project. | [prod.md §7](prod.md) |
| A3 | **Storage (documents / images) backup on the VPS** — install needs the owner's OK ("Backup VPS par laga do") | Employee and agency documents are not in the nightly DB backup yet | [prod.md §7](prod.md) |
| A4 | **WhatsApp (Meta Cloud API)** — five `WHATSAPP_*` keys in the VPS `.env`, Meta webhook, then a test message | WhatsApp send / receive has never been tested. Facebook + Instagram (via GHL) already work. | [prod.md §8](prod.md) |
| A5 | **GHL key: Social Planner scopes** | Needed for social posting from the CRM | GHL → Settings → Private Integrations |
| A6 | **AI Bot** — set `ANTHROPIC_API_KEY` on the VPS | Until then `/ai-bot` answers from rules only (no AI chat) | [prod.md](prod.md) |
| A7 | **Google review link** in Settings | Review-request messages need it | Settings |
| A9 | **Re-enter the employee field values lost earlier** (Misbah's Work Permit year is fixed — 2027, checked 2026-11-13) | Empty profiles | Employees → Edit |
| A15 | **Settings → Backup → This computer → Choose folder** on the office computer (Chrome / Edge), then "Allow on every visit" | Daily copy of all data on that computer, 30 days kept | Settings → Backup |
| A16 | **"Test 2- NH bldg": open it and press Save Changes** (nothing to change) | Removes its visit on 28 Dec 2027, outside the contract (R-SCHED-13) | Monthly Clients |
| A11 | **Check today's new screens on the live site** (Excel sheet, Add Job, Employee popup, Agency popup) | Built and tested in code, not yet clicked through in a browser | crm.safaeewala.com |

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
- The Content-Security-Policy is still `Report-Only` (reports, does not block). Switch it to enforcing once no reports show up.

### B5. Lint warnings
- ~800 ESLint warnings (mostly `any` types). No errors; clean up gradually when a file is touched.

---

## C. Later / decided

- **Android app** — at the end, after the web CRM is stable (owner, 2026-11-06).
- **Not wanted:** Supabase Pro (nightly VPS backup instead), OCR of documents (owner, 2026-11-06).
- **Keep:** "Delete All Data" on the Daily Job Sheet is intentional (AUD-45). The TEST-AUDIT login stays.
- **Testing:** localhost uses live data — test only with `TEST …` records (K-01, [prod.md §5](prod.md)).
