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

### R-SCHED-08 — Contract Status toggle on Monthly and Bi-Weekly clients
- **Rule:** *"Monthly aur Bi-Weekly clients ki profile ya 'Edit Client' pop-up mein ek 'Contract Status' toggle … 'On' hone ki soorat mein client ka data Daily Job Sheet par automatically synchronize hota rahay. Contract 'Off' hotay hi sync foran ruk jaye aur unki entries Daily Job Sheet par display na hon."*
  - The toggle is in Edit Client (Bi-Weekly mode, and the Profile tab of a monthly client) and in the Monthly client form. New clients start On.
  - **Off:** no visit of the client syncs (monthly and Bi-Weekly). On save, the client's synced visits **from today on** with no money received leave the Daily Job Sheet (a before-delete copy is kept, BAK-5). Past visits stay, because salaries, OT and history use them.
  - **On again:** visits sync from the next sync (opening the day on the sheet).
  - The card on Clients shows *Contract off*.
  - Works next to R-SCHED-05 (contracts in Monthly Clients → Contracts): either one switched off stops the sync.
  - The field is sent only when a contract is Off or turned back On, so client saves keep working before the migration runs.
- **Code:** `ContractStatusToggle.tsx`; `ClientModalForm`, `AddMonthlyClientModalForm`; `clientDataSync.ts → contractOffJobs`, checked in `getScheduledMonthlyShiftsForDate`; `DataContext → updateClient`; migration `2026-11-05_client_contract_active.sql`.
- **Status:** Active once the migration has run · Since: 2026-11-05

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
  - ~~Such a cleaner is not listed on the Daily Job Sheet when they have no job that day.~~ Replaced by R-ATT-09 (2026-11-09): they are listed, marked Absent / On leave.
  - They are not offered in the cleaner picker of Add / Edit Job (Daily and Excel) for that date, or in the Excel staff suggestions. The popup says who was left out.
  - A cleaner already on the job being edited stays selected. A job they still hold stays on the sheet with the *reassign* tag (R-ATT-07).
  - Marks kept by employee id or by name both count.
- **Code:** `src/lib/attendance.ts → isAwayMark, awayCleanerNames`; `AddJobModal.tsx` (`pickableStaff`); `JobSheetSpreadsheet.tsx` (`staffOptions`); `DailyJobSheet.tsx` (`nilRows`).
- **Status:** Active · Since: 2026-11-04

### R-ATT-09 — Every cleaner is listed on the job sheets; the crew timeline shows only those working
- **Rule:** *"Daily Job Sheet ki screen par maujood Jobs widget mein tamam cleaners ki mukammal list show ki jaye … Excel Job Sheet par bhi tamam cleaners … rows empty show hon lakin list mein shamil rahein. crew timeline wale widget me just wo show hon jinke pas job he."* (2026-11-09)
  - **Daily Job Sheet → Jobs:** after the jobs, every cleaner with no job that day has a row: blue = available, red = absent, amber = on leave (the Attendance mark). This includes days with no jobs at all.
  - **Excel Job Sheet:** on a one-day view (Today, Yesterday, one date), every active employee except drivers who has no job gets an empty block of 3 rows, with "No job — available" or "Absent".
    - These rows are not saved (`isBlankNewRow`) and do not make the sheet "unsaved". Typing a job into one saves it as a normal job.
    - Absent stays absent only when marked (R-ATT-01): an empty row is never counted as present.
  - **Crew timeline:** only cleaners with a job that day (it used to show everyone).
- **Code:** `DailyJobSheet.tsx → nilRows, crewTimeline`; `src/lib/excelSheet/rows.ts → withIdleCleaners`; `JobSheetSpreadsheet.tsx → idleCleaners`.
- **Status:** Active · Since: 2026-11-09

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

### R-BK-04 — Status menu on the card, synced with the cleaners
- **Rule:** *"Bookings screen par maujood 'Completed' button ko interactive … Unconfirmed, Scheduled … cleaner k sath sync hoga jab cleaning on way hoga ya start job kre ga ya end kre ga … manually b change … 'Edit Booking' pop-up mein status convert karne par woh main screen par foran update."* (2026-11-09)
  - **The menu:** the status on every booking card is a menu: Unconfirmed (pending), Scheduled (confirmed), In progress, Completed, Cancelled. Choosing one saves it straight away; for a booking, this is the same as changing it in Edit Booking.
  - **Live step:** a small tag under the status shows the cleaners' furthest step from My Duties for that job (On the way, Started, Cleaner done, Issue reported). It updates live.
    - With the trigger of R-DUTY-02, Started / End job also move the status itself (In progress, Completed). The office can still change it by hand.
  - **Sync fix:** a card made from a Daily Job Sheet row (no booking, e.g. a monthly visit) used to ignore a status changed in Edit Booking, and its status was guessed. Now the status is saved on the job row and the card shows that saved status first.
  - The card of a monthly visit not yet on the job sheet has no menu: add it to the sheet first.
- **Code:** `Bookings.tsx → StatusMenu, liveOf, handleUpdateBookingFromModal`, `src/lib/jobCheckins.ts → useJobCheckinsFor, jobProgress`.
- **Status:** Active · Since: 2026-11-09

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
  - *"Excel Job Sheet mein kisi block ka color change aur save karne ke baad, woh Daily Job Sheet par update nahi hota."* (2026-11-05) Two causes, both fixed:
    - The Excel Save compared rows without the colour, so a colour change alone said *Nothing to save*. `row_color` is now a saved field.
    - The Excel sheet stores a block palette key (`emerald`, `sky` …) or a custom hex; the Daily Job Sheet only read its own preset ids. Both sheets now read every kind (`rowColorOf`).
- **Code:** `syncQueue.ts → DAILY_JOBS_COLUMNS`; `excelSheet/rows.ts → SAVED_FIELDS`; `jobSheetUtils.ts → rowColorOf`; migration `2026-11-03_daily_jobs_split_and_color.sql`.
- **Status:** Active once the migration has run · Since: 2026-11-03 (both-way colours since 2026-11-05)

### R-SYNC-12 — Add New Booking uses the Add Job form
- **Rule:** *"Add New Booking' par click karne par wahi pop-up khulna chahiye jo 'Add Job' ke doran Daily ya Excel Job Sheet par show hota hai, taake dono sections ka data format aur fields bilkul same rahe."*
  - A new booking (Bookings, Overview) opens the Add Job form of the job sheets, with its fields, checks and clash test.
  - The booking is built from that entry: client by address (the same test the form uses), cleaners → employee ids (R-SYNC-02), date, times, money, mode (Monthly → monthly booking), remarks, colour.
  - The booking's job-sheet row is the entry itself (address, area, cleaners, split money), not a copy rebuilt from the booking.
  - Editing an existing booking keeps the booking form (status, frequency, recurring days).
- **Code:** `NewBookingModal.tsx`; `bookingSync.ts → bookingFromJobEntry`; `DataContext → addBooking (job_entry), createJobForBooking`.
- **Status:** Active · Since: 2026-11-05

### R-SYNC-13 — A change is never lost on the way to Supabase
- **Rule:** *"Verify karein ke employees screen ka data Supabase ke sath live synchronized ho aur kisi bhi qism ka sync ya data loss issue na ho."* (Employees go-live audit, 2026-11-06)
  - A change that cannot reach Supabase waits in the outbox. While the device is offline nothing is retried, and a try that fails on the network or a timeout does not count.
  - A change Supabase really rejects is retried 30 times (about 30 minutes online), then kept in `safaeewala_sync_failed` and reported. Before, it was dropped after 5 tries, so 6 minutes offline lost the change.
  - The outbox holds 300 changes; a change pushed out of a full outbox is kept and reported the same way (it was 50, dropped silently).
  - A table read that worked is the truth, even when it is empty: the browser's old copy is used only when the read failed. An old copy no longer brings back rows that were deleted in Supabase.
  - Employees: a field cleared in the form is saved as empty (null). Before, it was left out, Supabase kept the old value, and it came back on the next load.
  - Deleting an employee keeps a copy in Settings → Backup → Before-delete copies, so a wrong delete can be restored.
- **Code:** `src/lib/syncQueue.ts` (`isTransientError`, `MAX_TRIES`, `OUTBOX_CAP`); `DataContext.tsx → fromServer, updateEmployee`.
- **Status:** Active · Since: 2026-11-06

### R-SYNC-14 — The Excel Job Sheet saves by itself
- **Rule:** *"Excel Job Sheet par 'Add Job' ke doran yellow save button aksar kaam nahi karta, jiss se page refresh karne par data zaya ho jata hai … auto-save ka mechanism (maslan har 3 seconds baad) … ya manual save button."* (2026-11-06)
  - Both: changes save by themselves 3 seconds after the last change, and the Save button / Ctrl+S still save at once.
  - Auto-save waits while a cell is being typed in or the Add Job form is open.
  - Auto-save never asks a question. When a change double-books a cleaner, or rows were changed on another screen, it stops and shows the reason in red next to the title; the user presses Save to decide. These two cases were why Save often seemed to do nothing.
  - The header shows *Auto-save on* when everything is saved. The local draft and the leave warning (UX-34) stay.
- **Code:** `JobSheetSpreadsheet.tsx → handleSaveAll('auto' | 'manual')`, the auto-save effect.
- **Status:** Active · Since: 2026-11-06

### R-SYNC-04 — Staff are matched by whole words
- **Rule:** An employee matches a job's `staff_name` by normalised full name or whole-word match — "Rupa" must not match "Rupak".
- **Code:** `clientDataSync.ts → employeeMatchesStaff`.
- **Status:** Active

---

### R-UI-01 — Screens speak English only
- **Rule:** *"signout k popup se roman urdu remove krdo english use honi chaheye … crm ko mukamal audit kr k dekho"* (2026-11-09)
  - **Rewritten in English:** the sign-out question, login errors, the AI Bot's greeting, answers and suggestions, the Settings backup guide, and the Monthly schedule sync and Google Drive webhook windows. Also two hints (Excel columns, Monthly client days) and a keyword example.
  - **What stays:** Roman Urdu may still be typed. The AI Bot understands words like "kamai", "baqaya", "booking karo", and complaint detection knows "shikayat". Code comments are not shown and are left as they are.
  - A test scans every screen file for Roman Urdu words, so new text stays English.
- **Code:** `tests/unit/english-ui-attendance.test.ts` and the files above.
- **Status:** Active · Since: 2026-11-09

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

### R-JOB-09 — Team Leader dropdown & address selection time preservation
- **Rule:** *"Daily Job Sheet, Booking, aur Excel Sheet kay Add Job Entry pop-ups mein, Team Reference section mein auto-assigned leader kay sath aik dropdown menu shamil karein, taake admin apni marzi ka Team Leader select kar sakay. Mazeed yeh ke, Address select karnay par 'Time and Duty Hours' ka data reset ho jata hai; is bug ko resolve karein taake pehle say set kiya gaya time aur duty hours barqarar rahein."* (2026-11-10)
  - **Manual Team Leader Selection:** In multi-cleaner jobs (2+ staff), the Team Reference card provides a dropdown menu alongside the auto-assigned leader so the Admin can designate any assigned cleaner as Team Leader. The chosen leader is saved as the primary cleaner (`orderedStaff[0]`), ensuring payments and accounting anchor to the correct leader.
  - **Address Time Preservation:** When selecting an address/client from suggestions in Add Job or Booking modals, previously configured Start Time, End Time, and Duty Hours are preserved and never overwritten by the client's master profile defaults.
- **Code:** `AddJobModal.tsx`, `NewBookingModal.tsx`. Test: `tests/unit/cleaner-alerts-team-leader.test.ts`.
- **Status:** Active · Since: 2026-11-10

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

### R-CLI-07 — Active client = served in the last 60 days
- **Rule:** found in the full CRM audit (2026-11-06). *Active Clients* counted every client served after a fixed date (2026-01-01), so it never went down. Active now means a last service within the last 60 days (Dubai date); *At-Risk (>60d)* is the other side.
- **Code:** `Clients.tsx → isRecentClient`.
- **Status:** Active · Since: 2026-11-06

---

## LEAD — Website form leads

### R-LEAD-01 — The property type is shown as the customer picked it
- **Rule:** *"user ne flat select kiya tha"*. The CRM no longer renames the form's property type (Flat was shown as Apartment). The option chosen on the website form is saved and shown as is. A value typed in the CRM wins over the form, except a value that is only the old automatic renaming, so old leads show the form's wording again. Only a lead without a property field is guessed from the address / message.
- **Code:** `fluentFormsSync.ts → resolvePropertyType, legacyPropertyType`, `webhookServer.cjs → resolvePropertyType, healLead`.
- **Status:** Active · Since: 2026-11-08

### R-LEAD-02 — "Booking" on a lead opens the Add Job form
- **Rule:** *"form submissions ke section mein 'Confirmation' button ko 'Booking' button se replace kiya jaye … 'Add Job' ka wahi pop-up … Client Name, Number, Area … pre-filled … Preferred date ko hi 'Scheduled Date' … time na hone par default time … 'Booking Amount' … blank."* (2026-11-09)
  - The table button and the lead detail button both say **Booking**. They open the Add Job form of the job sheets (R-SYNC-12) instead of the old form that had 500 AED filled in.
  - **Prefilled:**
    - Job date = the preferred date (read from "30-Oct-26", "30/10/2026", "2026-10-30"; today if missing).
    - Time = the form's time, else 09:00 AM; the job runs 4 hours.
    - Area = the lead's area.
    - Address = the building of a known client (same number or name), else the location from the form.
    - Remarks = lead number, name, phone, service, property type, message.
  - **Charges are empty:** no invented price.
  - **New client:** saving opens "Add New Client" with the name, number and area filled in (R-DATA-11), so the client is saved with their WhatsApp number.
  - After saving, the booking and its job-sheet row exist and the lead is marked Converted.
  - Dragging a lead to Converted on the board still makes a quick booking as before.
- **Code:** `src/lib/leadBooking.ts`, `FluentFormsLeads.tsx`, `NewBookingModal.tsx → prefill.job, onSaved`, `AddJobModal.tsx → clientHint`, `QuickNewClientModal.tsx → initialPhone`.
- **Status:** Active · Since: 2026-11-09

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
  - The Daily Job Sheet shows this progress in its **Status** column, and the driver of each site (R-DRV-01) in its **Driver** column (UX-94).
- **Code:** `src/lib/jobCheckins.ts`, `MyDuties.tsx → DutyCard`; `src/lib/crewTimeline.ts → jobStatusLabel, driverNameForJob`.
- **Status:** In code · needs the migration · Since: 2026-11-05

### R-DUTY-02 — Start Job / End Job popups, synced with Bookings
- **Rule:** *"Booking screen se assign hone wali jobs yahan show hon, jahan cleaners direct 'Start Job' aur 'End Job' ke pop-ups zariye kaam control kar sakein … Booking screen ke Cards ke sath fully synchronized … job complete hone par … 'Completed'."* — designed for the later Android app (same steps, same data). (2026-11-09)
  - **Jobs:** a booking makes its job-sheet row (R-SYNC-03); My Duties lists the rows that carry the cleaner's name, so assigned bookings appear on the phone.
  - **Buttons:** On my way, plus **Start job** directly. Then **End job** (was "Finish job").
  - **Popups:** Start and End each ask in a popup: site, time, what the office will see. End also shows the cash to collect and takes an optional note.
  - **Phone → office:** the database trigger `duty_to_booking` (migration `2026-11-09_duty_booking_sync.sql`):
    - Start: job row and booking become *In progress*.
    - End: they become *Completed*, once no other cleaner on that job is still on the way or working.
    - Bookings are added to Realtime, so cards change live.
  - **Office → phone:** a booking set to In progress / Completed / Confirmed in the office writes that status on its job row. My Duties then shows "Completed (marked by the office)" with no buttons.
  - **Not automatic:** an invoice for a booking completed from the phone is not created. The office creates it, as before when completing by hand from the job sheet.
- **For the Android app:** the steps are rows in `job_checkins` (status + time + position) and the status changes are in the database. A native app writes the same rows with the cleaner's login and gets the same result, with nothing extra on the server.
- **Code:** `MyDuties.tsx → DutyCard`, `src/lib/bookingSync.ts → jobPatchFromBookingPatch`, migration `2026-11-09_duty_booking_sync.sql`.
- **Status:** Built · needs the migration · Since: 2026-11-09

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
  - **2026-11-09 audit** — *"agar documents ki expiry date abi baqi hai, to alert trigger nahi hona chahiye … sirf … 1 maheenay pehlay activate hon, aur 90 days pehlay se … band karein."*
    - **One window:** 30 days (`DOC_ALERT_DAYS`) everywhere: Alerts, the Employees KPI and filter, the badges, the widget, the profile and the agency staff checks. The Employees screens used 90 days and the agency "valid" mark used 60.
    - **Expired** = red; **≤ 30 days** = amber; more than 30 days = no alert.
    - **Wrong year** (outside 1950–2100, e.g. 0227 typed for 2027): never counted as expired. Alerts show one medium "date looks wrong — fix the year" item. The employee form refuses to save such a date.
    - The Misbah case was a Work Permit saved as 0227-08-04, shown as "expired 657168 days ago". It was the only wrong date in the data on 2026-11-09.
- **Code:** `utils.ts → DOC_ALERT_DAYS, isWrongDocDate, daysUntil`, `alerts.ts → employeeDocAlerts`, `agencyAlerts.ts`, `EmployeeFormModal.tsx`, `Employees.tsx`, `EmployeeWidgets.tsx`, `EmployeeProfile.tsx`, `AgencyDashboard.tsx`.
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

### R-EMP-07 — Excel import completes existing employees
- **Rule:** *"system mein pehle se maujood imported data … ko clean karke sirf real employee profiles maintain karne ka tareeqa"* (Employees go-live audit, 2026-11-06)
  - Importing an employee who is already on the list (same name, phone or Emirates ID) fills that employee's empty fields from the file: phone, email, nationality, Emirates ID, pay, salary, visa / work permit / passport expiry, end date, agency.
  - A field that already has a value is never overwritten. The message says how many were added, filled in and skipped.
  - Before, such rows were skipped, so the profiles saved from the Daily Job Sheet (name only, R-EMP-06) could not be completed from Excel.
- **Code:** `src/lib/employeeImport.ts → blankFieldsFromImport`; Employees → Import.
- **Status:** Active · Since: 2026-11-06

### R-EMP-08 — A deleted name can be used again
- **Rule:** found in the full CRM audit (2026-11-06). Deleting an employee keeps the name on a "deleted" list so job-sheet history does not bring them back (AUD-17).
  - Adding an employee with that name (Add Employee or Import) takes it off the list, so the new person's job-sheet rows are linked to them again. Before, rows under the name stayed unlinked.
- **Code:** `DataContext.tsx → addEmployee`.
- **Status:** Active · Since: 2026-11-06

### R-EMP-09 — Under Training workflow & Employee popup redesign
- **Rule:** (2026-11-09 owner prompt)
  - Profile section has `short_name` next to `nationality` in a 50% width grid, matching the Phone & Gender fields.
  - Salary widget renames 'Monthly Salary' to 'Total Salary' and adds a 'Basic Salary' field.
  - Employee status includes `under_training`; selecting it reveals Training Start Date and Training End Date inputs.
  - When the training period ends (`training_end_date <= todayDubai()`), the system triggers a high-severity alert for Admin to review performance and extend training or mark the employee as 'Active'.
  - Compliance documents are arranged in a 3 columns × 2 rows layout (6 cards total). Work Permit has Expiry Date only (Issue Date removed). NOC and Other Documents (multi-upload support) are included.
- **Code:** `EmployeeFormModal.tsx`, `types/index.ts`, `alerts.ts`, `DocVersionsField.tsx`, `Employees.tsx`, `EmployeeProfile.tsx`.
- **Status:** Active · Since: 2026-11-09

### R-EMP-10 — Skills & Client Assessment 3-column row redesign
- **Rule:** *"Add New Employee popup ke aakhir mein maujood 'Skills and Client Assessment' widget ko redesign karein. Isay aik hi row mein teen columns par mushtamil karein: pehla 'Skills', dusra 'Comments/Remarks', aur teesra 'Client' selection dropdown. Client field ko search bar ki bajaye dropdown menu mein convert kiya jaye."* (2026-11-10)
  - The bottom section of the Add/Edit Employee popup is arranged as a single row with 3 columns:
    1. **Skills:** comma-separated text input.
    2. **Comments / Remarks:** freeform assessment and notes text input (`notes`).
    3. **Client:** single dropdown selection menu populated from registered clients (replacing the previous search bar and scrollable checkbox list).
  - Cleaners' profile view in `/employees` displays the saved Comments & Remarks.
- **Code:** `EmployeeFormModal.tsx`, `types/index.ts`, `pages/Employees.tsx`. Test: `tests/unit/cleaner-alerts-team-leader.test.ts`.
- **Status:** Active · Since: 2026-11-10

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
    - The whole amount is on the **lead** cleaner's record. On the Excel Job Sheet the other cleaners show *Team X* (in Charges) / *REF: [Cleaner's Short Name]* (in Received) / *Above* (in Payment Mode).
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
- **Rule:** A booking that has a job-sheet row (`booking_id`) is counted only through that row. **Collected** revenue (Overview, Driver Payment Received, Cash Book) = the `received` amount only. A Cash / Online row with nothing received is pending, not collected (*"pending amount honay ke bawajood 'Driver Payment Received' mein 1000 show ho rahe hain … pending payments ghalti se received mein appear na hon"*, 2026-11-06; before, its charges counted as collected). `Monthly` rows count via monthly client payments and `Pending` rows via recoveries. **Billed / work** revenue (Reports) = job-sheet `charges` + bookings without a row.
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

### R-FIN-07 — Reports and Analytics show the same figures
- **Rule:** *"Reports and Analytics screens ka mukammal audit kiya jaye taake verify ho sakay ke data fully synchronized aur accurate hai."* (2026-11-06)
  - One formula for both screens (`lib/businessMetrics.ts`), months in Dubai time:
    - **Revenue** = job-sheet charges + bookings without a job-sheet row (completed / live) + **monthly-contract payments**. Monthly visits carry no charges on the sheet, so before this monthly revenue was missing on both screens.
    - **Collected** = received on job rows (R-FIN-03) + received on bookings without a row + pending recoveries + monthly-contract payments.
    - **Gross profit** = revenue − daily expenses (before salaries, which the CRM does not hold).
    - **Outstanding** = job dues (the Pending formula) + the unpaid part of sent / overdue invoices. Before, Reports counted the full total of an invoice that was partly paid.
  - Invoice collection rate = paid / issued invoices (drafts and void left out).
- **Code:** `src/lib/businessMetrics.ts`; `Reports.tsx`, `BusinessAnalytics.tsx`.
- **Status:** Active · Since: 2026-11-06

### R-FIN-08 — Payments is the one money screen (Pending merged in)
- **Rule:** *"'Pending' ke alag option ko khatam kar ke isay 'Payments' module mein mukammal tor par merge kar diya jaye. Tamam maali maamlaat … ab sirf Payments screen par hi show hona chahiye."* (2026-11-06)
  - Sidebar → Payments has one header, five cards (Outstanding, Collected this month, Pending recovered, Monthly contracts, Advance balance — each opens its tab) and the tabs Outstanding · By Client · Recovered · Monthly Contracts · Advances · Cash Book · Staff Collections · All Payments.
  - The Pending screen's lists and actions work unchanged inside those tabs; the separate Pending item is gone from the sidebar. Old links (`/pending?tab=…`, `/payments?tab=pending`) open the same tab.
  - Permissions: a role allowed the old Pending screen reaches it inside Payments. The "Pending" permission stays because the database write rules still name it.
  - Advances tab: clients' credit balances and the advances recorded on the Daily Job Sheet.
- **Code:** `src/pages/PaymentsHub.tsx`; `PendingPayments` / `PaymentProcessing` (`embedded`); `App.tsx → PendingRedirect`; `permissions.ts`.
- **Status:** Active · Since: 2026-11-06

### R-FIN-09 — Every payment in the history can be traced and deleted
- **Rule:** *"Payment section mein 590 amount aur specific clients … ki payments show ho rahi hain. Is data ka source investigate kiya jaye aur in entries ko remove karne ke liye 'Delete' ka option shamil kiya jaye."* (2026-11-06)
  - Found: the AED 590 "collected this month" was a completed booking (test1234, 1 Nov) with AED 590 received and no job-sheet row; it was counted but not listed. The three Monthly Contract payments (Oct 27 / 29) were entered with Record Payment.
  - Payments → All Payments now lists money received on bookings without a job-sheet row (type *Booking*), so every amount in *Collected* has a row.
  - Every row has **Delete** (asks first, says what happens): Monthly Contract → payment removed; Recovery → removed, the due is pending again; Daily Job → received set to 0, the job stays; Booking → the booking is deleted. *Edit* on a Booking row opens the booking form.
  - Expenses counts the same collections as Payments (received on bookings, not their total — R-FIN-07).
- **Code:** `PaymentProcessing.tsx → paymentHistoryRecords, handleDeleteHistory`; `Expenses.tsx → periodRevenue`.
- **Status:** Active · Since: 2026-11-06

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

### R-SEC-08 — Cleaners' salary only for Admin (or roles given "Salary")
- **Rule:** *"Roles and Screen Access settings mein 'Salary' visibility ka option … cleaner ki salary sirf Admin ko show ho. Manager, Employee, aur deegar roles ke liye permissions customize."* (2026-11-09)
  - Settings → Roles & Access has a **Salary** row (not a screen). Admin always sees salaries. Every other column starts **off**, Manager included; the admin can tick it per column.
  - **Without it:**
    - Monthly salary is shown as •••• on Employees (cards, table column hidden, detail, "Highest salary" sort, Excel export left blank), on the Employee profile and in the Agency staff list / profile.
    - The Employee popup does not show the salary field: the saved salary stays, and a new employee gets none until Admin sets it.
    - Agency: the "Salary Payout" button and the Staff & Salaries Payout tab are hidden.
    - Reports: the Staff Payroll table is hidden.
  - **Limit:** this is a screen rule. The salary is still in the employee record that the CRM loads, so a technical user could read it in the browser. Hiding it in the database needs a separate salary table (not done).
- **Code:** `src/lib/permissions.ts` (Salary key), `src/store/useModuleAccess.ts → useSalaryAccess`, `Employees.tsx`, `EmployeeProfile.tsx`, `EmployeeFormModal.tsx`, `AgencyDashboard.tsx`, `Reports.tsx`, `UserManagement.tsx`.
- **Status:** Active · Since: 2026-11-09

### R-SEC-05 — Cleaners and drivers see only their own duties
- **Rule:** *"cleaners ko sirf cleaners ki duties aur drivers ko sirf drivers ki duties nazar ayen, aur koi dosra inhein access na kar sakay."*
  - **Field staff** = a login with role *Employee* linked to a staff record (Settings → Users) whose staff role is not *supervisor*.
  - Field staff open **My Duties only**. Every other address sends them back to My Duties. The sidebar shows only My Duties. They get no AI bot and no office notifications.
  - A driver sees only their own route (stops assigned to them in Drivers). Every other staff role sees only their own jobs: time, site, team mates, driver drop and pick-up, material, and cash to collect. They see no OT and no prices.
  - Admin and manager can preview any cleaner or driver. Any other login not linked to a staff record sees nothing on My Duties.
  - **Database:** `2026-11-05_field_login_rows.sql` limits field logins to their own rows (R-SEC-07). Screens beyond My Duties can be given per column in Roles & Access.
- **Code:** `src/lib/duties.ts → isFieldStaff, dutyKindOf, cleanerDuties`; `src/store/useFieldStaff.ts`; `App.tsx → ModuleGate`; `Sidebar.tsx`; `Layout.tsx`; `MyDuties.tsx`.
- **Status:** Active · Since: 2026-11-03

## MKT / CMP / AI — Marketing, Complaints, AI Bot (2026-11-09)

### R-MKT-01 — Marketing: client base, Offers, Campaigns
- **Rule:** *"Marketing screen ko cleaning business ke mutabiq enhance karein; is mein 'Offers' aur 'Campaigns' ki tabs … inactive aur first-time clients ki base ko track karne ka feature."*
  - **Client base:** six segment cards. A card filters the list.
    - Segments: Inactive (served before, nothing in the last 60 days, same as R-CLI-07), First-time (one visit), Repeat (2+), Active (≤ 60 days), Never booked, All.
    - Synced from the Daily Job Sheet and Bookings (the store's clients). Only clients with a phone number count.
    - Per group: search, Copy numbers, CSV, "Campaign for this group". Per client: open the profile, open a WhatsApp chat.
  - **Offers:** title, % / AED / free hours / none, promo code, for which segment, services, valid from–to, terms, on / off. "Live" = on and inside the dates. "Use in campaign" fills a campaign.
  - **Campaigns:**
    - Fields: name, segment (with its client count), offer, channel, message with `{name}`, status (draft · scheduled · running · done · cancelled), dates, budget, bookings and revenue won (typed in), with ROI.
    - The CSV gives every number with its personalised message. WhatsApp campaigns are sent from Conversations → Broadcasts with an approved template (Meta's rule).
  - No invented figures (R-DATA-03): every number comes from clients or from saved offers / campaigns.
  - **Own screen:** Marketing in Settings → Roles & Access (it was under Fluent Forms).
  - **Database:** tables `marketing_offers`, `marketing_campaigns` (migration `2026-11-09_marketing_complaints.sql`). Until the migration runs, the client base works and a note asks for it.
- **Code:** `src/lib/marketing.ts`, `src/pages/MarketingDashboard.tsx`.
- **Status:** Built · waiting for the migration · Since: 2026-11-09

### R-MKT-02 — Lead lists: extract, filter, save
- **Rule:** *"aane wali emails se data (naam, number) extract karne aur unhein filter out karne ka system … Marketing screen par … leads ki list ban sakay aur unpar campaigns chalayi ja sakein … data extraction aur list segmentation."* (2026-11-09)
  - **What existed before:** the CRM receives no emails (no mailbox is connected). Contacts came only from website leads (Fluent Forms: name, phone, email), WhatsApp chats and clients. Contact lists existed in Conversations → Broadcasts, but there was no extraction or lead filter.
  - **Marketing → Lead lists** shows one pool of contacts:
    - Website leads (with status, service, area), WhatsApp chats and clients.
    - **Pasted text:** paste emails or any text and names, numbers and emails are pulled out. "Name:" / "From: Name <mail>" labels and the words before a number are read. UAE numbers become 971…, and a mail and a phone on the next line join one contact.
  - One contact per number (else email). Existing clients are marked "client".
  - **Filters:** source, date range, lead status, has phone / email / either, leave out existing clients, and search.
  - **Save list:** the selected contacts with a number are saved as a contact list (`wa_contact_lists`, tag "marketing") for Conversations → Broadcasts. A **CSV** download has every selected contact, emails included.
  - Facebook / Instagram contacts are not in the pool: GHL gives their names but no phone or email.
- **Code:** `src/lib/leadLists.ts`, `src/components/marketing/LeadLists.tsx`, `MarketingDashboard.tsx`.
- **Status:** Built · Since: 2026-11-09

### R-GHL-01 — Google review link in client messages
- **Rule:** owner's GHL / Google Business Profile plan, step 1 (2026-11-09): ask every client for a Google review.
  - Conversations → Settings → Notifications → **Google review link**: paste the link from Google Business Profile → "Ask for reviews". The CRM checks that it looks like a Google review link.
  - `{review_link}` can be picked as a value of any notification template (e.g. the Feedback request, R-WA-04). The server fills it.
  - A quick reply containing `{review_link}` gets the link when it is picked in a chat, so the link can be sent within 24 hours without Meta templates.
- **Code:** `src/lib/inboxSettings.ts → TOKENS, loadReviewLink, saveReviewLink, isReviewLink`, `WaSettingsMore.tsx → ReviewLinkSetting`, `Composer.tsx → fillReply`, `whatsappServer.cjs → automation().reviewLink`.
- **Status:** Built · Since: 2026-11-09

### R-GHL-02 — Google Business Profile posts through GHL's Social Planner
- **Rule:** *"GHL ke zariye Google My Business ke kaun kaun se features (post scheduling, review management, analytics) apne CRM mein direct handle kar sakta hoon … GMB messages … centralized Inbox."* (2026-11-09)
- **What the GHL key can do (read-only check on the live account, 2026-11-09):**

  | Area | Result |
  |---|---|
  | Conversations | Work: 93 Facebook, 7 Instagram |
  | Social Planner, location | 401: the Private Integration key lacks the scopes |
  | Reviews (`/reputation/reviews`) | "token source/channel mismatch": not open to this key type |

  - **GMB messages:** not possible. Google ended Business Profile chat on 31 Jul 2024, so there are no GMB messages to bring into the Inbox. A WhatsApp link on the profile is the alternative.
- **Built: Marketing → Google posts.**
  - Pick the connected accounts (Google Business Profile first).
  - Post type: Update, Event (title, dates) or Offer (title, coupon, dates, terms link, booking link). Text up to 1,500 characters.
  - Button: Book, Call, Learn more, Order, Shop or Sign up, with its link.
  - Photo: JPG / PNG up to 8 MB. It is stored in private Storage, and GHL gets a 1-year link.
  - When: post now, schedule (5+ minutes ahead, Dubai time) or save as a draft.
  - A list of posts (all, scheduled, published, draft, failed) with status, date, link and errors.
  - **Server:**
    - `/api/ghl/social/accounts`, `/posts/list` and `/posts` call GHL with `Version: v3`; admin / manager only.
    - A 401 / 403 from GHL becomes one message naming the scopes to tick: `socialplanner/account.readonly`, `post.readonly`, `post.write`.
- **Owner step:** GHL → Settings → Private Integrations → edit the CRM's key → tick the Social Planner scopes; make sure Google Business Profile is connected in Marketing → Social Planner.
- **Not built:**
  - Reviews in the CRM: GHL's API refuses this key. The Google Business Profile API needs Google's approval.
  - Analytics: the Google Performance API needs the same approval.
- **Code:** `ghlServer.cjs → buildPostBody, /api/ghl/social/*`, `src/lib/ghlInbox.ts → socialAccounts, socialPosts, createSocialPost`, `src/components/marketing/GooglePosts.tsx`.
- **Status:** Built · waits for the Social Planner scopes on the GHL key · Since: 2026-11-09

### R-CMP-01 — Complaints module
- **Rule:** *"sidebar mein 'Complaints' ka alag module … Fluent Forms ya Facebook se aane wali shikayat aur unka status centralized tor par manage."*
  - **Sidebar → Complaints** (own screen permission). One list, newest first, with:
    - Fields: reference CMP-0001…, client (linked when the number matches), phone, source (Fluent Forms · Facebook · Instagram · WhatsApp · phone · email · other), category, priority, cleaner, job date, assignee, resolution.
    - Status: Open → In progress → Resolved → Closed. It is changed in the row; Resolved / Closed asks for the resolution first and records when it was resolved.
  - **Cards:** Open, High priority, Over 2 days, Resolved, Average resolve time. Filters: search, status, source, Reset.
  - **To review:** website leads with complaint words (complaint, damage, late, no-show, rude, refund, shikayat …) and WhatsApp / Facebook / Instagram chats tagged "Complaint". Each has "Add as complaint". One source message makes one complaint.
  - The lead detail popup in Fluent Forms has a **Complaint** button.
  - **Database:** table `complaints` (same migration).
- **Code:** `src/lib/complaints.ts`, `src/pages/Complaints.tsx`, `FluentFormsLeads.tsx`.
- **Status:** Built · waiting for the migration · Since: 2026-11-09

### R-AI-01 — AI Bot hub
- **Rule:** *"AI Bot ke liye ek dedicated, full-width screen … 'central brain' … tamam modules (Booking, Employee, Financials, Operations) ka mukammal access … data retrieve … OT details ya cleaner info … operational tasks execute … direct yahan se nayi booking."*
  - **Owner's choice (2026-11-09):** build the hub first; the AI model comes later.
  - **Sidebar → AI Bot opens `/ai-bot`:**
    - Quick actions: New booking (the Add Job popup, saved here), Daily Job Sheet, New invoice, New complaint, Win-back campaign, Attendance, Full data check (the old AI Bot window).
    - Eight live cards: jobs today, working, available, OT this month, unpaid invoices, open complaints, low stock, document alerts.
    - **Ask the CRM:** OT, revenue, pending, duplicates and staff use the existing rules (`askCRMAIBot`). A cleaner's name gives their month (jobs, duty, OT), today's and next jobs. "book / new booking" opens the booking form. A chip says "AI model: not connected".
    - One search across cleaners, clients, bookings and invoices.
    - Cleaner card: this month, today, next jobs, document dates. The month's Duty & OT table appears when no cleaner is open.
    - The data-health line opens the full data check.
  - **Next step:** a Claude model over the same data and actions, with "Confirm" before anything is saved. It starts when the owner puts the API key in the VPS .env.
- **Code:** `src/lib/aiHub.ts`, `src/pages/AIBot.tsx`, `Sidebar.tsx → AIBotNavItem`.
- **Status:** Built (no AI model yet) · Since: 2026-11-09

## ALERT — Alerts

### R-ALERT-01 — Every alert in one place: Sidebar → Alerts
- **Rule:** *"Sidebar mein ek dedicated 'Alert' section shamil kijaye. CRM ke tamam alerts, notification, aur screen par show honay walay AI bot alerts (jaise priority discrepancies) ko is section mein consolidate kiya jaye. Main screens ko declutter karne ke liye alerts ko pop-ups ya headers se hata kar sirf is central section mein display kiya jaye."*
  - **Alerts** (`/alerts`, under Overview in the sidebar) lists, high priority first: system notifications (late jobs, overdue invoices, low stock), AI Bot findings (duplicates, discrepancies — *Review in AI Bot*), today's Daily Job Sheet issues (clash, job without a cleaner), a failed or missing nightly backup, employee documents expiring (≤30 days), agency documents / payouts / staff compliance, pending bookings and today's bookings without a cleaner.
  - Tabs by priority and source; each alert links to where it is fixed. *Dismiss* hides it in this browser; *Dismissed* shows and restores them.
  - The sidebar item shows the number of open alerts.
  - Removed from the screens: the alert ticker and the AI Bot discrepancy banner above every page, and the alert lists of the Employees, Agencies and Bookings header bells (the bell now only opens Alerts).
  - Kept: the sync banner (unsaved changes / sync errors must stay in view), the AI Bot (since UX-112 a Sidebar item under Alerts, not a floating button), and inline page notices that confirm an action (import done, delete done).
  - Cleaners and drivers get no alerts (R-SEC-05). Roles & Access has an **Alerts** column; a permissions save made before Alerts existed gives it to the roles that get it by default.
- **Code:** `src/lib/alerts.ts`, `src/store/useAlerts.ts`, `src/pages/Alerts.tsx`; `Sidebar.tsx`, `Layout.tsx`, `PageHero.tsx`; `permissions.ts → normalizeRolePerms`.
- **Status:** Active · Since: 2026-11-05

### R-ALERT-02 — A schedule must not name a cleaner who is not an employee
- **Rule:** found in the full CRM audit (2026-11-06): after employees were deleted, a monthly schedule still named one of them and the monthly sync kept adding visits under that name, with no warning.
  - A monthly / Bi-Weekly client whose schedule (preferred cleaner or a day's cleaner) names someone not on the Employees list gets a high alert in Sidebar → Alerts, with a link to Monthly Clients. Contracts switched off are skipped.
  - The schedule itself is not changed (R-SCHED-01..03): the user picks the new cleaner.
- **Code:** `src/lib/alerts.ts → scheduleCleanerAlerts`, `useAlerts`.
- **Status:** Active · Since: 2026-11-06

### R-ALERT-03 — An AI finding links to the record that needs fixing
- **Rule:** *"Alerts section mein AI-generated notifications ke sath 'Review in AI Bot' ke ilawa direct link ya redirection button shamil kiya jaye … us specific booking ya job par redirect kar day."* (2026-11-06)
  - A finding about a booking has **Edit booking** (Bookings opens that booking in the edit form, `/bookings?booking=<id>&edit=1`) and, when the booking has a job-sheet row, **Open job** (the Daily Job Sheet opens that day with the job in the edit form, `?date=…&job=<id>`).
  - A finding about a client has **Open client**. *Review in AI Bot* stays.
- **Code:** `lib/alerts.ts → aiIssueLinks`; `Alerts.tsx`; `Bookings.tsx` (`edit=1`); `DailyJobSheet.tsx` (`job`).
- **Status:** Active · Since: 2026-11-06

### R-ALERT-04 — Cleaner-reported duty issues routed to Admin Alerts
- **Rule:** *"Cleaner App ke 'Report Issue' workflow ka mukammal tajziya karein. Verify karein ke Cleaner ki taraf se bheji gayi reports Admin ko system mein kahan show hoti hain. Agar yeh notifications centralized nahi hain, to inhein 'Alerts' module mein route karne ka system banaya jaye, taake Admin ko foran khabar ho sakay aur woh bar-waqt iqdaam kar sakein."* (2026-11-10)
  - Whenever a cleaner reports an issue on a shift via My Duties (`job_checkins` status `issue`), it is routed immediately to the centralized Sidebar → Alerts module.
  - Generates a High Severity alert with the cleaner's name, client/site, job date, and the cleaner's note.
  - Direct Action links allow the Admin to jump straight to the Daily Job Sheet row (`Open Job Sheet`) or the Booking (`View Booking`) to resolve the issue on the spot.
- **Code:** `src/lib/alerts.ts → cleanerIssueAlerts`, `src/store/useAlerts.ts` (Realtime subscription on `job_checkins`). Test: `tests/unit/cleaner-alerts-team-leader.test.ts`.
- **Status:** Active · Since: 2026-11-10

### R-SYNC-15 — Files never travel inside a save
- **Rule:** owner report 2026-11-07: *"vps pr 1 employee add kiya he hogya us k bd mazeed nhi ho rahe. refresh kro to profile nhi show hrhi"*. Cause: the document photos (EID, passport, visa, permit) were sent inside the first save as text — with phone photos several MB, twice (the document list and the eid_file / … fields). The request failed, did not fit the browser's outbox (quota), and the employee was lost on reload; the files reached Storage but had no row to attach to.
  - An employee or agency is saved first without its files; the files go to Storage, then their paths are written to the record (matched against the saved record, not the screen's copy). The browser cache and the agencies server copy never hold the photos.
  - A file that does not upload is reported ("N documents could not be uploaded — open the employee and attach them again"); the employee is saved anyway.
- **Code:** `src/lib/docStorage.ts` (withoutInlineDocs), `src/store/DataContext.tsx` (addEmployee, updateEmployee, addAgency, updateAgency, docsToStorage).
- **Status:** Fixed · Since: 2026-11-07

### R-DOC-02 — Images and PDFs, stored the moment they are picked
- **Rule:** *"documents forms mein sirf 'Upload Image' ki bajaye 'Upload PDF' ka option bhi … PDF files ko read aur preview … 'No binary file preview available' ka error na aaye."* (2026-11-09)
  - Every document field (employee and agency popups, agency direct upload) says **Upload image or PDF** and accepts both. A PDF shows a red PDF tile and opens in the preview (browser PDF viewer); images show a thumbnail.
  - **Cause of the error:** the file used to travel to Storage only after the record was saved. When that upload failed, the record kept an empty file, which showed "No binary file preview available" (one agency document was found empty on 2026-11-09).
  - **Now** a picked file goes to private Storage at once (`employees/<id>/…`, `agencies/<id>/…`) and the record holds only `storage:<path>`. If the upload fails, the file is kept and moved on save (R-SYNC-15), and the user is told.
  - A record whose file is missing says so plainly and asks to upload it again.
- **Code:** `src/lib/docVersions.ts → storePicked, readAndStore`, `DocVersionsField.tsx`, `EmployeeFormModal.tsx`, `Agencies.tsx`, `AgencyDashboard.tsx`.
- **Status:** Active · Since: 2026-11-09

### R-DOC-01 — Document images keep their history (Current + Previous), and are backed up
- **Rule:** *"jahan jahan image upload ka option he popups me wahan pr multiple images add ka option … jo current image hogi … new image upload hone k bad usi field me neche show honi chaheye, take hum recent 1 image dekh sken … inka proper backup b rakhna he jese passport, eid, work permit"* (2026-11-09)
  - Every document field in the Employee popup (EID, Passport, Visa, Work Permit, Driving License) and the Agency popups (Trade License, EID, Passport, Contract, NOC, …) takes **one or more** images or PDFs at once.
  - The new upload becomes **Current**. The images it replaces show **in the same field, right under it, as "Previous · replaced <date>"**. Older sets are under "Older history (n)". Each image has preview and download.
  - **Remove** takes an image out of Current only. It stays in history marked "removed". No file is deleted from Storage.
  - Employees: `eid_file`, `passport_file` … still hold the newest current image (other screens read them). Old employees' single image becomes their Current set.
  - The profile's document archive lists current images first and earlier ones as "Previous" / "Removed". A replaced **profile photo** is kept there as "Previous photo".
  - **Backup:** the nightly VPS backup (R-OPS-04) also copies the Storage buckets `staff-documents` and `whatsapp-media` to `/var/backups/safaeewala/storage/`. Only new files are downloaded and nothing is deleted, so every version stays.
  - Expenses: a receipt is added only when the expense is created (there is no replace), so it has no Previous.
- **Code:** `src/lib/docVersions.ts`, `src/components/common/DocVersionsField.tsx`, `EmployeeFormModal.tsx`, `Agencies.tsx`, `AgencyDashboard.tsx`, `EmployeeProfile.tsx`, `scripts/backup/storage-mirror.cjs`, `db-backup.sh`.
- **Status:** Built · backup step to install on the VPS · Since: 2026-11-09

## WA — WhatsApp

### R-WA-01 — WhatsApp runs inside the CRM (Meta Cloud API, no GHL)
- **Rule:** *"WhatsApp ka mukammal nizaam mere is CRM me shift kiya jaye … pehle whatsapp k sare feature and coding ko merge kro, agar language ya framework ka issue he to new code likho."* (2026-11-06) The Lovable prototype (zip) used a mock WhatsApp adapter and another framework, so this is new code in the CRM's own stack.
  - Sidebar → **WhatsApp**: chats on the business number, newest first, unread count on the sidebar item. A chat shows the client's name when the number matches a CRM client (phone or WhatsApp field), with a link to the profile; Client Profile has a **WhatsApp** button that opens or starts the chat.
  - Receive: text, photos, voice notes, videos, documents, stickers, locations, button replies and reactions. Media is saved to the private Storage bucket `whatsapp-media` and shown through 5-minute signed links.
  - Send: free text only within 24 hours of the client's last message (Meta rule); after that only an **approved template** (with its {{1}}… values). Delivery ticks: sent ✓, delivered ✓✓, read (blue); failures show Meta's reason. Opening a chat marks it read on the phone too.
  - Security: Meta's webhook is accepted only with a valid `X-Hub-Signature-256` (app secret) and verified with the verify token; the tables are read by admins / managers (or a role given the WhatsApp screen) and written only by the server. Cleaners and drivers do not see WhatsApp.
  - Facebook and Instagram stay in GHL for now.
- **Code:** `whatsappServer.cjs` (wired in `webhookServer.cjs`); `src/lib/whatsapp.ts`; `src/pages/WhatsAppCRM.tsx`; `src/store/useWhatsAppUnread.ts`; migration `2026-11-06_whatsapp_inbox.sql`; setup in prod.md §8.
- **Status:** Built · inbox migration run 2026-11-06 · waiting for the Meta keys on the VPS · Since: 2026-11-06

### R-WA-02 — WhatsApp CRM modules as tabs, never blocked by setup
- **Rule:** *"WhatsApp screen ke interface ko is tarah design kiya jaye ke 'WhatsApp Not Connected Yet' ya 'Setup Needed' ke messages ki wajah se features block na hon … Inbox, Jobs, Deals, Broadcast, Analytics, Automation, Keyword Trigger, Templates, aur Settings … tabs ya navigation ki surat mein."* (2026-11-07)
  - Sidebar → WhatsApp has nine tabs (`?tab=`). Every tab opens before the Meta keys or a database step are done; a missing step shows as a small strip (keys) or a note inside the one tab that needs it (database). No full-screen setup wall.
  - **Inbox:** the chats (R-WA-01). The chat header has **Booking** (opens the normal booking form for that client) and **Deal** (adds the chat to Deals).
  - **Jobs:** the CRM's own bookings of clients who chat on WhatsApp (matched by client id or the last 9 digits of the phone) and the chats of the last 30 days without a booking, with **Book**. No second job list. A new booking uses the Add Job form (R-SYNC-12): a CRM client brings their building and area; anyone else goes into the remarks as "WhatsApp enquiry — name +number".
  - **Deals:** pipeline New lead → Contacted → Quote sent → Won / Lost, value in AED, drag between columns; open pipeline, won, win rate = won ÷ (won + lost).
  - **Broadcast:** one approved template to many numbers (CRM clients by service type, or pasted numbers; `{name}` in a value = each client's name). Needs a tick that the people agreed to get WhatsApp messages. The server sends one by one (4 per second) and shows progress; at most 1000 numbers.
  - **Analytics:** from stored messages only: chats, received, sent, median team reply time (automatic and failed messages do not count as a reply), chats waiting for a reply, delivered / read %, messages per day (Dubai).
  - **Automation:** welcome message (first message of a new chat), away message outside business hours (Dubai, at most once per 12 h per chat), business hours. **Keyword Trigger:** a word in the client's message → an instant reply (contains / exact, case-insensitive); the first matching trigger wins, and a keyword reply replaces the welcome / away message. Automatic replies are free (the client just opened the 24-hour window) and are marked "Automatic reply" in the chat.
  - **Templates:** every template of the WhatsApp account with its review status; create one (Utility / Marketing, examples for each {{n}}) and delete one at Meta.
  - **Settings:** connection checklist, webhook URL, the number as Meta sees it (name review, quality), and **Connect** (admin): registers the number with a 6-digit PIN and subscribes the WhatsApp account to the app — no terminal needed.
- **Code:** `src/pages/WhatsAppCRM.tsx`, `src/components/whatsapp/*`, `src/lib/whatsappModules.ts`, `whatsappServer.cjs` (automation, broadcast, templates, phone, connect), migration `2026-11-07_whatsapp_modules.sql`.
- **Status:** Built · waiting for the migration `2026-11-07_whatsapp_modules.sql` and the Meta keys · Since: 2026-11-07

### R-WA-03 — The rest of the WhatsApp CRM prototype, and a WhatsApp-first layout (UX-114)
- **Rule:** *"Root folder mein rakhi 'Safai Wala WhatsApp CRM' zip file ka mukammal audit karein aur us mein maujood tamam ahem functionalities aur options ko current CRM mein integrate karein … layout aur header ko completely redesign … 'Full Screen' mode ka toggle … 'Back to Sidebar' ka option."* (2026-11-07)
  - **Audit result:** the prototype's Inbox assignment / status / notes, Broadcast contact lists / schedule / retarget, Deal owner / close date / activity, deal-stage Automations, Auto-reply fallback + round-robin distribution, Template header / footer / buttons, and the agent leaderboard were missing; they are now in the CRM. Left out on purpose: its Jobs (services / visits / invoices — the CRM's own Bookings and Daily Job Sheet already do this, R-WA-02), multi-business / invitations (the CRM has one business and its own users), AI draft (Lovable AI only) and "simulate inbound" (a test button).
  - **Layout (UX-114):** the WhatsApp screen is one card: a module rail on the left (Inbox, Jobs, Deals, Broadcasts, Analytics, Automations, Keyword Trigger, Templates, Settings; icons only on narrow screens), the module title bar on top, and **Full screen** (hides the CRM sidebar and page padding) with **Back to Sidebar**. Leaving the WhatsApp screen always brings the sidebar back.
  - **Inbox:** status tabs Open · Pending · Snoozed · Resolved · All, and Everyone · Mine · Unassigned. In a chat: status, assign to an admin / manager, tags, and **Notes** (team notes + assignment / status history; never sent to the client). A resolved or snoozed chat opens again when the client writes.
  - **Assignment:** Settings → Team: Manual, or Round-robin among chosen agents (each new chat goes to the next one).
  - **Opt-out:** a client writing STOP / UNSUBSCRIBE is marked "Opted out", gets one confirmation, and every campaign skips the number; START subscribes again. Staff can undo it only when the client asks.
  - **Broadcasts:** Contacts List (lists from CRM clients, WhatsApp chats or pasted numbers; tags; All List · All Contacts · Unsubscribers), Create Campaign (lists / clients / pasted; send now or **schedule** — the server sends it within a minute of the time), Campaign List (status, progress, recipients with their result, cancel a scheduled one), **Retarget Campaign** (people of an earlier campaign who didn't reply / didn't read / didn't get it).
  - **Deals:** owner, expected close (late ones in red), search, owner filter, activity log (notes, stage moves, automations).
  - **Automations:** deal stage rules — when a deal moves to a stage (optionally from a stage): send a template to the contact (`{name}` = the contact) and / or log a note. **Keyword Trigger:** fallback reply when no keyword matched and nothing else went out (once per 12 h per chat).
  - **Templates:** header (text), body, footer, up to 3 quick-reply buttons; search, status and category filters.
  - **Analytics:** agent leaderboard (messages sent per person; automatic replies left out).
- **Code:** `src/pages/WhatsAppCRM.tsx`, `src/components/whatsapp/*` (WaInbox, WaChatCrm, WaBroadcast, …), `src/lib/whatsappCrm.ts`, `src/components/layout/Layout.tsx` (focus mode), `whatsappServer.cjs` (opt-out, round-robin, fallback, scheduled / retarget campaigns, deal-stage, agents, template components), migration `2026-11-07_whatsapp_crm_more.sql`.
- **Status:** Built · waiting for the migration `2026-11-07_whatsapp_crm_more.sql` and the Meta keys · Since: 2026-11-07

## INBOX — One inbox for every channel

### R-INBOX-01 — WhatsApp, Facebook and Instagram on one screen
- **Rule:** *"CRM ke main dashboard mein ek centralized 'Inbox' module shamil kiya jaye … GHL sub-account ke zariye Facebook aur Instagram messages, aur alag se chalne wale WhatsApp CRM ke chats ko merge karke display kiya jaye."* (2026-11-07)
  - Sidebar → **Inbox** (own screen permission): one list, newest first, with a channel badge and filters All / WhatsApp / Facebook / Instagram.
  - WhatsApp chats come from the CRM's own WhatsApp (R-WA-01) and open the same chat as the WhatsApp screen. Facebook and Instagram chats come from the GHL sub-account through GHL's API with the existing `GHL_API_KEY` / `GHL_LOCATION_ID`, and are answered from the CRM (sent by GHL on the same channel). GHL is never used for WhatsApp.
  - GHL has no live feed for us: the list refreshes every 30 s and an open Facebook / Instagram chat every 15 s.
  - A channel that is not connected is named in a note; the others keep working.
- **Code:** `src/pages/Inbox.tsx`, `src/lib/ghlInbox.ts`, `ghlServer.cjs` (wired in `webhookServer.cjs`, shipped by the Dockerfile and deploy).
- **Status:** Live 2026-11-07 (Facebook / Instagram chats read through GHL; replying not yet tried on a real chat) · Since: 2026-11-07
- **UX-113 (2026-11-07):** *"Inbox screen ko top se shuru karein aur iska maujooda header remove kar dein … Left sidebar ko mazeed width dein taake platform tabs (WhatsApp, Facebook, Instagram) wazeh nazar aein … professional aur minimalist look."* No page header: the Inbox starts at the top and fills the screen. The chat list is 360–420 px wide with four platform tabs (All · WhatsApp · Facebook · Instagram, icon + count, coloured underline), an "unread" toggle, search, and the setup notes in one quiet line at the bottom.

### R-INBOX-02 — One screen for the inbox and the WhatsApp CRM; demo data; delete all; Drive backup
- **Rule:** *"WhatsApp CRM aur Inbox modules ko yakja karne ke liye ek unified interface … WhatsApp sidebar aur platform switcher (All, WhatsApp, Facebook, Instagram) dono barqarar rahein. Testing ke liye local dummy data … jo Supabase par sync na ho … three-dots menu … 'Delete All Conversations' aur Google Drive par 'Backup'."* (2026-11-07)
  - Sidebar → **Inbox & WhatsApp** is the only item; `/inbox` opens it. Its first module, Inbox, has the platform switcher All · WhatsApp · Facebook · Instagram (counts and unread per platform). On the WhatsApp platform the status tabs and Everyone / Mine / Unassigned of R-WA-03 apply.
  - **Demo data** (⋮ → Show demo data): 3 WhatsApp, 1 Facebook and 1 Instagram sample chat, named "DEMO · …" and marked DEMO. Off by default, switched per browser (plain localStorage, not cloud-synced). Replies, status, assignment, tags and notes on demo chats change only in this browser's memory — nothing goes to Supabase, Meta or GHL, nothing shows in Analytics or backups, and a reload starts them fresh. *Exception to R-DATA-03 asked by the owner for testing.*
  - **Backup to Google Drive** (⋮): one JSON file with every WhatsApp chat, message and team note plus the Facebook / Instagram chat list (their messages stay in GHL). Sent through the n8n Drive webhook of Settings → Backup when set, else Google sign-in when `VITE_GOOGLE_CLIENT_ID` is set, else downloaded with a note that Drive is not connected. The nightly database backup (R-OPS-04) covers these tables too.
  - **Delete all conversations** (⋮, admins only): deletes every WhatsApp chat in the CRM with its messages, team notes and media files, after typing DELETE; offers "Make a backup first". Facebook / Instagram chats are in GHL and are not deleted; deals and campaign results stay without the chat link.
- **Code:** `src/components/whatsapp/WaInbox.tsx`, `GhlChat.tsx`, `src/lib/inboxDemo.ts`, `src/lib/inboxBackup.ts`, `src/pages/WhatsAppCRM.tsx` (⋮ menu), `src/pages/Inbox.tsx` (redirect), `whatsappServer.cjs → /api/whatsapp/delete-all`.
- **Status:** Built · Since: 2026-11-07

### R-INBOX-03 — Conversations: one module, tags, filters, a richer message bar
- **Rule:** *"Sidebar se 'Inbox' aur 'WhatsApp' options ko khatam kar ke 'Conversations' ke naam se aik single module … 'WhatsApp CRM' heading ko hata kar ek minimalist header … 'Tags' (maslan Upcoming Job, Booked Job) … custom tags … header mein tamam tags ki summary … unread messages automatically sab se top par … filter dropdown … File/Image Attachment icon, Template selector icon, aur Smiley/Emoji picker."* and *"demo data whatsapp ka dalna he just insta and facebook to already chal rahe hen."* (2026-11-07)
  - Sidebar → **Conversations** (`/conversations`, `/inbox` and `/whatsapp-crm` open it). The module rail starts with a minimal connection header (WhatsApp / Facebook / Instagram icons with a green or amber dot) instead of a title; nothing is blocked when a platform is not connected.
  - **Tags** on every chat (WhatsApp, Facebook, Instagram): a shared list with colours — defaults Upcoming Job, Booked Job, Quote Sent, Follow-up, Complaint, VIP — plus custom tags made in any chat or in Settings → Tags. WhatsApp tags are stored on the chat; Facebook / Instagram tags in `inbox_chat_tags`.
  - Above the list: a summary — Unread, Pending and each tag in use with its count; a click filters. Unread chats always come first, then newest. A filter button beside search: unread only, tag, WhatsApp status, assigned (everyone / mine / unassigned), opted out.
  - Message bar on every chat: 📎 photo / file (up to 16 MB; WhatsApp through Meta with a copy in the private bucket; Facebook / Instagram through GHL with a 7-day link), 📄 approved WhatsApp templates + **saved replies** (Templates → Quick replies), 😊 emoji, Send.
  - Demo data (R-INBOX-02) is WhatsApp only now.
- **Code:** `src/components/whatsapp/WaInbox.tsx`, `Composer.tsx`, `Tags.tsx`, `WaSettingsMore.tsx`, `src/lib/inboxSettings.ts`, `whatsappServer.cjs → /api/whatsapp/send-media`, `ghlServer.cjs` (attachments), migration `2026-11-07_inbox_tags_notifications.sql`.
- **Status:** Built · Since: 2026-11-07

### R-WA-04 — Automatic client notifications, each with its own switch
- **Rule:** *"ye feature add krna start kro lekin inko off krne k toggles b hone chaheye jese me reminder, auto message off b kr skta hon."* (2026-11-07 — the audit's top picks: booking messages, "team on the way", payment reminder)
  - Settings → **Notifications to clients**: a **master switch** (off = no automatic message at all: notifications, welcome / away / keyword / fallback replies, deal-stage rules; campaigns and typed replies still work) and one switch + approved template + values per notification:
    - **Booking confirmation** — new bookings saved after the switch was turned on (never old ones).
    - **Day-before reminder** — tomorrow's bookings (not cancelled / completed), from a set time (default 18:00 Dubai).
    - **Team on the way** — when a cleaner taps "On my way" (job check-in), to the client of that job (its booking, else the client of the building); also by hand from Conversations → Jobs → Today's jobs.
    - **Feedback request** — bookings completed today or yesterday, from a set time (default 10:00).
    - **Payment reminder** — by hand only: Conversations → Jobs → Unpaid jobs (job sheet rows of the last 60 days with charges above received) → Remind, after a confirmation; at most once a day per job.
  - Template values: {name} {date} {time} {service} {address} {amount} {balance} {cleaner}. The server checks every minute, sends at most 30 per minute, and logs each one in `wa_notification_log` (one per booking / job and kind — never twice).
  - Nothing is sent until Meta is connected and a template is chosen.
- **Code:** `whatsappServer.cjs` (runNotifications, /api/whatsapp/notify), `src/components/whatsapp/WaSettingsMore.tsx`, `WaJobsNotify.tsx`, `src/lib/inboxSettings.ts`.
- **Status:** Built · not tested against Meta (no keys yet) · Since: 2026-11-07

### R-INBOX-04 — Conversations → Settings with tabs
- **Rule:** *"Conversations module ke sidebar se 'Keyword Trigger', 'Automation', aur 'Template' options ko mukammal taur par hata diya jaye aur setting me as a tab add kiya jae … Settings screen … top par … Users, Notifications, Tags, Templates, aur Replies … tamam widgets aur modules ko inhi relevant tabs ke andar."* (2026-11-07)
  - Module rail: Inbox · Jobs · Deals · Broadcasts · Analytics · Settings.
  - Settings tabs (`?tab=settings&s=…`): **Users** (conversation assignment, agents) · **Notifications** · **Tags** · **Templates** · **Replies** (saved replies) · **Automation** (welcome, away, hours, deal-stage rules) · **Keyword Trigger** (incl. fallback) · **Connection** (checklist, business number, opt-out). Old links (`?tab=templates|automation|keywords`) open the matching tab.
- **Status:** Built · Since: 2026-11-07

### R-WA-05 — Template builder; templates made in the CRM
- **Rule:** *"Templates screen par 'Add New Template' ka option … 'Templates are read from Meta' … khatam kar ke manual entry … proper format ya template builder"* and *"Create Template pop-up ko … 'SafaeeWala' … references aur attached screenshot ke mutabiq"* (2026-11-07 — the reference is the WhatsApp CRM prototype's Templates screen; no folder of that name exists, the zip prototype is used)
  - All Templates: status tabs All · Favorites · Approved · Rejected · Pending · Paused · Draft · Disabled · Pending Deletion; search, category, type, sort; table Name · Category · Language · Status · Type · Created · Updated · Actions (edit / view, duplicate as draft, delete — at Meta too once submitted); favourites; Refresh brings Meta's review results in and adds templates made in Meta.
  - Create Template: step 1 one of 8 types (Custom Message, Flows, Appointment Reminder, Limited Time Offer, Carousel, Catalog, Multi-product, Call Permission — each starts with cleaning-business wording), step 2 name, category, language, header (none / text / image / video / document / location), body with bold / italic / strike and "Add variable", sample values, footer, buttons (quick reply, link, call, copy code), plus the type's own fields (offer text, Flow ID, catalog button, carousel cards); live WhatsApp preview on the right; the checks Meta applies are listed before review.
  - **Save draft** works without Meta (table `wa_templates`); **Submit for review** sends it to Meta when WhatsApp is connected. Media samples (header, carousel cards) need `WHATSAPP_APP_ID` on the server. Flows need a Flow ID from Meta; Catalog / Multi-product need a catalog on the WhatsApp account; Call Permission needs WhatsApp calling.
  - Sending still uses approved templates only (Meta's rule).
- **Code:** `src/lib/templateBuilder.ts`, `src/components/whatsapp/TemplateBuilder.tsx`, `WaTemplates.tsx`, `whatsappServer.cjs` (/templates/submit, /template-media), migration `2026-11-07_wa_templates.sql`.
- **Status:** Built · Meta submission not tested (no keys yet) · Since: 2026-11-07

### R-INBOX-05 — Templates is its own module
- **Rule:** *"Settings screen se 'Template' tab ko mukammal taur par hata kar Conversations module ke sidebar mein shamil kiya jaye … 'Broadcast' ke niche aur 'Analytics' ke upar … tabs … 'Automation', 'Keyword Triggers', aur 'Replies'."* (2026-11-09)
  - Module rail: Inbox · Jobs · Deals · Broadcasts · **Templates** · Analytics · Settings.
  - Templates tabs (`?tab=templates&t=…`): **Templates** (Meta templates, R-WA-05) · **Quick replies** · **Automation** · **Keyword Triggers**.
  - Settings keeps Users · Notifications · Tags · Connection.
  - Old links (`?tab=automation|keywords`, `?tab=settings&s=templates|replies|automation|keywords`) open the matching Templates tab.
- **Code:** `src/components/whatsapp/WaTemplatesHub.tsx`, `src/pages/WhatsAppCRM.tsx`, `WaSettings.tsx`.
- **Status:** Built · Since: 2026-11-09 · Replaces the tab list of R-INBOX-04.

### R-INBOX-06 — Leaner Conversations layout; Book Job in every chat
- **Rule:** *"Conversations screen ke inner sidebar ki width kam ki jaye … 'Partially Connected' status ko icons ke nechay dusri row mein … clickable … settings par redirect … 'WhatsApp, Facebook, and Instagram in one place' wali heading … remove … 'Full Screen' button hata dein … har chat header mein refresh icon ke sath ek 'Book Job' ka button … Daily Job Sheet ka booking pop-up pre-filled data ke sath."* and *"Template tab … 'Updated' column … hata diya jaye … 'Template Name' column ki width ko kam."* (2026-11-09)
  - **Module rail:** 184 px wide on desktop (was 220).
    - First row: the platform icons, with the ⋮ menu (demo data, Drive backup, delete all).
    - Second row: All / Partly / Not connected, a link to Settings → Connection. "DEMO DATA ON" also shows here.
    - Full screen stays at the bottom of the rail.
  - **Inbox:** no title row; the platform tabs and chats start at the top. Other modules keep a slim title (no buttons).
  - **Book Job:** green, in every chat header: on WhatsApp chats it replaced the "Booking" link, and on Facebook / Instagram chats it sits next to Refresh. It opens the Daily Job Sheet's Add Job popup in place.
    - Prefilled: today, 09:00–01:00 PM, and the building and area of the linked client (or of the client with the same number). Remarks name the channel, name and number.
    - Saving an unknown address opens Add New Client with the name and number filled in.
    - Off on demo chats.
  - **Templates table:** no Updated column. Fixed column widths with the name truncated (full name on hover), so the table fits without sideways scrolling.
- **Code:** `src/pages/WhatsAppCRM.tsx`, `BookJobButton.tsx`, `WaChat.tsx`, `GhlChat.tsx`, `src/lib/leadBooking.ts → chatToJob`, `WaTemplates.tsx`.
- **Status:** Built · Since: 2026-11-09

### R-WA-06 — Internal templates (quick replies) need no Meta review
- **Rule:** *"main templates apne CRM ke andar banaun jo mere liye internal templates ki tarah kaam karein, lekin jab inhein WhatsApp par bheja jaye to yeh aam text ke taur par jayen."* (2026-11-09)
  - In the template builder, **Save as quick reply** saves the text (text header + body + footer) as a quick reply. A quick reply has no Meta review and is sent as ordinary text from the message bar. Body formatting is kept: \*bold\*, \_italic\_, \~strike\~.
  - `{{1}}`-style variables are refused there: a quick reply is sent exactly as written.
  - **WhatsApp's 24-hour rule:** ordinary text, quick replies included, reaches only a client who wrote in the last 24 hours. Use a Meta-approved template (Submit for review) to start a conversation, or to write after 24 hours. Broadcasts and automatic notifications are examples.
- **Code:** `TemplateBuilder.tsx → saveAsReply, quickReplyText`, `WaTemplatesHub.tsx`, `Composer.tsx`.
- **Status:** Built · Since: 2026-11-09

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
  - It also saves the VPS data folder (agencies and Fluent Form leads are kept there, not in Supabase).
  - Daily copies are kept for 30 days; the copy of the 1st of each month is kept for good (*"mjhe complete record nahi rkhna chaheye?"*). Plus an off-site copy in Google Drive, because a backup on the VPS alone is lost with the VPS.
  - The time is fixed at 02:00 Dubai (owner asked for a setting; a fixed time was advised because nobody works then and a setting needs a link from the app to the VPS cron).
  - Each run checks that the copy can be read. A failed run is written to `last-status.txt`, and is posted to `BACKUP_ALERT_URL` when that is set.
  - The connection string (`SUPABASE_DB_URL`) lives only in the VPS `.env` and is never passed on the command line (R-SEC-02).
  - The Daily Job Sheet spreadsheet export to Drive (Settings → Backup, n8n webhook) is a report, not a database backup.
  - Restore is manual (see the README) and goes to a TEST project first.
  - Settings → Backup shows the last result (UX-93): the script writes `backup-status.json` into the VPS data folder, the server returns it at `/api/backup-status` (signed-in users only).
- **Code:** `scripts/backup/db-backup.sh`, `scripts/backup/README.md`, `webhookServer.cjs → /api/backup-status`, `src/lib/backupStatus.ts`, `src/components/settings/BackupStatusCard.tsx`; [prod.md §7](prod.md).
- **Status:** Active (VPS cron since 2026-11-05; first run and a test restore checked) · Google Drive copy pending (owner login) · Since: 2026-11-05

### R-OPS-05 — CRM on the company subdomain, hidden from search engines
- **Rule:** *"kiya me main website ki subdomain pr ye sab chala skta?"* and *"kya me iske liye crawler ko rok skta hn take google ki search me ye crm na aye?"* (2026-11-06)
  - The CRM answers on **https://crm.safaeewala.com**: Cloudflare DNS (A record `crm` → 187.77.116.14, **DNS only / grey cloud**, so Traefik's Let's Encrypt certificate works and Meta's webhook reaches the VPS directly). The old `crm.srv1646539.hstgr.cloud` keeps working.
  - The main website (`safaeewala.com`, `www`, email) is not touched. Never change the nameservers in Hostinger — DNS lives in Cloudflare.
  - Every response carries `X-Robots-Tag: noindex, nofollow` and `index.html` has `<meta name="robots" content="noindex, nofollow">`. No `robots.txt` block: a blocked page cannot be read, so Google would never see the noindex.
- **Code:** `docker-compose.yml` (Traefik rule), `webhookServer.cjs` (ALLOWED_ORIGINS), `nginx.conf`, `index.html`; [prod.md §8](prod.md).
- **Status:** Code ready · live after the next deploy; Supabase Auth redirect URL to be added by the owner · Since: 2026-11-06

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
