# Clients & Monthly Clients audit — 2026-11-03

**Scope:**
- Screens: `/clients`, `/monthly-clients`, `/clients/:id` (Client Profile)
- Forms: `ClientModalForm`, `AddMonthlyClientModalForm`
- Shared logic: `clientDataSync.ts`, `DataContext` (client functions)

**Method:**
- Code review.
- A read-only check of live Supabase data (only counts and column names were read).
- Nothing was tested in a browser.

## 1. What the live data shows

| Check | Result |
|---|---|
| Columns of `clients` | All the fields the app saves exist. No field is dropped on save. |
| Clients saved in the table | **4**. Every other client on the Clients screen is built from Daily Job Sheet addresses (`dj-…` ids). It is saved as a real client the first time it is edited. |
| Clients with a permanent monthly schedule (`service_days`) | **0**. The whole Monthly Clients list comes from jobs whose payment mode is *Monthly*, so the monthly auto-sync has no schedule to fill the job sheet from. |
| Recurring contracts | 4 items. **3 are the demo contracts** the code seeded ("Ahmed Al Mansoori", example.com emails). |
| Monthly payments / client adjustments | 3 each. They live in the cloud (`app_state`). |

## 2. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| CM-01 | High | Client Profile can build a client from a booking or a job-sheet row (ids `booking-…` / `job-…`). Editing one called `updateClient`, which found no such client: nothing was saved and no error was shown. | **Fixed**: saved as a client under the same id |
| CM-02 | High | Three demo recurring contracts were seeded into real data and synced to every device (R-DATA-03). | **Fixed**: no seeding. The three are recognised by id + name + email and left out on load. They leave the cloud value with the next contract save. |
| CM-03 | Medium | On every page open, Monthly Clients wrote its copy of payments and contracts back to the cloud. Another user's change made while the page was open was not shown and could be overwritten. | **Fixed**: written only after a change on the page; a remote change is read in live |
| CM-04 | Medium | A new client's opening advance or adjustment was stored with `client_id: ''`, so it was linked only by name. | **Fixed**: the new client's id |
| CM-05 | Medium | Invoice and date ranges used UTC dates. In Dubai (UTC+4), *This month* started on the last day of the previous month and ended a day early. *Today* was yesterday before 4 AM. This affected Monthly Clients (14 places), Clients (6) and Monthly Invoices (1). | **Fixed**: Dubai calendar dates |
| CM-06 | Medium | A standard client became *Monthly* if any note or remark contained the word "monthly" or "recurring". The form copies the remarks into three fields. | **Fixed** (R-SCHED-04). No live client depended on it. |
| CM-07 | Medium | The bin icon on a client card deleted at once, with no question. | **Fixed**: asks first |
| CM-08 | Medium | The cards of the two screens looked different from each other, from the booking cards and from the Daily Job Sheet: different colours, different buttons, money shown in different ways. | **Fixed**: one card family (UX-67) |
| CM-09 | Low | Payments, contracts and adjustments are lists in one shared value (`app_state`). An item deleted on one device can come back if another device changed the same list before syncing. | Open: move them to their own tables, as was done for attendance |
| CM-10 | Low | *Remarks*, *notes* and *access notes* are always saved with the same text, so a separate gate code or access note cannot be kept. | Open: separate fields in the form |
| CM-11 | Low | A standard client cannot be turned into a monthly client from *Edit*. The 7-Day Schedule tab appears only for a client that is already monthly. | Open: show the schedule tab for every client |

## 3. How to manage standard and monthly clients

| Task | Where | What it changes |
|---|---|---|
| Name, phone, WhatsApp, address, preferred cleaner, opening advance | Clients → card **Edit**, or Client Profile → **Edit** → *Profile & Financials* | The client record. Every screen shows it. |
| **Permanent** schedule of a monthly client (days, time, cleaner per day) | Client Profile → **Edit** → *7-Day Schedule* | The contract (R-SCHED-02/03). From then on the monthly auto-sync puts the visits on the Daily Job Sheet. |
| A change for **one day** (another cleaner, a later time, a skipped visit) | Daily Job Sheet / Excel Job Sheet, that date's row | That day only. The contract stays as it is (R-SCHED-01). |
| Payment from a monthly client | Monthly Clients → card **Payment** | Monthly payments (cloud). The card's Received and Due update. |
| Invoice for a period | Monthly Clients → card **Invoice** | A new invoice for the dates chosen (now the real calendar month). |
| Recurring contract amount | Monthly Clients → *Contracts* tab | The contract chip on the card, and the invoice amount. |
| Make a standard client monthly | Monthly Clients → **Add Monthly Client** with the same name, or give its jobs the *Monthly* payment mode | Until CM-11 is done, the schedule tab is not offered on a standard client. |

**Rule of thumb:**
- The client record and the 7-day schedule are permanent. Change them only in the Client Profile.
- The Daily Job Sheet is for one-off changes to a single day.
- The monthly clients found only through *Monthly* jobs show **"No fixed schedule"** on their card, which today is all of them. Open each one once and set *Edit → 7-Day Schedule*, so the visits are created automatically.

## 4. Next steps (not built)

1. Fix CM-09: move payments, contracts and adjustments into their own tables (one row each), live, like `attendance_marks`.
2. Fix CM-11: show the 7-Day Schedule tab for every client.
3. Fix CM-10: separate the remarks, notes and access-notes fields.
