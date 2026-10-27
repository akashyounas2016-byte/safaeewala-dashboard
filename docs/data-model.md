# Data Model & Storage

> What data exists, where it is stored, and how records link to each other.
> Types live in `src/types/index.ts`; when you add a field, update this page and (if Supabase stores it) the table column.
> **Last reviewed:** 2026-10-27

## 1. Core entities

| Entity | Key fields | Stored in | Notes |
|---|---|---|---|
| **DailyJob** | `date`, `staff_name` (names, comma-separated), `start_time`, `end_time`, `duty_hours`, `ot_hours`, `is_overtime`, `address`, `charges`, `received`, `payment_mode` (`Cash`/`Online`/`Pending`/`Monthly`/`Above`), `remarks`, `booking_id?` | Supabase `daily_jobs` + `safaeewala_daily_jobs` | **The operational ledger.** Most metrics derive from it. |
| **Booking** | `client_name`, `scheduled_date/time`, `duration_hours`, `assigned_crew` (**employee IDs**), `status` (`pending → confirmed → in_progress → completed / cancelled`), `total_amount`, `source` | `bookings` + `safaeewala_bookings` | Creates/updates its linked DailyJob (R-SYNC-02/03). |
| **Client** | `full_name`, `phone`, `area`, `building_name`, `total_spent`, `total_bookings`; monthly master schedule: `service_days`, `scheduled_time`, `end_time`, `duration_hours`, `preferred_cleaner`, `day_cleaner_assignments` | `clients` + `safaeewala_clients` | Master schedule is protected (R-SCHED-02). Synthetic clients from the job sheet have id `dj-<address>`. |
| **Employee** | `full_name`, `role`, `status` (`active`/`on_leave`/`inactive`/`engaged_in_project`), `monthly_salary`, `pay_rate_hourly`, `agency_id`/`agency_name`, document numbers + start/end dates + files (EID, passport, visa, work permit, driving licence, medical insurance, NOC), `documents[]`, `photo_url`, `assigned_client_ids` | `employees` + `safaeewala_employees` | Synthetic staff from the job sheet have id `emp-dj-<name>`. |
| **Agency** | `name`, `company_type` (`Parent Company`/`Third Party`), `status`, licence/EID/passport/contract dates, `contact_persons[]`, `bank_details`, `quota_cleaners`, `contracted_amount`, `payouts[]`, `documents[]` | Supabase `agencies` **and** VPS `/data/agencies.json` (`/api/agencies`) + `safaeewala_agencies` | `agency-safaeewala` is the parent (R-AGN-01). |
| **AgencyCommissionPayout** | `amount`, `payment_date`, `payment_type` (`salary`/`advance`), `status` (`paid`/`pending`/`processing`), `cleaner_id?` | inside `Agency.payouts` | R-PAY-02 |
| **Invoice** | `items[]`, `subtotal`, `vat_rate`, `vat_amount`, `total`, `status` (`draft`/`sent`/`paid`/`overdue`) | `invoices` + `safaeewala_invoices` | R-FIN-01 |
| **DailyExpense** | date, category, amount | `daily_expenses` + `safaeewala_daily_expenses` | |
| **InventoryItem** | stock, minimum | `inventory` + `safaeewala_inventory` | |
| **FluentFormLead** | website form lead, `status` (`new`/`contacted`/`quoted`/`converted`/`lost`) | `fluent_form_leads` + VPS `/data/leads.json` | Webhook `/api/webhook/fluent-forms` |
| Settings / users | company TRN & name, profiles, audit | `company_settings`, `profiles`, `audit_log` | |
| **app_state** | `key` (localStorage key), `value` (jsonb), `updated_at` | Supabase `app_state` | Cloud copy of the browser-only business keys (R-SYNC-05) |

## 2. How records link

```
Client ──(client_id / name)──► Booking ──(booking_id)──► DailyJob ◄──(staff_name ↔ full_name)── Employee ──(agency_id | agency_name)──► Agency
                                                            ▲                                                                         │
Client master schedule ──(generates rows)───────────────────┘                                                      payouts[] ◄────────┘
```

- **Employee ↔ DailyJob** is matched by **name** (`employeeMatchesStaff`, R-SYNC-04) — keep names consistent.
- **Booking ↔ Employee** is matched by **ID** (`assigned_crew`); convert with `crewToStaffName` / `staffNameToCrew`.
- **Employee ↔ Agency** by `agency_id` or exact `agency_name` (R-AGN-02).

## 3. Browser storage (`localStorage`, prefix `safaeewala_`)

| Group | Keys |
|---|---|
| Data cache | `daily_jobs`, `bookings`, `clients`, `employees`, `agencies`, `invoices`, `inventory`, `daily_expenses`, `recurring_contracts` |
| Job sheet side data | `daily_pending_items`, `daily_pending_rcvd_items`, `daily_advance_items`, `monthly_client_payments`, `client_adjustments`, `auto_sync_monthly_schedules`, `temp_excel_cache` |
| Attendance | `cleaner_attendance_overrides` (key `YYYY-MM-DD_id:<employeeId>` for registered staff, `YYYY-MM-DD_<name lowercase>` otherwise → `{status, reason}`) |
| Deletions | `deleted_staff`, `deleted_clients` (name keys that must not be re-created from job-sheet history) |
| UI preferences | `sidebar_nav_order`, `sidebar_favorites`, `sidebar_collapsed`, `daily_job_cols`, `daily_job_col_order`, `excel_*`, `fluent_form_cols`, `fluent_form_col_order`, `employees_hidden_rows`, `hide_admin_card` (plus `agencies_view_mode`, which has no prefix) |
| Integrations | `fluent_form_leads`, `fluent_form_leads_backup`, `fluent_forms_read*`, `ghl_config*`, `gdrive_webhook_url`, `review_requests`, `cached_reports` |
| Auth | `auth_session`, `login_attempts`, `admin_custom_credentials` |
| Sync internals | `sync_outbox` (Supabase writes waiting for retry), `cloud_state_meta` (last sync time / unsynced flag per key) |

Browser storage is per browser **and per port** (5058 and 5059 do not share it). These keys are mirrored to Supabase `app_state` (once the Phase 2 migration is run): `monthly_client_payments`, `daily_pending_items`, `daily_pending_rcvd_items`, `daily_advance_items`, `client_adjustments`, `cleaner_attendance_overrides`, `recurring_contracts`, `deleted_staff`, `deleted_clients`. UI preferences (e.g. hidden rows) stay per browser.

## 4. Changing the model — checklist

1. Add/modify the field in `src/types/index.ts`.
2. Read and write it through `DataContext` actions only.
3. If it must survive across devices, add the Supabase column (production DB change → owner's permission) — otherwise note it as browser-only.
4. Update this page, and [rules.md](../rules.md) if behaviour depends on it.
