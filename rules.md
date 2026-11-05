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

### R-SCHED-04 — What makes a client monthly
- **Rule:** A client is **monthly** when any of these is true:
  - it has a permanent schedule (`service_days`, `day_schedules` or `day_cleaner_assignments`);
  - its source is `monthly` / `monthly_contract`;
  - it has *Monthly* jobs on the Daily Job Sheet.
- Every other client is **standard**. A word in a note or remark ("monthly payment pending") does not change the type.
- A monthly client found only through Monthly jobs has **no fixed schedule**: its card says so, and the monthly auto-sync cannot fill the Daily Job Sheet for it until the schedule is set in *Edit → 7-Day Schedule*.
- **Code:** `src/lib/clientDataSync.ts → isMonthlyClient` and the two summary builders.
- **Status:** Active · Since: 2026-11-03 (CM-06)

### R-SCHED-05 — Monthly visits sync only while the contract runs
- **Rule:** *"active monthly clients ka data tab tak Daily Job Sheet par khud ba khud synchronize hota rahay jab tak unka contract manually off ya cancel nahi kiya jata."*
  - An active monthly client's scheduled visits keep being added to the Daily Job Sheet automatically.
  - When every contract of the client in *Monthly Clients → Contracts* is **paused** or **cancelled**, no new visits are added. Visits already on the sheet stay.
  - A client with no contract record keeps syncing from their 7-day schedule (R-SCHED-04).
  - Contracts are matched to the client by name.
- **Code:** `src/lib/clientDataSync.ts → isMonthlyContractStopped`, checked in `getScheduledMonthlyShiftsForDate`. Every sync path (startup, Daily Job Sheet, Bookings) goes through it.
- **Status:** Active · Since: 2026-11-04

### R-SCHED-07 — Bi-Weekly visits go to the Daily Job Sheet by themselves
- **Rule:** *"bi-weekly ki jobs … days, time select ho jayen gen jo k automatically sheet me show ho jaen gi un days me, jese monthly job show hoti hen."*
  - The days, time and cleaner chosen in Add New Client → Mode Bi-Weekly create the visits on the Daily Job Sheet by themselves, with the same sync as monthly visits.
  - Only between the contract's start and end dates. **Every week** on the chosen days by default; *Every other week* can be chosen on the card.
  - The row: address "<building> Apt <n> - <client>", the day's time and cleaner, payment mode Cash, charges 0 (filled by the office), remark "(Bi-Weekly Schedule)". A busy cleaner is not double-booked (R-SCHED-06).
- **Code:** `src/lib/biweekly.ts → biweeklyVisitOn`; `clientDataSync.getScheduledMonthlyShiftsForDate`.
- **The sync note (UX-86):** when a visit is added without a cleaner, the reason is kept at the end of its remarks. The Excel Job Sheet hides it from Remarks and shows a flag next to the cleaner's name instead (`src/lib/jobFlags.ts`). The flag stays grey (history, no clash) after a cleaner is assigned, until it is cleared.
- **Status:** In code · needs `2026-11-04_clients_service_mode.sql` · Since: 2026-11-05

### R-SCHED-06 — A clash is stopped where it starts
- **Rule:** *"error ko booking entry ke waqt hi detect kar ke rokna chahiye tha taake job duplicate na ho."* A cleaner is never given two jobs at the same time (R-JOB-01), at every entry point:
  - **Monthly schedule** (Add / Edit Monthly Client): the schedule is not saved when a cleaner already works for another monthly client on that weekday at an overlapping time. The message names the client, day and time.
  - **Monthly auto-sync**: a visit whose cleaner is already booked at that time is added **unassigned**, with a remark naming the other job ("⚠ Ambika is already booked 09:00–12:00 at Office Luxam… : assign a cleaner"). Earlier it was added with the same cleaner.
  - **New / Edit Booking**: not saved when a chosen cleaner already has a job-sheet row or another booking at an overlapping time that day.
  - Add Job, Edit Job, inline edits and the Excel save already block clashes (R-JOB-01).
- **Code:** `clientDataSync.ts → busyJobOf, findMonthlyScheduleClashes, syncMonthlySchedulesToDailyJobs`; `AddMonthlyClientModalForm.tsx`; `NewBookingModal.tsx`.
- **Status:** Active · Since: 2026-11-04

---

## ATT — Attendance

### R-ATT-01 — Absent only when specifically marked
- **Rule:** *"System available cleaners mein say sirf unhein Absent count karay jo specifically mark hon, jabke blank entries ka matlab ho ga keh cleaner available tha magar koi job assigned nahi thi."*
  - **Present:** ≥ 1 worked shift that date (a row with duty hours or charges).
  - **Available / Standby:** no job that date → **never counted as absent**.
  - **Absent:** only via an explicit mark — Attendance screen *Uninformed Absence / Other*, a rejected leave (R-ATT-05), or a job-sheet row with no hours/charges whose remarks/address say `absent`, `not available`, `medical emergency`, `uninformed`.
  - **On leave:** `on leave`, `sick leave`, `annual leave`, `emergency leave`, `day off`, `weekly off`, or an Attendance leave category (Sick / Emergency / Annual Leave, Weekly Off) — pending or approved.
- **Code:** `src/lib/attendance.ts → classifyAttendanceDay` (Attendance list, monthly calendar); marks in the Supabase table `attendance_marks`, key `YYYY-MM-DD_id:<employeeId>` or `YYYY-MM-DD_<name lowercase>` (R-SYNC-10).
- **Status:** Active · Since: 2026-10

### R-ATT-04 — Who appears on the attendance list
- **Rule:** Registered non-inactive employees, plus unregistered names seen on the job sheet in the last 60 days, plus anyone with a shift on the selected date. Shared rows ("Sita, Rupa") are split per cleaner. No hard-coded roster.
- **Code:** `src/lib/attendance.ts → buildCleanerRoster` (Attendance + Daily Job Sheet).
- **Status:** Active · Since: 2026-10-27 (AUD-08, AUD-18)

### R-ATT-02 — A worked row is never an absence
- **Rule:** A row with `duty_hours > 0` or `charges > 0` is a worked shift whatever its remarks say ("Leave keys at reception" must not mark anyone absent).
- **Code:** `Attendance.tsx` (`isWorkedShift`), `src/lib/employeeHealth.ts`.
- **Status:** Active

### R-ATT-03 — Manual override wins for that date
- **Rule:** An Attendance override for a date replaces what the job sheet implies for that cleaner and date.
- **Status:** Active

### R-ATT-05 — Leave needs admin / manager approval
- **Rule:** *"leave ka approval hona chaheye, admin dekhe ga k aya iski leave consider krni he ya isko mark as absent krna he."*
  - A leave category (Sick Leave, Emergency Leave, Annual Leave, Weekly Off) marked by any other role is a **pending request**; the cleaner shows *Leave · Awaiting approval*.
  - Admin or manager **approve** (stays leave) or **reject** (recorded as **absent**). A leave they mark themselves is approved at once.
  - *Uninformed Absence* and *Other* are absences — final at once, no approval.
  - A pending leave is not an absence (health score, reports). Other roles cannot change a decided leave; the database refuses a decision from any role but admin / manager.
- **Code:** `src/lib/attendance.ts → newAbsenceMark, decideLeave, canApproveLeave`; `Attendance.tsx` (Leave approvals panel); trigger `attendance_marks_guard` in migration `2026-11-03_attendance_marks.sql`.
- **Status:** Active · Since: 2026-11-03 (ATT-A06)

### R-ATT-06 — Monday leave is flagged for approval
- **Rule:** *"monday ki jo leave aye gi wo jab approval k liye admin ya manager k pas jae to tb just flag show kre take approval ya rejection me asani ho."* A **pending** leave on a Monday (Dubai calendar date) gets a yellow row and a yellow **Monday** flag in the Leave approvals list. The row also says how many other Monday absences / leave the cleaner had in the 90 days before. Only there — decided leave and other screens show no flag.
- **Code:** `src/lib/attendance.ts → isMondayDate`; `Attendance.tsx` (Leave approvals).
- **Status:** Active · Since: 2026-11-03 (ATT-A07)

### R-ATT-07 — The Daily Job Sheet shows Attendance marks
- **Rule:** A cleaner who still has jobs on a date they are marked absent / on leave gets an *Absent / On leave in Attendance — reassign* tag on the job row. The job rows are never moved or deleted by a mark.
- The separate *Absent / On Leave* rows for cleaners without jobs were removed on 2026-11-04 (R-ATT-08).
- **Code:** `DailyJobSheet.tsx → attendanceMarkFor`.
- **Status:** Active · Since: 2026-11-03 (ATT-A01) · changed 2026-11-04

### R-ATT-08 — A cleaner away that day is not offered for work
- **Rule:** *"leave par gaya hoa cleaner Active Job Sheet ya scheduling dropdown mein nazar na aaye."*
  - Away means marked **absent**, or **on leave** (pending or approved), in Attendance for that date. A rejected leave is an absence, so it also counts.
  - Such a cleaner is not listed on the Daily Job Sheet when they have no job that day.
  - They are not offered in the cleaner picker of Add / Edit Job (Daily and Excel) for that date, or in the Excel staff suggestions. The popup says who was left out.
  - A cleaner already on the job being edited stays selected. A job they still hold stays on the sheet with the *reassign* tag (R-ATT-07).
  - Marks kept by employee id or by name both count.
- **Code:** `src/lib/attendance.ts → isAwayMark, awayCleanerNames`; `AddJobModal.tsx` (`pickableStaff`); `JobSheetSpreadsheet.tsx` (`staffOptions`); `DailyJobSheet.tsx` (`nilRows`).
- **Status:** Active · Since: 2026-11-04

---

## OT — Overtime

### R-OT-01 — Overtime (OT) Policy & Two-Scenario Calculation
- **Rule Definition:**
  > **"Overtime (OT) do scenarios mein calculate hoga: (1) Shaam 8:00 PM kay baad ki janay wali duty har soorat mein OT shumar hogi, chahe us waqt tak basic hours kuch bhi hon. (2) Agar koi employee 8:00 PM say pehle apne basic duty hours (8 ghantay) say zayada duty kar lay, to woh extra hours bhi OT mein shamil hon gay."**
- **Detailed Scenarios:**
  - **Scenario 1 (Post-8:00 PM Rule):** Any work executed after **8:00 PM (20:00)** is strictly and unconditionally treated as Overtime, regardless of how many basic hours were worked beforehand (e.g., a 4h shift from 18:00 to 22:00 yields 2 OT hours for 20:00–22:00 even though total duty is only 4h). Shifts crossing midnight (e.g. 21:00 → 02:00) remain continuous OT.
  - **Scenario 2 (Excess Basic Hours Before 8:00 PM Rule):** Standard basic duty hours are **8 hours** (480 minutes). If an employee works more than 8 hours before 8:00 PM, all hours exceeding the 8-hour basic threshold qualify as Overtime (e.g., an 08:00 to 18:00 shift consists of 10 hours total before 8 PM: 8 hours standard duty + 2 hours OT).
  - **Combined Shifts (Scenario 1 + Scenario 2):** When a shift exceeds 8 hours before 8 PM and also extends past 8 PM, total OT is the sum of both components (e.g., 10:00 to 22:00 is 12h total: 10:00–20:00 has 10h pre-8 PM → 8h standard + 2h OT; 20:00–22:00 has 2h OT → Total OT = 4h).
  - **Multi-Shift Cumulative Tracking:** When a cleaner works multiple shifts on the same date, pre-8:00 PM duty is tracked cumulatively in chronological order against the daily 8-hour basic limit (480 mins). Excess pre-8 PM hours across earlier and later shifts plus post-8 PM hours are calculated at shift level and totaled across the day (`recalculateAllRowsOT`).
- **Always automatic (DEC-015):** OT comes only from the rules above. It cannot be typed, pasted or imported (an OT number or "yes" in a file is not used), and the old `is_overtime` column and stored `ot_hours` are never read.
- **Calculation:**
  1. **Times known:** `recalculateAllRowsOT(shifts)`: chronological pre-8 PM accumulation against the 8h basic limit + post-8 PM hours.
  2. **Times missing:** duty hours above what is left of the 8h basic limit.
- **Team jobs:** one row, but each cleaner has their own day: each cleaner's OT is kept separately (`calcCleanerOTHours`) and used on Employees, profiles and Attendance. The row shows the highest; totals sum the cleaners (`totalRowOT`).
- **Overlaps:** Time covered by two overlapping shifts of one cleaner is counted once. Each row still shows its own duty.
- **One source:** `DataContext` works out OT for all jobs (`viewDailyJobs`), so every screen shows the same OT; a stored `ot_hours` is not trusted.
- **Why:** Protects staff compensation and ensures accurate operational tracking for late evening shifts, split shifts, and prolonged daily shifts according to company overtime policy.
- **Code:** `src/components/dailyJobSheet/jobSheetUtils.ts → recalculateAllRowsOT, calcDailyCleanerShiftsOT, calcOTHours`, `src/lib/clientDataSync.ts → calcJobOTHours`, `src/pages/JobSheetSpreadsheet.tsx`, `src/pages/DailyJobSheet.tsx`, `src/lib/jobSheetImport.ts`.
- **Status:** Active · Updated 2026-11-01

### R-OT-02 — High OT flag
- **Rule:** ≥ 10 OT hours in the selected period = "High OT" (amber accent, `HIGH` badge, `High OT >10h` filter).
- **Code:** `src/pages/Employees.tsx`.
- **Status:** Active

---

## BK — Bookings

### R-BK-01 — Completing is not paying
- **Rule:** "Mark as Completed" sets only the status to `completed` on the record — the booking, or the Daily Job Sheet row for a job-sheet card; for a monthly-schedule card today's job rows are created and this client's row is completed. It never writes a received amount: money is recorded with Record Payment. A completed card moves from Live Now to Completed at once, on every device.
- **Code:** `Bookings.tsx → handleToggleMarkAsCompleted`; old browser-only list moved to the records once.
- **Status:** Active · Since: 2026-11-02 (E2E-20, E2E-21)

### R-BK-02 — Statuses
- **Rule:** `pending` (awaiting confirmation) → `confirmed` (shown as *Scheduled*) → `in_progress` (*Live Now*: today, cleaner assigned) → `completed`; `cancelled` at any point. A card linked to a job row is completed when the row is completed or fully paid.
- **Code:** `Bookings.tsx → normalizeBookingStatus, synchronizedBookings`.
- **Status:** Active

### R-BK-03 — Recurring visits
- **Rule:** The next visit is created when a visit is completed: weekly +7 days, biweekly +14, monthly on the contract's day of the month (`recurrence_day`), or the month's last day when the month is shorter.
- **Code:** `bookingSync.ts → nextOccurrence`. Migration `2026-11-02_bookings_recurrence_day.sql`.
- **Status:** Active · Since: 2026-11-02 (E2E-22)

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

### R-SYNC-06 — Bookings and the job sheet share one link and one set of rules
- **Rule:** A booking and its job-sheet row are linked by `booking_id` only (a name guess is used for old bookings only when it is exact and unique). Edits flow both ways with the same mapping and are saved to the database; payments are the job row's `received`; completing (on either screen) creates one draft invoice linked to the booking and its rows (not for monthly contracts) and the next recurring visit with its own row; cancelling removes the row (copy kept), un-cancelling brings it back; deleting a booking keeps a copy; re-importing a day keeps booking rows; monthly visits are added only after the cloud data has loaded and once per client and day.
- **Code:** `src/lib/bookingSync.ts`, `DataContext → createJobForBooking, onBookingCompleted, updateBooking, updateDailyJob`, `clientDataSync → syncMonthlySchedulesToDailyJobs`.
- **Status:** Active · Since: 2026-11-01 (BJ-01…BJ-18)

### R-SYNC-07 — Everything reaches the cloud
- **Rule:** Every business record is saved in Supabase: tables through the outbox, other lists through cloud-synced keys; nothing is kept in one browser only (UI preferences excepted). Rows found only in a browser are uploaded once per device; a field without a column never blocks the rest of the row and is reported.
- **Code:** `syncQueue.ts`, `cloudState.ts`, `DataContext → fromServer`, `fluentFormsSync.ts`, `webhookServer.cjs → saveLeadToCloud`.
- **Status:** Active · Since: 2026-11-01

### R-SYNC-08 — Excel Job Sheet saves one job per job
- **Rule:** A job with several cleaners shows one grid row per cleaner, but Save writes it back as **one** job: cleaners joined in `staff_name`, shared fields (time, address, area, material, notes) from the row that was changed, money from the lead row. Removing every cleaner row deletes the job. Save never creates a job for a per-cleaner row and never cuts cleaners off a job. A team job added with **Add Job** is split into one row per cleaner at once. Each row goes into that cleaner's block, and the team gets the next free *Team X* letter. On Save the rows are saved as one job. **Team names are unique per date:** a name another team already uses that day (saved or on screen) is replaced with the next free letter, and the new name is saved with the job.
- **Code:** `JobSheetSpreadsheet.tsx → handleSaveAll` (`splitJobPayload`), rows built by `ensureThreeRowsPerStaff`; `src/lib/excelTeams.ts → expandTeamJob, placeRowsInCleanerBlocks, nextTeamRef, uniqueTeamRefs`.
- **Status:** Active · Since: 2026-10-31 · Add Job split since 2026-11-03

### R-SYNC-09 — Several users, one live picture
- **Rule:** Every insert / update / delete in bookings, clients, employees, agencies, invoices, inventory, daily jobs and expenses reaches every signed-in browser live (Supabase Realtime) and is merged without a reload; a row with an unsaved local change keeps the local version until it is uploaded. Shared settings (payment modes, materials, colours, closed days, …) are cloud-synced and arrive live too — the open screen offers *Refresh*. A browser idle for 2 hours is signed out.
- **Code:** `src/lib/realtime.ts`, `DataContext` (subscribeTables), `cloudState.ts → subscribeCloudState`, `App.tsx → AuthGate`. Migration `2026-11-02_realtime.sql`.
- **Status:** Active · Since: 2026-11-02 (E2E-13, E2E-17, E2E-18)

### R-SYNC-10 — Attendance marks: one row per cleaner and date
- **Rule:** Present / Absent / Leave marks and leave decisions are rows of the Supabase table `attendance_marks` (one per cleaner + date), saved through the outbox and sent live to every user — two users marking at once no longer undo each other, and a reset mark does not come back. Until the migration has run the app keeps using the old shared value (`app_state` key `safaeewala_cleaner_attendance_overrides`); the migration copies it in (existing leave = approved).
- **Code:** `src/store/useAttendanceMarks.ts`, `realtime.ts → subscribeAttendanceMarks`, `DataContext → attendanceMarks / saveAttendanceMarks`. Migration `2026-11-03_attendance_marks.sql`.
- **Status:** Active · Since: 2026-11-03 (ATT-A02, ATT-A03)

### R-SYNC-11 — A job's row colour is saved in the cloud
- **Rule:** The row colour chosen in Add Job or the Excel Job Sheet is saved with the job, so every device shows it. Before 2026-11-03 `daily_jobs` had no `row_color` column and the outbox dropped the field: the colour stayed in one browser only.
- **Code:** `syncQueue.ts → DAILY_JOBS_COLUMNS`; migration `2026-11-03_daily_jobs_split_and_color.sql`.
- **Status:** Active once the migration has run · Since: 2026-11-03

### R-SYNC-04 — Staff are matched by whole words
- **Rule:** An employee matches a job's `staff_name` by normalised full name or whole-word match — "Rupa" must not match "Rupak".
- **Code:** `clientDataSync.ts → employeeMatchesStaff`.
- **Status:** Active

---

### R-FORM-01 — A popup never saves with a required field empty
- **Rule:** *"CRM ke tamam pop-ups aur Add Job Entry mein, agar koi mandatory field khaali ho to data save na ho … top par wazeh error message … specific field ko highlight kare."*
  - Nothing is saved while a required field (marked *) is empty or invalid.
  - A red message at the top of the popup names every missing field; a click on a name jumps to it.
  - Each missing field gets a red outline and a red label until it is filled.
- **Required in Add Job Entry** (Daily Job Sheet, Excel Job Sheet, Edit Job): Staff Name, Job Date, Address, Start Time, End Time. **New Booking:** Job Date, Address, Start Time, End Time.
- **Code:** `src/lib/requiredFields.ts` + `RequiredBanner` (controlled forms); `src/components/common/FormGuard.tsx` handles every field marked `required` in any form, and `requireFields` / `requireInPopup` handle checks done in code (monthly client days, payments, expenses, contracts, campaigns, Bi-Weekly days).
- **Status:** Active · Since: 2026-11-05

### R-JOB-01 — A cleaner cannot work two jobs at the same time
- **Rule:** When a job is added or edited (Add Job Entry, Edit Job, Daily Job Sheet inline edit, Excel Job Sheet cell / time dropdown / row popup / Save), a cleaner who already has a job overlapping that time on that date is refused with an error message, and the entry is not saved. Back-to-back shifts (12:00 end, 12:00 start) are allowed; shifts after midnight count into the next day. Clashes already in the data do not block unrelated edits (remarks, money) — only a change of cleaner, time or date is checked. The Excel Job Sheet lists every clash in the open sheet (saved or not) in a red banner as soon as it appears, outlines the rows in red, and *Show* jumps to them. Add Job in the Excel Job Sheet checks the rows on screen too, not only saved jobs.
- **Code:** `src/lib/shiftClash.ts` (`findStaffClash`, `findClashAmong`, `findAllClashes`), used by `AddJobModal`, `EditJobModal`, `DailyJobSheet → saveInlineEdit`, `JobSheetSpreadsheet → refuseClash / handleSaveAll`. Test: `tests/unit/shift-clash.test.ts`.
- **Status:** Active · Since: 2026-10-31

### R-DATA-11 — A new client typed on a job is registered first
- **Rule:** A new address typed on a job (Add Job Entry, Excel Job Sheet, row edit) opens the Clients screen's "Add New Client" popup with the address filled in, so the details and WhatsApp number are saved before the job entry is finished.
- **Code:** `QuickNewClientModal` → `ClientModalForm` (`prefill`).
- **Status:** Active · Since: 2026-10-31

---

## CLI — Clients

### R-CLI-01 — Client address format
- **Rule:** *"pehle Apartment ya Villa Number, phir Building ya Villa Name, aur aakhir mein Area Name (misal ke tor par: 302, Al Khair Building, ya Villa 25, Mirdif)."*
  - An address is written **number → building / villa name → area**, separated by commas: *302, Al Khair Building, Mirdif* or *Villa 25, Mirdif*. The city, where shown, comes last.
  - In *Add New Client* → *Address & Crew Assignment*, the field **Apartment / Villa Number** comes first and **Building / Villa Name** after it.
  - Client cards, the client picker, the client profile and Monthly Clients show addresses in this order.
  - Not changed: the address text of monthly visits already synced to the Daily Job Sheet, because older rows are matched by it.
- **Code:** `src/lib/clientAddress.ts → formatClientAddress`, `ClientModalForm.tsx`.
- **Status:** Active · Since: 2026-11-04

### R-CLI-03 — The address identifies a client; the name is optional
- **Rule:** *"CRM system ke tamam modules mein Client Name ki field ko optional banaya jaye … main zareya unka Address hoga."*
  - Add Client, Add Monthly Client and the quick client form save without a name.
  - The **address is required**: an apartment / villa number or a building / villa name. An area alone is not an address.
  - Without a name, the address ("302, Al Khair Building") is stored as the client's name, so every list, search, match and invoice keeps working. A name can be added later.
  - Job and booking forms already ask only for the address. Payment and contract forms still ask for a client, because a payment must belong to one; the client can be picked by its name or its address.
- **Code:** `src/lib/clientAddress.ts → hasClientAddress, clientNameOrAddress`; `ClientModalForm`, `AddMonthlyClientModalForm`; `schemas.ts`.
- **Status:** Active · Since: 2026-11-05

### R-CLI-02 — Client mode: General, Bi-Weekly or Monthly
- **Rule:** *"'Mode' ka dropdown … 'General', 'Bi-Weekly', aur 'Monthly' … 'Monthly' select karne par system user ko monthly client flow par redirect kare; 'General' aur 'Bi-Weekly' … same pop-up par hi rahen … user specific days select kar sakay aur sath hi contract ki duration … define ki ja sakay."*
  - **General** (default): an ordinary client with one-off jobs.
  - **Bi-Weekly**: in the same popup, a schedule table like the monthly one (day, start, end, duration, cleaner) and the contract: start date and duration in months (1–12, or custom). Visits are the ticked days **every other week**, from the start week until the end date. The popup shows the end date and the number of visits. At least one day must be ticked.
  - **Monthly**: the popup switches to the monthly client form (7-day schedule). What was already typed comes along. The mode can be switched back from the popup header.
  - A Bi-Weekly plan does not make a client monthly (R-SCHED-04), so the monthly auto-sync does not touch it. Bi-Weekly visits are **not** added to the Daily Job Sheet automatically yet.
  - An existing monthly client keeps its *Profile / 7-Day Schedule* tabs; its mode cannot be changed there.
- **Data:** `clients.service_mode` text, `clients.biweekly_plan` jsonb (migration `2026-11-04_clients_service_mode.sql`). Until the migration runs, the outbox leaves these two fields out and saves the rest.
- **Code:** `ClientModalForm.tsx` (`chooseMode`, `modeSelect`), `BiWeeklyScheduleCard.tsx`, `src/lib/biweekly.ts`, `AddMonthlyClientModalForm` (`prefill`).
- **Status:** Active · Since: 2026-11-04

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

### R-DATA-06 — Business dates follow Dubai time
- **Rule:** "Today", "this month" and every saved business date use the Asia/Dubai calendar, whatever the timezone of the computer. Excel calendar dates are read as written (no UTC shift); text dates are day/month/year.
- **Code:** `src/lib/dubaiTime.ts` (`todayDubai`, `monthDubai`, `calendarDate`); never `new Date().toISOString().split('T')[0]`.
- **Status:** Active · Since: 2026-10-29 (AUD-46, AUD-47, DEC-012)

### R-DATA-07 — The job sheet never deletes or overwrites rows by itself
- **Rule:** Rows that look like sheet totals or empty stubs are hidden and offered for review, never auto-deleted. Excel mode saves only the rows the user added, edited or removed, keeps unsaved edits through background changes, keeps a local draft and warns before leaving.
- **Code:** `DailyJobSheet.tsx` (hidden rows notice), `JobSheetSpreadsheet.tsx` (`pendingChanges`, `handleSaveAll`, draft `safaeewala_excel_draft:*`).
- **Status:** Active · Since: 2026-10-29 (AUD-44, AUD-48, AUD-49, UX-33, UX-34)

### R-DATA-08 — Closed days are locked
- **Rule:** A day closed on the Daily Job Sheet cannot be edited, added to, deleted from or re-imported until it is reopened (with a confirmation). Row checks warn but never block.
- **Code:** `src/lib/closedDays.ts`, `DailyJobSheet.tsx → blockIfClosed`, `src/lib/jobChecks.ts`.
- **Status:** Active · Since: 2026-10-29 (UX-26, UX-27). Excel mode does not check the lock yet.

### R-DATA-09 — One person, one record
- **Rule:** An employee's Emirates ID or passport number cannot be on two employee records (refused); the same phone asks first. A client with the same phone, or the same name + building, asks before a second record is created. Phones are compared in one UAE form (`9715XXXXXXXX`); a non-UAE number asks first. Emirates ID must be 15 digits starting with 784 and is stored as `784-YYYY-NNNNNNN-N`.
- **Code:** `src/lib/validation.ts`, client and employee forms; listed in Settings → Data health (`src/lib/dataHealth.ts`).
- **Status:** Active · Since: 2026-10-30 (VAL-01…04, AUD-67)

### R-DATA-10 — A copy is kept before anything big is deleted
- **Rule:** Before "Delete All Data", deleting or re-importing a day, and deleting an agency with its staff, a copy is saved (newest 10 in this browser; Delete All also downloads a file). Settings → Backup → Before-delete copies can restore them; records that still exist are not duplicated.
- **Code:** `src/lib/snapshots.ts`, `DataContext → restoreRecords`, `components/settings/BeforeDeleteCopies.tsx`.
- **Status:** Active · Since: 2026-10-30 (BAK-5)

---

## DRV — Drivers

### R-DRV-01 — Route plan comes from the Daily Job Sheet
- **Rule:** The day's jobs are grouped into **sites** (same cleaned address + area). Each site is one colour-coded card with its cleaners, drop time (earliest start) and pick-up time (latest end), ordered by drop time. Sites are assigned to drivers (employees with the Driver role) by hand or "Auto-assign by area" (same area → same driver, balanced load). The plan is per date in the cloud-synced key `safaeewala_driver_plans`; it never changes the job sheet.
- **Code:** `src/lib/driverRoutes.ts` (`buildRouteSites`), `src/lib/driverPlans.ts`, `src/pages/Drivers.tsx`.
- **Status:** Active · Since: 2026-10-31

### R-DRV-02 — Driver duty sheets have no OT and no Material
- **Rule:** A driver's sheet lists drop, pick-up, site, area, cleaners, service, payment (cash to collect) and remarks only — never OT or Material. Sent by WhatsApp, printed or exported to Excel; when the job sheet changes after sending, the driver row shows "Changed — send again". Drivers see the same sheet on **My Duties**.
- **Code:** `driverRoutes.ts → SHEET_COLUMNS, driverSheetRows, driverSheetText, sheetSignature`, `components/drivers/DriverSheetActions.tsx`, `src/pages/MyDuties.tsx`.
- **Status:** Active · Since: 2026-10-31

### R-DRV-03 — Live location only while the driver shares it
- **Rule:** Location is sent only after the driver presses "Start shift — share my location" on My Duties and while that page is open (at most every 20 s); "Stop sharing" marks it off. A driver can write only the row of the employee linked to their own login; office users can read. Shown as Live (< 5 min), No signal, or Stopped.
- **Code:** `src/lib/driverLocation.ts`, migration `2026-10-31_driver_locations.sql`, Drivers → Live location.
- **Map (UX-82):** every driver's pin on one OpenStreetMap map (no API key). It zooms to fit all pins and has + / − / fit buttons. Positions arrive live through Supabase Realtime, with the 30-second reload kept as a fallback. Green pin = live, amber = last known. Speed is shown when the phone reports it.
- **Limit:** a web page can share location only while it is open on the phone. Tracking in the background needs the Android app.
- **Status:** In code · needs the login setup (docs/setup-auth.md) and the driver_locations migration; Realtime needs `2026-11-04_job_checkins.sql` · Since: 2026-10-31

### R-DRV-04 — Dispatch by area
- **Rule:** *"managers aur drivers area (maslan Al Qusais) select karke wahan available jobs aur cleaners ki suggestions dekh saken aur unhen assign kar sakein."* Drivers → **Dispatch by area**:
  - The areas with jobs that day are listed, busiest first. A red count shows jobs without a cleaner.
  - Each job of the chosen area shows its time, cleaners and progress (R-DUTY-01).
  - **Suggested cleaners** are those free at that time (R-JOB-01) and not absent or on leave (R-ATT-08). Cleaners already working in the same area that day come first, then the least busy.
  - One click assigns a cleaner to the Daily Job Sheet row (clash-checked again). The driver for the site is chosen on the same card (the route plan).
- **Code:** `src/lib/dispatch.ts`, `src/components/drivers/DispatchBoard.tsx`.
- **Status:** Active · Since: 2026-11-05

### R-DUTY-01 — Job progress from My Duties
- **Rule:** *"har cleaner ko unki designated duties wazeh taur par nazar aani chahiye … industry-standard operational options bhi shamil karein."* Each job card on My Duties has:
  - one big next-step button: **On my way → Start job → Finish job**. Each step saves the time and, if the phone allows, the position;
  - **Report an issue** with a short note (client not home, no key …);
  - **Call client** and **WhatsApp** when the client record has a number.
  - The header shows jobs, hours, done / total and cash to collect, at full page width like the other screens.
  - The office sees the progress live on the Dispatch board.
- **Data:** `public.job_checkins`: one row per job and cleaner. A field login writes only its own rows; office roles write any. Migration `2026-11-04_job_checkins.sql`. Until it runs, the buttons are disabled and a note says why.
- **Code:** `src/lib/jobCheckins.ts`, `MyDuties.tsx → DutyCard`.
- **Status:** In code · needs the migration · Since: 2026-11-05

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

### R-EMP-06 — Every job-sheet cleaner is a saved employee
- **Rule:** *"daily job sheet me se data fully syncronize hona chaheye employee me"*
  - Every cleaner named on the Daily Job Sheet is saved as a row in the `employees` table automatically, without opening and saving them by hand. A new name on the sheet is saved as soon as it appears.
  - The row keeps the job-sheet id (`emp-dj-<name>`), so bookings, attendance marks and logins that already use it stay linked.
  - Only facts from the sheet are filled in (name, first date, active / inactive); HR fields stay empty until someone edits the employee.
  - It runs only in an admin or manager session, and only after employees and jobs were really read from Supabase (never from a stale browser copy). An existing row is never overwritten.
  - Never registered: TEST records (prod.md §5) and names the user deleted (AUD-17).
  - Deleting a registered job-sheet cleaner deletes the cloud row too.
- **Code:** `src/lib/staffRegistry.ts`, the R-EMP-06 effect in `DataContext.tsx`.
- **Status:** Active · Since: 2026-11-04

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
- **Code:** `AgencyDashboard.tsx → financials`; type `AgencySalaryPayout`.
- **Status:** Active

---

### R-PAY-03 — Agencies: fixed-price contracts, no commission
- **Rule:** An agency works on a fixed-price contract. There is no commission rate, type or amount anywhere in the CRM.
- **Status:** Active · Since: 2026-11-02 (DEC-016, E2E-30). Migration `2026-11-02_remove_agency_commission.sql`.

### R-PAY-04 — Overtime pay (planned)
- **Rule:** OT pay will be set and shown on the **Salaries** screen (OT hours from R-OT-01 × an OT rate). Not built yet — until then no screen pays or costs OT.
- **Status:** Planned (DEC-016, E2E-24)

### R-PAY-05 — Charges of a job: Lump Sum or Split Mode
- **Rule:** *"Charges section mein Lump Sum aur Split Mode ka toggle … Lump Sum Mode mein total amount aik hi cleaner (lead) ke record mein jayegi … Split Mode … har split entry mein cleaner ka naam, charges, received amount, aur compact payment mode."*
  - **Lump Sum Mode** (default; the only mode for a one-cleaner job): *Charges*, *Advance Received* and *Payment Mode*.
    - Advance Received is the first payment taken when the job is entered, not the full collection.
    - The whole amount is on the **lead** cleaner's record. On the Excel Job Sheet the other cleaners show *Added Team X / Reference Lead / Above*.
  - **Split Mode** (team jobs only): one line per cleaner with their own **charges**, **received** and **payment mode**.
    - The job's charges and received are the **totals** of the lines.
    - The job's payment mode is the common mode, else the lead's.
    - On the Daily and Excel Job Sheets every cleaner's row shows their **own** charges, received, pending and mode as plain numbers, with no reference to the lead. They are edited in place like a solo job; saving updates that cleaner's line and the job totals.
    - Employees revenue and cash collected use each cleaner's own line (EMP-05).
  - **Payment Mode** offers Cash, Online, Pending and Monthly, plus custom values. *+ Custom value…* adds a mode that every job and the Excel Mode column can then use (cloud-synced).
  - Switching an edited job back to Lump Sum removes its split. Switching to Split Mode starts with an equal share of the charges and the advance on the lead.
- **Code:**
  - `ChargesCard.tsx`: Daily and Excel Add Job, and Edit Job.
  - `src/lib/chargeSplit.ts`: `splitTotals`, `cleanerShare`, `splitEntryOf`.
  - `JobSheetSpreadsheet.tsx`: `refMoney` (reference labels only for Lump Sum members), `splitJobPayload` (the split rebuilt from the rows on save).
  - `excelTeams.ts → expandTeamJob` and `DailyJobSheet.tsx` (rows of a split job carry their own money; `withSplitEntry` on an inline edit).
- **Data:** `daily_jobs.charge_split` jsonb, holding `[{cleaner, charges, received, payment_mode}]` (migration `2026-11-03_daily_jobs_split_and_color.sql`).
- **Status:** Active · Since: 2026-11-03 · Lump Sum / Split Mode since 2026-11-04

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

### R-FIN-05 — Issued invoices are voided, never deleted
- **Rule:** *"Jari ho chuki invoice … jo bhtr lage krdo."* Only a **draft** can be deleted. An issued invoice (sent, paid, overdue) is **voided**:
  - it keeps its number and stays in the list, marked VOID (filter: Void);
  - the reason and date are added to its notes;
  - it counts in no total, balance or receivable, and its jobs can be billed again;
  - a void invoice cannot be paid, sent or deleted.
- **Why:** UAE VAT expects issued tax invoices to be kept (INV-A07).
- **Code:** `Invoices.tsx` (Void modal), `receivables.ts → invoiceBalance, invoicedJobIds`, `Invoice.status 'void'`.
- **Status:** Active · Since: 2026-11-05

### R-FIN-04 — Invoice numbers
- **Rule:** One scheme: `SAF-<year>-<NNNN>`, next = highest of the year + 1; `addInvoice` replaces any missing, legacy or duplicate number.
  - The year is the Dubai year (INV-A02).
  - Before an invoice is written, the numbers already in Supabase are read and the next free one is taken (INV-A01). This covers two users or two tabs creating an invoice at the same time. Offline, the local number is kept.
  - The database refuses a number that is taken (unique index, `2026-11-01_data_constraints.sql`). The app then takes the next free number and saves again, up to 5 times (INV-A09).
- **Code:** `src/lib/invoiceNumber.ts → reserveInvoiceNumber`; `DataContext.addInvoice`, `saveInvoiceWithFreeNumber`.
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

### R-SEC-01 — Everyone signs in with their own account; nobody signs up
- **Rule:** Login is required everywhere (localhost included) through Supabase Auth with a Login ID (e.g. `SW-0007`, stored as `crm-sw-0007@safaeewala.com`) or email + password. Only an admin creates users, resets passwords, changes roles and disables accounts — through the server, which holds the service key. Passwords: 10+ characters with upper case, lower case and a number. The last active admin cannot be disabled or demoted; an admin cannot disable or demote themselves. No password or secret key is ever in a `VITE_` variable or in git.
- **Code:** `src/store/UserContext.tsx`, `src/pages/Login.tsx`, `src/components/settings/UserManagement.tsx`, `webhookServer.cjs → /api/admin/users`, `supabase/migrations/2026-10-30_initial_schema_and_auth.sql`. Setup: `docs/setup-auth.md`.
- **Status:** In code on `claude/workspace` · needs the owner setup steps · Since: 2026-10-30 (SEC-01, SEC-02, DEC-014). Replaces the old browser-only login (`simpleAuth`, removed).

### R-SEC-03 — Screens by role; the database checks too
- **Rule:** Roles: **Admin** (everything), **Manager** and **Employee** (screens ticked in Settings → Roles & Access; defaults: Manager all but Settings, Employee Overview/Bookings/Attendance). A blocked screen is hidden from the menu and its URL shows "No access". The database only answers signed-in active users; deleting records is allowed for Admin and Manager only.
- **Database:** a role may add or change employees, agencies, invoices, inventory and clients only when it has a screen that works with that table (`role_can`, same screen list and defaults as the app): employees ← Employees/Agencies; agencies ← Agencies/Employees; invoices ← Invoices/Payments/Pending/Monthly Clients/Bookings/Daily Job Sheet; inventory ← Inventory/Daily Job Sheet; clients ← Clients/Monthly Clients/Bookings/Daily Job Sheet/Fluent Forms. Reading stays open to active users (pickers need names); deleting is admin + manager.
- **Code:** `src/lib/permissions.ts` (`APP_MODULES`, `moduleForPath`, `canAccessModule`), `App.tsx → AuthGate, ModuleGate`, row-level security in the migrations (`2026-11-02_role_based_writes.sql`). Test: `tests/unit/role-writes-sql.test.ts`.
- **Status:** In code · Since: 2026-10-30 (SEC-03) · DB writes by role since 2026-11-02 (E2E-07)

### R-SEC-02 — No secrets in the repo or docs
- **Rule:** Credentials live in `.env` (see `.env.example` for names) and GitHub secrets only — never in code, docs, commits or chat.
- **Status:** Active

---

### R-SEC-04 — Identity documents are private
- **Rule:** Emirates ID, passport, visa, licence and other staff / agency documents are stored in the private Storage bucket `staff-documents`. Only admin and manager can upload, open or delete them (signed links valid for 1 hour). The employee / agency row keeps only a reference (`storage:<path>`). Files still inside old rows are moved on the next admin / manager login.
- **Code:** `src/lib/docStorage.ts`, `DataContext → docsToStorage`. Migration `2026-11-02_staff_documents_storage.sql`.
- **Status:** Active · Since: 2026-11-02 (E2E-08)

### R-SEC-06 — The server's /api never answers strangers
- **Rule:** Every `/api` call that reads or changes data needs a signed-in, active user, **even while the service key is missing on the VPS** (K-06).
  - Without the service key, the server checks the sign-in with the project's public (publishable) key: `/auth/v1/user`, then the user's own profile.
  - Only two calls work without a sign-in, because they cannot carry one and only write: a Fluent Forms lead (until `FLUENT_WEBHOOK_SECRET` is set) and an error report from the login screen.
- **Before (found 2026-11-05):** leads (names, phones, addresses), agencies and the error log could be read by anyone on the internet.
- **Code:** `webhookServer.cjs → signedInWithPublicKey, authorizeApi`; test `tests/server/open-mode.test.mjs`.
- **Status:** Active · Since: 2026-11-05

### R-SEC-07 — Roles & Access columns for Supervisor, Driver and Cleaner
- **Rule:** *"setting me role and access ki tab me drivers and cleaners, supervisor k columns b add krdo."* Settings → Roles & Access has the columns Admin, Manager, Employee, **Supervisor, Driver, Cleaner**.
  - An Employee login linked to a staff record (Settings → Users) uses the column of that person's staff role. Driver = driver; Supervisor = supervisor; every other field role (cleaner, crew lead, ducting …) = Cleaner. An Employee login without a staff record uses Employee.
  - Defaults: Driver and Cleaner = **My Duties only** (R-SEC-05); Supervisor = Overview, Bookings, Daily Job Sheet, Attendance, Drivers, My Duties.
  - The admin may tick more screens for a column; the menu, the URL guard and the database (role_can) follow the same column.
  - The Roles tab uses the full page width (the side panel is hidden there).
- **Database (SEC-A03):** `2026-11-05_field_login_rows.sql` — a Driver / Cleaner login reads only its own data unless its column has a screen that uses the table: cleaner = jobs with their name; driver = all jobs from yesterday to 7 days ahead; clients of those jobs; their own staff record and the drivers; the driver plan. No bookings, invoices, expenses, inventory, agencies or leads. They write nothing except job progress and location.
- **Code:** `src/lib/permissions.ts → PermRole, PERM_ROLES, permRoleOf, canAccessModule`; `App.tsx → ModuleGate`; `Sidebar.tsx`; `UserManagement.tsx → RolePermissionsPanel`.
- **Status:** In code · the database part needs the migration · Since: 2026-11-05

### R-SEC-05 — Cleaners and drivers see only their own duties
- **Rule:** *"cleaners ko sirf cleaners ki duties aur drivers ko sirf drivers ki duties nazar ayen, aur koi dosra inhein access na kar sakay."*
  - **Field staff** = a login with role *Employee* linked to a staff record (Settings → Users) whose staff role is not *supervisor*.
  - Field staff open **My Duties only**. Every other address sends them back to My Duties. The sidebar shows only My Duties. They get no AI bot and no office notifications.
  - A driver sees only their own route (stops assigned to them in Drivers). Every other staff role sees only their own jobs: time, site, team mates, driver drop and pick-up, material, and cash to collect. They see no OT and no prices.
  - Admin and manager can preview any cleaner or driver. Any other login not linked to a staff record sees nothing on My Duties.
  - **Database:** `2026-11-05_field_login_rows.sql` limits field logins to their own rows (R-SEC-07). Screens beyond My Duties can be given per column in Roles & Access.
- **Code:** `src/lib/duties.ts → isFieldStaff, dutyKindOf, cleanerDuties`; `src/store/useFieldStaff.ts`; `App.tsx → ModuleGate`; `Sidebar.tsx`; `Layout.tsx`; `MyDuties.tsx`.
- **Status:** Active · Since: 2026-11-03

## OPS — Operating process

### R-OPS-01 — No browser automation without permission
- **Rule:** Do not launch browser sub-agents without the user's confirmation.
- **Status:** Active

### R-OPS-02 — No production deploy without permission
- **Rule:** Development is local. Do not run `deploy.ps1`, `scp`/`ssh` to the VPS (`187.77.116.14`) **or `git push origin main`** (it auto-deploys via GitHub Actions) without explicit permission. See [prod.md](prod.md).
- **Status:** Active

### R-OPS-03 — Claude works in the main folder; the VPS only on request
- **Rule:** *"ab se tum main pr hi kam kro ge take changes 5058 pr phle nzr ayn phir bad me jb me kahun hum vps pr change kren."* Claude edits the main folder (`main`, port 5058) and commits locally. The owner checks on localhost:5058. `git push origin main` (which deploys) happens only when the owner says so. Antigravity may work in the same folder, so check `git status` first and stage only your own files. The `-claude` worktree (2026-10-27 → 2026-11-03) is no longer used for work.
- **Status:** Active · Since: 2026-11-03 (was: two agents, two folders)

### R-OPS-04 — Nightly database backup without Supabase Pro
- **Rule:** *"backup hum kya n8n k through na bana len rozana take supabase paid ki zarorat b na rahe?"* The owner chose a backup on the VPS instead of n8n: *"tmhara mashwara ziyada bhter he start kro"*.
  - Every night at 02:00 Dubai time, the VPS saves a full copy of the database with `pg_dump`: the public schema (tables, data, functions, RLS policies) and the sign-in rows (auth).
  - Copies are kept for 30 days on the VPS, plus an off-site copy in Google Drive, because a backup on the VPS alone is lost with the VPS.
  - Each run checks that the copy can be read. A failed run is written to `last-status.txt`, and is posted to `BACKUP_ALERT_URL` when that is set.
  - The connection string (`SUPABASE_DB_URL`) lives only in the VPS `.env` and is never passed on the command line (R-SEC-02).
  - The Daily Job Sheet spreadsheet export to Drive (Settings → Backup, n8n webhook) is a report, not a database backup.
  - Restore is manual (see the README) and goes to a TEST project first.
- **Code:** `scripts/backup/db-backup.sh`, `scripts/backup/README.md`; [prod.md §7](prod.md).
- **Status:** In setup · Since: 2026-11-05

---

## Known issues (rules not yet fully honoured)

| ID | Issue | Affects | Status |
|---|---|---|---|
| K-01 | Localhost talks to the **live** backend (`/api` proxy → VPS, live Supabase): saves during testing change production data. | R-OPS-02 | Open |
| ~~K-02~~ | ✅ Fixed 2026-10-27: one salary rule everywhere (`MONTHLY_WORK_HOURS` = 200h, R-EMP-02). | R-EMP-02, R-PAY-01 | **Resolved** |
| ~~K-03~~ | ✅ Fixed 2026-10-27: agency saves send only the changed agency; deletes send `remove` (old servers fall back to the full list). | R-AGN-* | **Resolved** |
| K-04 | New employee/agency fields may not exist as Supabase columns → writes rejected. Now visible (banner) and retried; fixed for good once the Phase 2 migration is run. | R-EMP-*, R-SYNC-05 | Open |
| ~~K-05~~ | ✅ Fixed 2026-10-27: no seed/demo data is loaded. | R-DATA-03 | **Resolved** |
| K-06 | The live server has no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (checked 2026-11-03: `/api/admin/users` → 503). Effects: Settings → Users shows *User management is not set up on the server*. Since 2026-11-05 the `/api` routes are no longer open: they check the sign-in with the public key (R-SEC-06). Fix: put the keys in `/var/www/safaeewala/.env` on the VPS, then run `docker compose up -d`. | R-SEC-01…03 | Open: owner action |

Full list of sync / dummy-data issues with locations: [docs/audits/2026-10-27-data-sync-audit.md](docs/audits/2026-10-27-data-sync-audit.md) (AUD-01 … AUD-23), and for the finance & operations screens: [docs/audits/2026-10-27-finance-ops-screens-audit.md](docs/audits/2026-10-27-finance-ops-screens-audit.md) (AUD-24 … AUD-42), and for the Daily Job Sheet & Excel mode: [docs/audits/2026-10-29-daily-job-sheet-audit.md](docs/audits/2026-10-29-daily-job-sheet-audit.md) (AUD-44 … AUD-58).
