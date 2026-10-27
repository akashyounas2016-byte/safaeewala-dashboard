# Audit — Data Synchronisation & Dummy Data (2026-10-27)

> **Scope:** all screens, with focus on Employees, Agencies, Clients and the shared data layer (`DataContext`, `src/lib`).
> **Method:** code review of the current `main` (`ec6c9c2`), tracing each number from storage → calculation → screen.
> Findings were checked against the code; items marked **(verify)** depend on the live Supabase schema, which was not inspected.
> **Status of fixes:** Phase 1 fixed — AUD-01, AUD-05, AUD-07, AUD-10. Phase 2 code done — AUD-02, AUD-03, AUD-04, AUD-20, AUD-23 (marked ✅; AUD-02/03 need the Supabase migration `supabase/migrations/2026-10-27_phase2_sync.sql` to take full effect). Phase 3 fixed — AUD-08, AUD-14, AUD-15, AUD-18, AUD-19; AUD-13 partly (rename). Others open. Track fixes by ID (`AUD-xx`) in commits and CHANGELOG.

## Summary

| Severity | Count | Meaning |
|---|---|---|
| 🔴 High | 8 | Wrong money / staff numbers on screen, or data that can be lost |
| 🟠 Medium | 9 | Screens disagree with each other, or fake values shown as real |
| 🟡 Low | 5 | Inconsistency or clean-up, little user impact today |

**Top 5 to fix first:** AUD-01 (Overview double-counts revenue), AUD-02 (financial data only in the browser), AUD-03 (newly added employees can vanish after refresh), AUD-04 (agencies list race between two stores), AUD-05 (Reports ignore the Daily Job Sheet).

---

## A. Revenue & money calculations

### AUD-01 🔴 Overview revenue double-counts bookings and monthly jobs — ✅ Fixed
- **Where:** `src/pages/Overview.tsx:774-799` (`periodRevenue`).
- **What:** Revenue = job-sheet collections **+** completed bookings **+** monthly payments **+** pending recoveries.
  1. Every booking already creates a Daily Job row (`DataContext.addBooking`), so a booking's amount is counted twice.
  2. Line 779 counts a job's `charges` as collected whenever `payment_mode !== 'Pending'` — including `Monthly` jobs with `received = 0` — and then monthly client payments are added again.
- **Impact:** e.g. a AED 300 booking marked completed shows AED 600 of revenue; monthly clients are counted when billed *and* when paid.
- **Fix:** derive revenue from the job sheet only (skip bookings that have a linked job, `booking_id`); for `Monthly` jobs count only `monthly_client_payments`, not `charges`.

### AUD-05 🔴 Reports use bookings only, not the Daily Job Sheet — ✅ Fixed
- **Where:** `src/pages/Reports.tsx:66-72` (monthly revenue), `:89` (total revenue), `:118` (revenue by service), `:129` (staff performance), `:147` (ops metrics).
- **What:** All Reports revenue, job counts and "staff performance" come from `bookings`. Shifts entered directly on the job sheet (most of the work) are invisible. Booking status is the raw stored status, while the Bookings screen shows a booking as completed once its job has `received > 0` (`Bookings.tsx:214`) — so the two screens disagree.
- **Impact:** Reports show much lower revenue/jobs than Overview, Employees or Agencies for the same period.
- **Fix:** build Reports from `dailyJobs` (same helpers as Employees/Overview); use bookings only for pipeline/forecast.

### AUD-06 🟠 Three different salary models
- **Where:** `src/pages/Reports.tsx:168` (hours × `pay_rate_hourly`); `src/components/agencies/AgencyDashboard.tsx:281` (`monthly_salary / (26×8)`, i.e. 208 h, fallback 15); `src/lib/clientDataSync.ts:315-321` (200 h, `getEmployeeMonthlySalary`).
- **What:** Payroll in Reports, salary allocation in Agency payouts and salary on Employees use different hour bases.
- **Impact:** the same cleaner's salary differs between Reports, Agency profile and Employee profile. (Known issue K-02.)
- **Fix:** one helper (`MONTHLY_WORK_HOURS`) everywhere; decide whether payroll is fixed-monthly or hourly per employee type.

### AUD-07 🟠 Agency revenue counts shared shifts in full for each cleaner — ✅ Fixed
- **Where:** `AgencyDashboard.tsx:284`, `:1135`, `:1280`, `:3365`.
- **What:** Employees (`Employees.tsx:464`) and Employee Profile (`EmployeeProfile.tsx:239`) split a shared shift's `charges` between its cleaners; the Agency dashboard gives each cleaner the full amount.
- **Impact:** two cleaners from the same agency on a AED 400 shift → agency "Gross Shift Revenue" shows AED 800; cleaner revenue on the agency profile ≠ on the employee profile.
- **Fix:** use the same split (`charges / splitStaffNames(staff_name).length`).

---

## B. Dummy / hard-coded data shown as real

### AUD-08 🔴 Hard-coded 26-name roster creates "active employees" — ✅ Fixed (job-sheet-only staff inactive after 60 days without a shift)
- **Where:** `src/lib/clientDataSync.ts:916-930` (`extractAllEmployeesFromDailyJobs` → `standardRoster`), duplicated in `src/pages/Attendance.tsx:18-24`.
- **What:** 26 fixed names (Sharmila, Sharada, … Qasim) are always added as `status: 'active'` employees (`:967`) even with zero jobs, and as cleaners on Attendance — including people who left. Roles are guessed from the name (`:959`: qasim/dinesh/adnan → crew lead).
- **Impact:** inflated staff counts (e.g. "34 / 34"), ex-staff shown as "Available" every day, wrong roles.
- **Fix:** remove the hard-coded rosters; staff come only from registered employees + names actually present in the job sheet; synthetic staff inactive after N days without jobs.

### AUD-09 🟠 Fake salary / rate values when data is missing
- **Where:** `EmployeeProfile.tsx:372`, `:1112` (shows **AED 2500/mo** when no salary); `AgencyDashboard.tsx:1230`, `:1323`, `:3422` (shows **AED 12/hr**); `AgencyDashboard.tsx:281` (uses **15/hr**); `AgencyDashboard.tsx:2787` (new agency staff saved with 12/hr); `Employees.tsx:137` (Excel import defaults to 14/hr).
- **Impact:** looks like real pay data; feeds payroll/payout numbers.
- **Fix:** show "Not set" (`formatMonthlySalary` already does) and exclude from payroll until set.

### AUD-10 🔴 Edit Profile silently saves AED 2500 salary — ✅ Fixed
- **Where:** `EmployeeProfile.tsx:1202` (`Number(fd.get('monthly_salary')) || (emp.monthly_salary || 2500)`), `:1366` (default value `'2500'`).
- **Impact:** editing any field of an employee with no salary writes a fake AED 2500 salary (and hourly rate 12.5) to the database.
- **Fix:** leave salary empty when not entered.

### AUD-11 🟠 Fake hours in Live Cleaners
- **Where:** `src/pages/Agencies.tsx:425`, `:476` (`duty_hours || 4`), `:448` (booking `duration_hours || 2`).
- **Impact:** rows without hours show 4 h duty — totals look real.
- **Fix:** show "—" for unknown hours; don't add to totals.

### AUD-12 🟡 Demo seed data loads when storage is empty
- **Where:** `src/store/DataContext.tsx:132-148`, `:294-326` (`seedBookings`, `seedClients`, `seedEmployees`, `seedInvoices`, `seedInventory`).
- **Impact:** a new browser with Supabase slow/unreachable (2 s timeout) shows demo clients/staff (Sarah, Mohammed, Muhammad Tariq …) as if real, and they can be saved back. (Known issue K-05.)
- **Fix:** show an empty state / "offline" banner instead of seeds in production; keep seeds for a demo flag only. `src/data/mock.ts` is unused and can be deleted.

---

## C. Synchronisation between Employees, Agencies, Clients and the data layer

### AUD-03 🔴 New employees/clients can disappear after refresh (verify) — ✅ Fixed in code (+ migration)
- **Where:** `DataContext.tsx:568-571` (insert), `:298`, `:306` (load).
- **What:** a new record is added to local state and inserted into Supabase; errors are only `console.error`. On next load, if Supabase returns any rows, the list is **replaced** by Supabase's (no merge with local-only records), and the local cache is then overwritten.
- **When it bites:** offline / timeout during save, or a Supabase column missing for new fields (`photo_url`, `eid_start_date`, `documents`, … — Supabase rejects the whole insert). **(verify)** which columns exist.
- **Impact:** an employee added today is gone tomorrow; same pattern for clients and bookings.
- **Fix:** surface save errors in the UI; on load, merge local records not yet in Supabase and retry; add missing columns (owner approval).

### AUD-04 🔴 Agencies load from two stores; the last one wins — ✅ Fixed
- **Where:** `DataContext.tsx:257-276` — `/api/agencies` (VPS JSON) merges into state, then Supabase `agencies` **replaces** the whole list (`setAgencies(dbAgencies)`), without re-adding the Safaeewala parent.
- **What:** writes go to both stores (`addAgency/updateAgency` POST the full list to `/api` and insert/update Supabase). If one write fails (e.g. missing columns for `payouts`, `documents`, `bank_details`) the stores diverge, and whichever request finishes last decides what the user sees.
- **Impact:** agencies/payouts "revert" after refresh (the earlier Safaeewala-name bug), parent company may vanish, payouts recorded on one device not visible on another. Plus K-03 (stale tab overwrites the full list).
- **Fix:** one source of truth for agencies (Supabase *or* `/api`), merge-by-id on load, always inject the parent, send per-agency updates instead of the full list.

### AUD-13 🟠 Renaming or deleting an agency orphans its staff — 🟡 Rename fixed (staff re-linked); delete still open
- **Where:** `DataContext.tsx:613` (`updateAgency`), `:633` (`deleteAgency`) — no cascade to employees; matching in `AgencyDashboard.tsx:231-239` uses `agency_id` **or** `agency_name`.
- **Impact:** staff linked only by name drop out of the renamed agency; after delete, staff keep the old `agency_id`/name, count as third-party, but no filter option shows them (agency filter lists live agencies only).
- **Fix:** on rename update `agency_name` on linked employees; on delete ask to reassign staff (or move to parent).

### AUD-14 🟠 Employees screen and Agency dashboard count agency staff differently — ✅ Fixed (`lib/utils.ts → employeeBelongsToAgency, staffOfAgency, matchesAgencyFilter`)
- **Where:** `Employees.tsx:539-542` and `:628-630` use a *substring* match (`agency_name.includes(filter)`), and the two blocks differ from each other; `AgencyDashboard.tsx:236-237` and `lib/agencyAlerts.ts:23-24` use exact match.
- **Impact:** KPI count, list and agency profile can show different staff numbers for the same agency.
- **Fix:** one shared `staffOfAgency(agency, employees)` helper used everywhere.

### AUD-15 🔴 Bookings link to clients by address text, not by ID — ✅ Fixed
- **Where:** `DataContext.addBooking` writes the job's `address` = `service_address` (or `"<name> - Dubai"`); `clientDataSync.ts → extractAllClientsFromDailyJobs` links jobs to clients by matching the **address text** with the client name/building (`:626-700`) — it ignores `booking_id`/`client_id`.
- **Impact:** a booking whose service address doesn't contain the client's name creates a separate auto-discovered "client" named after the address; the real client's total spent / visits miss it.
- **Fix:** link via `booking_id → booking.client_id` first, text matching only for hand-typed job-sheet rows.

### AUD-16 🟠 Fuzzy client matching attaches jobs to the wrong client
- **Where:** `clientDataSync.ts:665-672` (whole-word partial match; first registered client wins).
- **Impact:** a client named e.g. "Ahmed" absorbs jobs for any address containing "Ahmed"; totals shift between clients.
- **Fix:** prefer exact/ID links; restrict partial matches to building names and show "possible match" instead of auto-attaching.

### AUD-17 🟠 Deleting a synthetic or job-linked record doesn't stick
- **Where:** `DataContext.tsx:560-565` (`deleteClient`), `deleteEmployee`; records are re-derived by `extractAllClientsFromDailyJobs` / `extractAllEmployeesFromDailyJobs`.
- **Impact:** deleting a client/employee that appears on the job sheet makes it reappear immediately (as `dj-…` / `emp-dj-…`).
- **Fix:** keep a "hidden/merged" list for synthetic records, or explain in the UI that history keeps them.

### AUD-18 🟠 Attendance treats shared shifts as a new cleaner — ✅ Fixed
- **Where:** `src/pages/Attendance.tsx:181-190` adds the raw `staff_name` ("Sharada, Ambika") as a cleaner instead of splitting it.
- **Impact:** phantom cleaners like "Sharada, Ambika" appear in Attendance with their own status.
- **Fix:** use `splitStaffNames` (as Employees/Agencies do).

### AUD-19 🟠 Live Cleaners counts a booking and its job twice — ✅ Fixed
- **Where:** `src/pages/Agencies.tsx:411-452` — for each employee adds today's job-sheet rows **and** today's confirmed/in-progress bookings; a booking already has a job row.
- **Impact:** double duties and double hours in the Live Cleaners modal. Unknown names default to "Agency Supplied" (`:498`) even when they are not agency staff.
- **Fix:** skip bookings whose `booking_id` exists in today's jobs; label unknown names "Unregistered".

---

## D. Persistence gaps (browser-only business data)

### AUD-02 🔴 Payments, adjustments and attendance live only in the browser — ✅ Fixed in code (needs migration)
- **Where (localStorage only, no Supabase table):**
  - `safaeewala_monthly_client_payments` — `MonthlyClients.tsx`, `Overview.tsx`, `PaymentProcessing.tsx`
  - `safaeewala_daily_pending_items`, `safaeewala_daily_pending_rcvd_items` — `DailyJobSheet.tsx`, `PendingPayments.tsx`, `PaymentProcessing.tsx`, `Overview.tsx`
  - `safaeewala_daily_advance_items` — `DailyJobSheet.tsx`, `ClientProfile.tsx`
  - `safaeewala_client_adjustments` — `Clients.tsx`, `ClientProfile.tsx`, `clientDataSync.ts`
  - `safaeewala_cleaner_attendance_overrides` — `Attendance.tsx`, `employeeHealth.ts`
  - `safaeewala_recurring_contracts` — `MonthlyClients.tsx`
- **Impact:** money received, pending recoveries, advances and absences differ per browser/device (and between localhost and the VPS); clearing the browser or switching laptop loses them; Health Score differs per device.
- **Fix:** move each to a Supabase table (owner approval for schema), keep localStorage as cache only.

### AUD-20 🟡 Save errors are invisible — ✅ Fixed
- **Where:** every `supabase.from(...).insert/update/delete(...).then(({ error }) => console.error(error))` in `DataContext.tsx`.
- **Impact:** users believe data is saved when it isn't (root cause behind AUD-03/04).
- **Fix:** toast on failure + retry queue.

### AUD-23 🔴 Only the first 1000 rows of each table were loaded — ✅ Fixed
- **Where:** `DataContext.tsx` loader `q()` — one `select('*')` per table; Supabase returns at most 1000 rows per request.
- **Impact:** once `daily_jobs` passed 1000 rows, older shifts silently disappeared from every screen (hours, revenue, history).
- **Fix:** the loader now pages through each table 1000 rows at a time (found during Phase 2, 2026-10-27).

### How Phase 2 works
- **Outbox (`src/lib/syncQueue.ts`):** every Supabase write goes through `dbInsert / dbUpdate / dbDelete`. A failed write is kept in `safaeewala_sync_outbox`, retried every minute and on reconnect, and re-applied on load so the record is not lost. Inserts are upserts, so retries are safe.
- **Cloud copy of browser data (`src/lib/cloudState.ts`):** the 7 browser-only keys are mirrored to the Supabase table `app_state`; pulled before the app renders, pushed after each change, merged by `id` when two devices both changed data.
- **Agencies:** loaded from `/api/agencies` and Supabase together and merged by id (parent always present); saves send only the changed agency (K-03); deletes send `remove`.
- **Banner:** an amber "N changes not saved to the cloud" banner with the error text and a Retry button appears whenever something is pending.
- **Tests:** 14 behaviour checks run against an in-memory Supabase (failed insert kept, update folded into pending insert, retry, delete, first upload, two-device merge, deletion not resurrected, reload from cloud, missing table) — all pass.

---

## E. Consistency / clean-up

### AUD-21 🟡 Two different "bogus row" filters
- **Where:** `Overview.tsx:33` (`isBogusSummaryJob`, extra "empty stub" rule) vs `clientDataSync.ts:89` (`isBogusJob`).
- **Impact:** Overview may exclude rows other screens include.
- **Fix:** delete the copy; use `isBogusJob` (extend it if the extra rule is wanted).

### AUD-22 🟡 Client "total spent" mixes billed and paid
- **Where:** `clientDataSync.ts:696` (`total_spent = max(stored, sum of charges)`), `DataContext.updateBooking` adds `total_amount` on completion.
- **Impact:** "spent" is billed charges, not money received; `max()` hides double counting rather than preventing it.
- **Fix:** compute from jobs (received vs charged shown separately); stop incrementing a stored counter.

### Other notes
- Bookings screen derives a status for job-sheet-only rows: past date ⇒ `completed` even if unpaid (`Bookings.tsx:241`).
- `rules.md` R-DATA-01 lists `expense` among bogus keywords; in code that word is only in `isBogusStaffName`, not `isBogusJob` — corrected in rules.md with this audit.

---

## Flow analysis — Employees · Agencies · Clients · Data

```
                       ┌───────────── Supabase (bookings, clients, employees, agencies, daily_jobs …)
                       │                 ▲ insert/update — errors only logged (AUD-20)
                       ▼                 │
 /api/agencies ──► DataContext state ────┘──► localStorage cache
   (AUD-04 race)        │
                        ├─ dailyJobs (ledger) ── IDs→names view (R-SYNC-02 ✓)
                        │     ├─► allEmployees = registered + job-sheet names + 26 hard-coded (AUD-08)
                        │     └─► allClients   = registered + addresses (text match AUD-15/16)
                        │
   Screens:             ▼
   Employees ──── shifts/revenue split per cleaner ✓ ── agency filter substring (AUD-14)
   Employee Profile ─ salary fallback 2500 (AUD-09/10) ── health score uses browser-only absences (AUD-02)
   Agencies/Profile ─ revenue full per cleaner (AUD-07) ── pay 208h/15 (AUD-06/09) ── Live Cleaners double (AUD-19)
   Attendance ─────── shared shift = phantom cleaner (AUD-18) ── roster hard-coded (AUD-08)
   Clients ─────────── jobs by address text (AUD-15) ── delete reappears (AUD-17)
   Overview ───────── revenue double counted (AUD-01)
   Reports ────────── bookings only (AUD-05) ── salary model #3 (AUD-06)
```

**What is already consistent:** OT calculation (single helper), staff ↔ job matching (`employeeMatchesStaff`), job-sheet history for an employee (`getEmployeeDailyJobsHistory`), booking → job staff names (fixed today), agency filter and client assign lists free of dummy data.

## Suggested fix order

| Phase | Items | Why first |
|---|---|---|
| 1 — wrong money on screen | AUD-01, AUD-05, AUD-07, AUD-10 | Owner decisions are made on these numbers |
| 2 — data loss | AUD-03, AUD-04, AUD-20, AUD-02 | Need Supabase schema work → owner approval |
| 3 — staff/client integrity | AUD-08, AUD-18, AUD-19, AUD-14, AUD-13, AUD-15 | Fix counts and links |
| 4 — clean-up | AUD-06, AUD-09, AUD-11, AUD-12, AUD-16, AUD-17, AUD-21, AUD-22 | Consistency |
