# Audit — Finance & Operations Screens (2026-10-27)

> **Screens:** Pending · Payments · Expenses · Inventory · Invoices · Monthly Invoices · Attendance · Monthly Clients · Fluent Forms.
> **Question asked:** is the data on each screen synchronised, real and correct (not dummy / hard-coded)? How can the UI/UX be improved?
> **Method:** code review of `claude/workspace` (`28c66de`, includes audit phases 1-3), tracing each number to its source.
> Not yet re-checked: Antigravity's uncommitted edits to `PaymentProcessing.tsx` and the new `src/components/payments/` (in progress at the time of this audit).
> **Fix status (2026-10-27):** all findings fixed (AUD-24 … AUD-43).
> Findings continue the numbering of the [data-sync audit](2026-10-27-data-sync-audit.md): **AUD-24 … AUD-42**. UI/UX ideas are **UX-01 … UX-24**. No fixes applied yet.

## Summary

| Screen | Data verdict | Main problems |
|---|---|---|
| **Pending** | 🟠 Real, but over-counts | Monthly-contract visits counted as unpaid (AUD-24); collection notes lost (AUD-25) |
| **Payments** | 🔴 Incomplete | Recoveries missing from history and totals; collection rate distorted (AUD-27, AUD-28) |
| **Expenses** | 🟠 Real expenses, wrong profit | Revenue includes Excel total rows and unpaid jobs; "Net Profit" ignores salaries (AUD-30, AUD-31) |
| **Inventory** | 🔴 Partly fake | Hard-coded KPI trends; "Reorder" adds stock instantly; probably demo seed items (AUD-32, AUD-33) |
| **Invoices** | 🔴 Legal details hard-coded | Old company name + placeholder TRN printed; fake KPI trends; non-sequential numbers (AUD-34 … AUD-36) |
| **Monthly Invoices** | 🔴 Wrong source | Built from all bookings, ignores the job sheet's monthly visits (AUD-37) |
| **Attendance** | 🟢 Real (fixed in phase 3) | Overrides keyed by name (AUD-38) |
| **Monthly Clients** | 🟠 Totals disagree | Period charges minus all-time payments; per-client balance ignores payments (AUD-39, AUD-40) |
| **Fluent Forms** | 🟠 Real, but can hide real leads | Hard-coded name list hides real customers with those names; save errors swallowed (AUD-41, AUD-42) |

Severity: 🔴 High 7 · 🟠 Medium 8 · 🟡 Low 4.

---

## Pending (`/pending` — `src/pages/PendingPayments.tsx`)

**Data sources:** `dailyJobs` (charges − received − later receipts − client adjustments, `clientDataSync.ts:251 calcJobPending`) + manual side items `safaeewala_daily_pending_items`; collections go to `safaeewala_daily_pending_rcvd_items`. Both browser keys are now mirrored to Supabase (`app_state`, phase 2). No dummy data.

### AUD-24 🔴 Monthly-contract visits show as unpaid — ✅ Fixed (`calcJobCollectable`)
- **Where:** `clientDataSync.ts:251` (`calcJobPending`), used by `PendingPayments.tsx:294-323`, Payments, Overview and Client Profile.
- **What:** a visit with `payment_mode = 'Monthly'` and `received = 0` is "pending" for its full charge; monthly client payments (`safaeewala_monthly_client_payments`) never reduce it.
- **Impact:** Pending total is inflated by every monthly visit until someone types a received amount on each row; the same money also shows as paid on Monthly Clients.
- **Fix:** exclude `Monthly` rows from job-level pending (their balance lives on Monthly Clients), or allocate monthly payments to that client's visits.

### AUD-25 🟡 Collection notes are thrown away — ✅ Fixed
- **Where:** `PendingPayments.tsx:124` (`collectNotes`), input at `:1366`; the saved receipt (`:514-521`) has no notes field.
- **Fix:** save `remarks: collectNotes`.

### AUD-26 🟡 Staff summary and overpayment — ✅ Fixed
- **Where:** `PendingPayments.tsx:460-477` groups by the raw `staff_name` ("Sita, Rupa" is one bucket); `handleSaveCollection` accepts an amount larger than the pending balance.
- **Fix:** split with `splitStaffNames`; warn when amount > pending (or record the excess as advance).

## Payments (`/payments` — `src/pages/PaymentProcessing.tsx`)

**Data sources:** same pending list as `/pending`, monthly client payments, job `received`.

### AUD-27 🔴 Recoveries missing from Payment History and totals — ✅ Fixed
- **Where:** `PaymentProcessing.tsx:293-350` (history = job `received` + monthly payments only), `:353-358` (totals).
- **What:** money collected later through Pending/Payments (`pending_rcvd_items`) is not listed and not in "Total Collected".
- **Impact:** collected cash looks lower than reality; the history can't be used to reconcile the cash book.
- **Fix:** add receipts as a third history type ("Recovery") and include them in collected totals.

### AUD-28 🟠 Collection rate double-counts billing — ✅ Fixed
- **Where:** `PaymentProcessing.tsx:357` — `totalBilled = Σ job charges + Σ monthly payments`.
- **What:** monthly visits are already in job charges; adding the payments again inflates "billed".
- **Fix:** billed = job charges (+ invoices not tied to jobs); collected = received + recoveries + monthly payments.

### AUD-29 🟡 Payment method reduced to cash/online — ✅ Fixed (`method` stored on receipts)
- **Where:** `PaymentProcessing.tsx:398-406` — Bank Transfer / Card / Cheque are stored only as `online` + a remark.
- **Fix:** store `method` on the receipt.

## Expenses (`/expenses` — `src/pages/Expenses.tsx`)

**Data sources:** `dailyExpenses` (Supabase `daily_expenses`) from the job sheet and office entries. Expense data itself is real.

### AUD-30 🔴 Period revenue includes Excel total rows and unpaid jobs — ✅ Fixed
- **Where:** `Expenses.tsx:354-366` — `received || charges` for every job in range, **without `isBogusJob`**; falls back to bookings only if there is no job revenue.
- **Impact:** a footer row like "TOTAL 15,000" counts as revenue; pending/monthly charges count as earned → profit and expense ratio wrong.
- **Fix:** use the same "collected" helper as Overview (`jobCollected`, R-FIN-03) on `isBogusJob`-filtered rows.

### AUD-31 🟠 "Net Profit" leaves out staff salaries and agency payouts — ✅ Relabelled "Collected − Expenses", note that salaries/payouts are excluded
- **Where:** `Expenses.tsx:368-370`.
- **Impact:** the biggest costs are missing, so profit is heavily overstated.
- **Fix:** rename to "Revenue − Recorded Expenses", or add payroll (Reports payroll) and paid agency payouts as cost lines.

## Inventory (`/inventory` — `src/pages/Inventory.tsx`)

### AUD-32 🔴 Hard-coded KPI trends — ✅ Fixed
- **Where:** `Inventory.tsx:93` (`delta: '+2'`), `:96` (`'+3%'`), `:97-98` (`'Active'`, `'All'`).
- **Impact:** "+3% stock value" is shown forever regardless of data.
- **Fix:** compute vs last month or remove the delta chip.

### AUD-33 🔴 "Reorder" adds stock immediately; items can't be edited — ✅ Fixed (Receive stock + expense, delete)
- **Where:** `DataContext.tsx:809` (`reorderItem` adds `reorder_quantity` to `current_stock`), buttons at `Inventory.tsx:70` (reorder all critical) and `:200`.
- **What:** clicking Reorder records the goods as received; no purchase/expense, no undo. There is no edit/delete or stock-out (usage) action, and the list falls back to demo seed items (`seedInventory`) when the table is empty (AUD-12).
- **Impact:** stock levels and stock value are not real.
- **Fix:** Reorder = create a "pending order"; "Receive" adds stock and logs an expense; add edit/delete and a usage action; no seeds.

## Invoices (`/invoices` — `src/pages/Invoices.tsx`)

### AUD-34 🔴 Old company name and placeholder TRN printed on invoices — ✅ Fixed (`lib/companyInfo.ts`)
- **Where:** `Invoices.tsx:20-26` (`COMPANY` constant: "Safaeewala Cleaning & Maintenance LLC", TRN `100234567890003`, phone, email).
- **What:** the printable tax invoice ignores Settings / `company_settings` (the real name is now "Safaeewala Cleaning & Technical Services LLC"); `DataContext` loads `companyTRN` but Invoices doesn't use it.
- **Impact:** legally relevant document shows wrong company details.
- **Fix:** read name/TRN/address from `company_settings` (single source), no constants.

### AUD-35 🟠 Hard-coded KPI trends — ✅ Fixed
- **Where:** `Invoices.tsx:286` (`'+12%'`), `:290` (`'+3%'`), `:287-289` (static labels).
- **Fix:** compute vs previous period or remove.

### AUD-36 🟠 Invoice numbers are not sequential and can collide — ✅ Fixed (`lib/invoiceNumber.ts`, SAF-YYYY-NNNN)
- **Where:** `Invoices.tsx:841` and `DataContext.tsx:513` (`INV-` + last 6 digits of the timestamp); `MonthlyClients.tsx:701-703` (`INV-YYYYMM-` + random 1000-9999).
- **Impact:** gaps/duplicates; UAE tax invoices need a unique sequential number.
- **Fix:** one generator: next number = max existing + 1 per year (e.g. `SAF-2026-0001`), checked for uniqueness.

## Monthly Invoices (`/monthly-invoices` — `src/pages/MonthlyInvoices.tsx`)

### AUD-37 🔴 Statements built from all bookings, not monthly visits — ✅ Fixed
- **Where:** `MonthlyInvoices.tsx:74-111`.
- **What:** groups **every** completed/confirmed booking of the month by client name — one-off clients get "monthly statements"; monthly-contract visits recorded on the Daily Job Sheet (the real source, `isMonthlyJob`) are ignored. VAT is always 5% (`:15`) and labelled "VAT Collected" although nothing is collected. Company name/phone hard-coded in WhatsApp/email text (`:123-132`).
- **Impact:** statements are empty or wrong for actual monthly clients.
- **Fix:** build from `extractMonthlyClientsFromDailyJobs` (same as Monthly Clients), respect each client's VAT setting, label "VAT billed", company details from settings.

## Attendance (`/attendance` — `src/pages/Attendance.tsx`)

Real data: registered staff + recent job-sheet names; hard-coded roster removed and shared shifts split in phase 3 (AUD-08, AUD-18); overrides now synced to the cloud (AUD-02).

### AUD-38 🟡 Overrides are keyed by cleaner name — ✅ Fixed (overrides keyed `date_id:<employeeId>`, old name keys still read)
- **Where:** `Attendance.tsx:210` (`${date}_${name lowercase}`).
- **Impact:** renaming an employee loses their absence history (also affects Health Score).
- **Fix:** key by employee id when the cleaner is registered.

## Monthly Clients (`/monthly-clients` — `src/pages/MonthlyClients.tsx`)

**Data sources:** monthly summaries from the job sheet (`extractMonthlyClientsFromDailyJobs`), recurring contracts and payments (browser keys, now cloud-mirrored).

### AUD-39 🟠 Total balance mixes a period with all-time payments — ✅ Fixed (payments filtered to the same period)
- **Where:** `MonthlyClients.tsx:585-587` — `charges (selected period) − (received in period + ALL payments ever recorded)`.
- **Impact:** for any period other than "all", balance due is understated (often 0).
- **Fix:** filter payments by the same period (payment date or invoice month).

### AUD-40 🟠 Per-client balance ignores payments; payments matched by name text — ✅ Covered by AUD-39 (cards already subtracted payments; the period mismatch was the bug)
- **Where:** per-client `balanceDue` from `calcJobPending` (`clientDataSync.ts` → `extractMonthlyClientsFromDailyJobs`) never subtracts monthly payments; `paymentsByClient` (`:571-579`) keys on typed client name.
- **Impact:** client cards show balances that the total doesn't; a typo creates an orphan payment.
- **Fix:** subtract the client's payments in the card; pick clients from a list and store `client_id` on payments.

## Fluent Forms (`/fluent-forms` — `src/pages/FluentFormsLeads.tsx`, `src/lib/fluentFormsSync.ts`)

**Data sources:** VPS webhook store (`/api/webhook/fluent-forms` → `/data/leads.json`) first, then Supabase `fluent_form_leads`, then browser cache. Leads are real website submissions.

### AUD-41 🟠 A hard-coded list of names hides real leads — ✅ Fixed
- **Where:** `fluentFormsSync.ts:12-27` (`isDummyLead`): ids `lead-ff-101…110` **and** 10 common names ("Sarah Jenkins", "Vikram Patel", "Rahul Khanna", "Fatima Al-Zahra", …).
- **Impact:** a real customer with one of those names never appears.
- **Fix:** filter by the old demo ids only (or delete them once from the store) and drop the name list.

### AUD-42 🟠 Lead saves fail silently; two stores can disagree — ✅ Fixed (VPS write retry queue, both stores merged on read)
- **Where:** `fluentFormsSync.ts:359-420` — every write to the VPS and to Supabase is wrapped in `catch {}`; reads prefer the VPS list even when it is empty.
- **Impact:** a status change that failed reverts after refresh with no warning; if the VPS file is reset, Supabase leads are not shown.
- **Fix:** route Supabase writes through the outbox (`syncQueue`), show errors, merge both stores by id on read.

---

### AUD-43 🔴 Saving company/agency details wiped other settings — ✅ Fixed
- **Where:** `DataContext.updateAgency` (Safaeewala rename) upserted `company_settings` with only `{ company: { company_name, trading_name } }`; Settings saves wrote `{ company, notifications }` without `rolePermissions`.
- **Impact:** TRN, address, notification settings and role permissions could be erased.
- **Fix:** `updateCompanySettings` / `saveSettingsData` read the current record and merge.

---

## UI/UX recommendations

**Cross-screen**
- **UX-01 Merge Pending and Payments.** Both list the same outstanding items and both have a "collect" flow. One "Receivables" screen with tabs *Outstanding · Collected · Monthly payments · History* removes the duplication and the risk of collecting twice.
- **UX-02 Replace browser `alert()` / `confirm()`** (Pending 4, Expenses 5+1, Monthly Clients 4+2, Payments 1, Fluent Forms 1) with the app's Modal/toast so messages match the design and don't block the page.
- **UX-03 Pagination or virtualised tables** for Pending, Expenses and Payment History (no paging today) — they will slow down as the job sheet grows.
- **UX-04 Remove decorative "delta" chips** unless they are computed (AUD-32, AUD-35); a wrong trend is worse than none.
- **UX-05 One date-range control** with the same presets on every finance screen (today they differ: 28 days, this month, custom, etc.).
- **UX-06 Show the source of each number** (tooltip "from Daily Job Sheet · 42 rows") on KPI tiles so staff can trust and check them.
- **UX-07 Mobile:** Attendance has no horizontal-scroll wrapper; add `overflow-x-auto` + sticky first column to wide tables.

**Pending**
- UX-08 Group by **client** (cleaned name via `cleanClientNameFromAddress`) with expandable visits; today each row shows the raw address.
- UX-09 Ageing buckets (0-30 / 31-60 / 60+ days) and a "send reminder" (WhatsApp) action per client.
- UX-10 Bulk "collect" for several visits of one client in one receipt.

**Payments**
- UX-11 A daily **cash-book view**: opening, collected by method, handed over, closing — matching how cash is reconciled with crew leads.
- UX-12 Store and filter by real payment method and reference number.

**Expenses**
- UX-13 Category budgets with a progress bar per month, and receipt photo upload per expense.
- UX-14 Profit card split into *Revenue · Expenses · Payroll · Agency payouts · Net* (AUD-31).

**Inventory**
- UX-15 Edit / delete / adjust-stock actions per row; usage log; purchase orders with "received" step (AUD-33).
- UX-16 Supplier view with contact and last order; low-stock banner links to a prefilled order.

**Invoices & Monthly Invoices**
- UX-17 Invoice preview with company letterhead from Settings, PDF download and "mark partly paid".
- UX-18 Link invoices to the jobs/visits they bill so a paid invoice clears those visits from Pending (avoids two parallel receivable systems).
- UX-19 Monthly Invoices: one click "generate invoice from statement" that creates a numbered invoice (AUD-36/37).

**Attendance**
- UX-20 Month calendar per cleaner (present/available/absent colours) and a monthly summary export.

**Monthly Clients**
- UX-21 Client picker (not free text) for payments; per-client ledger tab: visits, invoices, payments, balance.
- UX-22 The file is 3,767 lines with 15 tab states — split into sub-components per tab for speed and maintainability.

**Fluent Forms**
- UX-23 Lead pipeline as a Kanban (new → contacted → quoted → converted/lost) with response-time indicator.
- UX-24 Duplicate-lead detection (same phone within 7 days) and one-click "convert to booking" that pre-fills the booking form.

## Suggested fix order

| Phase | Items | Why |
|---|---|---|
| A — wrong money / legal | AUD-24, AUD-27, AUD-28, AUD-30, AUD-34, AUD-36, AUD-37 | Numbers used for decisions and documents sent to clients |
| B — fake data | AUD-32, AUD-33, AUD-35, AUD-41 | Remove anything not backed by data |
| C — consistency | AUD-31, AUD-39, AUD-40, AUD-42, AUD-38 | Screens agree with each other |
| D — small | AUD-25, AUD-26, AUD-29 + UX items | Polish |
