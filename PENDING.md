# Safaeewala CRM — Pending Tasks & Future Backlog

This file tracks planned improvements, UI/UX refinements, and technical backlog items that have been deferred for later implementation.

---

## 1. Corner Radii & Spacing Standardization across All Screens (UI/UX Hierarchy)

### Status:
- **Sample Completed & Verified:** `src/pages/Expenses.tsx` (Gold-standard specimen page).
- **Rollout to Remaining Screens:** Pending / On Hold (will be completed in a dedicated future pass).

### Design Token Hierarchy (Standardized 4-Tier Scale):

| Hierarchy Tier | Target Radius | Tailwind Class | Elements Covered |
|---|---|---|---|
| **Tier 1: Outer Surfaces** | `24px` | `rounded-[24px]` | `PageHero`, Main Table Containers, Toolbar Bars, Section Filter Bars, Sidebar Analysis Cards, CTA Promo Cards. |
| **Tier 2: Inner Cards & Modals** | `16px` | `rounded-2xl` | KPI Metric Cards, Date Range Panels, Sub-widgets, Dropdown Menus, Dialog Bodies. |
| **Tier 3: Controls & Inputs** | `12px` | `rounded-xl` | Primary & Secondary Action Buttons, Date Filter Preset Pills, Search Inputs, Select Dropdowns, Modal Form Inputs, KPI Icon Wrappers (`w-9 h-9 rounded-xl`). |
| **Tier 4: Status Badges & Pills** | Circular | `rounded-full` | Count Badges, Status Pills, Priority Tags, Progress Bar Tracks & Fills, Indicator Dots. |
| **Tier 5: Compact Table Actions** | `8px` | `rounded-lg` | Row-level Edit (`<Edit2 />`) and Delete (`<Trash2 />`) icon triggers, Calendar month stepper arrows. |

### Screens to Apply (Future Implementation Checklist):
- [ ] `src/pages/Bookings.tsx` (Cards grid, Board Kanban columns, Calendar tab, Filters toolbar)
- [ ] `src/pages/Clients.tsx` (Client cards grid, Table view, Search & Filter toolbar, KPI row)
- [ ] `src/pages/Employees.tsx` (Staff cards, Role tabs, KPI boxes, Filter toolbar)
- [ ] `src/pages/PendingPayments.tsx` (KPI boxes, Date filter bar, Outstanding & Recovered tables, Toolbar)
- [ ] `src/pages/MonthlyClients.tsx` (Contract cards, Schedule tables, Filter bar, KPI cards)
- [ ] `src/pages/DailyJobSheet.tsx` (Job sheet table card, Live Schedule banner, KPI cards, Reconciliation widgets)
- [ ] `src/pages/Overview.tsx` (Summary KPI cards, Live cleaner tracker, Recent activity panels)
- [ ] `src/pages/BusinessAnalytics.tsx` (Chart cards, Timeframe selector, Revenue & profit bars, Cleaner performance table)
- [ ] `src/pages/Invoices.tsx` & `src/pages/MonthlyInvoices.tsx` (Invoice tables, Status tabs, Filter toolbars)
- [ ] `src/pages/PaymentProcessing.tsx` (Payment methods, Summary cards, Transaction ledger)
- [ ] `src/pages/Inventory.tsx` (Chemicals & equipment grid, Usage tracker, Stock level indicators)
- [ ] `src/pages/Agencies.tsx` (Agency vendor cards, Payout summaries, Staff roster tables)
- [ ] `src/pages/FluentFormsLeads.tsx` (Leads table, Pipeline board, Status chips)
- [ ] `src/pages/CustomerFeedback.tsx` (Review cards, Rating widgets, Sentiment breakdown)
- [ ] `src/pages/WhatsAppCRM.tsx` (Chat threads, Contact card, Message composer)
- [ ] `src/pages/MarketingDashboard.tsx` (Campaign cards, Lead source breakdown, Conversion metrics)
- [ ] `src/pages/Settings.tsx` (Settings navigation tabs, Configuration form panels)

---

## 2. Security & Backend Architecture (From Audit Report)

- [ ] **Supabase Authentication Hardening:** Implement full email/password authentication via Supabase Auth to replace the current client-side state guard.
- [ ] **VPS Webhook Validation:** Add an API secret key check (`AGY_WEBHOOK_SECRET`) to `webhookServer.cjs` endpoints (`/api/daily-job-sheet-sync`, `/api/ghl-webhook`) to reject unauthenticated requests.
- [ ] **Database Row Level Security (RLS):** Review and tighten RLS policies across Supabase tables (`bookings`, `daily_jobs`, `clients`, `employees`, `invoices`, `daily_expenses`).
