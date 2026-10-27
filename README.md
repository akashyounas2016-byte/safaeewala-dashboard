# Safaeewala Operations Dashboard

Operations CRM for **Safaeewala Cleaning & Technical Services LLC** (Dubai): daily job sheet, bookings, monthly clients,
staff & duty/OT hours, attendance, agencies & salary payouts, invoices (UAE VAT), expenses and website leads.

- **Live:** https://crm.srv1646539.hstgr.cloud (login required)
- **Stack:** React 19 · TypeScript · Vite 8 · Tailwind v4 · Supabase · Node webhook server · Docker on VPS

## Quick start (local)

```bash
cp .env.example .env        # fill in values (ask the owner — never commit them)
npm install                 # not inside the -claude worktree (shared node_modules)
npm run dev                 # http://localhost:5058 — login is bypassed locally
npx tsc -b                  # type-check
npm run build               # type-check + production build into dist/
```

> ⚠️ Local development uses the **live** database and API. Test with records named `TEST …` and clean up — see [prod.md §5](prod.md#5-live-data-safety-read-before-testing).

## Documentation map

| File | Read it when you… | Contains |
|---|---|---|
| [AGENTS.md](AGENTS.md) | are an AI agent starting work | Must-follow rules and permissions, short form |
| [rules.md](rules.md) | change any behaviour or calculation | **Business rules registry** with IDs (`R-ATT-01` …) + known issues |
| [design.md](design.md) | build or change UI | Design tokens, colour meaning, popup system (`D-xx`) |
| [architecture.md](architecture.md) | need to know where code lives / how data flows | Stack, folders, providers, lib modules, data flow |
| [prod.md](prod.md) | deploy, configure, or test against live data | Environments, deploy paths, checklist, rollback, live-data safety |
| [CHANGELOG.md](CHANGELOG.md) | want to know what changed | Dated list of changes with rule IDs and commits |
| [docs/data-model.md](docs/data-model.md) | add/change a field or storage key | Entities, links between them, Supabase tables, localStorage keys |
| [docs/workflow.md](docs/workflow.md) | commit, merge, or work alongside the other agent | Worktree setup, merge steps, definition of done, how rules are tracked |
| [docs/decisions.md](docs/decisions.md) | wonder *why* something is the way it is | Dated decision records (`DEC-xxx`) |
| [docs/audits/](docs/audits/) | want the list of known problems with locations | Dated audit reports (`AUD-xx` findings) |
| [docs/guides/](docs/guides/) | set up an integration | SMS, Stripe, API, document management guides |

## How rules are tracked (summary)

1. Every rule has a permanent ID in [rules.md](rules.md); design rules in [design.md](design.md).
2. Code that enforces a rule mentions its ID in a comment; commits mention it too.
3. Every change gets a [CHANGELOG.md](CHANGELOG.md) line; the reason behind a rule goes in [docs/decisions.md](docs/decisions.md).
4. Rules are retired, never deleted. Unfixed gaps are listed as *Known issues* (K-xx).

Full process: [docs/workflow.md §4](docs/workflow.md#4-how-rules-are-tracked).

## Main screens

| Route | Screen |
|---|---|
| `/daily-job-sheet`, `/daily-job-sheet/spreadsheet` | Daily Job Sheet (operational ledger) |
| `/bookings` | Bookings & dispatch |
| `/clients`, `/clients/:id`, `/monthly-clients` | Clients & monthly contracts |
| `/employees`, `/employees/:id` | Staff, duty/OT, documents, health score |
| `/attendance` | Attendance (present / available / absent) |
| `/agencies`, `/agencies/:id` | Agencies, staff, salary & advance payouts |
| `/invoices`, `/monthly-invoices`, `/pending`, `/payments`, `/expenses` | Finance |
| `/fluent-forms`, `/reports`, `/analytics`, `/inventory`, `/settings` | Leads, reports, analytics, inventory, settings |
