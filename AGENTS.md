# Safaeewala Operations Dashboard — Agent Operating Instructions & Core Rules

This file defines the core system and business rules that any agent working on this repository MUST strictly follow.

---

## 1. Monthly Clients Schedule Isolation Rule
> **Rule Definition:**  
> **"Monthly Clients kay schedule mein Daily Job Sheet par ki janay wali koi bhi tabdeeli — jaisay time, date, cleaner assignment, ya duration mein change — temporary (aarzi) samjhi jaye gi aur woh Monthly Client kay asal permanent schedule ko kabhi update nahi karay gi."**

- **Daily Job Sheet Changes are Temporary & Date-Specific:**
  - Any edit made to a monthly client's shift on `/daily-job-sheet` (e.g., date change, start/end time change, cleaner reassignment, duty hours) applies **ONLY to that specific date's `DailyJob` row**.
- **Permanent Master Schedule Protection:**
  - The client's master contract fields (`service_days`, `scheduled_time`, `end_time`, `duration_hours`, `preferred_cleaner`, and `day_cleaner_assignments`) are permanent.
  - The system must **NEVER** overwrite, back-sync, or mutate the master client record based on Daily Job Sheet edits.
- **Where Permanent Changes are Allowed:**
  - Permanent recurring contract changes can **ONLY** be made inside the Monthly Clients module (`/monthly-clients`) or Client Profile modal.

---

## 2. Cleaner Attendance Classification Rule
> **Rule Definition:**  
> **"System available cleaners mein say sirf unhein Absent count karay jo specifically mark hon, jabke blank entries ka matlab ho ga keh cleaner available tha magar koi job assigned nahi thi."**

- **Present (Working):** Cleaners with $\ge 1$ active cleaning shifts assigned on that date.
- **Available (Standby):** Cleaners with blank/0 job entries on that date. **MUST NOT be counted as absent**.
- **Specifically Absent:** Cleaners are ONLY counted as absent if specifically marked with an explicit absence/leave note or manual override.

---

## 3. User Permission Protocols
1. **Browser Access Permission**: Do NOT launch browser subagents without user confirmation.
2. **VPS Deployment Permission**: Strictly local development (`localhost:5058`). Do NOT push or run `scp`/deployment commands to the production VPS server (`187.77.116.14`) without asking for explicit user permission.
