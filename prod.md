# Production & Deployment

> How the live system runs, how changes reach it, and how to avoid hurting live data.
> **Golden rule (R-OPS-02):** nothing goes to production without the owner's explicit OK — that includes `git push origin main`.
> **Last reviewed:** 2026-10-27

## 1. Environments

| | Local development | Production (VPS) |
|---|---|---|
| URL | `http://localhost:5058` (main folder) · `http://localhost:5059` (Claude worktree) | `https://crm.srv1646539.hstgr.cloud` · `http://187.77.116.14:8080` |
| Who runs it | `npx vite` / `npm run dev` | Docker container `safaeewala-booking-crm` on the VPS |
| Login | Bypassed (auto admin) — R-SEC-01 | Required; 5 failed attempts → 60 s lock; 7-day session |
| Data | ⚠️ **the same live data as production** (see §5) | Supabase + `/data/*.json` on the VPS |

## 2. Production architecture

```
Browser ──HTTPS──► Traefik (VPS, Let's Encrypt) ──► container safaeewala-booking-crm (host port 8080 → 80)
                                                      ├── Nginx :80   serves dist/ (SPA, index.html no-cache)
                                                      │     └── /api/* → proxy → 127.0.0.1:3001
                                                      └── Node webhookServer.cjs :3001
                                                            ├── /api/agencies                  (GET / POST)  → /data/agencies.json
                                                            ├── /api/webhook/fluent-forms      (GET/POST/PATCH/DELETE) → /data/leads.json
                                                            └── /api/webhook/google-drive-backup (POST)      → /data/backups/
Browser ──HTTPS──► Supabase (PostgreSQL): bookings, clients, employees, daily_jobs, daily_expenses,
                   invoices, inventory, agencies, fluent_form_leads, company_settings, profiles, audit_log
```

- Container files: `Dockerfile` (nginx:alpine + node), `entrypoint.sh` (starts Node in background, Nginx in foreground), `nginx.conf`, `docker-compose.yml`.
- Persistent volume: VPS `/var/www/safaeewala/data` ↔ container `/data` (`DATA_DIR`). **Never delete this folder** — it holds agencies, leads and backups.

## 3. Configuration & secrets

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env` (local), build step (CI) | Supabase connection (anon key is public by design; RLS must protect data) |
| `VITE_ADMIN_USERNAME`, `VITE_ADMIN_PASSWORD` | `.env` | Production login |
| `DATA_DIR`, `NODE_ENV` | `docker-compose.yml` | Webhook server storage path |
| `VPS_HOST`, `VPS_USER`, SSH key | GitHub repo secrets | CI deploy |

- `.env` is git-ignored; copy `.env.example` and fill values. Never paste values into docs, commits or chat (R-SEC-02).

## 4. Deploy paths

There are **two** ways code reaches production. Both need the owner's permission.

### A. `deploy.ps1` (manual, full deploy) — used by Antigravity from the main folder
1. `npm run build` (runs `tsc -b` then `vite build` → `dist/`). Stops if the build fails.
2. `scp` `dist/`, `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `webhookServer.cjs`, `entrypoint.sh` → `root@187.77.116.14:/var/www/safaeewala/`.
3. `ssh`: stop host nginx, `docker compose up -d --build`, show container status.
- It deploys **whatever is in the main folder's working tree**, committed or not.

### B. GitHub Actions (`.github/workflows/deploy.yml`) — automatic
- Trigger: **any push to `main`** on `github.com/akashyounas2016-byte/safaeewala-dashboard`.
- Builds with Node 22 and copies `dist/` to the VPS (does not rebuild the container).
- ⇒ Pushing `main` *is* deploying. Do not push without permission.

### Pre-deploy checklist
- [ ] `git status` clean in the main folder (or you know exactly what uncommitted work ships)
- [ ] `npx tsc -b` and `npm run build` pass
- [ ] Changed screens checked on localhost
- [ ] [CHANGELOG.md](CHANGELOG.md) updated; rules changed → [rules.md](rules.md) updated
- [ ] Owner has said "deploy"

### After deploy
- Open the live URL, hard refresh, check the changed screens and the login.
- `ssh … "docker ps --filter name=safaeewala-booking-crm"` → status `healthy`.

### Rollback
1. In the main folder: `git log` → pick the last good commit.
2. Build that commit (e.g. `git switch --detach <commit>` in a separate worktree) and run `deploy.ps1` from there — with permission.
3. Data in Supabase and `/data` is **not** rolled back by a code rollback.

## 5. Live-data safety (read before testing)

- `vite.config.ts` proxies `/api` to the **production** server, and `.env` points to the **production** Supabase. Every save on localhost (5058 or 5059) writes **live data** (Known issue K-01).
- Agency saves send the whole agency list (K-03): never keep two tabs (5058 and 5059) open on Agencies while saving — the older tab can wipe newer agencies.
- Test with records named `TEST …` and delete them afterwards. Do not edit or delete real clients, staff or agencies while testing.
- Long-term fix (planned): a separate test Supabase project + local `webhookServer.cjs` for development.

## 6. Monitoring & support

- Container health: Docker healthcheck (`wget http://127.0.0.1:80/` every 30 s).
- Frontend errors: `src/lib/errorLogger.ts`; route errors are caught by `ErrorBoundary` (resets on navigation).
- Chunk-load failures after a deploy auto-reload once (`lazyWithRetry` in `App.tsx`).
- Audit trail: Supabase `audit_log` (created / updated / deleted / status changes).
