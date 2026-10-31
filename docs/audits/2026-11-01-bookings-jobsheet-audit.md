# Bookings ↔ Daily Job Sheet audit — sync, functionality, suggestions (2026-11-01)

> Scope: `src/pages/Bookings.tsx`, `src/components/bookings/*`, `src/pages/DailyJobSheet.tsx`,
> `src/pages/JobSheetSpreadsheet.tsx` and the shared logic in `src/store/DataContext.tsx`
> (`addBooking`, `updateBooking`, `deleteBooking`, `pushBookingToDailyJob`, `updateDailyJob`) and
> `src/lib/clientDataSync.ts`, on `main` as of `cb9ca31`. Every finding below was read in the code.
> IDs **BJ-01…BJ-18** (findings) and **BJS-01…BJS-16** (suggestions). Nothing is fixed yet.

## 0. Answer: are the two screens fully synchronised?

**No.** The link works for the simple path (create a booking → a job-sheet row appears; edit time /
cleaner / charges on the job sheet → the booking follows). It breaks on payments, edits made from the
Bookings screen, cancellations, deletions, re-imports, recurring bookings and invoices — and the
booking → job direction is **saved only in the browser**, not in the database.

| How the two are linked | Where |
|---|---|
| Creating a booking adds one job row with `booking_id` | `DataContext.addBooking` (also creates/updates the client) |
| Editing a booking copies date, time, hours, cleaner, address, charges, service to the job | `DataContext.updateBooking` — **browser only** (BJ-02) |
| Editing a job copies date, time, hours, charges, address, service, cleaner, "fully paid → completed" back | `DataContext.updateDailyJob` (not for monthly bookings) |
| Bookings screen shows each booking with live values from its job; job rows without a booking appear as `DJ-…` cards; today's monthly visits as `monthly-sync-…` cards | `Bookings.tsx → synchronizedBookings` |
| Opening Bookings, the job sheet or Excel inserts today's monthly visits into the job sheet | `syncMonthlySchedulesToDailyJobs` (3 screens) |

---

## 1. Findings

### 🔴 Data is lost or not saved

**BJ-01 — Editing a job-sheet card on Bookings wipes the money collected.**
`Bookings.tsx:2262-2275`: for `DJ-…` cards the popup calls `updateDailyJob` with
`received: patch.status === 'completed' ? … : undefined` and `staff_name: crewToStaffName(…) || undefined`.
The keys are present with `undefined`, and `updateDailyJob` turns `received` into `safeNum(undefined) = 0`
and spreads `staff_name: undefined`.
*Effect:* changing only the time or address of such a card sets **received to 0** (cash disappears from
collections, the row turns Pending) and can blank the cleaner's name.
*Fix:* send only fields that changed; never send `undefined` keys.

**BJ-02 — Booking edits reach the job row only in this browser.**
`DataContext.updateBooking:526-547` updates the linked job in React state and localStorage but never calls
`dbUpdate('daily_jobs', …)`.
*Effect:* other devices, the driver sheet and the next login (which loads the server copy) still show the
old date / time / cleaner / charges. Now that data comes from Supabase, the edit is effectively undone on reload.
*Fix:* route the change through `updateDailyJob` (or call `dbUpdate`) for the linked row.

**BJ-03 — Payments recorded on a booking never reach the job sheet.**
`Bookings.tsx:334-341`: the Payment button on a real booking only sets `booking.received_amount`.
The job row's `received` is unchanged, so the cash book, Pending, Overview and driver sheets don't see the
payment. The Bookings card itself shows the **job's** received (`synchronizedBookings`), so a part payment
seems to vanish; only a full payment shows (because it flips the status to completed, which then sets the
job's received to the full charge).
*Fix:* one collection routine (the existing `applyCollection` / job `received`) for both screens; the booking
reads its payment from the job.

**BJ-04 — Monthly visits can be inserted twice.**
`syncMonthlySchedulesToDailyJobs` runs automatically on Bookings (`Bookings.tsx:752-759`), the job sheet and
Excel, as soon as `dailyJobs` changes — including the first render, before the cloud data has arrived.
On a new device, after clearing the browser, or with two screens open, it inserts today's monthly rows
that already exist in the cloud → **duplicate visits** (double hours, double cleaner, double charges for
non-zero rates). The "already synced" test matches the client's name in the address
(`clientDataSync.ts:1326-1333`), so a monthly **booking** whose address has no client name (BJ-16) also gets a
second row.
*Fix:* run the sync only after data has loaded from the server, from one place, and match by `client_id`;
show a "N monthly visits added" notice with undo.

### 🟠 The two screens disagree

**BJ-05 — "Completed" means different things depending on where it happens.**
Completing on Bookings → `updateBooking` creates a draft invoice and the next recurring booking.
Completing on the job sheet (received ≥ charges) → `updateDailyJob` sets `status: 'completed'` directly,
skipping both. Un-paying a job never reverts the booking.

**BJ-06 — Next recurring booking has no job row and inherits payment state.**
`updateBooking:575-588` adds the next weekly/bi-weekly/monthly visit with `{...booking}`: no job-sheet row is
created (only `addBooking` makes one), and `received_amount`, `is_partially_paid`, `job_sheet_id`,
`is_sheet_synced` are copied from the visit just completed.

**BJ-07 — Duplicate invoices and double receivables.**
The auto draft invoice (`updateBooking:555-572`) has no `booking_id` and no `job_ids`.
The Invoice button (`BookingInvoiceModal`) looks for `booking_id` or "same client, created on the booking
date", so it usually doesn't find the auto invoice and makes a second one. Without `job_ids` the job is
still counted on Pending **and** on the invoice. VAT is always 5 % there; monthly-frequency bookings get one
invoice per visit although monthly clients are billed monthly.

**BJ-08 — Cancelling a booking leaves the job on the sheet.**
No code handles `status: 'cancelled'`: the job stays — counted in revenue and Pending, the cleaner looks
busy, the driver still gets the stop.

**BJ-09 — Deleting a booking deletes its job outside the safe path.**
`deleteBooking:600` deletes job rows with a direct `supabase…delete().eq('booking_id', …)` (not the outbox —
a failure is only logged) and keeps no before-delete copy (R-DATA-10).

**BJ-10 — Re-importing or deleting a job-sheet day breaks the booking link.**
Import replaces the day (`clearDailyData`), deleting booking rows; imported rows carry no `booking_id`.
Excel "delete row" and the job-sheet delete do the same. The booking then falls back to BJ-11.

**BJ-11 — Guess-matching links bookings to the wrong job.**
`synchronizedBookings` links by `booking_id` **or** "same date and the address contains the client name".
"Ali" matches "Ali Khan"; two visits on one day both match; one job can feed two bookings. The card then
shows another job's cleaner, time, amount and payment.

**BJ-12 — Buttons that do nothing.**
"Mark complete" on a `DJ-…` card sets `job.status = 'completed'`, a field nothing reads — the card stays open.
`monthly-sync-…` cards send edit / delete / complete / payment to `updateBooking` / `deleteBooking` with an id
that does not exist — nothing happens, and a payment entered there is lost.

**BJ-13 — Status shown ≠ status saved.**
Cards show "completed" when the job's received ≥ charges, but the stored booking stays `confirmed` (stats,
notifications and filters that read the stored status disagree). Job-only cards from past dates are shown
"completed" even when unpaid (Pending).

### 🟡 Gaps

**BJ-14 — Fields that never sync:** material (the new Yes/No toggle on bookings), payment mode, notes/remarks,
client name changes, area (job area is always "Dubai"), team name, OT.

**BJ-15 — New booking defaults:** job payment mode is always Cash (or Monthly) even for online / prepaid;
area "Dubai"; a booking created as completed sets received = full total.

**BJ-16 — A monthly booking rewrites the client's permanent schedule** (`addBooking:449-462` merges
`service_days`, time, cleaner) — R-SCHED-02 says permanent changes happen only on Monthly Clients.

**BJ-17 — The job sheet doesn't show which rows come from a booking** (no badge in the table or Excel), so
rows are edited or deleted without knowing a booking depends on them.

**BJ-18 — Dates:** the auto-invoice due date uses UTC (`toISOString`) — R-DATA-06.

---

## 2. Fix plan (suggested order)

| Step | Items | Size |
|---|---|---|
| 1 — stop data loss | BJ-01, BJ-02, BJ-03, BJ-04 | small–medium |
| 2 — one link, one truth | link only by `booking_id` (drop guess-matching, BJ-11); payment and status read from the job (BJ-13); completion side effects in one function used by both screens (BJ-05, BJ-06, BJ-07) | medium |
| 3 — lifecycle | cancel → mark/remove job (BJ-08); delete through outbox + copy (BJ-09); keep `booking_id` on re-import / warn before deleting a booking row (BJ-10, BJ-17); make `DJ-` / `monthly-sync-` card actions real (BJ-12) | medium |
| 4 — fields | material, payment mode, notes, area, team (BJ-14, BJ-15); monthly booking → creates a Monthly Client contract via its own screen (BJ-16) | small |

---

## 3. Suggestions — new features and options

### Bookings
- **BJS-01 Booking timeline per cleaner** — a day view with one lane per cleaner (drag a booking to another
  cleaner or time); shows free gaps for new bookings.
- **BJS-02 Double-booking check** — warn when the chosen cleaner already has an overlapping job (bookings
  or job sheet) — VAL-06.
- **BJS-03 Recurring series** — edit "this visit / all future visits", skip a date, pause a series.
- **BJS-04 Cancel & reschedule with reason** — reason, optional fee, history on the booking.
- **BJS-05 WhatsApp confirmation and day-before reminder** to the client (template with date, time, cleaner).
- **BJS-06 Price calculator** — hours × rate + material + area surcharge, saved as a quote the client can accept.
- **BJS-07 Lead → booking in one click** from Fluent Forms (UX-47), fields pre-filled.
- **BJS-08 Booking status flow chips** — Booked → On job sheet → In progress → Done → Paid, each from real data.

### Daily Job Sheet / Excel
- **BJS-09 Booking badge on rows** ("BK-1234", click opens the booking); warning before deleting such a row.
- **BJS-10 "Bookings without a cleaner" tray** for the selected date — assign from the job sheet.
- **BJS-11 Sync review** — instead of silent inserts, a "3 monthly visits and 2 bookings to add" panel with Add / Skip.
- **BJS-12 One payment entry** — a single "Collect payment" dialog (cash / online / partial) used by Bookings,
  the job sheet and Pending, so all screens agree.
- **BJS-13 Live updates** — Supabase realtime so a second device sees new rows and edits within seconds.
- **BJS-14 Close day checks bookings** — list bookings of the day that are not on the sheet or not paid.
- **BJS-15 Cleaner day timeline** (Gantt) under the table, with overlaps highlighted.
- **BJS-16 Sync health in Data health** — bookings without a job, jobs pointing to deleted bookings,
  booking/job value differences, duplicate monthly visits.
