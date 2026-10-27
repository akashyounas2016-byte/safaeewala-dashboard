# Design System

> How every screen should look and feel. New UI must reuse these patterns instead of inventing new ones.
> Design rules have IDs (`D-…`) so they can be referenced in reviews and commits.
> **Last reviewed:** 2026-10-27

## 1. Principles

- **D-01 Executive & calm:** slate/white surfaces, one teal brand colour, colour used for meaning — not decoration.
- **D-02 Numbers first:** duty hours, OT, money and expiry dates must be readable at a glance (bold numerals, clear units: `hrs`, `AED`).
- **D-03 Same thing looks the same everywhere:** a document card, a status chip or a popup header looks identical on every screen.
- **D-04 Dense but grouped:** related fields sit together in a titled card; never a long single column of inputs.

## 2. Tokens

Defined in `src/index.css` (`@theme`) and used through Tailwind classes.

| Token | Value | Use |
|---|---|---|
| Font | `Inter Tight` | All text; tabular numerals for hours/currency |
| `--color-ink` / `ink-soft` / `ink-mute` | `#111827` / `#374151` / `#6B7280` | Headings / body / secondary text |
| `--color-line` | `#E4E8EC` | Card and input borders |
| Brand | `teal-600 #0d9488`, `teal-700`, `teal-800`; tints `teal-50/100` | Primary buttons, active states, links |
| Canvas | `slate-50 #f8fafc` | Page background |
| Hero | `.gradient-card` (dark slate → teal gradient + emerald glow) | `PageHero` banner |

**Radius:** `rounded-[24px]` page cards & KPI tiles · `rounded-2xl` form sections and sub-cards · `rounded-xl` inputs, selects, buttons · `rounded-full` chips and avatars.
**Shadows:** cards `shadow-[0_4px_20px_rgba(15,23,42,0.05)]`; hover lifts to `0_10px_35px_rgba(15,23,42,0.08)`.

## 3. Colour meaning

| Meaning | Colour | Examples |
|---|---|---|
| Brand / positive action | Teal | Save buttons, active filter, "ASSIGNED" |
| Overtime & warnings | Amber / orange | OT block, High OT badge, expiring ≤ 30 days |
| Danger / expired / absent | Red / rose | Expired documents, delete, specifically-absent |
| Regular duty / info | Sky / slate | Duty hours, "Available / Standby" (never red — R-ATT-01) |
| Success / valid | Emerald | Valid documents, paid |

**Document tints (D-05)** — each document type always uses the same tint, in both the Agency and Employee popups:

| Document | Tint |
|---|---|
| Trade License | amber |
| Emirates ID (EID) | sky |
| Passport | purple |
| Residency Visa | amber |
| Work Permit | emerald |
| Tax & NOC / NOC Clearance | emerald (agency) · indigo (employee) |
| Medical Insurance | rose |

## 4. Page layout

1. **`PageHero`** (`src/components/layout/PageHero.tsx`): title, subtitle, status chip, custom actions, primary CTA, notification bell.
   - Header buttons use short labels (D-06): `Import`, `Export`, `Add Employee` — not long phrases.
   - **Bell (D-07):** pass `notifications` to make it functional (count badge + dropdown, click → open the record). Without the prop it is decorative. Live on Employees (R-EMP-04) and Agencies (R-AGN-04).
2. **KPI tiles:** 4–6 clickable `rounded-[24px]` cards that also act as quick filters.
3. **Filter bar:** search, role/agency/date filters, sort, view switch (grid/table), reset; right end shows `filtered / total` with the row-visibility eye icon on the same line (D-08).
4. **Content:** list (grid bento or dense table, min width ~740 px with horizontal scroll) + right-hand widgets on wide screens.

## 5. Popup (modal) system — D-09

The **Add New Agency** popup is the reference design; **Add New Employee** follows it exactly.

```
┌ Title ───────────────────────── Status: [toggle/select] │ Cancel │ ✓ Save … │ ✕ ┐
│ ┌ PROFILE ─────────┐ ┌ CONTACT / ROLE ─────┐ ┌ ADDRESS / EMPLOYMENT ─┐            │  Row 1: 3 section cards
│ └──────────────────┘ └─────────────────────┘ └───────────────────────┘            │
│ ┌ DOCUMENTS ───────────────────────────────────────────────────────────┐          │  Row 2: 4 tinted sub-cards
│ │ [tinted card] [tinted card] [tinted card] [tinted card]              │          │
│ └──────────────────────────────────────────────────────────────────────┘          │
│ ┌ INSURANCE & CLEARANCE (one row) ─────────────────────────────────────┐          │  Row 3
│ └──────────────────────────────────────────────────────────────────────┘          │
│ ┌ ROLE-SPECIFIC (Skills & Clients / Driving License) ──────────────────┐          │  Row 4
└────────────────────────────────────────────────────────────────────────────────────┘
```

- `Modal size="xl" className="max-w-6xl"`; **Status, Cancel and Save live in `headerActions`**, Save uses `form="<form-id>"`.
- Section card: `bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80`; heading `text-[12px] font-black uppercase tracking-wider` + 13 px icon + bottom border.
- Tinted sub-card: `bg-<tint>-50/70 border-<tint>-200/90 rounded-2xl p-3.5` with an uppercase 11 px title.
- Labels `text-[11.5px] font-bold text-slate-700`; inputs/selects `text-[12px] rounded-xl border-slate-200 shadow-2xs`, focus `border-teal-600`.
- **Document field (D-10):** number input with the upload icon **inside** the input on the right; attached file shows as a teal pill with preview 👁 and remove ✕ (`InputFieldWithUpload` in Agencies, `EmployeeDocInput` in Employees). Dates as a 2-column *Start/Issue · End/Expiry* pair under it.
- Fields that depend on a choice (e.g. driver-only) swap in place; show a small chip saying which form mode is active.

## 6. Domain widgets

- **Duty & OT block:** duty (teal/sky, calm) beside OT (amber, `Flame`/`Zap`, `HIGH` badge at ≥ 10 h) with a split ratio bar under them. Zero OT = neutral grey "No OT recorded".
- **Document health:** < 30 days red, < 90 days amber, otherwise emerald.
- **Health Score (employee profile):** ring 0–100 coloured by grade (emerald Excellent, teal Good, amber Needs Attention, rose At Risk) + three mini bars (Attendance, Activity, Compliance).
- **Avatar:** photo if `photo_url`, else coloured initials; profile avatar has a teal camera button bottom-right for upload.

## 7. Interaction

- Transitions `transition-all duration-200`; dropdown panels close on outside click.
- Destructive actions ask for confirmation; empty states explain what to do next.
- Responsive: < 640 px one column; 640–1024 px two columns; ≥ 1280 px full layout with side widgets.
