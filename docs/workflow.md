# Development Workflow

> How work is done on this repo by two AI agents (Claude and Antigravity) and the owner, and how every rule
> and change stays tracked. **Last reviewed:** 2026-11-03

## 1. Who works where (R-OPS-03, since 2026-11-03)

| | Claude | Antigravity |
|---|---|---|
| Folder | `E:\ANTIGRAVITY PROJECTS\Safaeewala Booking Dashboard` (main folder) | same folder |
| Branch | `main` | `main` |
| Dev server | `localhost:5058` — the owner checks every change here first | same |
| Deploys | Only when the owner says so (`git push origin main` → GitHub Actions) | Only with the owner's OK |

- Before editing: `git status`. The other agent may have uncommitted work in the same folder. Don't overwrite it, and stage only your own files (never `git add -A`).
- Commit locally on `main` after `npm run check`. Pushing deploys, so push only on the owner's word.
- The old worktree `…-claude` (branch `claude/workspace`, port 5059, 2026-10-27 → 2026-11-03) is no longer used for work.
- Avoid big parallel edits to the shared files: `src/types/index.ts`, `src/store/DataContext.tsx`, `src/lib/utils.ts`, `src/lib/clientDataSync.ts`, `src/App.tsx`.

## 2. Going live

1. The owner checks the change on localhost:5058.
2. The owner says to deploy. Then run `git push origin main`.
3. GitHub Actions runs the check, deploys, waits for `/api/health` and tags `deploy-YYYYMMDD-HHMM-<sha>`. It rolls back by itself if the health check fails.
4. Migrations in `supabase/migrations/` are run by the owner in the Supabase SQL Editor, after the deploy.

## 3. Definition of done (every change)

- [ ] `npm run check` passes — lint errors, type check and tests (`tests/unit`, `tests/server`). The deploy
      workflow runs the same check and **stops the deploy** if it fails (TA-07, TA-08)
- [ ] New logic in `src/lib` or the server → add or update a test in `tests/` (`npm test -- <name>` runs one file)
- [ ] Lint warnings in files you touch → clean them while you are there
- [ ] Checked on localhost with **test data only** (see [prod.md §5](../prod.md))
- [ ] Commit message: `type(scope): summary` — types `feat`, `fix`, `refactor`, `docs`, `chore`; body explains *why*
- [ ] [CHANGELOG.md](../CHANGELOG.md) entry under *Unreleased*
- [ ] Behaviour rule added/changed → [rules.md](../rules.md) updated (new ID, or edit + date)
- [ ] UI pattern added/changed → [design.md](../design.md)
- [ ] Data field/storage added → [docs/data-model.md](data-model.md)
- [ ] A real trade-off was decided → [docs/decisions.md](decisions.md)

## 4. How rules are tracked

1. **One registry:** every business rule lives in `rules.md` with a permanent ID (`R-ATT-01`). Design rules use `D-xx` in `design.md`.
2. **Code points to rules:** where code enforces a rule, add a short comment with the ID (`// R-SYNC-02: bookings store IDs, job sheet stores names`). Search the codebase for an ID to find every place it is enforced.
3. **Changes are logged:** CHANGELOG lists what changed; commits mention rule IDs (`fix(bookings): … (R-SYNC-02)`).
4. **Decisions keep the why:** when a rule is introduced, changed or retired for a reason, add a dated entry to `docs/decisions.md`.
5. **Rules are never deleted:** set `Status: Retired` and say what replaced it, so old discussions still make sense.
6. **Known gaps are visible:** problems not yet fixed go to *Known issues* in `rules.md` (K-xx) until resolved.

## 5. Permissions recap

- Browser automation: ask first (R-OPS-01).
- VPS / `deploy.ps1` / `scp` / `ssh` / **`git push origin main`**: ask first (R-OPS-02).
- Production database schema changes: ask first.

## Deploy, versions and rollback (E2E-25)
- Every push to `main` deploys. Before it, the running version is saved on the VPS in `/var/www/safaeewala/releases/` (last 5).
- After it, `/api/health` and the home page must answer within 2 minutes, otherwise the previous version is put back and the run fails.
- A successful deploy is tagged `deploy-YYYYMMDD-HHMM-<sha>`.
- To go back by hand: GitHub → Actions → **Roll back the live site** → Run workflow (empty = newest kept version).

## Pre-commit check (E2E-06)
- `.githooks/pre-commit` lints the staged TypeScript files before every commit (about 30 s); a commit with lint errors is stopped. Type errors and tests are caught by `npm run check` and by CI (deploy blocked). Turned on with `git config core.hooksPath .githooks` (already set for this repo and its worktrees; a fresh clone runs it once).
- Full tests still run with `npm run check` and in CI.
