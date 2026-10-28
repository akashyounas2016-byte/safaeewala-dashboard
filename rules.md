# Business Rules Registry

> The single source of truth for **how the system must behave**. Every rule has a permanent ID.
> Code that enforces a rule should mention its ID in a comment (e.g. `// R-ATT-01`), and any change to a rule
> must also be logged in [CHANGELOG.md](CHANGELOG.md) (and in [docs/decisions.md](docs/decisions.md) if it changes a decision).
>
> **Status values:** `Active` (enforced in code) · `Partial` (enforced in some places) · `Planned` (agreed, not built yet) · `Retired` (kept for history, no longer applies).
> **Last reviewed:** 2026-10-27

## How to read a rule

```
### R-<AREA>-<NN> — Short title            ← ID never changes, even if the wording does
- Rule:    what must happen (the requirement)
- Why:     the business reason
- Code:    where it is enforced (file → function)
- Status:  Active | Partial | Planned | Retired   · Since: date / commit
```

Areas: `SCHED` Monthly schedules · `ATT` Attendance · `OT` Overtime · `SYNC` Cross-screen sync · `DATA` Data hygiene ·
`EMP` Employees · `AGN` Agencies · `PAY` Salaries & payouts · `FIN` Invoices & payments · `SEC` Security · `OPS` Operating process

---

## SCHED — Monthly client schedules

### R-SCHED-01 — Daily Job Sheet edits are temporary
- **Rule:** *"Monthly Clients kay schedule mein Daily Job Sheet par ki janay wali koi bhi tabdeeli — jaisay time, date, cleaner assignment, ya duration mein change — temporary (aarzi) samjhi jaye gi aur woh Monthly Client kay asal permanent schedule ko kabhi update nahi karay gi."* An edit on `/daily-job-sheet` changes **only that date's `DailyJob` row**.
- **Why:** One-off swaps (sick cleaner, client asks for a later slot) must not silently rewrite the contract.
- **Code:** `src/pages/DailyJobSheet.tsx`, `src/pages/JobSheetSpreadsheet.tsx` — edits call `updateDailyJob` only.
- **Status:** Active · Since: 2026-10

### R-SCHED-02 — The master schedule is permanent and protected
- **Rule:** `service_days`, `scheduled_time`, `end_time`, `duration_hours`, `preferred_cleaner`, `day_cleaner_assignments` on the client are never overwritten, back-synced or mutated from Daily Job Sheet edits.
- **Code:** `Client` fields in `src/types/index.ts`; no write path from job sheet to these fields.
- **Status:** Active · Since: 2026-10

### R-SCHED-03 — Permanent changes only in Monthly Clients / Client Profile
- **Rule:** Recurring contract changes are made only in `/monthly-clients` or the Client Profile modal.
- **Status:** Active · Since: 2026-10

---

## ATT — Attendance

### R-ATT-01 — Absent only when specifically marked
- **Rule:** *"System available cleaners mein say sirf unhein Absent count karay jo specifically mark hon, jabke blank entries ka matlab ho ga keh cleaner available tha magar koi job assigned nahi thi."*
  - **Present:** ≥ 1 worked shift that date (a row with duty hours or charges).
  - **Available / Standby:** no job that date → **never counted as absent**.
  - **Absent:** only via an explicit mark — Attendance screen override, or a job-sheet row with no hours/charges whose remarks/address say `absent`, `not available`, `medical emergency`, `uninformed`.
  - **On leave:** `on leave`, `sick leave`, `annual leave`, `emergency leave`, `day off`, `weekly off`, or override category *Approved Leave / Weekly Off*.
- **Code:** `src/lib/attendance.ts → classifyAttendanceDay` (used by the Attendance list and the monthly calendar); overrides in localStorage `safaeewala_cleaner_attendance_overrides` (key `YYYY-MM-DD_<name lowercase>`).
- **Status:** Active · Since: 2026-10

### R-ATT-04 — Who appears on the attendance list
- **Rule:** Registered non-inactive employees, plus unregistered names seen on the job sheet in the last 60 days, plus anyone with a shift on the selected date. Shared rows ("Sita, Rupa") are split per cleaner. No hard-coded roster.
- **Code:** `Attendance.tsx → allKnownCleaners`.
- **Status:** Active · Since: 2026-10-27 (AUD-08, AUD-18)

### R-ATT-02 — A worked row is never an absence
- **Rule:** A row with `duty_hours > 0` or `charges > 0` is a worked shift whatever its remarks say ("Leave keys at reception" must not mark anyone absent).
- **Code:** `Attendance.tsx` (`isWorkedShift`), `src/lib/employeeHealth.ts`.
- **Status:** Active

### R-ATT-03 — Manual override wins for that date
- **Rule:** An Attendance override for a date replaces what the job sheet implies for that cleaner and date.
- **Status:** Active

---

## OT — Overtime

### R-OT-01 — Three-tier OT calculation
- **Rule:** For each job, in order: (1) `ot_hours > 0` → use it (rounded to 0.1); (2) `is_overtime = true` → the whole `duty_hours` is OT; (3) otherwise time past **20:00** counts as OT. Shifts crossing midnight end on the next day.
- **Code:** `src/lib/clientDataSync.ts → calcJobOTHours`, `src/components/dailyJobSheet/jobSheetUtils.tsx → calcOTHours`.
- **Status:** Active

### R-OT-02 — High OT flag
- **Rule:** ≥ 10 OT hours in the selected period = "High OT" (amber accent, `HIGH` badge, `High OT >10h` filter).
- **Code:** `src/pages/Employees.tsx`.
- **Status:** Active

---

## SYNC — Cross-screen synchronisation

### R-SYNC-01 — Daily Job Sheet is the operational ledger
- **Rule:** Clients and staff seen on the job sheet appear automatically in Clients / Employees (`dj-<address>` and `emp-dj-<name>` synthetic records); hours, OT, revenue and history are derived from `dailyJobs`.
- **Code:** `DataContext.tsx → allClients / allEmployees` via `extractAllClientsFromDailyJobs`, `extractAllEmployeesFromDailyJobs`.
- Job-sheet-only staff are `active` only while they had a shift in the last 60 days (`SYNTHETIC_STAFF_ACTIVE_DAYS`); role stays `cleaner` until registered. Rows created from a booking belong to the booking's client by id (`booking_id → client_id`), not by address text.
- **Status:** Active · Updated 2026-10-27 (AUD-08, AUD-15)

### R-SYNC-02 — Bookings store IDs, the job sheet stores names
- **Rule:** `Booking.assigned_crew` holds **employee IDs**; `DailyJob.staff_name` holds **cleaner names** (comma-separated). Always convert with `crewToStaffName` / `staffNameToCrew` — never copy one into the other.
- **Why:** Name-based matching (agency payouts, history, attendance) fails on IDs; this caused job-sheet rows showing IDs instead of names.
- **Code:** `clientDataSync.ts → crewToStaffName, staffNameToCrew`; used in `DataContext.addBooking / updateBooking` and `Bookings.tsx`. `DataContext` also shows legacy rows' IDs as names (read-only).
- **Status:** Active · Since: 2026-10-27 (`4d65fba`)

### R-SYNC-03 — Creating a booking creates its job-sheet row
- **Rule:** `addBooking` creates a linked `DailyJob` (`booking_id`); `updateBooking` keeps it in step (date, time, duty, staff, address, charges, received on completion).
- **Code:** `DataContext.tsx → addBooking, updateBooking`.
- **Status:** Active

### R-SYNC-05 — No change is lost when Supabase is unavailable
- **Rule:** Every write to Supabase goes through the outbox; a failed write is kept, retried, re-applied on load and shown to the user. Business data that has no table of its own (payments, pending/received items, advances, adjustments, attendance overrides, recurring contracts) is mirrored to `app_state`.
- **Code:** `src/lib/syncQueue.ts` (`dbInsert/dbUpdate/dbDelete`, `applyOutbox`), `src/lib/cloudState.ts`, `src/components/layout/SyncStatusBanner.tsx`; loader pages through tables (no 1000-row cap).
- **Status:** Active in code · needs migration `supabase/migrations/2026-10-27_phase2_sync.sql` · Since: 2026-10-27 (AUD-02/03/04/20/23)

### R-SYNC-04 — Staff are matched by whole words
- **Rule:** An employee matches a job's `staff_name` by normalised full name or whole-word match — "Rupa" must not match "Rupak".
- **Code:** `clientDataSync.ts → employeeMatchesStaff`.
- **Status:** Active

---

## DATA — Data hygiene

### R-DATA-01 — Ignore Excel summary / bogus rows
- **Rule:** Skip rows with no address and no times; no address with charges or received > 1500 (footer totals); `duty_hours > 24`; or text containing `gross`, `pending rcvd`, `total`, `expences`, `net total`, `summary` (staff names additionally reject `expense`, `nil`, `none`).
- **Code:** `clientDataSync.ts → isBogusJob, isBogusStaffName`.
- **Status:** Active

### R-DATA-02 — Clean client names from addresses
- **Rule:** Remove payment tags in brackets (`(…monthly…)`, `(…cash…)`, `(…pending…)`, `(…online…)`, `(…above…)`) and stray punctuation before matching clients.
- **Code:** `clientDataSync.ts → cleanClientNameFromAddress`.
- **Status:** Active

### R-DATA-03 — No dummy data in operational lists
- **Rule:** Pickers, filters and assign lists show live data only. Demo seed data (`src/lib/seedData.ts`, client ids `c1000001-0000-0000-0000-…`) appears only when there is no real data at all, and is excluded from assign lists.
- **Code:** `clientDataSync.ts → getAssignableClients`; Employees agency filter reads only `agencies`; dummy agencies removed from `defaultAgencies`.
- **Status:** Active — seed fallbacks and demo data files removed 2026-10-27 (AUD-12).

---

## EMP — Employees

### R-EMP-01 — Roles
- **Rule:** Roles are `cleaner`, `supervisor` (legacy `crew_lead`), `technical` (legacy `ducting`), `store_cleaner`, `driver`. Legacy values display as their new label.
- **Code:** `src/types/index.ts → EmployeeRole`; `formatEmpRole` in Employees / EmployeeProfile / Reports.
- **Status:** Active

### R-EMP-02 — Monthly salary and hourly rate
- **Rule:** Pay is a **monthly salary** everywhere (no per-hour rates shown). Monthly salary = stored `monthly_salary` (legacy records: `pay_rate_hourly × 200`). The salary cost of one shift = monthly ÷ 200 h × duty hours (`shiftSalaryCost`) — used by agency payouts; Reports payroll = monthly salary. A missing salary shows "Not set"; no default values (12/15/14 per hour, 2500) are ever invented.
- **Code:** `clientDataSync.ts → MONTHLY_WORK_HOURS, getEmployeeMonthlySalary, shiftSalaryCost, formatMonthlySalary`.
- **Status:** Active · Standardized & Updated 2026-10-27 (AUD-06, AUD-09, AUD-10, K-02)

### R-EMP-03 — Performance Health Score
- **Rule:** 0–100 = Attendance 50 (worked days vs specifically-marked absences, last 90 days, per R-ATT-01) + Activity 30 (distinct worked days in last 30 days vs 22) + Compliance 20 (Visa, Passport, Work Permit, EID not expired). Grades: ≥85 Excellent, ≥70 Good, ≥50 Needs Attention, else At Risk.
- **Code:** `src/lib/employeeHealth.ts → calcEmployeeHealth`; shown on `/employees/:id`.
- **Status:** Active · Since: 2026-10-27

### R-EMP-04 — Document expiry alerts
- **Rule:** Employee bell lists Visa, Passport, Work Permit, EID, Medical Insurance, Driving License and contract end dates that are expired or ≤ 30 days away (inactive staff excluded), most urgent first.
- **Code:** `Employees.tsx → employeeNotifications`.
- **Status:** Active

### R-EMP-05 — Driver-only fields
- **Rule:** Driving License, licence type and assigned vehicle are shown/required only for `driver`; Skills and Client Assignment only for other roles.
- **Code:** Add/Edit Employee popups in `Employees.tsx`, `EmployeeProfile.tsx`.
- **Status:** Active

---

## AGN — Agencies

### R-AGN-01 — Safaeewala is the parent company
- **Rule:** `agency-safaeewala` (company type *Parent Company*) is always present; staff with no agency belong to it. Third-party agencies are everything else.
- **Code:** `DataContext.tsx → defaultAgencies` and agencies loader; `lib/utils.ts → isParentCompanyEmployee, isThirdPartyEmployee`.
- **Status:** Active

### R-AGN-02 — Agency ↔ staff matching
- **Rule:** An employee belongs to an agency when `agency_id` equals the agency id **or** `agency_name` equals the agency name (case-insensitive).
- **Code:** `lib/utils.ts → employeeBelongsToAgency, staffOfAgency, matchesAgencyFilter` (used by Employees filter and agency alerts; `AgencyDashboard.tsx → agencyStaff` uses the same rule). Renaming an agency re-links its staff (`DataContext.updateAgency`).
- **Status:** Active

### R-AGN-03 — Agency filter lists live agencies only
- **Rule:** The Employees agency filter shows only agencies from the Agencies screen, so new agencies appear automatically and old names on employee records do not.
- **Code:** `Employees.tsx → dynamicAgencies`.
- **Status:** Active · Since: 2026-10-27

### R-AGN-04 — Agency alerts
- **Rule:** Agencies bell shows: trade license / contract / Emirates ID / passport expired or ≤ 30 days; payouts `pending`/`processing`; third-party agency with active staff but no paid salary payout in 35 days; agency staff with Visa / Work Permit / Passport / EID expired or ≤ 30 days (grouped per agency). Inactive agencies excluded.
- **Code:** `src/lib/agencyAlerts.ts → buildAgencyNotifications`.
- **Status:** Active · Since: 2026-10-27

### R-AGN-06 — Deleting an agency deletes its staff
- **Rule:** Deleting a third-party agency also deletes the employees linked to it (R-AGN-02). The delete dialog lists who will be removed. Their past shifts stay on the Daily Job Sheet; deleted names are not re-created from that history. The parent company is never deleted with its staff.
- **Code:** `DataContext.deleteAgency`, `Agencies.tsx` delete dialog.
- **Status:** Active · Since: 2026-10-27 (owner decision, DEC-010)

### R-DATA-05 — Deleted records stay deleted
- **Rule:** Deleting a client or employee records its name key in `safaeewala_deleted_staff` / `safaeewala_deleted_clients` (cloud-synced) so job-sheet history does not bring it back.
- **Code:** `DataContext.deleteEmployee / deleteClient`; `extractAllEmployeesFromDailyJobs / extractAllClientsFromDailyJobs` (`deletedKeys`).
- **Status:** Active · Since: 2026-10-27 (AUD-17)

### R-AGN-05 — Issue date must not be after expiry
- **Rule:** For trade license, Emirates ID, passport and contract, the issue/start date cannot be after the expiry/end date.
- **Code:** Add Agency form submit in `Agencies.tsx`.
- **Status:** Active

---

## PAY — Salaries & payouts

### R-PAY-01 — Agency gross shift revenue
- **Rule:** Agency "Gross Shift Revenue" = sum of each staff member's **share** of job-sheet `charges` (a shared shift is split equally between its cleaners, same as Employees / Employee Profile). Payment status does not affect it.
- **Code:** `clientDataSync.ts → jobChargeShare`; `AgencyDashboard.tsx → staffJobsData, financials`.
- **Status:** Active · Updated 2026-10-27 (AUD-07)

### R-PAY-02 — Salary vs advance payouts
- **Rule:** Payouts have `payment_type` `salary` or `advance` and `status` `paid` / `pending` / `processing`. "Salary paid" counts only `paid` non-advance payouts.
- **Code:** `AgencyDashboard.tsx → financials`; type `AgencyCommissionPayout`.
- **Status:** Active

---

## FIN — Invoices & payments

### R-FIN-01 — UAE VAT and company details
- **Rule:** VAT is 5% of the subtotal unless the invoice is VAT-exempt (`vat_rate = 0` / `apply_vat = false`). Company name, TRN, address and phone on invoices and statements come only from Settings (`company_settings`) — no hard-coded values; saving settings merges, never replaces the record.
- **Code:** `src/lib/companyInfo.ts` (`useCompanyInfo`, `getCompanyInfo`, `updateCompanySettings`); `Invoices.tsx`, `MonthlyInvoices.tsx`, `Settings.tsx`.
- **Status:** Active

### R-FIN-03 — Revenue is counted once
- **Rule:** A booking that has a job-sheet row (`booking_id`) is counted only through that row. **Collected** revenue (Overview) = `received`, else `charges` for paid-on-site rows; `Monthly` rows count only via monthly client payments and `Pending` rows only via recoveries. **Billed / work** revenue (Reports) = job-sheet `charges` + bookings without a row.
- **Code:** `Overview.tsx → jobCollected, bookingsWithoutJobRow`; `Reports.tsx → workItems`.
- **Status:** Active · Since: 2026-10-27 (AUD-01, AUD-05)

### R-FIN-04 — Invoice numbers
- **Rule:** One scheme: `SAF-<year>-<NNNN>`, next = highest of the year + 1; `addInvoice` replaces any missing, legacy or duplicate number.
- **Code:** `src/lib/invoiceNumber.ts`; `DataContext.addInvoice`.
- **Status:** Active · Since: 2026-10-27 (AUD-36)

### R-FIN-05 — Receivables exclude monthly-contract visits
- **Rule:** Pending, Payments and Overview chase job-level dues only for non-monthly rows (`calcJobCollectable`); monthly-contract balances live on Monthly Clients (charges − payments of the same period). Payment history and "collected" include later recoveries; "billed" is job charges only.
- **Code:** `clientDataSync.ts → calcJobCollectable, jobCollected`; `PendingPayments.tsx`, `PaymentProcessing.tsx`, `MonthlyClients.tsx`, `Expenses.tsx`.
- **Status:** Active · Since: 2026-10-27 (AUD-24, 27, 28, 30, 39)

### R-DATA-04 — No invented numbers on screen
- **Rule:** KPI trend chips, stock movements and defaults must come from data. No fixed "+3%" deltas; stock increases only when goods are received; monthly statements come from job-sheet visits.
- **Status:** Active · Since: 2026-10-27 (AUD-32, 33, 35, 37)

### R-FIN-06 — Invoices carry their visits and part payments
- **Rule:** An invoice may list the job-sheet rows it bills (`job_ids`). Once sent, those rows are collected through the invoice: they leave job-level receivables and the invoice balance (total − `amount_paid`) is shown instead. Part payments add to `amount_paid`; the invoice becomes `paid` when fully settled. One collection over several dues is applied oldest first.
- **Code:** `lib/receivables.ts` (`invoiceBalance`, `invoicedJobIds`); `calcJobCollectable(job, ctx, invoiced)`; `PendingPayments.tsx → applyCollection`; `Invoices.tsx`; `MonthlyInvoices.tsx` (invoice from statement).
- **Status:** Active · Since: 2026-10-29 (UX-10, UX-17, UX-18, UX-19)

### R-FIN-02 — Monthly client balance
- **Rule:** Balance due = max(0, total charges − total received) for the client's monthly jobs (`payment_mode = Monthly` or "monthly" in remarks/address).
- **Code:** `clientDataSync.ts → isMonthlyJob`, monthly summaries.
- **Status:** Active

---

## SEC — Security

### R-SEC-01 — Login only on production
- **Rule:** On `localhost` / dev builds the login is bypassed; on the VPS a login is required, locked for 60 s after 5 failed attempts, session lasts 7 days.
- **Code:** `src/lib/simpleAuth.ts → isLocalEnvironment, SESSION_TTL`.
- **Status:** Active

### R-SEC-02 — No secrets in the repo or docs
- **Rule:** Credentials live in `.env` (see `.env.example` for names) and GitHub secrets only — never in code, docs, commits or chat.
- **Status:** Active

---

## OPS — Operating process

### R-OPS-01 — No browser automation without permission
- **Rule:** Do not launch browser sub-agents without the user's confirmation.
- **Status:** Active

### R-OPS-02 — No production deploy without permission
- **Rule:** Development is local. Do not run `deploy.ps1`, `scp`/`ssh` to the VPS (`187.77.116.14`) **or `git push origin main`** (it auto-deploys via GitHub Actions) without explicit permission. See [prod.md](prod.md).
- **Status:** Active

### R-OPS-03 — Two agents, two folders
- **Rule:** Antigravity works in the main folder; Claude works in the `-claude` worktree and merges into `main` only with the user's go-ahead. See [docs/workflow.md](docs/workflow.md).
- **Status:** Active · Since: 2026-10-27

---

## Known issues (rules not yet fully honoured)

| ID | Issue | Affects | Status |
|---|---|---|---|
| K-01 | Localhost talks to the **live** backend (`/api` proxy → VPS, live Supabase): saves during testing change production data. | R-OPS-02 | Open |
| ~~K-02~~ | ✅ Fixed 2026-10-27: one salary rule everywhere (`MONTHLY_WORK_HOURS` = 200h, R-EMP-02). | R-EMP-02, R-PAY-01 | **Resolved** |
| ~~K-03~~ | ✅ Fixed 2026-10-27: agency saves send only the changed agency; deletes send `remove` (old servers fall back to the full list). | R-AGN-* | **Resolved** |
| K-04 | New employee/agency fields may not exist as Supabase columns → writes rejected. Now visible (banner) and retried; fixed for good once the Phase 2 migration is run. | R-EMP-*, R-SYNC-05 | Open |
| ~~K-05~~ | ✅ Fixed 2026-10-27: no seed/demo data is loaded. | R-DATA-03 | **Resolved** |

Full list of sync / dummy-data issues with locations: [docs/audits/2026-10-27-data-sync-audit.md](docs/audits/2026-10-27-data-sync-audit.md) (AUD-01 … AUD-23), and for the finance & operations screens: [docs/audits/2026-10-27-finance-ops-screens-audit.md](docs/audits/2026-10-27-finance-ops-screens-audit.md) (AUD-24 … AUD-42), and for the Daily Job Sheet & Excel mode: [docs/audits/2026-10-29-daily-job-sheet-audit.md](docs/audits/2026-10-29-daily-job-sheet-audit.md) (AUD-44 … AUD-58).
