# Full CRM audit — sync, security, backup & recovery, validation, screens, colours (2026-10-29)

> Scope: the whole dashboard on `claude/workspace` (after Daily Job Sheet phases 1–3), the VPS
> `webhookServer.cjs`, Supabase usage and the design system. Earlier audits are not repeated:
> [data-sync](2026-10-27-data-sync-audit.md) (AUD-01…23), [finance/ops screens](2026-10-27-finance-ops-screens-audit.md) (AUD-24…43),
> [Daily Job Sheet](2026-10-29-daily-job-sheet-audit.md) (AUD-44…58). All of those are fixed except AUD-45 (owner decision).
>
> New IDs: security **SEC-01…09**, data/sync **AUD-59…68**, validation **VAL-01…12**, screens **UX-41…60**, colours **CLR-01…08**.
> **Status 2026-10-30 (`claude/workspace`):** SEC-01, SEC-02, SEC-03, SEC-05 fixed in code (needs the owner setup in `docs/setup-auth.md`). New finding **AUD-69 🔴: the live Supabase project had no tables at all** — every record lived only in the browser that created it (no sharing between devices, no cloud copy); fixed by `2026-10-30_initial_schema_and_auth.sql`. Also fixed on `claude/workspace` (2026-10-30): **SEC-04** (sign-in for /api, webhook secret, CORS allow-list), **SEC-07** (print escaping), **BAK-5** (before-delete copies + restore), **VAL-01…04** (duplicate client/employee, UAE phone, Emirates ID), **AUD-64** (Analytics recurring revenue / collected — Antigravity had already replaced the fake arrays), **AUD-67** (Settings → Data health). Everything else below is still open. Severity: 🔴 fix before going live · 🟠 soon · 🟡 later.

---

## 0. Summary

| Area | Rating (0–10) | Main reason |
|---|---|---|
| Data sync & accuracy | **7** | Shared formulas, outbox, cloud state and Dubai dates are in place. Leads still live in two stores; clients are partly derived from job rows; no reconciliation report. |
| Security | **2** | Login is checked only in the browser; the password is shipped inside the JavaScript; the database is open to anyone holding the public key; VPS endpoints have no authentication and one allows writing files anywhere. |
| Backup | **3** | Only a manual Excel-to-Drive/VPS copy of one day. No full backup, no restore, no tested recovery. |
| Data-loss recovery | **4** | Outbox, Excel drafts and row history help for single edits; nothing restores a deleted day, a "Delete All" or a corrupted table. |
| Validation | **4** | Forms check required fields; row checks on the job sheet. No duplicate prevention for clients, employees, bookings or invoices; no database constraints. |
| Design consistency | **5** | Clean cards and spacing, but three different greens as "primary", 209 hard-coded hex colours, 6+ corner radii, design tokens used only 61 times. |

**Do first (before going live):** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, then BAK-1 (daily automatic backup) and VAL-01/02 (duplicate clients & employees).

---

## 1. Security (SEC)

### SEC-01 🔴 Login is only a browser flag; everyone becomes "admin"
- **Where:** `src/lib/simpleAuth.ts` (session = `safaeewala_auth_session` in localStorage), `App.tsx → AuthGuard`, `store/UserContext.tsx` (`DEFAULT_DEV_USER` role `admin` is the starting user for everyone).
- **Risk:** anyone can open the browser console, set one localStorage value and is "logged in". Roles (`employee`) never apply unless a Supabase profile exists, and the default is admin.
- **Fix:** use Supabase Auth (email + password or magic link) as the only login; read the role from `profiles`; start with **no** user (not admin) until the profile loads; remove `simpleAuth`.

### SEC-02 🔴 Admin username and password are inside the public JavaScript
- **Where:** `simpleAuth.ts` reads `VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD` with the fallback `admin / safaeewala2026` written in the code. Every `VITE_*` value is copied into the bundle that every visitor downloads. A changed password is saved in **plain text** in localStorage (`safaeewala_admin_custom_credentials`).
- **Fix:** delete these variables and the fallback; change the password now (it must be treated as public); SEC-01 replaces this login.

### SEC-03 🔴 The database is open to anyone with the public key
- **Where:** the browser talks to Supabase with the anon key (public by design). Migration `2026-10-27_phase2_sync.sql` gives `app_state` the policy `for all to anon … using (true)`. Other tables' policies are set in the Supabase dashboard and are not in the repo — the app works without a Supabase login, so they must also allow `anon`.
- **Risk:** anyone who opens the site can read, change or delete clients, employees (passport / Emirates ID data), invoices and job sheets with a few lines of code — no login needed.
- **Fix:** after SEC-01, change every policy to `to authenticated` (and role checks for deletes); put all RLS policies in a migration file so they are reviewed; never use `anon` for writes.

### SEC-04 🔴 VPS endpoints have no authentication
- **Where:** `webhookServer.cjs` — `GET /api/webhook/fluent-forms` returns **all leads** (names, phones, addresses) to anyone; `POST/PATCH/DELETE` change or delete leads; `POST /api/agencies` replaces the whole agency list; CORS `*`.
- **Fix:** shared secret header for the Fluent Forms webhook (`X-Webhook-Secret`), Supabase JWT check for everything the dashboard calls, CORS limited to the dashboard domain, rate limit.

### SEC-05 🔴 Backup endpoint can write any file on the server
- **Where:** `webhookServer.cjs:393-410` — `filename` from the request is joined to the backups folder without cleaning: `"../leads.json"` or `"../../app/…"` overwrites other files. No size limit on request bodies (`body += chunk`) — a large upload can exhaust memory.
- **Fix:** `path.basename(filename)` + allow only `.xlsx`; reject if the resolved path is outside `backups/`; limit body size (e.g. 10 MB); require auth (SEC-04).

### SEC-06 🟠 Secret API tokens would be shipped to the browser
- **Where:** code reads `VITE_WHATSAPP_TOKEN`, `VITE_STRIPE_PUBLISHABLE_KEY` (fine), GoHighLevel API key stored in localStorage (`safaeewala_ghl_config`, sent from the browser).
- **Fix:** WhatsApp / GHL calls go through the VPS (token in server env only); never put a secret in a `VITE_` variable.

### SEC-07 🟠 Print pages insert data without escaping (XSS)
- **Where:** `DailyJobSheet.tsx` print (`win.document.write`, ~line 1085: `${j.remarks}`, `${n.staff_name}` …) and `MonthlyClients.tsx:883`. Lead data comes from public web forms, so a lead with `<script>` in the address runs in the dashboard's origin when printed. `Invoices.tsx` already escapes (`escapeHtml`).
- **Fix:** move `escapeHtml` to `src/lib/` and use it in every print template.

### SEC-08 🟡 Localhost skips login entirely while using the live database
- `isLocalEnvironment()` disables login on localhost and `*.local`; combined with SEC-03 any local copy has full live access. Keep, but only after SEC-03 (RLS) so the database itself still demands a login.

### SEC-09 🟡 No audit of who deleted what (except job rows now)
- `logAudit` covers some deletes; job edits/deletes now logged (UX-40). Add it to clients, employees, invoices, payments, and to "Delete All".

---

## 2. Data synchronisation & reconciliation (AUD-59…68)

**Where data lives today**

| Store | Holds | Backed up? |
|---|---|---|
| Supabase tables | bookings, clients, employees, agencies, invoices, inventory, daily_jobs, daily_expenses, fluent_form_leads, company_settings, audit_log | Only by the Supabase plan (check plan) |
| Supabase `app_state` | payments, pending/received/advance items, adjustments, attendance overrides, contracts, cash handovers, budgets, POs, closed days … (cloud-synced keys) | same |
| VPS JSON files (`/data`) | `leads.json`, `agencies.json`, Excel backups | No (container volume only) |
| Browser localStorage | caches of all of the above + local-only data | No |

### AUD-59 🟠 Leads have two sources of truth
- `fluentFormsSync.ts` writes every lead to the VPS JSON **and** to Supabase `fluent_form_leads`; reads merge both. A failed write on one side leaves them different with no report.
- **Fix:** Supabase is the single store; the VPS webhook only inserts into Supabase; `leads.json` becomes a read-only archive.

### AUD-60 🟠 Agencies stored in Supabase and in `agencies.json`
- `POST /api/agencies` can replace the whole list. **Fix:** Supabase only; remove the JSON endpoints after migrating.

### AUD-61 🟠 Clients are partly derived from job-sheet addresses
- `extractAllClientsFromDailyJobs` builds client entries from job addresses; spelling differences ("Villa 12 JLT" / "villa 12, JLT") create separate clients and split balances.
- **Fix:** link each job to `client_id` when it is entered (ClientPicker / autocomplete exists now), keep the address match only for old rows, and offer a "merge clients" tool (VAL-02).

### AUD-62 🟠 Employees are partly derived from staff names on jobs
- Same pattern (`extractAllEmployeesFromDailyJobs`); unregistered names appear as staff. Row checks now flag them (UX-27); add "Register employee" from the flag.

### AUD-63 🟠 Local-only business data
- `safaeewala_review_requests` (Client Profile review requests) and `safaeewala_ghl_config` live only in one browser. **Fix:** add `review_requests` to the cloud-synced keys; GHL config to the server (SEC-06).

### AUD-64 🔴 Analytics screen shows invented numbers
- `BusinessAnalytics.tsx` (in the sidebar) uses hard-coded arrays (`monthlyData`, `revenueByService`, `teamPerformance`, "AED 8,500"). Violates R-DATA-03/R-DATA-04.
- **Fix:** build it from `dailyJobs`, `dailyExpenses`, invoices (same helpers as Overview), or hide it until then.

### AUD-65 🟡 Orphan screens with no data source
- `MarketingDashboard`, `CustomerFeedback`, `WhatsAppCRM`, `RecurringSubscriptions` have routes but no sidebar entry and do not read the store. Decide: wire up or remove.

### AUD-66 🟡 "Overview" is tagged "Coming Soon" in the sidebar
- It is the main live dashboard (`Sidebar.tsx:28`). Remove the tag.

### AUD-67 🟠 No reconciliation report
- **Fix:** a Settings → "Data health" page that runs these checks and shows counts with links:
  1. jobs without a matching client / employee;
  2. clients with the same phone or name+building (duplicates);
  3. invoices whose `job_ids` point to deleted jobs; payments without an invoice/client;
  4. outbox entries older than 1 hour; cloud-state keys not pushed;
  5. leads present in only one store (AUD-59) until it is fixed;
  6. daily totals: sum of job `received` vs cash book per day.

### AUD-68 🟡 Totals cached for reports may go stale
- `safaeewala_cached_reports` — recompute on open or show "as of".

---

## 3. Backup strategy (rating 3/10) and recovery design

### Today
- Manual "Send to Google Drive" / VPS copy of **one day's** Excel sheet.
- Supabase backups depend on the plan (paid plans keep daily backups for a limited number of days; the free plan gives no backup you can download and restore yourself). Check the plan under Supabase → Database → Backups.
- Nothing covers `app_state`, VPS JSON files or settings in one place. No restore was ever tested.

### Recommended (3-2-1: 3 copies, 2 places, 1 off-site)

| ID | What | How | When |
|---|---|---|---|
| BAK-1 🔴 | Full database dump | VPS cron: `pg_dump` of the Supabase database (connection string in server env) → gzip → `/data/backups/db/YYYY-MM-DD.sql.gz` | daily 03:00 Dubai |
| BAK-2 🔴 | Off-site copy | same file uploaded to Google Drive (service account) or S3/Backblaze | daily, after BAK-1 |
| BAK-3 🟠 | Keep history | keep 14 daily, 8 weekly, 12 monthly | automatic clean-up |
| BAK-4 🟠 | In-app export | Settings → "Download full backup" (JSON of every table + `app_state`), owner only | on demand, before big imports / Delete All |
| BAK-5 🟠 | Automatic backup before destructive actions | "Delete All Data", day re-import and agency delete first save a JSON snapshot of what they remove (`deleted_snapshots` table or file) | every time |
| BAK-6 🟡 | Point-in-time recovery | Supabase Pro PITR add-on if budget allows | — |
| BAK-7 🟠 | Backup health | Settings shows "last backup: …, size …"; alert if older than 36 h | daily check |

### Recovery process (data-loss runbook)

1. **Stop the damage** — tell staff to stop editing; note the time it happened (Dubai time).
2. **Find what was lost** — Settings → Audit log / Row history (who, what, when); Data health page counts.
3. **Choose the source:**
   - one row or a few edits → Row history (UX-40) shows the old values; re-enter or "restore row" (future button);
   - a day → the deleted-snapshot from BAK-5, or that day's Excel backup on Drive/VPS → Import (preview shows what will be replaced);
   - a whole table / Delete All → last nightly dump (BAK-1) restored into a **separate** Supabase project first, then copy back only the missing rows;
   - unsynced browser changes → the outbox (`safaeewala_sync_outbox`) and Excel drafts are still in that browser — do not clear site data.
4. **Verify** — Data health page totals match the expected numbers; spot-check 3 clients' balances.
5. **Record** — add a line to `docs/decisions.md` / incident note: cause, data lost, how restored, prevention.
6. **Test the restore every month** (restore last dump into a test project and open the dashboard on it).

---

## 4. Validation rules & error alerts (VAL)

Rules run in the form (instant message) **and** in the database (constraint) so imports and other screens cannot bypass them.

| ID | Rule | Form message | Database |
|---|---|---|---|
| VAL-01 🔴 | Employee unique by Emirates ID, passport no., or phone | "Already registered as {name} — open profile?" | unique index on normalised `emirates_id`, `passport_no` (where not null) |
| VAL-02 🔴 | Client duplicate: same phone, or same name + building | "Looks like {client} — use existing / create anyway" | unique index on normalised phone (where not null) |
| VAL-03 🟠 | UAE phone format `+971 5X XXX XXXX` (accept 05…, 971…, normalise) | "Enter a UAE mobile like 050 123 4567" | check constraint on stored E.164 |
| VAL-04 🟠 | Emirates ID `784-YYYY-NNNNNNN-N` | "Emirates ID has 15 digits starting 784" | check constraint |
| VAL-05 🟠 | Email format; lower-case stored | "Check the email" | — |
| VAL-06 🟠 | Booking: no double-booking of a cleaner (overlapping time on the same date) | "Rupa already has 09:00–13:00 at Villa 4" | — (app check, warn only) |
| VAL-07 🟠 | Job: end after start, hours ≤ 16, charges ≥ 0, received ≤ charges unless marked advance | row check chips (UX-27) + block on save for negatives | check `charges >= 0`, `received >= 0`, `duty_hours between 0 and 24` |
| VAL-08 🟠 | Invoice number unique (SAF-YYYY-NNNN) | — | unique index on `invoice_number` |
| VAL-09 🟠 | Payment amount > 0 and ≤ open balance (else confirm "overpayment → advance?") | inline | check `amount > 0` |
| VAL-10 🟡 | Document dates: issue ≤ expiry (R-AGN-05 done for agencies) — same for employees | inline | check constraint |
| VAL-11 🟡 | Lead duplicate: same phone within 30 days → merge into existing lead | badge "duplicate" (exists for display) | unique (phone, form, day) |
| VAL-12 🟡 | Import: reject rows with unknown payment mode / material; preview lists them | preview (UX-28) red rows | enum check |

**Error alerts (one pattern everywhere):** field message under the input (red, plain words, what to do); toast for save results; amber banner for data that needs attention (row checks, hidden rows, unsynced changes); the **Data health** page (AUD-67) as the daily checklist; optional daily WhatsApp/email summary to the owner of: unsynced changes, backup age, duplicates found, expired documents.

---

## 5. Screen-by-screen (UX-41…60)

| Screen | Data accuracy | Functionality | Design | Suggestions |
|---|---|---|---|---|
| **Overview** | ✅ shared helpers, KPI tooltips | ✅ | good | UX-41 remove "Coming Soon" tag (AUD-66); UX-42 add "Data health" and "last backup" tiles |
| **Bookings** | ✅ IDs ↔ names fixed | ✅ redesign done | good | UX-43 double-booking warning (VAL-06); UX-44 recurring booking → link to Monthly Clients |
| **Daily Job Sheet / Excel** | ✅ after phases 1–3 | ✅ | dense but clear | UX-45 split the remaining table/widgets into components (UX-31 rest); UX-46 apply the closed-day lock in Excel mode too |
| **Fluent Forms (Leads)** | 🟠 two stores (AUD-59) | ✅ pipeline, duplicates | indigo theme differs from rest (CLR-03) | UX-47 "Convert to booking" pre-fills client + service; UX-48 response-time SLA alert |
| **Clients / Client Profile** | 🟠 derived clients (AUD-61) | ✅ ledger | dark navy hero `#070d1e` unlike other pages | UX-49 merge-duplicates tool; UX-50 client statement PDF from profile |
| **Monthly Clients** | ✅ R-SCHED rules | ✅ | emerald + teal mixed 147/123 | UX-51 contract renewal reminder 30 days before end |
| **Employees / Profile** | ✅ health score, docs | ✅ | amber hero on list, dark teal on profile | UX-52 document expiry calendar view; VAL-01 |
| **Attendance** | ✅ R-ATT rules | ✅ calendar, export | good | UX-53 bulk "mark leave" for a date range |
| **Agencies / Profile** | ✅ | ✅ | teal-heavy (205 teal uses) | UX-54 agency statement (staff × hours × rate) export |
| **Invoices / Monthly Invoices** | ✅ part payments | ✅ | purple accents only here | UX-55 send by WhatsApp/email with PDF link |
| **Payments / Pending** | ✅ one collection routine | ✅ receivables module | red-dominant Pending page feels alarming | UX-56 tone down: red only for overdue > 60 days |
| **Expenses** | ✅ budgets, receipts | ✅ | red hero (`from-red-50`) — spending ≠ error | UX-57 neutral hero, red only for over-budget |
| **Inventory** | ✅ ledger, POs | ✅ | ok | UX-58 low-stock alert into the notification bell |
| **Reports** | ✅ | export | ok | UX-59 monthly P&L PDF for the owner |
| **Analytics** | 🔴 fake data (AUD-64) | — | blue/purple, off-brand | rebuild or hide |
| **Settings** | ✅ | many sections | long single page | UX-60 tabs: Company · Users & roles · Backup · Data health · Integrations · Audit log |

---

## 6. Colour & design audit (CLR)

### What is inconsistent (measured)
- **Three different "brand greens" in use:** emerald (`#059669`, `#047857`, `#065f46` = the `accent` token), Tailwind teal (`#0d9488`, `teal-600/700`) and a custom `#0d8a72`. Primary buttons are `bg-emerald-600`, `bg-emerald-700`, `bg-teal-600`, `bg-teal-700` or `bg-amber-600` depending on the page.
- **Token naming is misleading:** `--color-teal` is actually emerald `#059669`, while real Tailwind `teal-*` is used 600+ times.
- **209 distinct hex colours** in components; design tokens (`bg-accent`, `text-ink`, …) used only **61** times; `#E4E8EC` hard-coded 622 times instead of `border-line`.
- **Each screen has its own hero colour:** emerald-50, teal-50, amber-400 (Employees), indigo-500 (Leads), red-50 (Expenses), blue-500 (Analytics), dark navy `#070d1e` (Client Profile), dark teal `#021f24` (Employee Profile), emerald-600 (WhatsApp).
- **Accent families per page:** up to 12 (Clients, Expenses) and 16 (Excel). Purple appears only on invoices/analytics/marketing.
- **Corner radius:** `rounded-lg`, `xl`, `2xl`, `3xl`, `[16px]`, `[18px]`, `[20px]`, `[22px]`, `[24px]`, `[26px]`, `[28px]`.
- **Status colour meaning differs:** red used for expenses (normal spending), pending (normal receivable) and errors; sky for "available" vs blue for "online payment".

### Recommended hierarchy (one system)

| Role | Token | Value | Use |
|---|---|---|---|
| Brand primary | `accent` | emerald-700 `#047857` | primary buttons, active nav, links, focus ring |
| Brand primary hover | `accent-bright` | emerald-600 `#059669` | hover only |
| Brand dark | `accent-deep` | `#064e3b` | sidebar / one hero style |
| Brand soft | `accent-soft` | emerald-50/100 | selected rows, chips |
| Neutral text | `ink`, `ink-soft`, `ink-mute` | slate-900 / 700 / 500 | all text |
| Lines & surfaces | `line`, `canvas`, `elevated` | `#E4E8EC`, `#f0f4f3`, white | borders, page, cards |
| Success | `success` | emerald-600 | paid, present, saved |
| Warning | `warning` | amber-600 / amber-50 | pending, checks, expiring soon |
| Danger | `danger` | rose-600 / rose-50 | overdue, absent, delete, errors **only** |
| Info | `info` | sky-600 / sky-50 | available, online payment, notices |
| Data-viz only | `chart-1…6` | fixed categorical palette | charts and per-cleaner colours, never UI chrome |

- **CLR-01 🟠** Retire Tailwind `teal-*` and `#0d8a72` in UI chrome → `accent` tokens; rename `--color-teal*` to `--color-success*`.
- **CLR-02 🟠** One hero style for every list page (white card, `accent-soft` icon tile, title + subtitle) and one dark style for profile headers (`accent-deep`); remove amber/indigo/red/blue/navy heroes.
- **CLR-03 🟠** Status colours carry meaning only: red never decorates (Expenses, Pending pages), purple removed except charts.
- **CLR-04 🟠** Replace hard-coded hex with tokens (`#E4E8EC` → `border-line`, `#111827` → `text-ink`, `#f8fafc` → `bg-line-soft`) — a mechanical codemod.
- **CLR-05 🟡** Radius scale: `rounded-lg` (inputs, chips), `rounded-xl` (buttons), `rounded-2xl` (cards), `rounded-3xl` (modals/heroes). Remove arbitrary `[16-28px]`.
- **CLR-06 🟡** Buttons only through `<Button variant>`; add `success`, `warning` variants; ban raw `bg-emerald-600` buttons via lint rule.
- **CLR-07 🟡** Cleaner colour palettes in the job sheet / Excel stay, but drawn from the `chart-*` palette (checked for contrast) — currently 125 hex values in `JobSheetSpreadsheet.tsx`.
- **CLR-08 🟡** Contrast check: white text on `emerald-500`/`amber-400` badges fails WCAG AA — use 600+ shades for filled badges.

---

## 7. Suggested order

| Phase | Items |
|---|---|
| A — before live (security) | SEC-01, SEC-02 (change password today), SEC-03, SEC-04, SEC-05, SEC-07 |
| B — never lose data | BAK-1, BAK-2, BAK-4, BAK-5, BAK-7, recovery runbook test |
| C — clean data | VAL-01, VAL-02, VAL-03, VAL-07, VAL-08, AUD-59, AUD-60, AUD-64, AUD-67 (Data health) |
| D — one look | CLR-01 … CLR-04, then CLR-05 … CLR-08 |
| E — screen polish | UX-41 … UX-60, AUD-61 … AUD-63, AUD-65, AUD-66, AUD-68, SEC-06, SEC-08, SEC-09 |
