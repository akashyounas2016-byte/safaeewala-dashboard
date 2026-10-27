# Technical Architecture

> How the code is organised and how data moves. For entity fields and storage keys see [docs/data-model.md](docs/data-model.md);
> for servers and deploys see [prod.md](prod.md).
> **Last reviewed:** 2026-10-27

## 1. Stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript ~5.9, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), lucide-react icons, Radix primitives |
| Charts / Excel | Recharts, SheetJS (`xlsx`) |
| Data | Supabase (PostgreSQL) + browser `localStorage` cache |
| Small backend | `webhookServer.cjs` (plain Node HTTP, port 3001) behind Nginx `/api/` |
| Runtime | Docker (nginx:alpine + node) on an Ubuntu VPS, Traefik TLS |

## 2. Folder map

```
├── AGENTS.md · README.md · rules.md · design.md · architecture.md · prod.md · CHANGELOG.md
├── docs/                    data-model.md · workflow.md · decisions.md · guides/ (SMS, Stripe, API, documents)
├── src/
│   ├── App.tsx              routes, lazy pages (lazyWithRetry), providers, AuthGuard
│   ├── main.tsx · index.css (design tokens)
│   ├── pages/               one file per screen (Employees, Agencies, DailyJobSheet, Bookings, …)
│   ├── components/
│   │   ├── layout/          Layout (shell + per-route ErrorBoundary), Sidebar, PageHero (hero + bell)
│   │   ├── ui/              Button, Input/Select, Modal, Card, Badge, Table, Avatar, ErrorBoundary
│   │   ├── agencies/        AgencyDashboard (agency profile: staff, payouts, documents)
│   │   ├── employees/       EmployeeDocumentField (document section + preview modal)
│   │   ├── dailyJobSheet/   AddJobModal, DailyJobModals, MonthlyScheduleSyncModal, jobSheetUtils (OT calc)
│   │   ├── monthlyClients/  AddMonthlyClientModalForm
│   │   └── common/          CleanerMultiSelect
│   ├── store/               DataContext (all business data), UserContext (RBAC), NotificationContext
│   ├── lib/                 business logic — see §4
│   ├── types/index.ts       all shared interfaces
│   └── data/mock.ts · lib/seedData.ts   demo data (fallback only)
├── webhookServer.cjs        /api/agencies, /api/webhook/fluent-forms, /api/webhook/google-drive-backup
├── Dockerfile · entrypoint.sh · nginx.conf · docker-compose.yml · deploy.ps1 · .github/workflows/deploy.yml
└── vite.config.ts           dev port 5058, /api proxy → production server
```

## 3. Runtime composition

```
SimpleAuthProvider → AuthGuard → DataProvider → UserProvider → NotificationProvider → BrowserRouter → Layout → <Page/>
```

- **AuthGuard** (`lib/simpleAuth.ts`): bypass on localhost, login on VPS (R-SEC-01).
- **DataProvider** (`store/DataContext.tsx`): loads and owns every business collection and exposes CRUD actions (`addBooking`, `updateEmployee`, `addAgency`, …). Pages never call Supabase for core data directly.
- **Layout** wraps each route in an `ErrorBoundary` keyed by path, so one broken screen does not trap the app.
- Pages are lazy-loaded; a failed chunk after a deploy triggers one automatic reload (`lazyWithRetry`).

## 4. Business logic modules (`src/lib`)

| Module | Responsibility | Rules |
|---|---|---|
| `clientDataSync.ts` | Job-sheet ledger logic: OT, bogus rows, address cleaning, staff matching, synthetic clients/employees, monthly summaries, salary helpers, crew ID↔name, assignable clients | R-OT-01, R-SYNC-*, R-DATA-*, R-EMP-02, R-FIN-02 |
| `employeeHealth.ts` | Performance Health Score | R-EMP-03, R-ATT-01 |
| `agencyAlerts.ts` | Agencies bell alerts | R-AGN-04 |
| `utils.ts` | dates (`daysUntil`, `formatDate`), parent/third-party staff, slugs | R-AGN-01 |
| `simpleAuth.ts` | login, session, rate limit | R-SEC-01 |
| `storageUtils.ts` | safe localStorage read/write | — |
| `supabase.ts` | Supabase client | — |
| `fluentFormsSync.ts`, `ghlService.ts`, `googleDrive.ts`, `emailService.ts`, `smtpEmailService.ts`, `stripeService.ts`, `paymentReminderService.ts`, `crmAIBot.ts` | Integrations | see `docs/guides/` |

**Rule of thumb:** a calculation used by more than one screen belongs in `src/lib`, not inside a page.

## 5. Data flow

1. **Boot:** each collection is read from Supabase with a 2 s timeout race; on timeout/empty it falls back to `localStorage`, then (only if both are empty) to seed data.
2. **Agencies:** additionally fetched from `/api/agencies` (VPS JSON file) and Supabase `agencies`; Safaeewala parent is always injected.
3. **Derived views (memoised in DataContext):**
   - `dailyJobs` exposed with legacy employee-ID staff names resolved to names (R-SYNC-02)
   - `clients` = Supabase clients + clients discovered from the job sheet
   - `employees` = Supabase employees + staff discovered from the job sheet
4. **Writes:** an action updates React state → mirrors to `localStorage` → fires the Supabase write (errors are logged, not shown). Agencies also POST the full list to `/api/agencies`.
5. **Screens read, never fork, the data:** e.g. Agency payouts, Employee history and Attendance all derive from `dailyJobs` with `employeeMatchesStaff`.

```
Booking ──addBooking──► DailyJob (booking_id, staff names) ──► Employees / Attendance / Agency payouts / Clients
Monthly client master schedule ──generates──► DailyJob rows   (edits to rows never flow back — R-SCHED-01)
```

## 6. Conventions

- TypeScript must pass `npx tsc -b` (part of `npm run build`).
- Keep files' existing style; shared UI goes in `components/`, shared logic in `lib/`.
- New persisted browser settings use the `safaeewala_` localStorage prefix and are listed in `docs/data-model.md`.
- Reference rule IDs in comments where code enforces a rule.
