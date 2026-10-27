# Changelog

> What changed, newest first. Add an entry under **Unreleased** with every change; when a deploy happens,
> rename *Unreleased* to the deploy date and start a new *Unreleased*. Mention rule IDs where relevant.
> Format: `- type(scope): summary (rule IDs) — commit`

## Unreleased (in `main` or `claude/workspace`, not yet confirmed deployed)- refactor(quality): Phase 4 React 19 cleanup, strict typing & subcomponent optimization — resolved all React 19 hook warnings (cascading renders, impure render functions, setState-in-effect) across `NotificationCenter.tsx`, `AgencyDashboard.tsx`, `CRMAIBotModal.tsx`, `Agencies.tsx`, and `DailyJobModals.tsx`. Converted `jobSheetUtils.tsx` into pure TypeScript utility `jobSheetUtils.ts` with typed inputs (`unknown`) and extracted UI components into `JobSheetBadges.tsx`, resolving Fast Refresh export warnings. Verified 0 errors across all `src/components/dailyJobSheet/*` components and validated full project production build (`tsc -b && vite build`) passing in 1.69s.
- refactor(dailyJobSheet, dataContext): Phase 3 modularization & data engine cleanup — modularized mammoth DailyJobSheet (4,411 lines down to 3,798 lines, -613 lines) into 3 dedicated subcomponents in `src/components/dailyJobSheet/`: `JobSheetKPIs.tsx` (2-row executive clickable financial metrics), `ExpensesAndDriversPanel.tsx` (Expenses log & driver collections summary), and `ReconciliationWidgets.tsx` (Today Pending, Pending Received, and Advance reconciliation tables). Cleaned up `DataContext.tsx` by isolating `defaultAgencies` into `src/lib/defaultAgencies.ts`, removing `any` types in supabase query timeout guards, and resolving `react-refresh` export warnings.
- refactor(employees): Phase 2 modularization — created unified reusable `EmployeeFormModal.tsx` and modular `EmployeeWidgets.tsx`. Slashed duplicate code in `Employees.tsx` from 3,276 lines down to 1,940 lines (-1,336 lines, bundle dropped from 113.5 kB to 72.8 kB) and in `EmployeeProfile.tsx` from 1,744 lines down to 1,141 lines (-603 lines, bundle dropped from 70.6 kB to 47.1 kB). Both Add Employee and Edit Employee modals now share one consolidated form with dynamic driver/cleaner fields, document uploads, and live client assignments.
- refactor(core): Phase 1 audit improvements — purged dead file `DailyJobSheet.backup.tsx`, pruned unused dependencies (`leaflet`, `react-leaflet`, `@tanstack/react-query`), updated package name to `safaeewala-dashboard`, resolved K-02 by standardizing Agency payouts to `MONTHLY_WORK_HOURS` (200h, R-EMP-02, R-PAY-01), and resolved React 19 `react-hooks/purity` warning in `NotificationContext.tsx` with a reactive 60s timer
- fix: remaining audit items — one monthly-salary rule, no per-hour or invented pay values (AUD-06/09, R-EMP-02); agency delete also deletes its staff with a warning (R-AGN-06, DEC-010); deleted clients/staff not re-created from history (AUD-17, R-DATA-05); no seed/demo data (AUD-12); no invented duty hours (AUD-11); safer client matching (AUD-16); one bogus-row rule (AUD-21); client totals from job sheet (AUD-22); payment method on receipts (AUD-29); attendance keyed by employee id (AUD-38)
- fix(finance): finance & operations audit fixes — monthly visits out of receivables (AUD-24), recoveries in payment history/totals (AUD-27/28), expenses revenue = collected (AUD-30/31), real inventory receiving + delete (AUD-33), company details & TRN from Settings (AUD-34), sequential SAF-YYYY-NNNN invoice numbers (AUD-36), monthly statements from job-sheet visits (AUD-37), period-matched monthly balances (AUD-39), no fake KPI deltas (AUD-32/35), no name-based lead hiding (AUD-41), lead save retry + store merge (AUD-42), settings saves no longer wipe other settings (AUD-43), pending notes/staff split/overpay warning (AUD-25/26) — R-FIN-01/04/05, R-DATA-04
- docs(audit): finance & operations screens audit — Pending, Payments, Expenses, Inventory, Invoices, Monthly Invoices, Attendance, Monthly Clients, Fluent Forms (AUD-24…AUD-42, UX-01…UX-24)
- fix(staff, clients, agencies): audit phase 3 — no hard-coded roster, job-sheet-only staff inactive after 60 days (AUD-08), attendance splits shared shifts (AUD-18, R-ATT-04), Live Cleaners no double booking/job (AUD-19), one agency-staff rule everywhere (AUD-14), agency rename keeps staff (AUD-13), booking rows linked to clients by id (AUD-15)
- fix(sync): audit phase 2 — Supabase write outbox with retry + banner (AUD-03, AUD-20), cloud copy of browser-only payments/attendance in `app_state` (AUD-02), agencies merged from both stores and saved per agency (AUD-04, K-03), loader pages past the 1000-row limit (AUD-23); migration `supabase/migrations/2026-10-27_phase2_sync.sql` (R-SYNC-05)
- fix(reports, overview, agencies, employees): audit phase 1 — revenue counted once (AUD-01, AUD-05, R-FIN-03), agency revenue split for shared shifts (AUD-07, R-PAY-01), no invented AED 2500 salary (AUD-10, R-EMP-02)
- docs(audit): data synchronisation & dummy-data audit — 22 findings AUD-01…AUD-22 with locations and fix order
- feat(clients): Redesigned Add New Client / Edit Client Profile modal (`ClientModalForm.tsx`) with 3 organized, professional cards: Primary Contact & Identity, Address & Crew Assignment, and Opening Financial Balances (Advance, ADJ, Pending) & Access Notes
- feat(employees): Updated Live Status column label from "On Duty Today" to "On Duty" across employee status badges (`Employees.tsx`)
- feat(employees): Replaced row-hiding eye icon with Column Visibility Management dropdown menu with localStorage persistence, letting users show/hide specific table columns (Employee, Role, Status, Duty Hours, OT, Total Hours, Shifts, Salary, Visa, Actions)
- feat(employees): Updated Employee Profile hero header to CRM's signature Dark Slate-Teal palette (`#021f24` → `#062c32`) with teal/emerald glows, borders, and accents for unified visual cohesion (`EmployeeProfile.tsx`)
- feat(clients): Updated Client Profile hero header to dark Midnight Navy / Sapphire Indigo palette (`#070d1e` → `#0c1633`), making it distinct from Employee Profile; redesigned the 6 summary cards with high-contrast dark glassmorphism and glowing accents (Total Charges, Received, Overtime, Pending, Advance, ADJ) (`ClientProfile.tsx`)
- feat(payments, clients): Added `RecordPaymentModal` with dynamic client autocomplete/suggestions and quick chips; added "Add Payment" action button right after "Add Client" in Clients screen hero; added "Record Payment" button to Client Profile top header and financial ledger with instant live sync across Payment Processing and Client Profile (R-SYNC-01, R-DATA-03)
- feat(employees, agencies): Document upload fields modernized to pure image upload (thumbnail preview, replace, remove, full preview modal) with issue/expiry dates; removed text input fields for Emirates ID, Passport, Visa, Work Permit, Medical Insurance, Trade License, Tax/NOC & Agreements; unified Edit Employee and Edit Agency popups to exact same structures as Add Employee and Add Agency (R-EMP-04, R-AGN-05)
- feat(clients): Single row of 6 summary cards with pulsing expander button for secondary metrics; added Pending Balances & Client Distribution widgets; expanded Sorted By options (highest due, bookings, Z-A, service dates)
- feat(employees): Employee Profile dark hero header integrating staff name and health status; Edit Profile popup unified to Add Employee max-w-6xl 3-row layout (D-09, R-EMP-03)
- docs: documentation structure — README, rules registry with IDs, design, architecture, prod, data model, workflow, decision log (DEC-008) — `ad70b43`
- feat(agencies, employees): Agency popup agreement / workmen compensation / bank rows, Live Cleaners modal, Edit Employee popups in tinted layout (Antigravity) — `8c9dfb8`
- feat(agencies): Agencies bell shows document, contract, payout and staff-compliance alerts (R-AGN-04) — `a0d99b9`
- fix(bookings): job sheet gets cleaner names instead of employee IDs; agency payouts now count booking shifts (R-SYNC-02) — `28d15cd`
- feat(employees): tinted document cards in Add Employee popup, insurance/NOC row, live-only client lists (D-05, R-DATA-03) — `3f83c01`
- feat(employees): Health Score, profile photo upload, row show/hide, Import/Export labels, Employees bell alerts (R-EMP-03, R-EMP-04) — `ac0e0c7`
- feat(employees): Add Employee popup redesigned like Add Agency; agency filter from Agencies list only (R-AGN-03) — `1bf35cb`
- feat(agencies): Add New Agency popup reorganised with identity, insurance and bank fields — `5a00dc6`
- feat(employees): employee document fields and uploads; "Ducting" role renamed "Technical" (R-EMP-01) — `51e65ca`

## 2026-10-27

- fix: data consistency and calculation parity across employees and clients — `18036b2`
- fix: Parent Company name "Safaeewala" persists via backend — `b512a01`
- feat: Salary Payout & Advance system synced with the Daily Job Sheet (R-PAY-01, R-PAY-02) — `3ea25a6`
- feat: Safaeewala master agency widget, agency profile edit modal, licence & documents tab — `65c3723`, `6f95f1c`, `3eb3a58`, `c24eba5`

## 2026-10-23 → 2026-10-25

- feat: Employees screen redesign with prominent Duty & OT; login bypass on localhost (R-SEC-01) — `ac4b0df`
- feat: AI bot improvements — `a453a45`
- feat: Subscriptions merged into Monthly Clients; Daily Job Sheet cards — `58af1c0`
- perf: route-based code splitting — `7ee5613`
- feat: job sheet ↔ employees/clients sync; Fluent Forms leads module (R-SYNC-01) — `f3de790`

## 2026-06

- Daily Job Sheet OT auto-calculation and row highlights (R-OT-01); Monthly Clients / Invoices redesign; initial VPS deployment pipeline.
