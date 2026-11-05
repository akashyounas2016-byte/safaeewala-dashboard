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

## 5b. Feedback, paging and period — D-11 … D-14

- **D-11 No browser dialogs:** use `notify.success/error/info` (toasts) and `await confirmAsync({ title, message, tone })` — never `alert()` / `confirm()`.
- **D-12 Paging:** lists that can grow past ~30 rows use `usePagination` + `<Pager />`.
- **D-13 Periods:** finance screens use the presets from `lib/datePresets.ts` and open on "This Month".
- **D-14 Explain numbers:** every KPI tile has a `title` tooltip saying where the number comes from; trend chips appear only when computed from data.
- **Module tabs:** related screens share one tab bar (e.g. `ReceivablesNav` on Pending and Payments).

## 6. Domain widgets

- **Duty & OT block:** duty (teal/sky, calm) beside OT (amber, `Flame`/`Zap`, `HIGH` badge at ≥ 10 h) with a split ratio bar under them. Zero OT = neutral grey "No OT recorded".
- **Document health:** < 30 days red, < 90 days amber, otherwise emerald.
- **Health Score (employee profile):** ring 0–100 coloured by grade (emerald Excellent, teal Good, amber Needs Attention, rose At Risk) + three mini bars (Attendance, Activity, Compliance).
- **Avatar:** photo if `photo_url`, else coloured initials; profile avatar has a teal camera button bottom-right for upload.

## 7. Interaction

- Transitions `transition-all duration-200`; dropdown panels close on outside click.
- Excel Job Sheet rows are **white** by default (UX-70, replaces the solo teal of UX-61). A row is coloured only when it belongs to a team project (UX-66) or a row or cleaner colour was chosen. New rows and blocks (*Add Row*, *Add Shift*, *Add First Row*) start white, also in the Cleaner Blocks view. "Solo at bottom" still moves cleaners who only have solo jobs below the team jobs.
- Booking cards (UX-63) follow the Daily Job Sheet: cleaner colour on the left edge (same palettes, same colour per cleaner), cleaner avatars first, then client, a shift strip (date · start → end · hours) and a money strip (Charges · Received · Pending). Completed cards are in the Completed category only.
- Time picker (UX-68, `Time12hPicker`, used by the Booking and Add Job popups and others):
  - The box shows only the time (09:00); the AM / PM toggle sits beside it.
  - The dropdown has *Morning (AM)* / *Evening (PM)* tabs, like the Excel Job Sheet. The list shows plain numbers in 30-minute steps: Morning from 09:00 to 11:30, Evening from 12:00 to 11:00.
  - Any other time can be typed ("9:15", "7:45 pm").
  - In the Add Job popup (Daily and Excel), the list opens upwards like the material drop-up and steps every 15 minutes (09:00, 09:15, 09:30 …).
- Row colours (UX-69, revised 2026-11-04): **40 fully light colours** (Lab lightness 80 or more), picked to be as far apart as possible by **CIEDE2000**, the colour-difference measure that follows human vision. A test checks that no two are closer than 7 (above 5 reads as clearly different), all are light, and every name is unique.
- White rows (UX-79): a cleaner's block colour (an older setting) no longer paints that cleaner's rows; it only marks the edge of the name cell. Rows are white unless they belong to a team project (UX-71) or were given a row colour. Applies to the flat and Cleaner Blocks views.
- Team colour everywhere (UX-71): the Daily Job Sheet uses the same rule as the Excel Job Sheet: every row of one team project (location + date) has one light colour; a row colour chosen by hand still wins. The swatch and the Excel row use the colour itself. Older colour ids are kept on their nearest new colour.
- Team colour (UX-71): all rows of one team project (location + date) have **one** colour, whichever cleaner they belong to. A row colour chosen for any row of the project colours the whole project. A cleaner's own block colour never splits a team. Every other row stays white (UX-70).
- Advance column (UX-72): the Excel Job Sheet has an **Advance** column after Pending. It shows money received beyond the charges. Pending shows only what is still due (no more *+445 Adv*). The footer Advance total uses the same formula.
- Column alignment (UX-73): click any cell, then use the left / centre / right buttons next to Undo / Redo to align that whole column. The choice is saved and synced between devices.
- Add Job Entry popup (UX-74): taller (up to 96% of the screen), so the start / end time lists open in full.
- Time lists (UX-77): the start / end time list floats above the popup (fixed position), so the popup's scrolling body never cuts it. It opens upwards or downwards, wherever there is more room, and shrinks to fit the screen.
- Add Job Entry popup (UX-75): the cleaning-materials card has no heading; the field label says what it is.
- Add New Client popup (UX-76): wider (`max-w-5xl`). The *Preferred Cleaner(s)* list opens from the right edge and never pushes the popup wider.
- Excel column letters (UX-80): a click on A, B, C … selects the whole column (green letter, tinted cells). The align buttons then act on it; a click on another column's cell ends the selection. The column names have no grip icon; the header still drags to reorder.
- Bi-Weekly contract (UX-81): duration chips (1–12 months) and a month calendar. Use *Start* to click the first day and *End* to click the last day. The contract range is shaded, and each visit day has a green dot.
- Drivers (UX-82): new *Dispatch by area* tab (R-DRV-04). *Live location* shows one OpenStreetMap map with every driver's pin, live. The header date picker has dark text (it was white on white, DRV-A01).
- My Duties (UX-83): full page width like the other screens. The header shows Jobs, Hours, Done and Cash to collect. Each job card has a big next-step button, Call / WhatsApp and Report an issue (R-DUTY-01).
- Round 2026-11-05 (UX-84):
  - Excel Job Sheet: every cleaner block has at least 3 rows. A cleaner added by Add Job gets a full block (job row + empty rows), like the others.
  - Popups: a missing required field shows a red message at the top (chips name the fields) and a red outline on the field (R-FORM-01). The browser's small bubble is not used.
  - Time picker: switching Morning / Evening (or opening the list) starts the list at its first time.
- Round 2026-11-05 b (UX-85):
  - Excel Job Sheet: a column header follows its column's alignment (left / center / right).
  - Invoices: issued invoices show *Void* instead of *Delete*; a void invoice has a grey, struck-through status.
  - Bi-Weekly card: *Every week / Every other week* switch; a note says the visits appear on the Daily Job Sheet by themselves.
  - Settings → Roles & Access: six columns (Admin, Manager, Employee, Supervisor, Driver, Cleaner) over the full width.
- Round 2026-11-05 c:
  - Excel Job Sheet (UX-86): a **flag** next to the cleaner's name replaces the sync text in Remarks. Hovering shows each issue with time, site and the reason. Red = time clash now. Amber = the visit needs a cleaner (the scheduled cleaner was busy when the monthly schedule added it). Grey = **no clash now, only history**: a cleaner was assigned since; *Clear flag* removes it (Save to keep).
  - Copy buttons (UX-87) work on the http VPS address too (fallback copy when the browser has no clipboard API). The new-user card says what was copied, or how to copy by hand.
  - Settings (UX-88): the side widgets (owner card, System Health, Data Backup) show on the Company tab only; every other tab uses the full width.
- Round 2026-11-05 d:
  - Daily Job Sheet (UX-86): the same issue flag next to the cleaner's name; Remarks no longer show the sync note.
  - Sidebar settings (UX-89): each item has 👁 **Shown / Hidden** next to Favorite and Up / Down. Hidden items leave the menu and stay in the settings. The bottom *Customize Items Sequence* button is gone; the sliders button at the top opens the settings. Up / Down move the item itself (they moved the wrong item when the role hid some screens).
  - Clients (UX-90): cards use the full width, three per row; Top Clients, Pending Balances, Client Distribution, Top Locations and Recent Bookings sit below the cards, as in the table view.
  - Daily Job Sheet (UX-96): the Jobs widget header is white like the Clients widgets (icon tile, title, job count and date; light filter and column controls). Job rows are white unless a colour was chosen: the row's own colour (Excel / Add Job), the team project colour, or a category colour changed in *Customize Row Colors*; the built-in tints (Monthly green, Pending red …) no longer apply. The Monthly left edge stays.
  - Clients KPI cards (UX-97): the Daily Job Sheet card style (white, coloured label, solid icon tile). First row: Total Clients · Active · Monthly · **New This Month** · VIP · **Total Bookings**; *More Client Metrics*: Total Revenue · Avg Lifetime · **Due Balance** · At-Risk · **Repeat Rate** · Advance. Every card filters the cards and the widgets below; Total Clients shows all.
    - Recent Bookings audit: newest first even without a created date, the client's current name, a readable date, *not on sheet* when the booking has no Daily Job Sheet row, and a click opens that booking (`/bookings?booking=<id>`).
  - Client Profile (UX-98): Record Payment (light green) and Edit Profile (outlined) sit inside the dark header. The tabs (Daily Job Sheet, Financial History, Booking Records, Client Info) use the full width; Job Sheet Summary, Upcoming Bookings and Financial Summary sit below in three columns. Review Requests widget removed.
    - Audit: Upcoming lists only open bookings from today on (past "confirmed" ones were listed), soonest first, plus the client's visits already on the Daily Job Sheet (monthly / Bi-Weekly) that no booking covers. Job Sheet Summary shows shifts worked vs. scheduled ahead, the last worked date, and each cleaner once (team rows were shown as one name).
  - Alerts screen (R-ALERT-01): tabs All / High priority / by source, alert rows coloured by priority with the fix link and Dismiss.
  - Clients (UX-95, owner prompt 2026-11-05):
    - Each card shows three tiles: **In-house** and **Outsourced** cleaners (preferred cleaners and everyone in the client's job history; outsourced = an agency that is not Safaeewala, `isParentCompanyEmployee`; hover lists the names) and **Visits**.
    - Under the cards, the expand arrow of *More Client Metrics* (bouncing chevron): *Show N more clients* / *Show less*.
    - A selected KPI card (Monthly, Due, VIP, Repeat, Active, At-risk) scopes the widgets below — Top Clients, Pending Balances, Client Distribution, Top Locations, Recent Bookings — to those clients, with a green note and *Show all clients*.
    - Monthly / Bi-Weekly cards with the contract Off show a red *Contract off* tag (R-SCHED-08).
  - Daily Job Sheet in the V1 colours (UX-94, owner prompt 2026-11-05: *"color scheme ko V1 ke mutabiq update krein … neche wale widgets ka style pehle jaisa"*):
    - Header and the Jobs bar: solid forest `#0F1F19` instead of the gradient. KPI cards: white with a thin border; the coloured icon carries the meaning. Column header: `#FAFBF9`, grey labels.
    - **Crew timeline** under the KPI cards (single day only): one lane per cleaner, jobs as blocks (Monthly green, other jobs blue, the part after 8 PM orange, clash = red border, no cleaner = dashed amber). Available and absent / on-leave lanes follow R-ATT-01. A click on a block opens Edit Job. Hide / Show is remembered per browser.
    - **Needs attention** above the timeline: each clash and each job without a cleaner, with Resolve / Assign (opens Edit Job) and the free cleaners named. Four shown, the rest behind *Show all*.
    - New columns **Driver** (Drivers day plan, R-DRV-01) and **Status** (My Duties check-ins, R-DUTY-01: Scheduled / On the way / Started / Done / Issue) before Remarks; a saved column order gets them in the same place. Rows without jobs stay white (coloured left edge only). Job rows keep the category colours from Row colours.
    - Bottom widgets (Expenses, Drivers, Reconciliation) unchanged.
  - Settings → Backup (UX-93): a **Nightly database backup** card above Before-delete copies: green when last night's backup is OK, red when it failed or is older than 26 hours, grey before the first run; daily / monthly copy counts, space used and the next run (02:00 Dubai). Data from `/api/backup-status`.
  - Clients (UX-92): the card grid shows 4 rows (12 cards on a wide screen); a **View All (n)** button below opens the rest and turns into **Show Less**.
  - Excel Job Sheet (UX-91): the Mode list shows only the names (Cash Payment, Online Transfer …), no descriptions.
  - Client forms: *Full Name (optional)*; *Building / Villa Name \** (R-CLI-03).
- Add New Client popup (UX-78): no description lines under the card titles. The contact row is Full Name, Phone, WhatsApp and **Mode** (four equal columns). Bi-Weekly adds a violet schedule card under the address card; Monthly swaps the body for the monthly client form and keeps a compact Mode selector in the header.
- Client cards (UX-67) are the same on Clients and Monthly Clients, and match the booking cards (UX-63). From top to bottom:
  - the lead cleaner's colour on the left edge;
  - the client name, address and a *Monthly* / *Standard* chip;
  - cleaner avatars in their Daily Job Sheet colours;
  - for monthly clients, a Mon–Sun strip (scheduled days filled, with the time slot), or an amber *No fixed schedule* hint;
  - a line of contact and history;
  - a money strip: Billed · Received · Due;
  - equal footer buttons (`CardAction`).
  Monthly cards have an emerald tint. Delete asks first. One column on a phone, two from `md`. Parts are in `components/clients/ClientCardParts.tsx`; cleaner colours come from `lib/cleanerColors.ts`.
- Excel Job Sheet team colours (UX-66):
  - A **project** is the team work at one location on one date. Every team row at that address shares one light colour, whatever job or team name it came from. The *Project* tab counts projects, not rows, and groups by project.
  - Every row of one team job has the same light colour, and its team chip is filled in the matching strong colour.
  - Ten colours (amber, indigo, pink, green, sky, violet, orange, fuchsia, lime, red) are given in the order teams appear.
  - Solo jobs keep the solo colour.
  - A colour the user picks for a cell, row or cleaner wins.
- My Duties (UX-65), phone first:
  - Header spans the full page column.
  - A sticky date bar with a 7-day strip and arrows; every tap target is at least 44 px.
  - Cleaner job cards: time strip, site plus a Maps button, then chips for team, Material and Collect AED.
  - Drivers keep the coloured stop cards.
  - One column on a phone, two from `md`.
  - Safe-area bottom padding.
  - The app can be installed on Android (`manifest.webmanifest`, theme colour `#064e3b`).
- Attendance (UX-64): leave is amber, absence red, available sky. *Leave approvals* panel above the cleaner cards — pending first, Approve leave (green) / Reject → Absent (white, red text); a pending Monday leave has a yellow row and a yellow flag chip *Monday*. The mark dialog groups categories into *Leave (needs approval)* and *Absent* and warns when the cleaner has jobs that date. The Daily Job Sheet lists absent / on-leave cleaners with the same colours.
- Excel Job Sheet: the Received reference and team tag go straight to the row where the payment was received and flash it, no popup (UX-62).
- Excel Job Sheet cell dropdowns use `ExcelCellPopover` (portal, Address design: header + icon, search, green custom row, emerald selected item with check). Never draw a dropdown inside a table row — row hover filters paint over it (UX-35).
- Destructive actions ask for confirmation; empty states explain what to do next.
- Responsive: < 640 px one column; 640–1024 px two columns; ≥ 1280 px full layout with side widgets.
