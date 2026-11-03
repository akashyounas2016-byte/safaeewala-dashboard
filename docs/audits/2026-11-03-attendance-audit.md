# Attendance system audit — 2026-11-03

**Scope:** Attendance screen, how its marks reach the Daily Job Sheet and Employees, where the data is stored, and the new leave approval.
**Asked by the owner:** *"jab kisi cleaner ko Absent mark kiya jaye, toh uski entry Daily Job Sheet mein kyun nahi aati"*, plus sync, storage, suggestions, an approval system, and a yellow flag for Monday leave.
**Method:** code review of `Attendance.tsx`, `lib/attendance.ts`, `DailyJobSheet.tsx`, `employeeHealth.ts`, `cloudState.ts`, `AttendanceCalendar.tsx`. Nothing was tested in a browser.

## 1. Why an absent cleaner did not appear in the Daily Job Sheet

There were three reasons.

1. **The Daily Job Sheet never read the Attendance marks.**
   - Its "no job" rows come from the shared roster (`buildCleanerRoster`), and every one was drawn as *Available / Standby*.
   - An absent cleaner looked exactly like a free cleaner.
2. **No jobs on the date meant no "no job" rows at all.**
   - The sheet hid every such row when the date had no jobs (`todayJobs.length === 0`).
   - So a cleaner marked absent for tomorrow did not show anywhere.
3. **A cleaner with jobs who was marked absent kept the jobs without any sign.**
   - The mark lived only in Attendance.
   - The sheet showed the jobs as normal, so nobody knew to reassign them.

**Fixed (R-ATT-07):**
- Absent and on-leave cleaners are now listed in red or amber, with the reason and who marked them. This works on an empty date too.
- Their remaining jobs get an *Absent / On leave in Attendance — reassign* tag.

## 2. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| ATT-A01 | High | The Daily Job Sheet ignored Attendance marks (see §1). | **Fixed** (R-ATT-07) |
| ATT-A02 | High | All marks were one shared JSON value in `app_state`. Problems: (a) when two users marked at once, the merge rule "this browser wins per key" could put back an older mark; (b) a *Reset* on one device could come back from another device; (c) the Attendance page read the marks once on open and wrote its whole copy back on the next change. | **Fixed**: table `attendance_marks`, one row per cleaner + date, live (R-SYNC-10) |
| ATT-A03 | Medium | The Employees health score read the marks from this browser's `localStorage`, not from the shared store. | **Fixed**: it now uses the same marks as Attendance |
| ATT-A04 | Medium | The *Next day* / *Previous day* arrows used the browser's local time and then UTC. In the UAE and Pakistan, *Next* stayed on the same date and *Previous* jumped back two days. | **Fixed**: uses `dubaiTime.addDays` |
| ATT-A05 | Medium | Marking absent a cleaner who has jobs that day gave no warning. | **Fixed**: the mark dialog warns, and the job sheet tags the jobs |
| ATT-A06 | Medium | There was no approval: any user could record leave, and it counted straight away. | **Fixed**: leave approval (R-ATT-05) |
| ATT-A07 | — | Monday leave needed a visible flag for the approver. | **Done** (R-ATT-06), plus the count of other Monday absences in the last 90 days |
| ATT-A08 | Low | *Fetch Daily Sheet* only shows a spinner and a message. The data is already live, so the button does nothing. | Open: rename it or remove it |
| ATT-A09 | Low | The *Last 7 days / Last 30 days / This month* presets only jump to one date. They are not a range. | Open |
| ATT-A10 | Low | The words "sick leave", "on leave" or "absent" typed in a job-sheet row's remarks still count as leave or absent without approval. The Excel Job Sheet does not show Attendance marks. | Open: suggest recording leave only on the Attendance screen |

## 3. Is the data synchronised, and is it online?

| Data | Where it is saved | Who sees it |
|---|---|---|
| Jobs (Present is derived from these) | `daily_jobs` table (cloud) | Every user, live |
| Absent / Leave / manual Present marks, leave decisions | `attendance_marks` table (cloud), with a copy in this browser for offline use. Until the migration runs, the old shared `app_state` value is used. | Every user, live (after the migration) |
| Health score absences (Employees → profile) | Worked out from the two rows above | Same everywhere |
| Monthly calendar and summary export | Worked out from the two rows above | Same everywhere |

**Before this change:**
- The marks *were* online: the `app_state` value has been cloud-synced since AUD-02.
- But they were exposed to the problems in ATT-A02.
- The health score used whatever this browser had.

**How the three modules relate:**
- The Daily Job Sheet is the source for *Present*.
- Attendance is the source for *Absent* and *Leave*.
- Employees reads both.

## 4. Approval system (built)

- **Leave request:** Sick Leave, Emergency Leave, Annual Leave and Weekly Off marked by any role other than admin or manager are saved as *Pending*.
  - The cleaner's card shows *Leave · Awaiting approval*.
  - Pending leave is not counted as an absence.
- **Decision:** admin or manager open Attendance → **Leave approvals**.
  - *Approve leave* keeps it as leave.
  - *Reject → Absent* records an absence.
  - The record keeps who requested it, who decided and when.
  - A leave that admin or manager mark themselves is approved at once.
- **Absences** (Uninformed Absence, Other) are final at once and need no approval.
- **Monday:** a pending Monday leave has a yellow row and a yellow **Monday** chip, with "N other Mondays off in last 90 days".
- **Database enforcement:** the trigger `attendance_marks_guard` refuses a decision from any role other than admin or manager, even through the API.

## 5. Suggestions (not built)

1. **Salaries screen (planned):** deduct days for rejected leave and absence, and pay approved leave according to the contract.
2. **Leave balance** per employee (annual quota, sick days used), shown in the approval row.
3. **A cleaner asks for leave from *My Duties*:** the request goes straight into Leave approvals.
4. **Notify admin and manager** of a new request (sidebar badge, or WhatsApp through the existing integration).
5. **Remove ATT-A08 and fix ATT-A09** (real date range with totals per cleaner).
6. **Record leave only in Attendance:** drop the job-sheet keyword rule (ATT-A10), or turn such rows into pending requests.
7. **Show Attendance marks in the Excel Job Sheet** in the same colours.

## 6. What the owner must do

1. Merge and deploy.
2. Run `supabase/migrations/2026-11-03_attendance_marks.sql` in the Supabase SQL Editor. It creates the table and copies the existing marks; existing leave counts as approved.
   - Until then, the app keeps working the old way: marks are saved, but there is no live update and the database does not enforce the approval rule.
   - Running it again later is safe.
3. Check with two users:
   - A supervisor login sends a leave.
   - An admin sees it in Leave approvals and approves or rejects it.
   - The Daily Job Sheet for that date shows the cleaner.
