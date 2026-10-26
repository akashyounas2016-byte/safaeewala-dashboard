# Safaeewala Operations Dashboard — Design System & Theme Architecture

> **Document Status:** Active & Standardized  
> **Last Updated:** October 2026  
> **Repository:** `Safaeewala Booking Dashboard`  
> **Core Focus:** Visual Hierarchy, Theme Studio, Duty & Overtime Aesthetics, Component Design Tokens, and Micro-Interactions.

---

## 1. Design Philosophy: Executive Service-Tech

The Safaeewala Operations Dashboard is engineered for high-volume, real-time cleaning business operations in Dubai. Its aesthetic balances:
1. **Executive Professionalism:** Deep slate, porcelain white, and rich jewel tones that project operational credibility and calm under heavy transaction loads.
2. **High-Contrast Data Legibility:** Critical operational metrics—specifically **Duty Hours** and **Overtime (OT)**—must be readable in a single glance without ambiguity.
3. **Structured Bento Workstation:** Information-dense cards with dual workload gauges, live crew dispatch status, and document compliance widgets.

---

## 2. Core Color System & Design Tokens

The dashboard utilizes a curated **Emerald Executive** palette engineered for clarity, high contrast, and reduced visual fatigue in active dispatch environments:

### 2.1 Brand & Accent Tokens
- **Brand Primary (Emerald):** `#0d9488` (`teal-600`), `#0f766e` (`teal-700`), `#115e59` (`teal-800`)
- **Brand Soft / Tints:** `#f0fdfa` (`teal-50`), `#ccfbf1` (`teal-100`)
- **Overtime Alert (Amber/Orange):** `#d97706` (`amber-600`), `#ea580c` (`orange-600`), `#f59e0b` (`amber-500`)
- **Overtime Soft / Tints:** `#fffbeb` (`amber-50`), `#fef3c7` (`amber-100`)
- **Duty Regular (Slate/Teal):** `#0284c7` (`sky-600`), `#0369a1` (`sky-700`), `#f0f9ff` (`sky-50`)
- **Compliance Urgency (Crimson):** `#dc2626` (`red-600`), `#fef2f2` (`red-50`)

### 2.2 Surface & Elevation System
- **App Canvas:** `#f8fafc` (`slate-50`)
- **Card Background:** `#ffffff` (`white`) with subtle slate borders `#e2e8f0` (`slate-200/90`)
- **Hero Header:** Gradient banner `from-slate-900 via-teal-950 to-slate-900` with subtle emerald ambient glow
- **Hover Elevation:** Smooth transition to `shadow-[0_10px_35px_rgba(15,23,42,0.08)]` and `border-teal-400/80`
- **Border Radius:** `rounded-[24px]` for major bento cards and KPI containers, `rounded-xl` for badges and inputs

---

## 3. Duty Hours & Overtime (OT) Visual Hierarchy

Making Duty Hours and Overtime **numaya (prominent)** is a core operational requirement. They are presented as a cohesive dual-metric executive block.

```
┌──────────────────────────────────────────────────────────────────┐
│  WORKLOAD METRICS BLOCK                                          │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐ │
│  │ 💼 DUTY HOURS     6 Shifts  │  │ 🔥 OVERTIME (OT)    HIGH   │ │
│  │ 20 hrs                      │  │ +2 hrs                     │ │
│  │ Regular assigned duty       │  │ 9% of worked time          │ │
│  └─────────────────────────────┘  └────────────────────────────┘ │
│  Total Workload: 22 hrs                          ● 2h Overtime   │
│  [████████████████████████████████████████░░░░░░░░]              │
│   Regular Duty (91%)              Overtime (9%)                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Regular Duty Hours Styling
- **Visual Tone:** Calm, structured, and reliable.
- **Color Base:** Crisp Teal / Slate (`#0f766e`, `#0284c7`).
- **Typography:** Bold numeral display (`text-[18px] font-black`).
- **Context:** Displays shift count and confirmation of regular assigned duty.

### 3.2 Overtime (OT) Styling — High-Impact Alert
- **Visual Tone:** Energetic, eye-catching, and urgent.
- **Color Base:** Warm Amber & Tangerine (`#d97706`, `#ea580c`, `#f59e0b`).
- **Iconography:** Dynamic `Flame` or `Zap` icon with pulsing indicator.
- **Worked Time Ratio:** Shows the percentage of total hours represented by OT (e.g. `9% of worked time`).
- **High OT Trigger ($\ge 10\text{h}$):** Adds a gradient top accent stripe (`from-amber-400 via-orange-500 to-amber-500`) and a badge labeled `HIGH`.
- **Zero OT State:** Soft neutral styling (`0.0 hrs`, "No OT recorded") to prevent visual clutter when no overtime was performed.

### 3.3 Visual Hours Ratio Bar
- Below the dual cards, a dual-colored split progress bar displays the exact proportion:
  - **Duty Segment:** Teal/Cyan theme color ($100 - \text{OT\%}$).
  - **Overtime Segment:** Amber/Orange theme color ($\text{OT\%}$).

---

## 4. Layout Grid & Component Tokens

### 4.1 Executive Page Structure
1. **Page Hero Section:** Deep gradient banner with ambient glow, date period indicator, roster totals, and action buttons (`Import Roster`, `Export Duty & OT`, `Add Employee`).
3. **KPI Summary Cards (6-Card Grid):**
   - Total Staff
   - Working Today (Live)
   - Regular Duty Hours
   - Total Overtime (OT)
   - Combined Total Logged Time
   - Document Compliance Expirations
4. **Unified Filter & Control Bar:**
   - Real-time search by name, nationality, phone, or Emirates ID.
   - Role filter pills (`All Roles`, `Cleaners`, `Crew Leads`).
   - Work activity toggles (`Has OT`, `High OT >10h`, `Working Today`).
   - Period selector (`All Time`, `Today`, `Yesterday`, `7 Days`, `30 Days`, `3 Months`, `6 Months`, `Custom Range`).
   - Sort dropdown (`Highest OT Hours`, `Highest Duty Hours`, `Most Shifts`, `Name`, `Pay Rate`).
   - View mode switcher (`Grid Bento View` vs `Dense Table View`).
5. **Main Content (2 Columns):**
   - **Left Column (xl:col-span-2):** Employee Cards (Grid) or dense Roster Table.
   - **Right Column (xl:col-span-1):** 4 Operational Widgets.

---

### 4.2 Intelligent Operational Widgets

1. **🏆 Overtime Leaders Leaderboard Widget:**
   - Ranks the top 5 cleaners with the highest overtime in the selected date period.
   - Gold/Silver/Bronze rank indicators (`#1`, `#2`, `#3`).
   - Displays exact OT hours and regular duty hours for each leader.
2. **🟢 Live Crew Status Widget:**
   - Real-time operational dispatch check:
     - Pulls today's shifts directly from the Daily Job Sheet and Supabase Bookings.
     - Displays cleaner name, role, live site location, shift hours (e.g. `Marina Gate (08:00 - 16:00)`), and status badge (`ON DUTY`, `SCHEDULED`, `AVAILABLE`).
3. **🛡️ Document Health Tracker Widget:**
   - Visa and Work Permit compliance monitor.
   - Urgent alert (<30 days: Crimson background), Warning (<90 days: Amber background), or All Valid (Emerald checkmark).
4. **📊 Skills Coverage Widget:**
   - Distribution progress bars for Deep Clean, Sofa, Carpet, Window, Move-in Cleaning capabilities.

---

## 5. Dual View Mode: Grid Bento vs Table Roster

### 5.1 Grid Bento View
- Designed for supervisory review and individual cleaner evaluation.
- Large circular initials avatar with role and nationality.
- Complete workload metrics block with Duty Hours, OT, and workload ratio bar.
- Contact details, pay rate (AED/hr), document expiry status, and skills tags.
- Direct link to [EmployeeProfile.tsx](file:///e:/ANTIGRAVITY%20PROJECTS/Safaeewala%20Booking%20Dashboard/src/pages/EmployeeProfile.tsx) for full job sheet history.

### 5.2 Dense Table Roster View
- Optimized for quick payroll reviews, HR audits, and rapid scanning.
- **Dedicated Columns:** Employee | Role | Live Status | **Duty Hours** | **Overtime (OT)** | **Total Hours** | Shifts | Pay Rate | Visa Expiry | Actions.
- Table has a strict minimum width (`min-w-[740px]`) with smooth horizontal scrolling to guarantee zero column truncation on tablets and laptops.

---

## 6. Typography & Micro-Interactions

- **Font Family:** `Inter Tight`, sans-serif (clean, geometric, high numerals legibility).
- **Numerals:** Tabular lining numbers for hours and currency.
- **Transitions:** `transition-all duration-200` on hover, border color changes, and theme switches.
- **Pulse Indicators:** CSS `@keyframes pulse` on active duty dots and OT flame icons.
- **Responsive Breakpoints:**
  - Mobile (`<640px`): Single column cards, stacked action buttons.
  - Tablet (`640px - 1024px`): 2-column cards, condensed KPI row.
  - Desktop (`>1280px`): Full 3-column layout (2/3 roster, 1/3 widgets).
