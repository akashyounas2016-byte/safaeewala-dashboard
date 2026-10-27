# Changelog

> What changed, newest first. Add an entry under **Unreleased** with every change; when a deploy happens,
> rename *Unreleased* to the deploy date and start a new *Unreleased*. Mention rule IDs where relevant.
> Format: `- type(scope): summary (rule IDs) — commit`

## Unreleased (in `main` or `claude/workspace`, not yet confirmed deployed)

- docs(audit): finance & operations screens audit — Pending, Payments, Expenses, Inventory, Invoices, Monthly Invoices, Attendance, Monthly Clients, Fluent Forms (AUD-24…AUD-42, UX-01…UX-24)
- fix(staff, clients, agencies): audit phase 3 — no hard-coded roster, job-sheet-only staff inactive after 60 days (AUD-08), attendance splits shared shifts (AUD-18, R-ATT-04), Live Cleaners no double booking/job (AUD-19), one agency-staff rule everywhere (AUD-14), agency rename keeps staff (AUD-13), booking rows linked to clients by id (AUD-15)
- fix(sync): audit phase 2 — Supabase write outbox with retry + banner (AUD-03, AUD-20), cloud copy of browser-only payments/attendance in `app_state` (AUD-02), agencies merged from both stores and saved per agency (AUD-04, K-03), loader pages past the 1000-row limit (AUD-23); migration `supabase/migrations/2026-10-27_phase2_sync.sql` (R-SYNC-05)
- fix(reports, overview, agencies, employees): audit phase 1 — revenue counted once (AUD-01, AUD-05, R-FIN-03), agency revenue split for shared shifts (AUD-07, R-PAY-01), no invented AED 2500 salary (AUD-10, R-EMP-02)
- docs(audit): data synchronisation & dummy-data audit — 22 findings AUD-01…AUD-22 with locations and fix order
- docs: documentation structure — README, rules registry with IDs, design, architecture, prod, data model, workflow, decision log (DEC-008) — `ad70b43`
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
