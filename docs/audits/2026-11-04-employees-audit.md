# Employees screen audit — 2026-11-04

**Scope:**
- Screens and components: `/employees` (`Employees.tsx`), `EmployeeFormModal`, `EmployeeProfile`.
- Data and logic: the employee functions in `DataContext`, `employeeHealth`, `clientDataSync`.

**Question:** *Is the data fully live, is it saved in Supabase, and is the screen ready for real data?*

**Method:**
- Code review.
- A read-only check of live Supabase (column names and counts only, no personal data).
- Nothing was tested in a browser.

## 1. Is it live and saved?

| Check | Result |
|---|---|
| Fields the app saves vs. columns of `employees` | All 51 fields exist as columns, so nothing is dropped on save. |
| Save path | Each change is saved through the outbox. It is retried if offline, sent live to other users (R-SYNC-09), and logged in the audit log. |
| Rows in the table | **2**, both drivers. Every cleaner on the screen comes from Daily Job Sheet names (`emp-dj-…`). Such a cleaner is saved as a real employee the first time someone edits them. |
| Identity documents | Private Storage bucket, admin/manager only (R-SEC-04). |
| This browser's copy | `safaeewala_employees` in localStorage is a cache only; Supabase is the source. |

**Verdict:** saving works and is live. But the team is not in the database yet. Until each cleaner is opened once and saved (or added with *Add Employee*), these features cannot be linked to their record by id: their login (My Duties, R-SEC-05), their documents, salary, and Attendance marks by id.

## 2. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| EMP-01 | High | Excel import added every row again. Importing the same file twice doubled the team. There was no message saying what was imported. | **Fixed**: people already listed (same name, phone or Emirates ID) are skipped, and a message gives the counts. |
| EMP-02 | Medium | The bin icon on a card or a table row deleted the employee at once, with no question. | **Fixed**: asks first. The profile dialog keeps its own confirm step. |
| EMP-03 | Medium | Dates used UTC. Dates imported from Excel moved one day back in UAE / PK time (date of joining, visa expiry…), and *Today / Last 7 days …* were off before 4 AM. | **Fixed**: calendar dates, Dubai "today". |
| EMP-04 | Medium | A cleaner marked absent, or given approved leave, in Attendance still showed *Available / On Duty* here. Only the employee's own status field was read. | **Fixed**: today's Attendance mark shows as *Absent*, *On Leave* or *Leave (pending)* (R-ATT-05). |
| EMP-05 | Medium | Revenue and cash collected of a team job were always split equally between its cleaners. | **Fixed**: a job in Split Mode (R-PAY-05) gives each cleaner their own amount. Lump-sum jobs keep the equal share. |
| EMP-06 | Low | Per-employee statistics scan every job for every employee (`getEmployeeDailyJobsHistory`), which grows as employees × jobs. Fine for the current size (about 30 staff, a few thousand rows). | Open: suggestion 2 |
| EMP-07 | Low | Profile photos are stored as data URLs inside the row (`photo_url`), unlike documents. This makes the row and the browser cache heavy. | Open: suggestion 3 |
| EMP-08 | Low | `updateEmployee` and `updateClient` write to the outbox inside a React state updater. In development (StrictMode) that runs twice. It is harmless because the write is an upsert, but it is not clean. | Open: suggestion 4 |

## 3. Suggestions for reliability and performance

1. **Register the team.** Open each cleaner who came from the job sheet once and press *Save*, or import a staff file (now safe to re-run). Then link logins in Settings → Users.
2. **Index jobs by cleaner once** (one `Map<cleanerKey, jobs[]>` built in `DataContext`) and let Employees, the profile, Attendance and My Duties read from it, instead of each screen scanning all jobs.
3. **Move photos to Storage**, like documents (`docStorage`). Keep a small thumbnail in the row.
4. **Move outbox writes out of state updaters** in `DataContext`: compute the next list first, then call `dbInsert` / `dbUpdate` once.
5. **Load jobs by date window.** Load the last 90 days at start and older history on demand (already listed in the end-to-end audit).
6. **Server-side checks.** A database unique index on the Emirates ID, and a check constraint on `status` / `role`, would catch duplicates and bad values even when they come from an import or the API.
