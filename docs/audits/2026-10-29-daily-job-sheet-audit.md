# Audit — Daily Job Sheet & Excel Mode (2026-10-29)

> **Screens:** `/daily-job-sheet` (`src/pages/DailyJobSheet.tsx`, 3,796 lines, + `src/components/dailyJobSheet/*`) and its Excel mode `/daily-job-sheet/spreadsheet` (`src/pages/JobSheetSpreadsheet.tsx`, 3,388 lines).
> **Question:** is the data correct, realistic and in sync with other screens? How can the screen, its UI/UX and the Excel mode be improved?
> **Method:** code review of `claude/workspace` (`947cb0c`). Date findings were reproduced with `TZ=Asia/Dubai` in Node.
> Findings continue the audit numbering: **AUD-44 … AUD-58**. Suggestions: **UX-25 … UX-40**.
>
> **Status 2026-10-29 (Phase 1, `claude/workspace`):** ✅ AUD-44, AUD-46, AUD-47, AUD-48, AUD-49, AUD-50, AUD-58, UX-33, UX-34 fixed. AUD-45 — **won't fix (owner decision):** Delete All stays, it is used to clear test entries at the end of testing. Dates follow Dubai time (DEC-012).
>
> **Status 2026-10-29 (Phases 2 + 3):** ✅ AUD-51, AUD-52, AUD-53, AUD-54, AUD-55, AUD-56, AUD-57 and UX-25 … UX-40 done (UX-25 and UX-29 were already present; UX-31 partly — see below). **All AUD-44 … AUD-58 are closed** except AUD-45 (owner decision).

## Summary

| Severity | Count | Main theme |
|---|---|---|
| 🔴 High | 6 | Jobs deleted or lost without the user asking (auto-purge, Save All, grid reload, Delete All), dates shifted by a day |
| 🟠 Medium | 5 | Fake defaults, hard-coded roster, totals that disagree with other screens |
| 🟡 Low | 4 | Consistency and performance |

**Fix first:** AUD-44, AUD-45, AUD-48, AUD-49 (data loss) and AUD-46 (wrong dates on import).

---

## A. Data can be deleted or lost

### AUD-44 🔴 Page load silently deletes "bogus" rows — including absence rows and new blank rows
- **Where:** `DailyJobSheet.tsx:513-520` (`isBogusSummaryJob`) + `:527-533` (effect that calls `deleteDailyJob` for every match, on every change of `dailyJobs`).
- **What:** any row with no address and no times, or no address/charges/received/service/remarks, is **deleted from the database** as soon as someone opens the Job Sheet. That includes rows that only say "Absent" / "Weekly off" (Attendance relies on them, R-ATT-01) and a blank row someone just added.
- **Fix:** never delete automatically — hide such rows from totals and show a "N rows look like totals — review" notice with a manual delete.
- **Status:** ✅ Fixed — rows are hidden with a "N rows look like totals — Show to review" notice; nothing is deleted automatically.

### AUD-45 🔴 "Delete All Data" wipes the whole history in one click
- **Where:** header menu `DailyJobSheet.tsx:2803-2809`, confirm `DailyJobModals.tsx:179-240`, action `DataContext.clearAllDailyData` (`:799-811`) + `DailyJobSheet.tsx:3658-3669`.
- **What:** one confirm deletes **every** daily job and expense in live Supabase plus pending items, recoveries and advances (which are cloud-synced, so the empty lists overwrite the cloud copy). No typed confirmation, no automatic backup/export, no owner-only restriction.
- **Fix:** owner-only; require typing `DELETE ALL`; download an Excel/JSON backup first; better: remove from the UI and keep it as an admin script.
- **Status:** ⏸ Won't fix — owner keeps Delete All to clear testing entries (2026-10-29).

### AUD-48 🔴 Excel mode loses unsaved edits whenever data changes in the background
- **Where:** `JobSheetSpreadsheet.tsx:1168-1189` — the grid reloads from `dailyJobs` on every change and sets `hasUnsavedChanges = false`. No `beforeunload` / route-leave warning.
- **What:** a background save, outbox retry, cloud sync, auto-fetched monthly shift or the AUD-44 purge replaces the grid; the user's typing disappears with no message.
- **Fix:** reload only when the date/filter changes or the user asks; if server data changed while editing, show "data changed — reload / keep mine"; warn before leaving with unsaved edits; keep a local draft.
- **Status:** ✅ Fixed — grid loads on date/filter change; background changes merge into rows you did not touch; your edits are kept with a "Load latest instead" notice.

### AUD-49 🔴 "Save All" deletes jobs that are not in the (possibly stale) grid and rewrites every row
- **Where:** `JobSheetSpreadsheet.tsx:1605-1668`.
- **What:** every job of the period that is not in the grid is deleted — e.g. a job added from Bookings, another device, or the monthly auto-fetch after the grid was loaded. Every unchanged row is also re-written to Supabase (hundreds of writes in range/all mode). `is_overtime` is updated only for new rows (AUD-58).
- **Fix:** track deletions explicitly (rows the user removed), save only changed rows (diff against the loaded copy), never delete rows the grid did not load.
- **Status:** ✅ Fixed — Save writes only added / edited / removed rows (diff against the loaded copy) and asks before overwriting rows changed elsewhere.

## B. Wrong values

### AUD-46 🔴 Excel import saves every date one day early (Dubai time)
- **Where:** `DailyJobSheet.tsx:1463-1469` — `XLSX.read(..., { cellDates: true })` gives a local-midnight `Date`; `toISOString()` converts it to UTC.
- **Proof:** `TZ=Asia/Dubai`: cell 27-Oct-2026 → saved as `2026-10-26`.
- **Impact:** imported shifts land on the previous day (attendance, revenue, payroll per day all wrong). Text dates like `27/10/2026` are parsed by `new Date()` (US order) and can also go wrong.
- **Fix:** format with local getters (`getFullYear/Month/Date`) or `XLSX.SSF`; parse `dd/mm/yyyy` explicitly.
- **Status:** ✅ Fixed — Excel dates read with local fields; text `dd/mm/yyyy` parsed explicitly.
- **Correction:** the import actually takes its date from the **file name** (string parsing, timezone-safe); the `toDate` helper above was never called and has been removed. The import preview (UX-28) now shows the date and lets you change it before saving.

### AUD-47 🟠 "Today" is the UTC date — wrong between 00:00 and 04:00 in Dubai
- **Where:** `DailyJobSheet.tsx:89, 268, 293`; `JobSheetSpreadsheet.tsx:903, 917-918, 1171-1174, 1612-1614, 1903, 1918`; `AddJobModal.tsx:98` (same pattern exists app-wide).
- **Proof:** 29-Oct 02:30 Dubai → `today` = `2026-10-28`.
- **Fix:** one `todayLocal()` helper (local date) used everywhere.
- **Status:** ✅ Fixed — `src/lib/dubaiTime.ts` (`todayDubai`, `monthDubai`) used app-wide (84 places).

### AUD-50 🟠 New Excel rows are pre-filled with fake values
- **Where:** `JobSheetSpreadsheet.tsx:1396-1414` — first employee, 08:00-16:00, 8 h, **AED 200 charged and AED 200 received in cash**, service "House".
- **Impact:** an unedited row becomes a fake AED 200 cash job (revenue, cash book, payroll).
- **Fix:** empty amounts and staff; times empty or copied from the row above.
- **Status:** ✅ Fixed — new rows start with no staff, AED 0 and no service; blank new rows are not saved.

### AUD-51 🟠 Hard-coded 26-name roster and history names in the "no job today" rows
- **Where:** `DailyJobSheet.tsx:621-648` (`allKnownCleaners`) — the roster removed elsewhere (AUD-08) is still here; every staff string ever used (including shared "Sita, Rupa" and inactive people) is added.
- **Fix:** registered active staff + names seen in the last 60 days, shared names split — the same list as Attendance (R-ATT-04).
- **Status:** ✅ Fixed — `buildCleanerRoster` (`src/lib/attendance.ts`) is shared by Attendance and the Job Sheet; the 26-name roster is gone.

### AUD-52 🟠 A third, different "bogus row" rule
- **Where:** `DailyJobSheet.tsx:513-520` uses a 2,000 AED threshold and an empty-stub rule that ignores remarks; `clientDataSync.ts → isBogusJob` uses 1,500 (AUD-21 unified the others).
- **Fix:** use `isBogusJob` only.
- **Status:** ✅ Fixed — the page uses `isBogusJob` only.

### AUD-53 🟠 "Today Pending" disagrees with the Pending screen
- **Where:** `DailyJobSheet.tsx:811` uses `calcJobPending` (counts monthly-contract and invoiced visits); Pending/Payments/Overview use `calcJobCollectable` (R-FIN-05, R-FIN-06).
- **Fix:** use `calcJobCollectable` for the receivables widget and show monthly visits separately.
- **Status:** ✅ Fixed — row pending, totals, "Today Pending", the Pending filter and the Excel pending column use `calcJobCollectable` (monthly and invoiced visits excluded).

### AUD-54 🟡 "Collected" uses a different rule from Overview
- **Where:** `DailyJobSheet.tsx:854` — only `received` of non-monthly rows; Overview counts cash rows with charges and no received as collected (`jobCollected`, R-FIN-03).
- **Fix:** one helper; if the sheet wants "cash actually entered", label it so.
- **Status:** ✅ Fixed — collected, online total and per-staff summary use `jobCollected`.

## C. Consistency & performance

### AUD-55 🟡 Day/all deletes bypass the write outbox
- **Where:** `DataContext.tsx:796-797, 805-808` — direct Supabase deletes, errors only logged (AUD-20 pattern).
- **Status:** ✅ Fixed — day delete goes row by row through the outbox; Delete All falls back to the outbox if the bulk delete fails. Also removes a race where a late "delete where date = …" could wipe rows just imported.

### AUD-56 🟡 "All" mode loads and renders every job
- **Where:** `JobSheetSpreadsheet.tsx:1178` and the row render — no virtualisation; with thousands of rows the grid slows down and Save All rewrites all of them.
- **Status:** ✅ Fixed — the grid draws 300 rows at a time ("Show 300 more" / "Show all"); totals still use all rows; Save writes only changed rows (AUD-49).

### AUD-57 🟡 Browser alerts remain
- **Where:** `DailyJobSheet.tsx` (2), `AddJobModal.tsx` (1) — use `notify` / `confirmAsync` (D-11).
- **Status:** ✅ Fixed — alerts replaced with toasts.

### AUD-58 🟡 Overtime flag not updated on edit
- **Where:** `JobSheetSpreadsheet.tsx:1633-1648` — `is_overtime` set only when inserting (`:1663`).

---
- **Status:** ✅ Fixed — `is_overtime` is saved on every edit, not only on new rows.

## UI/UX & functionality suggestions

### Daily Job Sheet screen
- **UX-25 Day navigation strip:** `◀ date ▶`, "Today" (local date), and a clear day status (open / closed).
- **UX-26 Close the day:** a "Close day" step that checks the cash book (UX-11) and locks the day's rows; reopening is owner-only. Stops later accidental edits to settled days.
- **UX-27 Row checks:** inline warning chips — end before start, received > charges, monthly row with cash received, staff not registered (with "Register employee"), duplicate row (same staff + address + date + start).
- **UX-28 Import preview:** after choosing a file, show the parsed rows, detected sheet and dates, duplicates against existing rows — then "Import N rows". Fixes surprises from AUD-46.
- **UX-29 Smarter filters:** payment mode, pending only, monthly only, unregistered staff — next to the existing staff-letter filter.
- **UX-30 "Available today" section:** collapsible list of active staff without a job (from the shared Attendance list), with a one-click "assign job".
- **UX-31 Split the page:** 3,800 lines → page shell + sections (table, widgets, import, modals) so each can be tested.

### Excel mode efficiency
- **UX-32 Paste from Excel/Sheets:** multi-cell TSV paste, `Ctrl+C` of a range, `Ctrl+D` fill-down — the biggest time saver for daily entry.
- **UX-33 Safe save:** save only changed rows, explicit deleted-rows list, "N changes" counter, conflict prompt if the server changed since load (fixes AUD-48/49).
- **UX-34 Draft & leave guard:** autosave the grid to a local draft; warn on tab close / navigation with unsaved edits.
- **UX-35 Dropdowns & autocomplete:** staff from Employees, address/client from the Clients list (same `ClientPicker` source), payment mode and material as selects; numbers right-aligned and validated.
- **UX-36 Excel-like keys:** `Tab`/`Enter` move, `F2` edit, `Esc` cancel, `Delete` clears the selected range.
- **UX-37 Frozen header + first column, sticky totals row** and per-staff subtotals in block view.
- **UX-38 Virtual scrolling** for range/all modes; cap "All" with paging (fixes AUD-56).
- **UX-39 Column presets:** "Cashier" (charges/received/mode), "Payroll" (staff/hours/OT), "Ops" (address/time/service).
- **UX-40 Row history:** who changed a row and when (from `audit_log`), shown on hover.

## Suggestions — status (2026-10-29)

| ID | Status |
|---|---|
| UX-25 Day navigation | ✅ already present (◀ date ▶, Today, presets) |
| UX-26 Close day | ✅ "Close day" with cash summary + lock; "Reopen day" asks first. Owner-only reopen needs user roles (not in the app yet). Key `safaeewala_closed_days` (cloud-synced) |
| UX-27 Row checks | ✅ amber "N checks" chip + "Checks" filter (`src/lib/jobChecks.ts`) |
| UX-28 Import preview | ✅ `ImportPreviewModal` — sheet, date (editable), rows, duplicates, what gets replaced |
| UX-29 Smarter filters | ✅ already present (mode, pending); Pending now uses the receivable rule, "Checks" added |
| UX-30 Available today | ✅ "available (no job)" rows get "+ Assign job" (staff pre-filled) |
| UX-31 Split the page | 🟡 partly — Excel parsing (`src/lib/jobSheetImport.ts`, ~450 lines), import preview, row checks, roster and closed days moved out; page 3,800 → ~3,450 lines. Splitting the table/widgets is left to avoid conflicts with Antigravity |
| UX-32 Paste / fill-down | ✅ Ctrl+V pastes a block from Excel/Sheets (adds rows), Ctrl+C copies a cell, Ctrl+D fills down |
| UX-33 / UX-34 | ✅ Phase 1 |
| UX-35 Autocomplete | ✅ staff (Employees), client (Clients), area, service lists; payment mode / material already selects |
| UX-36 Excel keys | ✅ arrows, Tab, Enter/F2 edit, Enter/Tab save-and-move, Esc, Delete clears, type to edit |
| UX-37 Frozen header / totals | ✅ already present (sticky header, first column, totals row) |
| UX-38 Virtual scrolling | ✅ as paging (300 rows at a time) |
| UX-39 Column presets | ✅ All / Cashier / Payroll / Ops |
| UX-40 Row history | ✅ right-click → "Row history" (from `audit_log`); job edits and deletes are now logged with the changed fields |

## Suggested order

| Phase | Items |
|---|---|
| 1 — stop data loss | AUD-44, AUD-45, AUD-48, AUD-49, UX-33, UX-34 |
| 2 — correct dates & values | AUD-46, AUD-47, AUD-50, AUD-51, AUD-52, AUD-53, AUD-54, UX-28 |
| 3 — speed & polish | AUD-55 … AUD-58, UX-32, UX-35 … UX-38, then the rest |
