# Decision Log

> Short records of *why* things are the way they are. Newest first. Never edit an old decision's outcome —
> add a new entry that supersedes it.
>
> Template:
> ```
> ## DEC-NNN — Title (YYYY-MM-DD)
> - Context:  what problem or request triggered this
> - Decision: what we chose
> - Why:      reasons / alternatives rejected
> - Affects:  rule IDs, files
> ```

## DEC-014 — Real accounts and login everywhere, including localhost (2026-10-30)
- **Context:** Audit SEC-01…03: the login was a browser flag with a password inside the JavaScript, and the database answered anyone. The live Supabase project also had no tables (AUD-69).
- **Decision:** Supabase Auth with admin-created accounts only (no sign-up), roles admin/manager/employee with screen permissions, row-level security for signed-in users. Login is required on localhost too, because the database refuses anonymous requests. Supersedes DEC-002.
- **Decided by:** owner ("admin user add kr sake, sign up nahi kr ske ga koi, role k hisab se screens") · **Rules:** R-SEC-01, R-SEC-03

## DEC-013 — Two-scenario Overtime (OT) Policy: Post-8 PM & Excess Basic Hours (2026-10-30)
- **Context:** Owner clarification on OT rules: "Rules document mein Overtime (OT) ka rule add karen. Do scenarios shamil karen: pehlay yeh ke 8:00 PM kay baad ki janay wali duty har soorat may OT mein consider hogi, basic hours kuch bhee hon. Doosra yeh kay agar koi employee 8:00 PM say pehle apne basic duty hours (8 ghantay) say zayada duty kar lay, to woh extra hours bhee OT mein shamil hon."
- **Decision:** Two-scenario OT logic:
  1. Any duty hours past 8:00 PM (20:00) count unconditionally as Overtime.
  2. Any duty hours before 8:00 PM exceeding the 8-hour basic duty limit count as Overtime.
  3. Combined shifts add both components together. Explicit job `ot_hours` or `is_overtime` override automated calculation.
- **Why:** Protects cleaner compensation for prolonged daytime hours and evening work, maintaining operational fairness and ledger clarity.
- **Affects:** R-OT-01, `src/components/dailyJobSheet/jobSheetUtils.ts`, `src/lib/clientDataSync.ts`.

## DEC-012 — Dubai time for business dates; Delete All stays (2026-10-29)
- **Decision:** All business dates ("today", months, imports) use Asia/Dubai, because the company works in Dubai even when the dashboard is opened from Pakistan. "Delete All Data" on the Daily Job Sheet stays: the owner uses it to clear test entries at the end of testing (AUD-45 won't fix).
- **Decided by:** owner · **Rules:** R-DATA-06

## DEC-011 — Receivables as one module without merging the two screens (2026-10-29)
- **Context:** UX-01 asked to merge Pending and Payments; Antigravity was rebuilding the Payments screen at the same time.
- **Decision:** A shared tab bar (`ReceivablesNav`) makes them one module; new receivables features (by-client view, cash book, invoice dues) live on the Pending side. One collection routine (`applyCollection`) serves single rows, client bulk collection and invoices.
- **Why:** Same user experience with no rewrite of a file another agent was editing; avoids merge conflicts.
- **Affects:** R-FIN-06, UX-01, UX-08 … UX-11.

## DEC-010 — Agency delete removes its staff; pay shown as monthly salary only (2026-10-27)
- **Context:** Owner request: "jab agency delete ho jaye tab employee ka data bhi delete hoga"; "/hr ko monthly salary mein badlo".
- **Decision:** Deleting a third-party agency deletes its linked employees (with a named warning in the dialog); shifts on the job sheet are kept as history. Hourly rates are no longer shown or defaulted anywhere; monthly salary is the single pay figure.
- **Why:** Owner decision; removes orphaned staff (AUD-13) and the three conflicting salary formulas (AUD-06).
- **Affects:** R-AGN-06, R-DATA-05, R-EMP-02.

## DEC-009 — Outbox + key/value cloud copy instead of one table per feature (2026-10-27)
- **Context:** Phase 2 of the audit — browser-only financial data and silently failed Supabase writes.
- **Decision:** (1) all writes through an outbox that retries and re-applies pending changes; (2) the 7 browser-only keys mirrored as JSON values in one `app_state` table, merged by item `id`.
- **Why:** No page code had to change (they keep using localStorage); one small migration instead of 7 new tables; works offline. Trade-off: an item deleted on one device can return if another device edited the same list before syncing — acceptable until these become proper tables.
- **Affects:** R-SYNC-05, `syncQueue.ts`, `cloudState.ts`, `supabase/migrations/2026-10-27_phase2_sync.sql`.

## DEC-008 — Documentation structure with rule IDs (2026-10-27)
- **Context:** Rules were spread across AGENTS.md, rules.md and chat; two agents change the code in parallel.
- **Decision:** One registry (`rules.md`) with permanent IDs; `design.md`, `architecture.md`, `prod.md`, `docs/*` for the rest; CHANGELOG + this log for history.
- **Why:** Anyone (human or agent) can find a rule, where it is enforced, and why it exists.
- **Affects:** all docs.

## DEC-007 — Bookings keep employee IDs, job sheet keeps names (2026-10-27)
- **Context:** Job-sheet rows created from bookings showed IDs instead of cleaner names; agency payouts missed those shifts.
- **Decision:** Convert at the boundary (`crewToStaffName` / `staffNameToCrew`) instead of changing either model; show legacy ID rows as names without rewriting the database.
- **Why:** The job sheet is name-based by nature (Excel imports, hand entry); bookings need stable IDs. Read-only repair avoids touching live data.
- **Affects:** R-SYNC-02, `DataContext.tsx`, `Bookings.tsx`, `clientDataSync.ts`.

## DEC-006 — Health Score counts only specifically-marked absences (2026-10-27)
- **Context:** Owner asked for a performance score based on absenteeism.
- **Decision:** Attendance 50 / Activity 30 / Compliance 20; absences only from explicit marks.
- **Why:** Must agree with the attendance rule — blank days are "available", not absent.
- **Affects:** R-EMP-03, R-ATT-01.

## DEC-005 — No dummy data in pickers and filters (2026-10-27)
- **Context:** Agency filter and client assign lists showed demo names.
- **Decision:** Filters read live collections only; demo seeds removed from `defaultAgencies` and excluded from assign lists.
- **Affects:** R-DATA-03, R-AGN-03.

## DEC-004 — Add Agency popup is the reference popup design (2026-10-27)
- **Decision:** All large forms follow its layout: header actions, 3-card top row, tinted document sub-cards.
- **Affects:** design.md D-05, D-09, D-10.

## DEC-003 — Claude works in a separate git worktree (2026-10-27)
- **Context:** Two agents editing one folder overwrote each other's changes.
- **Decision:** Claude uses `…-claude` worktree on `claude/workspace`; merges into `main` by fast-forward after rebasing; only Antigravity deploys.
- **Affects:** R-OPS-03, docs/workflow.md.

## DEC-002 — Login bypass on localhost only (2026-10-25)
- **Decision:** `isLocalEnvironment()` skips login in development; production enforces login with rate limiting.
- **Affects:** R-SEC-01.

## DEC-001 — Daily Job Sheet is the source of truth for operations (2026-10)
- **Decision:** Clients, staff, hours, OT and revenue derive from the job sheet; monthly master schedules generate rows but are never changed by them.
- **Affects:** R-SYNC-01, R-SCHED-01..03.
