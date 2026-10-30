# Technical audit — architecture, code quality, scalability, security, validation, error handling (2026-10-31)

> Scope: whole repo on `claude/workspace` (= `main` + unmerged Claude commits), measured with tools,
> not estimated. Earlier audits: data-sync, finance/ops, Daily Job Sheet, full CRM (SEC/VAL/BAK/CLR).
> New IDs: **TA-01…TA-24**. 🔴 fix before going live · 🟠 soon · 🟡 later.

## Status (2026-11-01, `claude/workspace`)

| Item | Status |
|---|---|
| TA-06 hooks crash in the booking popup | ✅ fixed (wrapper + key) |
| TA-07 lint gate | ✅ errors 614 → 0 (bug rules stay errors, clean-up rules are warnings); deploy stops on errors |
| TA-08 tests in the repo | ✅ `npm test` — 15 files, 190+ checks; `npm run check` in the deploy |
| TA-04 duplicated `cleanNum` | ✅ one shared function |
| TA-05 / TA-22 dead services & missing endpoints | ✅ 7 unused files removed |
| TA-13 bundle | ✅ first load ~1.4 MB → ~0.68 MB (xlsx and charts load on demand) |
| TA-16 security headers | ✅ on the HTML too, HSTS, Permissions-Policy, CSP report-only (nginx config not syntax-checked locally — run `nginx -t` on deploy) |
| TA-17 deploy host key | ✅ pinned with the `VPS_KNOWN_HOSTS` secret when set |
| TA-18 browser secrets | ✅ GHL key moved to the server; WhatsApp help text fixed |
| TA-19 shared validation | ✅ zod rules; import preview skips rows that break them |
| TA-20 database rules | ✅ migration `2026-11-01_data_constraints.sql` (owner runs it) |
| TA-21 silent failures | ✅ full browser storage shown in a red banner and reported |
| TA-23 error boundaries | ✅ already per page (audit was wrong); crashes now reported |
| TA-24 error monitoring | ✅ own error log on the VPS, shown in Settings → Data health |
| TA-15 login live | ⏳ owner setup steps 2–5, then merge |
| TA-02 / TA-03 one store, tables instead of JSON blobs | ⏳ needs the login setup first (data must reach Supabase), then a migration of payments / pending / advances / driver plans into tables |
| TA-11 / TA-12 load window + SQL totals | ⏳ client balances and reports read the full history; needs SQL views first — a planned piece of work, not a quick fix |
| TA-01 / TA-09 split the store and the 3,500-line pages | ⏳ large refactor of files Antigravity is editing — best done in a quiet window, one page at a time |
| TA-10 colours | ⏳ CLR-01…08, same reason |
| TA-14 | no action needed |

## 0. Scorecard

| Area | Score /10 | One line |
|---|---|---|
| Architecture | 5 | Clear layers on paper (pages → store → lib), but one 1,000-line store loads every table into the browser and four storage places hold data. |
| Code quality & maintainability | 4 | 69k lines; 5 page files over 3,500 lines; 644 lint problems; 158 `any`; no automated tests in the repo. |
| Scalability | 4 | Fine for today's size; every record of every table is downloaded on start and kept in memory + localStorage (5 MB limit). |
| Security | 3 now → 7 after setup | Login, RLS and API protection are built (Claude branch) but not live until the owner setup is done. |
| Data validation | 5 | Duplicate / format rules for people, row checks, import preview — but forms do not share one schema; zod and react-hook-form are installed and unused. |
| Error handling | 5 | Outbox, cloud-state retry, error boundary, toasts — but 24 silent `catch {}`, and the app calls 5 server endpoints that do not exist. |

**Recommendation (question asked): keep the Drivers module inside this CRM, on the same domain and database.** See §7.

---

## 1. Architecture

**What it is:** React 19 + Vite SPA served by nginx in one Docker container, plus a small Node server (`webhookServer.cjs`) in the same container for webhooks, agencies, backups and user admin. Data in Supabase (Postgres + Auth), cached in localStorage.

| ID | Finding | Fix |
|---|---|---|
| TA-01 🟠 | **One global store** (`DataContext.tsx`, 1,043 lines) owns 9 entities, loading, caching, outbox calls, audit logging and business rules (booking → job sync, agency → staff delete). Every change re-renders every consumer (one `value={store}` object). | Split by domain (`useJobs`, `useClients`, `usePeople`, `useFinance`) or move server state to TanStack Query; keep business rules in `src/lib`. |
| TA-02 🟠 | **Four places hold data:** Supabase tables, Supabase `app_state` (JSON blobs per key), VPS JSON files (`leads.json`, `agencies.json`), browser localStorage (58 keys). | Supabase only; turn `app_state` blobs that grow (payments, pending items, driver plans) into tables; retire the JSON files (AUD-59/60). |
| TA-03 🟠 | **Business data in JSON blobs** (`app_state`): payments, pending/received/advance items, attendance overrides, driver plans. Last write wins for the whole list; two people editing the same list at once can overwrite each other. | Real tables with one row per item (`payments`, `pending_items`, …) — the existing `mergeValues` softens but does not remove the risk. |
| TA-04 🟡 | `src/lib` is good (43 files, pure helpers, shared formulas) but some rules are still copied: `cleanNum` is defined in **5** files. | One `cleanNum` in `jobSheetUtils`; lint rule against re-definitions. |
| TA-05 🟡 | Dead or orphan code: `stripeService`, `emailService`, `smtpEmailService`, `errorLogger` call `/api/payments…`, `/api/send-email`, `/api/logs/errors` which the server does not have; pages `MarketingDashboard`, `CustomerFeedback`, `WhatsAppCRM` are routed but not in the menu. | Delete or implement; keep the server's endpoint list and the app's calls in one typed client (`src/lib/api.ts`). |

## 2. Code quality & maintainability

Measured: 135 source files, **69,245 lines**. Largest: MonthlyClients 3,785 · AgencyDashboard 3,718 · JobSheetSpreadsheet 3,701 · Bookings 3,618 · DailyJobSheet 3,608 · Agencies 2,865.

| ID | Finding | Fix |
|---|---|---|
| TA-06 🔴 | **React hooks called after an early return** in the booking detail popup (`Bookings.tsx:2890` — `if (!booking) return null` before `useData`, `useMemo`, 15 × `useState`, `useEffect`). When the popup's booking changes between empty and set, React throws "Rendered more hooks than during the previous render" and the screen crashes. | Move the `return null` below the hooks, or render the popup only when `booking` exists (`{booking && <Popup booking={booking} />}`). (Antigravity's file — not changed by Claude.) |
| TA-07 🟠 | **644 lint problems** (614 errors) in 50 files: unused code 286, `any` 198, effects that set state 27, missing effect dependencies 28, empty blocks 24. CI does not run lint. | Fix per file when touched; add `npm run lint` + `tsc` to the deploy workflow so new problems cannot be merged. |
| TA-08 🟠 | **No automated tests in the repo.** Claude's checks (≈150 cases: formulas, sync outbox, import, validation, permissions, server endpoints) live in a scratch folder. | Add Vitest; move those tests into `src/**/*.test.ts` and `server/*.test.mjs`; run them in CI. |
| TA-09 🟠 | **Giant page files** mix data shaping, business rules, UI and print templates (each 3,500+ lines). Hard to review, two agents edit the same file → merge conflicts. | Split each page into `components/<page>/…` (table, toolbar, modals, print) and `lib/<page>.ts` (pure logic) — started for the job sheet (import, row checks). |
| TA-10 🟡 | Three styling systems in parallel (Tailwind tokens, raw hex — 209 colours, inline styles in print templates). | CLR-01…08 in the CRM audit. |

## 3. Scalability

| ID | Finding | Fix |
|---|---|---|
| TA-11 🟠 | **Everything is downloaded on start** (all bookings, clients, employees, invoices, inventory, every daily job ever, paged 1,000 at a time) and kept in memory and localStorage. At ~200 jobs/day that is ~70k job rows a year — slow first load on phones and over the 5 MB localStorage limit (writes then fail silently, see TA-19). | Load a window (e.g. last 90 days of jobs) + on-demand history; server-side totals (SQL views / RPC) for reports; IndexedDB instead of localStorage for the offline cache. |
| TA-12 🟠 | Totals and reports are computed in the browser over the full lists (Overview, Pending, Analytics). | Postgres views: daily totals, client balances, receivables ageing. |
| TA-13 🟡 | Bundle: xlsx 411 KB, charts 381 KB, React 215 KB, Supabase 194 KB, DailyJobSheet chunk 177 KB (gzip ~⅓). OK on Wi-Fi, heavy on mobile data for drivers. | Load `xlsx` only when exporting/importing (dynamic import); keep My Duties free of chart/xlsx code. |
| TA-14 🟡 | Single container, single Node process, JSON files on a volume. Fine for one company; no horizontal scaling needed now. | When moving off JSON files, the Node server becomes stateless and can restart freely. |

## 4. Security

Already covered in detail by the CRM audit (SEC-01…09). Status: **SEC-01/02/03/04/05/07 built on `claude/workspace`, live only after the owner setup** (`docs/setup-auth.md`). Additional findings:

| ID | Finding | Fix |
|---|---|---|
| TA-15 🔴 | Until the setup is done, production still uses the old browser-only login with the default password in the JavaScript, and the database answers anyone with the public key — **the most important open risk**. | Finish setup steps 2–5, then merge + deploy the Claude branch. |
| TA-16 🟠 | No Content-Security-Policy or HSTS header (nginx has nosniff, frame, referrer). | Add `Strict-Transport-Security` and a CSP allowing self, Supabase, Google Fonts, OpenStreetMap / Google Maps frames. |
| TA-17 🟠 | Deploy uses `StrictHostKeyChecking=no` (accepts any server key — open to man-in-the-middle on the deploy connection). | Pin the VPS host key in the workflow (`known_hosts` secret). |
| TA-18 🟡 | Third-party secrets still read in the browser (`VITE_WHATSAPP_TOKEN`, GHL API key in localStorage) — SEC-06. | Move those calls to the server. |

## 5. Data validation

Done: duplicate employees/clients, UAE phone, Emirates ID (VAL-01…04), job row checks, import preview, Data health page. Gaps:

| ID | Finding | Fix |
|---|---|---|
| TA-19 🟠 | Forms validate by hand, each differently; `zod` and `react-hook-form` are installed but used **0** times. | One zod schema per entity in `src/lib/schemas.ts`, used by forms, import and the server — the same rule everywhere. |
| TA-20 🟠 | The database accepts anything (no CHECK constraints, no unique indexes on invoice number, Emirates ID, phone). A bug or import can still save bad data. | Add constraints once the data is clean (VAL-07/08 in the CRM audit; Data health shows what to clean first). |

## 6. Error handling

| ID | Finding | Fix |
|---|---|---|
| TA-21 🟠 | **24 empty `catch {}` blocks** — e.g. a full localStorage makes `safeLocalStorageSet` fail and nothing tells the user that the browser copy is no longer updated. | Report storage failures through the sync banner; never swallow errors that mean data was not saved. |
| TA-22 🟠 | The app calls 5 endpoints the server does not have (`/api/logs/errors`, `/api/send-email`, `/api/payments…`) — failures are hidden; error logs and e-mails silently go nowhere. | Remove the calls or add the endpoints (TA-05). |
| TA-23 🟡 | One global error boundary; a crash in one widget blanks the whole page. | Boundary per page section (table, widgets, modals). |
| TA-24 🟡 | No error monitoring in production (`VITE_SENTRY_DSN` read but no Sentry package). | Sentry (or similar) on the frontend and the Node server. |

## 7. Should the Drivers module live in this CRM or on a separate domain?

**Keep it in this CRM — same app, same database, same login. Optionally give drivers a short address that opens the same app.**

| | Inside the CRM (recommended) | Separate app / domain |
|---|---|---|
| Data | Reads the Daily Job Sheet directly — the route plan updates the moment a job changes | Needs a sync between two systems (another place for data to disagree — the main problem this project already fights, TA-02) |
| Login & roles | One user list; drivers are Employees with "My Duties" | Second user system or shared auth across domains (cookies/CORS work) |
| Security | One RLS policy set; driver can only write their own location | Second API surface to secure |
| Cost / upkeep | One build, one deploy | Two deploys, two dependency sets |
| Phone experience | My Duties is already a phone layout; can be installed as a home-screen app (PWA) | Same could be done in one app |

When a **separate** app would make sense: many drivers from other companies, a native app with background GPS (a web page only sends location while it is open), or selling the driver app to other businesses. None applies today.

Practical next steps for drivers: a `drivers.safaeewala…` sub-domain (or a QR code) that opens `/my-duties` of the same app; a PWA manifest so it installs like an app; later, a native wrapper (Capacitor) only if background location becomes necessary.

## 8. Suggested order

| Phase | Items |
|---|---|
| Now | TA-15 (finish login setup → merge), TA-06 (hooks crash in Bookings) |
| Next | TA-07 + TA-08 (lint + tests in CI), TA-16, TA-17, TA-21, TA-22 |
| Then | TA-02/TA-03 (single store, tables instead of JSON blobs), TA-11/TA-12 (load window + SQL totals), TA-19/TA-20 |
| Later | TA-01, TA-09 (split store and pages), TA-13, TA-23, TA-24 |
