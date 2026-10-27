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
