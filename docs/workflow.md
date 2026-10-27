# Development Workflow

> How work is done on this repo by two AI agents (Claude and Antigravity) and the owner, and how every rule
> and change stays tracked. **Last reviewed:** 2026-10-27

## 1. Who works where (R-OPS-03)

| | Antigravity | Claude |
|---|---|---|
| Folder | `E:\ANTIGRAVITY PROJECTS\Safaeewala Booking Dashboard` | `E:\ANTIGRAVITY PROJECTS\Safaeewala Booking Dashboard-claude` (git worktree) |
| Branch | `main` | `claude/workspace` |
| Dev server | `localhost:5058` | `localhost:5059` (`npx vite --port 5059 --strictPort`) |
| Deploys | Yes, with the owner's OK (`deploy.ps1`) | Never |

- The worktree's `node_modules` is a junction to the main folder's — **do not run `npm install` in the worktree**.
- Both agents should avoid big edits to the same shared files at the same time: `src/types/index.ts`, `src/store/DataContext.tsx`, `src/lib/utils.ts`, `src/lib/clientDataSync.ts`, `src/App.tsx`.

## 2. Merging Claude's work into `main`

Only when the owner says so.

1. In the main folder: `git status`. If Antigravity has uncommitted work, it is committed first (by Antigravity, or by Claude with the owner's OK — `git add` + `git commit` only).
2. Dry-run conflicts without touching files:
   `W=$(git stash create); git merge-tree --write-tree --name-only $W claude/workspace`
3. In the worktree: `git rebase main` (or merge), resolve conflicts keeping **both** sides' intent, run `npx tsc -b`, check on 5059.
4. In the main folder: `git merge --ff-only claude/workspace`. Git refuses if it would overwrite uncommitted files — that is the safety net.
5. Production gets it on Antigravity's next approved deploy.

## 3. Definition of done (every change)

- [ ] `npx tsc -b` passes (and `npx eslint <changed files>` has no new errors)
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
