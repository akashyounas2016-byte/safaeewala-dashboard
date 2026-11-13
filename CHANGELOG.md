# Changelog

> What changed, newest first. Add an entry under **Unreleased** with every change; when a deploy happens,
> rename *Unreleased* to the deploy date and start a new *Unreleased*. Mention rule IDs where relevant.
> Format: `- type(scope): summary (rule IDs) — commit`

## Unreleased (in `main`, not yet confirmed deployed)

- fix(leads): "Possible duplicate" no longer flags leads that only share the form's example number +971 50 000 0000; the same email within 7 days now counts (UX-148)
- docs: INSTRUCTIONS.md — how each feature works, for the Safaeewala team
- fix(contracts): saving a contract's Start / End date takes off the client's upcoming unpaid visits outside those dates — a visit on 28 Dec 2027 no longer stays after the End date 29 Dec 2026 (R-SCHED-13)
- fix(job-sheet): no false "Ends before it starts" check on morning-to-evening jobs (9 AM – 8 PM) — row checks read AM / PM; Bi-Weekly / Monthly client save, edit and delete checked on live with TEST records (R-JOB-02)

- feat(complaints): each complaint keeps a track record (every change, who, when); a cleaner's complaints show on their profile and lower the Health Score by severity — high −15, medium −8, low −3 over 90 days, at most −40 (R-CMP-02, R-EMP-13)
- feat(settings): Roles & Access in categories with a whole-category switch; Daily Job Sheet options "Excel Job Sheet" and "Import & delete a whole day"; Billing tab removed (R-SEC-09)
- feat(excel-sheet): Attendance opens a popup with every cleaner and Present / Available / Absent / Leave, plus View details (R-ATT-11)
- change(excel-sheet): right-click menu tidied — one Delete Block, deletes at the bottom; row height 24 px added, 56 px removed; one tick in the save toast (UX-146, UX-147)
- feat(settings): Activity Log redesigned — every add / change / delete with person, time, screen and each field before → after; filters, day groups, record links, CSV; client / employee / booking / invoice edits, new jobs, expenses and whole-day deletes now logged; migration `2026-11-12_audit_log_details.sql` (R-OPS-06, UX-145)
- feat(settings): Data health opens the exact job for unregistered staff and job warnings; app errors carry kind, person, version, connection and unsaved changes, the server logs its own errors, and the list is grouped by cause with the effect on the data (R-OPS-07)
- feat(settings): Backup tab simplified — one clear "are backups running?" answer, Server / Google Drive / This computer lines, daily automatic copy to a folder on this computer and to the Drive webhook; advanced settings folded (R-OPS-08)
- fix(excel-sheet): a new 2-cleaner job from Add Job saves; it no longer stops with "Not saved — 1 row(s) changed on another screen" (R-SYNC-18)

- feat(contracts): optional Contract End date on the Contract card and in Monthly Clients → Contracts; visits are added only from Start to End, an End before the Start is refused, and the contract shows Starts / Valid till / Renews / Ended (R-SCHED-11)
- fix(bookings): a booking without a cleaner adds its job with an empty cleaner, never "Unassigned" (R-SCHED-10)
- change(clients): the client list shows two rows with a See All button; the widgets below are in their own Client Insights panel (UX-144)
- fix(monthly-clients): a monthly client's visits are added only from its contract start date (or the day it was added) — opening an older date no longer puts a new client on past days (R-SCHED-11)
- fix(clients): deleting a monthly / Bi-Weekly client also removes its unpaid visits from today on and its contract (restore point kept); a deleted client is not brought back from old visits (R-SCHED-12)
- feat(clients): Contract card on the Monthly / Bi-Weekly client popup (service, amount, billing, start, notes, renewal) — saved as the client's contract in Monthly Clients → Contracts; Contract Status On / Off = active / paused (R-CLI-05)
- fix(ui): date boxes take a 4-digit year only (no "123123" / "275760") on every screen; Add Employee stops a wrong year or a future Date of Birth before saving (UX-143)
- fix(sync): a row removed on the Excel sheet (Delete Row, Clear Row Contents, every cell cleared) deletes the job from the Daily Job Sheet instead of saving an empty job; a deletion is never a "Not saved — changed on another screen" conflict and is not undone by a live update; a deleted monthly / Bi-Weekly visit is no longer added back by the monthly sync on any device (R-SYNC-17)
- fix(monthly-clients): a monthly client saved without a cleaner keeps the cleaner empty instead of "Unassigned"; old "Unassigned" records are read as no cleaner — no fake cleaner on visits, no false alert (R-SCHED-10)
- fix(sync): no false "Not saved — N row(s) changed on another screen" / extra unsaved rows — OT is not compared, conflicts compare the job as loaded, team jobs and empty cleaner rows survive live updates (R-SYNC-16)
- fix(staff): Inactive employees (and CSR) are not offered in Add Job, Booking, the Excel editor or the client cleaner pickers (R-EMP-12)
- fix(excel-sheet): removing a start or end time clears Duty Hrs and OT (typed, picked or Delete) (UX-139)
- fix(staff): no bare "Busy" tag — an empty cleaner row or a job without a time makes nobody busy; every tag says until when (UX-140)
- fix(excel-sheet): the monthly replacement banner shows only for real monthly-contract clients, not for a row whose Mode is "Monthly" (UX-141)
- feat(excel-sheet): in an open cell dropdown, Up / Down walk the list and Enter picks; past the end they move to the next row; Alt + Down opens the dropdown of the selected cell (UX-142)
- feat(excel-sheet): cleaners only — no CSR / driver / technical rows or suggestions; Staff column shows the Short Name (R-SHEET-02)
- feat(employees): CSR role (employee record only — never on the job sheet, Add Job or My Duties) (R-SHEET-02)
- change(excel-sheet): Charges (hrs) is typed by hand and saved on the job, no longer Charges ÷ Duty Hrs — run `2026-11-11_daily_jobs_charges_per_hour.sql` (UX-138)
- feat(ot): OT starts after the employee's own Total Duty Hours (8 h → after 8 h, 10 h → after 10 h; blank = 8 h); after 8 PM is still always OT; written in README (R-OT-03)
- feat(employees): every dropdown in Add / Edit Employee is a white searchable list (Booking-screen style); Nationality and Client can take a typed value (UX-133)
- feat(excel-sheet): the keyboard cell has a clear green border; new **Charges (hrs)** column = Charges ÷ Duty Hrs (UX-134)
- feat(add-job): wider Staff picker; client list and picked client show Advance / Pending (UX-135)
- feat(finance): a new job for a client whose advance covers it is marked "Paid from advance" — nothing to collect on site (R-FIN-10)
- fix(excel-sheet): picking one date shows one date box — From–To only for Custom Range and range presets (UX-136)
- feat(excel-sheet): right-click Copy Row / Paste Row Here, or Alt + drag a row onto another; the target keeps its cleaner and date (UX-137)
- feat(excel-sheet): banner to replace an absent / on-leave cleaner on monthly-client jobs for that day only (R-SCHED-09)
- feat(agencies): Third Party (Group) company type with several trade licenses (file, issue, expiry, name) — run `2026-11-11_agency_trade_licenses.sql` (R-AGN-07)
- feat(staff): "Busy till 9:00 PM" tag in the Add Job (Excel + Daily Job Sheet) and Booking pickers; goes away when the job time is over, the cleaner presses End in My Duties or the booking is completed; re-checked every minute (UX-131)
- feat(excel-sheet): 90 % / smaller zoom fills the whole screen — only the content shrinks (UX-131)
- feat(excel-sheet): OT shows once per cleaner, on the last row of the block, as the total of all the cleaner's jobs (UX-131)
- feat(excel-sheet): Attendance column between Mode and Remarks — Present by default, Absent or Short Leave (reason required); same marks as the Attendance screen; Short Leave keeps the cleaner in the assign lists (R-ATT-10)
- feat(excel-sheet): Row Color Uniqueness — a row colour already used on that date is refused with an error, except within a team (R-SHEET-01)
- feat(excel-sheet): click-and-drag / Shift selection of cells and whole columns; colour fill, Delete and Ctrl+C work on the selection; arrow keys move out of an open dropdown (Start time …) instead of getting stuck (UX-132)
- feat(employees): Short Name under Full Name; Total Duty Hours (6 / 8 / 10 / 12 or typed) and Date of Birth — run `2026-11-10_employee_dob_duty_hours.sql`; "switch automatically" note removed; Other Documents says "Upload Image and PDF" (R-EMP-11)
- fix(employees): Delete on a document really deletes it from the employee (confirm first) and it no longer comes back on save (R-DOC-03)
- fix(review): columns for the 2026-11-09 employee fields (`2026-11-10_employee_training_fields.sql`), Other Documents to Storage, sign-in retries instead of hanging; unique realtime channel names for job check-ins (R-EMP-09, R-EMP-10, SEC-01, R-DUTY-02)

- feat(excel-sheet): team job row styling isolates color from Start Time onwards; Staff column retains default white unless user customized; right-click Row Height control with 5 discrete levels (XS 26px to XL 56px) (UX-128)
- feat(excel-sheet): strict 3-row default limit per cleaner, trimming excess blank shifts; 15-minute time slots (07:00 AM–11:45 PM) with robust manual custom time parsing (e.g. 9:15, 9.15, 9am, 1pm) (UX-129)
- feat(excel-sheet): simplified secondary team labels: Charges displays team name directly ("Team A"), Received displays "REF: [Cleaner's Short Name]" (R-PAY-05)
- feat(excel-sheet): removed Team badges from Staff column; default Left aligned with functional toolbar alignment buttons; added Attendance button in top header (UX-130)

- fix(realtime): unique channel name for duty issues subscription in `useAlerts`, preventing "cannot add callbacks after subscribe" error when multiple components mount (R-ALERT-04)
- fix(auth): extend idle auto-logout timer to 24 hours (1440 min) and add network error resilience in `loadProfile` to prevent unwanted session logouts (SEC-01)

- feat(alerts): centralized Cleaner duty issues in Sidebar Alerts module with Realtime updates, high-severity badges, cleaner notes, and direct links to Job Sheet and Booking (R-ALERT-04)
- feat(employees): Skills and Client Assessment widget redesigned into a clean 3-column row (Skills, Comments/Remarks notes, Client selection dropdown) (R-EMP-10)
- feat(jobs, bookings): Team Reference section includes selectable Team Leader dropdown; address selection bug resolved to preserve previously entered start time, end time, and duty hours (R-JOB-09)
- feat(employees): Add Employee popup redesign — Short Name field (50% width), Total Salary + Basic Salary fields, Under Training status with duration and Admin completion alert, 3x2 compliance documents layout (Work Permit expiry only, NOC, Other Documents multi-upload) (R-EMP-09)
- feat(agencies, documents): document Delete button in Add/Edit Agency popups; date year 4-digit formatting fix preventing "202" truncation (R-DOC-01, UX-127)
- ui(sidebar): AI Bot and Alerts counters visually standardized with identical red blinking pill badge (UX-126)

- feat(bookings): status menu on every card (Unconfirmed · Scheduled · In progress · Completed · Cancelled) with the cleaners' live step; Edit Booking status shows at once on job-sheet cards (R-BK-04)
- feat(staff): live "Busy" tag — finished jobs no longer count; with a chosen time only overlapping jobs count (UX-125)
- ui(sidebar): AI Bot between Reports and Settings; red blinking counter (UX-126)

- fix(ui): English only on screen — sign-out, login errors, AI Bot, backup guide and sync / webhook windows rewritten; a test keeps it so (R-UI-01)
- feat(job-sheet): no "leave site / changes not saved" warning; the Excel sheet saves on the way out (UX-123)
- feat(attendance): Cards / Table view, Hide / Show, first 6 cards then View all; tab spacing fixed (UX-124)

- feat(documents): Upload image or PDF everywhere; PDFs preview; picked files go to Storage at once (no more empty "No binary file preview" records) (R-DOC-02)
- feat(my-duties): Start Job / End Job popups; Start → booking In progress, End → Completed (database trigger); office-completed bookings show as done on the phone (R-DUTY-02)
- feat(sidebar): Attendance is a tab of Employees; merged-screen tabs under the header like Marketing (UX-117)
- feat(bookings): date filter All Time · Today · Yesterday · Last 3 / 7 / 30 Days · … · Custom; default Today; Dubai dates (UX-121)
- feat(users): the key icon no longer makes a password by itself — explicit Generate New Password (UX-122)
- db: `2026-11-09_duty_booking_sync.sql` — to run in Supabase

- feat(ghl): Marketing → Google posts — update / event / offer with button and photo, post now / schedule / draft, list of posts, through GHL Social Planner (needs the key's Social Planner scopes) (R-GHL-02)
- feat(whatsapp): Google review link setting; {review_link} in notification templates and quick replies (R-GHL-01)

- feat(job-sheets): every cleaner listed — Daily Job Sheet "no job" rows (available / absent / leave), Excel empty blocks (not saved); crew timeline only cleaners with a job (R-ATT-09)
- feat(marketing): Lead lists — pool of website leads, WhatsApp chats, clients and contacts extracted from pasted text; filters; save as a contact list or CSV (R-MKT-02)
- ui: merged-screen tabs inside the page header; popup header buttons on one line; payout popup "Payment and Advances"; Templates filters in one row with status as a dropdown (UX-117, UX-119, UX-120)

- feat(sidebar): Monthly Clients, Inventory, Analytics and Complaints are tabs of Clients, Expenses, Reports and Alerts; Fluent Forms is "Leads (Website)" (UX-117)
- feat(security): "Salary" in Roles & Access — cleaners' salary shown to Admin only unless a role is given it (R-SEC-08)
- feat(agencies): documents tab without the four-card banner; Current Active Documents first; Delete in the version history (UX-118)

- feat(documents): every document field (employee + agency popups) takes several images; the new upload is Current and the replaced one shows right under it as Previous; Remove keeps the file; replaced profile photo kept (R-DOC-01)
- ops(backup): the nightly backup also copies the Storage files (document images, chat media), every version kept (R-DOC-01, R-OPS-04)

- feat(ai-bot): Sidebar → AI Bot opens a full-width hub — quick actions (new booking here), live cards from every module, Ask the CRM (rules over your data; cleaner by name; "new booking"), one search, cleaner card, month Duty & OT; AI model later (R-AI-01)
- feat(marketing): client base by segment (inactive, first-time, repeat, active, never booked) synced from jobs + bookings, Offers and Campaigns tabs; own screen permission (R-MKT-01)
- feat(complaints): new Complaints module — status, priority, assignee, resolution; "To review" from website messages and chats tagged Complaint; Complaint button on a lead (R-CMP-01)
- feat(invoices): header without search / Monthly Invoices; 5 DJS cards (no VAT card); search · status · date · Reset in one row (UX-115)
- feat(inventory): DJS cards; full-width list; Inventory Health · Suppliers · Restock Queue in one row at the bottom (UX-116)
- db: `2026-11-09_marketing_complaints.sql` — to run in Supabase

- feat(conversations): leaner layout — rail 184 px, connection status under the icons links to Settings → Connection, no Inbox title row, no Full screen in the header; "Book Job" in every chat header opens the Add Job popup prefilled; Templates table without Updated, fixed widths (R-INBOX-06)

- fix(employees, alerts): document alerts start 30 days before expiry on every screen (some used 90 / 60); a typo year (0227) shows "date looks wrong" instead of "expired 657168 days ago", and the employee form refuses it (R-EMP-04)

- feat(leads): "Confirmation" is now "Booking" — opens the Add Job form filled from the lead (date, time, area, address, remarks; new client popup with name + number), amount left empty (R-LEAD-02)
- feat(conversations): Templates is its own module between Broadcasts and Analytics, with tabs Templates · Quick replies · Automation · Keyword Triggers; Settings keeps Users · Notifications · Tags · Connection (R-INBOX-05)
- feat(templates): "Save as quick reply" in the template builder — an internal template sent as ordinary text, no Meta review (R-WA-06)

- fix(leads): website leads were refused with 401 since the service key was set on the VPS (2026-11-05) — the webhook accepts leads again until FLUENT_WEBHOOK_SECRET is set (SEC-04)
- fix(leads): the property type is shown as the customer picked it on the website form — Flat was shown as Apartment (R-LEAD-01)

- fix(employees, agencies): adding an employee with document photos lost it after a reload — files now go to Storage and only their paths are saved (R-SYNC-15)

- feat(conversations): Automation, Keyword Trigger and Templates moved into Settings, which now has tabs (Users, Notifications, Tags, Templates, Replies, Automation, Keyword Trigger, Connection) (R-INBOX-04)
- feat(templates): template builder with 8 types and live preview; templates saved in the CRM as drafts, submitted to Meta for review; All Templates list with status tabs and filters (R-WA-05)

- feat(conversations): one "Conversations" module — minimal connection header, tags with custom colours on every chat, tag summary, unread first, filter dropdown; message bar with attachment, templates + saved replies, emoji; demo data WhatsApp only (R-INBOX-03)
- feat(whatsapp): client notifications with switches — booking confirmation, day-before reminder, team on the way, feedback request, payment reminder (by hand) — and a master switch for every automatic message (R-WA-04)

- feat(inbox): Inbox merged into the WhatsApp CRM — one sidebar item, platform switcher All / WhatsApp / Facebook / Instagram; ⋮ menu with local demo data, Backup to Google Drive, Delete all conversations (admin) (R-INBOX-02)

- feat(whatsapp): rest of the WhatsApp CRM prototype — chat status / assignment / tags / team notes, round-robin, STOP opt-out, contact lists, scheduled + retarget campaigns, deal owner / close date / activity, deal-stage automations, fallback reply, template header / footer / buttons, agent leaderboard (R-WA-03)
- feat(whatsapp): new layout — module rail, title bar, Full screen with Back to Sidebar (UX-114)

- feat(layout): AI Bot moved from the floating button to Sidebar → AI Bot (under Alerts) (UX-112)
- feat(inbox): Inbox redesign — no header, full height, wider chat list with clear platform tabs, minimalist (UX-113)

- fix(employees): Health Score uses the Dubai date — from midnight to 04:00 today's absences were left out (R-EMP-03)

- feat(whatsapp): nine WhatsApp tabs — Inbox, Jobs, Deals, Broadcast, Analytics, Automation, Keyword Trigger, Templates, Settings; setup never blocks a tab (R-WA-02)
- feat(whatsapp): server automation (welcome, away with business hours, keyword replies), broadcasts, template create / delete, number register + subscribe (R-WA-02)
- feat(inbox): one Inbox for WhatsApp + Facebook + Instagram (GHL) (R-INBOX-01)
- feat(bookings): /bookings?new=1&client=&name=&phone= opens a new booking for a WhatsApp client (R-WA-02)

- feat(ops): CRM on https://crm.safaeewala.com (Traefik + allowed origins); noindex header and meta so search engines leave it out (R-OPS-05)

- feat(whatsapp): WhatsApp inbox in the CRM on the Meta Cloud API — receive text / media / statuses through a signed webhook, send text in the 24-hour window or approved templates, client linking, unread badge, Client Profile button (R-WA-01)
- fix(server): "Bearer " was not stripped from the token when the service key is missing (regex typo)
- chore(deploy): whatsappServer.cjs shipped with every deploy; release backup tolerates a new file

- fix(marketing): no made-up campaign / retention numbers — the screen says it is not connected; Marketing added to the sidebar (R-DATA-03)

- feat(payments): All Payments lists booking payments; Delete on every payment row (R-FIN-09)
- feat(monthly clients): Wide grid view with widgets at the bottom (UX-110)
- feat(expenses): Daily Job Sheet style cards, Profit & Loss widget; collections counted like Payments (UX-111, R-FIN-07)

- feat(alerts): AI findings link straight to the booking (edit form), its job and the client (R-ALERT-03)
- feat(client profile): ⋮ menu with Delete Profile; short card labels; Service History cards and columns can be hidden / reordered (UX-108)
- feat(employees): 10 cards, 5 a row, Daily Job Sheet style (UX-109)

- feat(analytics, reports): one set of figures incl. monthly-contract revenue; Analytics redesigned as an organised grid with new insights; Reports outstanding counts partial payments (R-FIN-07, UX-106)
- feat(payments): Pending merged into Payments — one hub with cards and tabs, Advances tab; /pending redirects (R-FIN-08)
- fix(settings): no made-up account values; Notifications say nothing is sent; Billing backup text; Stripe and Zoho Books removed from Integrations; all headers in the Daily Job Sheet colour (UX-107)

- fix(ui audit): Esc closes popups; Clients table delete asks; Bookings card time; no "0d left" for missing document dates; React render warning from the sync banner (UX-105)

- fix(audit): alert when a schedule names a cleaner who is not an employee (R-ALERT-02); a re-added name is linked again (R-EMP-08); Active Clients = last 60 days, not a fixed date (R-CLI-07)

- feat(bookings): KPI cards in the Daily Job Sheet style, 5 a row; Avg Shift Duty and Staff Allocated removed (UX-104)

- feat(daily sheet): Crew timeline hides cleaners with no job; axis 09:00–23:00 (UX-103)

- fix(money): collected = the received amount only; a Cash row with nothing received no longer shows in Driver Payment Received / Total Collected (R-FIN-03)
- feat(excel sheet): auto-save 3 s after the last change; clash / remote-change reason shown instead of a silent stop (R-SYNC-14)
- feat(daily sheet): Jobs Show / Hide (UX-99); feat(client profile): no Repeat tag on Monthly (UX-100)
- feat(clients, daily sheet): 5 cards a row, At-Risk / Repeat Rate removed, long titles wrap (UX-101)
- feat(employees): Agency Staff / Available / Absentees / On Leave cards behind an arrow, sync icon by the status, 3 rows + View All (UX-102)

- fix(sync): changes are no longer dropped after 5 failed tries or offline; an empty cloud table is not refilled from the browser; a cleared employee field is saved as empty (R-SYNC-13)
- feat(employees): Excel import fills the empty fields of employees already on the list (R-EMP-07)
- docs(prod): go-live steps for clearing imported jobs and keeping real employees

- feat(alerts): Sidebar → Alerts collects every alert; ticker, AI banner and header-bell lists removed from the screens (R-ALERT-01)
- feat(daily sheet): white Jobs header; rows white unless a colour was chosen (UX-96)
- feat(clients): KPI cards in the Daily Job Sheet style, new order, every card filters cards and widgets; Recent Bookings audit fixes (UX-97)
- feat(client profile): actions in the header, full-width content, widgets below, Review Requests removed; Upcoming / Job Sheet Summary audit fixes (UX-98)
- fix(sheets): an Excel block colour shows on the Daily Job Sheet; a colour change alone is saved (R-SYNC-11)
- feat(bookings): Add New Booking opens the Add Job form; the job-sheet row is that entry (R-SYNC-12)
- feat(clients): in-house / outsourced crew and visits on cards, expand arrow, widgets follow the selected KPI card (UX-95)
- feat(clients): Contract Status toggle for Monthly / Bi-Weekly clients; Off stops the sync and clears synced visits from today on (R-SCHED-08) — needs `2026-11-05_client_contract_active.sql`
- feat(daily sheet): V1 colours, crew timeline with clashes / jobs without a cleaner, Driver and Status columns synced from Drivers and My Duties (UX-94)
- feat(settings): Nightly database backup card on the Backup tab, fed by /api/backup-status (UX-93, R-OPS-04)
- feat(clients): card grid limited to 4 rows with a View All button (UX-92)
- ops(backup): nightly pg_dump of the database on the VPS, kept 30 days, optional Google Drive copy and failure alert (R-OPS-04)
- feat(daily sheet): issue flag next to the cleaner's name; sync note no longer in Remarks (UX-86)
- feat(sidebar): show / hide items in the sidebar settings; duplicate bottom button removed; Up / Down fixed (UX-89)
- feat(clients): three cards per row, widgets below (UX-90); client name optional, the address identifies the client (R-CLI-03)
- fix(excel): Mode options without descriptions (UX-91)
- data: Office ABC Trading DMCC registered as a monthly client with Uma Sunar (Mon–Sat 09:00–12:00), so it no longer clashes with Office Luxam (Ambika) — owner request 2026-11-05
- feat(excel): flag next to the cleaner's name with a hover popup (clash / needs a cleaner / history) instead of the sync text in Remarks (UX-86)
- fix(copy): Copy buttons work on the http VPS address (Add user credentials, webhook snippets, review message) (UX-87)
- fix(settings): owner, System Health and Backup widgets on the Company tab only (UX-88)
- refactor(excel): step 1 of splitting the Excel Job Sheet — columns, palettes, row logic, settings and formulas moved to src/lib/excelSheet/ (6,518 → 5,173 lines); no behaviour change (CODE-A01)
- fix(excel): column headers follow the column alignment (UX-85)
- feat(invoices): issued invoices are voided, not deleted; a taken number is retried (R-FIN-05, INV-A09)
- feat(clients): Bi-Weekly visits go to the Daily Job Sheet by themselves, every week or every other week (R-SCHED-07)
- feat(security): Supervisor / Driver / Cleaner columns in Roles & Access; SQL that limits field logins to their own rows (R-SEC-07, SEC-A03). Needs `2026-11-05_field_login_rows.sql`
- fix(excel): a cleaner added by Add Job gets a 3-row block like the others (UX-84)
- feat(forms): popups never save with a required field empty; red message at the top and outlined fields, in every popup (R-FORM-01, UX-84)
- fix(time picker): Morning / Evening switch starts the list at the top (UX-84)
- fix(security): /api needs a sign-in even without the VPS service key; leads, agencies and the error log were readable by anyone (R-SEC-06)
- fix(agencies): agencies that existed only in the VPS file are copied to Supabase (AGN-A01)
- fix(invoices): numbers checked against Supabase before saving (no duplicates); Dubai year, due date and date filter; overdue total minus part payments; overdue marked once invoices load; warning before deleting an issued invoice (INV-A01…A07)
- feat(drivers): Dispatch by area with free-cleaner suggestions; one live map for all drivers (Realtime); readable header date (R-DRV-04, UX-82, DRV-A01)
- feat(duties): My Duties full width; On my way / Start / Finish / Issue, call and WhatsApp the client (R-DUTY-01, UX-83). Needs `2026-11-04_job_checkins.sql`
- feat(excel, clients): column letter selects the column; no grip icon; Bi-Weekly contract calendar (UX-80, UX-81)
- docs: CRM audit 2026-11-05 (`docs/audits/2026-11-05-crm-audit.md`)
- fix(scheduling): clashes are stopped at the monthly schedule, the monthly auto-sync (visit added unassigned) and New / Edit Booking (R-SCHED-06)
- fix(excel-studio): old cleaner block colours no longer paint rows; Daily Job Sheet uses one light colour per team project (UX-79, UX-71)
- feat(jobs): 40 light row colours chosen by CIEDE2000 so no two look alike (UX-69)
- feat(clients): Add New Client → Mode (General / Bi-Weekly / Monthly); Bi-Weekly days + contract duration; Monthly opens the monthly form with the typed details; description lines removed (R-CLI-02, UX-78). Needs `2026-11-04_clients_service_mode.sql`
- fix(jobs): the start / end time list is no longer cut off in the Add Job popup (UX-77); row colours are 40 fully light shades (UX-69)
- fix(excel-studio): one colour for all rows of a team project; a cleaner's block colour no longer splits a team (UX-71)
- feat(jobs): Split Mode rows show and edit each cleaner's own charges / received on the Daily and Excel Job Sheets (R-PAY-05)
- feat(excel-studio): Advance column; Pending shows only what is due (UX-72)
- feat(excel-studio): left / centre / right alignment per column (UX-73)
- fix(attendance): a cleaner absent or on leave is not listed or offered for that date (R-ATT-08)
- fix(jobs): taller Add Job popup; materials card heading removed; 40 clearly different light row colours (UX-74, UX-75, UX-69)
- feat(monthly): monthly visits stop syncing once the client's contract is paused or cancelled (R-SCHED-05)
- feat(clients): address format number → building → area; Add New Client field order; wider popup, cleaner list stays inside (R-CLI-01, UX-76)
- feat(employees): every cleaner on the Daily Job Sheet is saved in the employees table automatically, with the same id; deleting one removes the cloud row; registered job-sheet staff with a salary count in payroll (R-EMP-06)
- feat(jobs): Charges has Lump Sum and Split Mode. Lump Sum: Charges, Advance Received and Payment Mode (with custom values), all on the lead. Split Mode: each cleaner's charges, received and mode. The split is saved as `charge_split` (R-PAY-05)
- feat(jobs): Add Job time lists open upwards and step every 15 minutes (UX-68)
- feat(jobs): row colours are 17 clearly different colours; look-alike shades removed (UX-69)
- feat(excel-studio): rows are white unless part of a team project or given a colour; new rows and blocks start white (UX-70)
- fix(employees): audit EMP-01…05:
  - Re-import skips existing people.
  - Delete asks first.
  - Dubai calendar dates.
  - Attendance absence and leave show on the card.
  - Split jobs credit each cleaner's own amount.
  - Report: `docs/audits/2026-11-04-employees-audit.md`.
- fix(excel-studio): *Project* counts projects, not cleaner rows: 7 cleaners at 2 locations is 2 projects. A project is one location on one date; all its rows share one colour, different from every other project (UX-66)
- feat(time): Booking and Add Job time pickers list plain numbers in 30-minute steps from 9:00, with Morning / Evening tabs; the box shows no AM/PM tag (the toggle beside it does); typing any time still works (UX-68)
- feat(jobs): 20 more light row colours (UX-69); "Charges & Collection" is now "Charges", with *Split received between cleaners* (who collected how much) (R-PAY-05)
- fix(sync): a job's row colour and the cash split are saved to Supabase. The row colour was never saved before (R-SYNC-11; migration `2026-11-03_daily_jobs_split_and_color.sql`)
- fix(excel-studio): two teams on one date no longer share "Team A"; names are unique per date, also for saved jobs, and each team gets its own colour (R-SYNC-08, UX-66)
- fix(excel-studio): time clashes are shown at once. A red banner lists every cleaner booked twice in the sheet, the rows are outlined, and *Show* jumps to them. Add Job checks unsaved rows on screen too (before: only saved jobs, so a second overlapping job slipped in) (R-JOB-01)
- docs(ops): Claude works in the main folder; the VPS is updated only on request (R-OPS-03)
- fix(app): coming back to the browser tab no longer reloads the whole app. Supabase sends SIGNED_IN again on every return, and the app treated it as a new sign-in, so every screen was rebuilt and Settings jumped to Company (SET-01)
- fix(settings): the chosen tab is kept in the URL and in the browser tab's session, so leaving Settings and coming back keeps it (SET-02)
- feat(settings): when the server has no Supabase admin key, Users explains how to fix it (SET-03, K-06)
- feat(clients): Clients and Monthly Clients cards redesigned as one family after the Daily Job Sheet: cleaner colour, avatars, Mon–Sun schedule strip, money strip. Delete asks first (UX-67)
- fix(clients): audit CM-01…CM-08:
  - Editing a client the profile built from a booking or job row is no longer lost (CM-01).
  - The demo recurring contracts are removed (CM-02, R-DATA-03).
  - Payments and contracts are no longer rewritten on every page open, and update live (CM-03).
  - The opening advance is linked to the new client (CM-04).
  - Monthly invoice ranges and date presets use Dubai calendar dates; "This month" started a day early (CM-05).
  - A note saying "monthly" no longer makes a client monthly (CM-06, R-SCHED-04).
- docs(audit): Clients & Monthly Clients audit, with a guide to editing standard and monthly clients
- fix(excel-studio): Add Job with several cleaners shows one row per cleaner, each in that cleaner's block, and Save keeps it one job. Before, Save made one job per cleaner. All rows of a team share one colour (R-SYNC-08, UX-66)
- feat(my-duties): cleaners see only their own jobs and drivers only their own route. A cleaner / driver login opens My Duties only, with no AI bot and no office notifications. Admin / manager can preview anyone. Full-width header, sticky 7-day date bar, phone-first cards with a Maps button and cash to collect. The app can be installed on Android (R-SEC-05, UX-65)
- feat(attendance): leave approval — leave from other roles waits for admin / manager, who approve it or reject it as absent; pending Monday leave flagged yellow in the approval list; marks saved one row per cleaner + date in `attendance_marks`, live for every user; Daily Job Sheet lists absent / on-leave cleaners and tags their remaining jobs; Next / Previous day fixed (R-ATT-05, R-ATT-06, R-ATT-07, R-SYNC-10, UX-64; migration `2026-11-03_attendance_marks.sql`)
- docs(audit): attendance system audit — ATT-A01…A10
- chore(quality): one time-overlap check for the whole app (E2E-02); pre-commit hook lints staged files (E2E-06)
- fix(security): the database enforces screen permissions for writes — a role can add / change employees, agencies, invoices, inventory and clients only with a screen that uses them (R-SEC-03, E2E-07; migration `2026-11-02_role_based_writes.sql`)
- fix(security): staff and agency identity documents moved out of the table rows into the private Storage bucket `staff-documents` (admin / manager only, signed links); old files are moved on the next admin login (R-SEC-04, E2E-08; migration `2026-11-02_staff_documents_storage.sql`)
- chore(deploy): the live version is kept before each deploy (last 5), a health check (`/api/health`) puts the previous version back automatically when the new one does not answer, every deploy gets a git tag, and Actions → "Roll back the live site" restores a kept version (E2E-25)
- fix(security): rate limit on the API (webhook / admin 120 per minute per IP) (E2E-15); xlsx 0.20.3 from the official SheetJS CDN, react-router 7.18.5, zod 4.6.7 — npm audit: 0 vulnerabilities (E2E-10, E2E-11). Run `npm install` in the main folder after merging.
- feat(sync): live updates between users — changes to bookings, clients, staff, agencies, invoices, inventory, jobs and expenses appear on every open screen without a reload; shared settings (payment modes, materials, deleted drivers, sheet colours, monthly auto-sync) are cloud-synced and arrive live with a Refresh prompt; idle sign-out after 2 hours (R-SYNC-09, E2E-13/17/18; migration `2026-11-02_realtime.sql`)
- chore(agencies): commission removed everywhere — agencies work on a fixed-price contract (R-PAY-03, DEC-016; migration `2026-11-02_remove_agency_commission.sql`); OT pay planned on the Salaries screen (R-PAY-04); old Phase 2 migration can no longer reopen `app_state` to anonymous users (E2E-12)
- fix(bookings): Mark as Completed no longer records the full amount as received, saves the status on the record so every device sees it, and the card moves to Completed at once; monthly visits keep their contract day (migration `2026-11-02_bookings_recurrence_day.sql`); new Bookings rules R-BK-01…03 (E2E-20, E2E-21, E2E-22)
- feat(bookings): booking cards redesigned after the Daily Job Sheet — cleaner colour and avatars, shift strip, Charges / Received / Pending (UX-63)
- docs(audit): end-to-end technical & functional audit — E2E-01…30: Mark as Completed records full payment (E2E-20), database readable by every role (E2E-07), ID documents in table rows (E2E-08), no deploy rollback (E2E-25), vulnerable xlsx (E2E-10); action plan
- feat(overtime): OT is always automatic — the Excel OT column is read-only, file values and the old `is_overtime` flag are ignored; each cleaner of a team job has their own OT on Employees, profiles and Attendance; job-sheet total counts every cleaner (R-OT-01, DEC-015)
- feat(excel-studio): Received reference and team tag go straight to the row where the payment was received, no popup; a hidden row is shown first (UX-62)
- fix(overtime): excessive OT — saving a shift with any OT set `is_overtime`, which then counted the whole shift as OT (Sabirti 2026-10-19 showed 5.5h, real 3h); overlapping shifts of one cleaner count once; every screen shows the same OT (R-OT-01)
- feat(excel-studio): single-cleaner jobs have a light row colour, and "Solo at bottom" moves cleaners with only solo jobs below the team jobs (UX-61)
- feat(overtime): Two-scenario cumulative multi-shift Overtime calculation & auto-standardization (R-OT-01):
  - Multi-Shift Cumulative Tracking: Implemented `recalculateAllRowsOT` and `calcDailyCleanerShiftsOT` in `jobSheetUtils.ts` to track daily cleaner duty chronologically across multiple shifts on the same date.
  - Standardized Scenario 1 (unconditional OT for duty past 20:00 / 8:00 PM) + Scenario 2 (excess duty before 20:00 beyond standard 8-hour basic limit).
  - Excel Job Sheet Spreadsheet (`JobSheetSpreadsheet.tsx`): Automatic multi-shift OT recalculation on load, inline cell editing of times/staff, pasting, and 'Recalculate Hours' action; accurately reflects shift-level OT (e.g. Parmila 3.5h, Sabirti 3.0h) and footer total OT.
  - Daily Job Sheet (`DailyJobSheet.tsx`): Synchronized active job rows, table footer totals, inline cell edits, print views, and Excel export with cumulative cleaner OT map.
  - Excel Importer (`jobSheetImport.ts`): Automatically runs `recalculateAllRowsOT` on imported sheets to eliminate human transcription errors and faulty static manual OT numbers.
  - Client Data Sync (`clientDataSync.ts`): Updated `calcJobOTHours` to support sibling job context.
  - Unit Tests: Added `tests/unit/overtime-cumulative.test.ts` covering Parmila 3-shift scenario, Sabirti 2-shift scenario, night/midnight shifts, and explicit overtime flags (all 21 test files & 274 checks passing).

- feat(bookings): Dynamic button width on cards for full text display (UX-38, R-JOB-01):
  - Incompleted bookings: 'Mark as Completed' button widened to 1.65fr and given full text display without truncation (`whitespace-nowrap`), while 'Invoice' and 'Payment' buttons sized compactly to 1fr each.
  - Completed bookings: All 3 buttons ('Invoice', 'Payment', 'Completed') evenly balanced at equal 33.33% width (`grid-cols-3`) with complete text display.

- feat(daily-job-sheet, driver-widget, reconciliation): Jobs Header Single-Row, Preset Date Range Display, Pending Received Formula & Driver Widget Polish (UX-37, R-JOB-01, R-DRV-01):
  - Jobs Widget Header: Removed mode tag display (`Mode: {paymentFilter}`) on filter selection to keep the header strictly single-row and eliminate layout wrapping.
  - Header Date Range: Replaced redundant duplicate preset names ("Last 7 Days") with a clear single date range (`{startDate} – {endDate}`) in both subtitle and active navigation capsule.
  - Pending Received Widget: Displayed client pending formula in a single row (`Pending: AED X − Received: AED Y = Remaining: AED Z`) and made the tag clickable, navigating directly to the client's financial history ledger or payment history view.
  - Driver Summary Widget: Added individual delete button (`Trash2`) next to edit icon (`Pencil`) on each driver row with local deletion persistence.
  - Driver Staff Modal: Made 'Link Payment to Cleaner / Job Reference' editable supporting custom typed values alongside dropdown datalist options with 'Link / Apply' action; removed bottom 'Close' button and added a clean 'Save' button in the modal header beside the cross (`X`) icon.

- feat(bookings, excel-studio): Booking Cards & Details Polish, Modal Edits & Spreadsheet Mode Customization (UX-36, R-JOB-01, R-SYNC-06):
  - Bookings Screen: Shifted charges to card upper row; restricted card footer strictly to 3 buttons (Invoice, Payment, and instant-saving Mark as Completed); replaced 'Job Sheet Sync' summary KPI card with 'Uncollected Dues' card; moved Auto Sync option into the header 3-dot dropdown menu.
  - Booking Details Modal: Expanded modal width to 5xl and replaced multi-row wrap with single horizontal 4-card row (grid-cols-4) eliminating vertical scrolling; moved Client ID under username; placed 'Monthly Contract' tag in Client ID's former spot; replaced 'Shift' button with 'Edit' button opening the New Booking form in full edit mode with live updates; preserved single-row flex-nowrap header actions.
  - New Booking Modal: Relocated booking frequency selector to 'Staff & Schedule' section with simple 'Frequency' label; removed 'Service Type' selector; integrated full initialBooking prefill and edit-mode submission.
  - Excel Job Sheet: Removed badges from Cash/Online/Monthly/Pending payment modes; added support for custom payment mode values with quick "+ Add" input; added individual delete button (Trash2) next to every option with local persistence.

- feat(time): Standardized VPS-style 12-hour AM/PM Time12hPicker project-wide across New Booking, Add Job Entry, Edit Job, Spreadsheet Edit Modal, Bookings Edit Modal, Clients & Monthly Clients Reschedule Modals, and Payment Processing (R-JOB-01, R-OT-01):
  - 12h format display with Clock icon and ChevronDown.
  - Dedicated AM / PM toggle pill button with soft emerald active badge.
  - Floating popover with search & custom time input, plus 30-min suggestions (07:00 AM to 11:00 PM).
  - Robust time parsing supporting both 12-hour and 24-hour inputs.

- feat(excel-studio, daily-job-sheet, bookings): UX & Timing Polish:
  - Add Job Entry & New Booking: Replaced AM/PM time pickers with pure numerical time dropdowns (9:00 to 22:00 at 30-min intervals) in Timing and Duty sections.
  - Excel Job Sheet: Header date display shows a single date input when 'Today' or 'Yesterday' is active; From-To range input is reserved exclusively for custom/multi-day ranges.
  - Excel Job Sheet: Moved Undo and Redo icons from the header and aligned them directly in the sub-bar alongside Columns and Reset Column controls.
  - Excel Job Sheet: Made 'Received' column references clickable buttons that jump directly to the primary lead cleaner row and open a dedicated Team Details modal; cleaners of the same team are sequenced vertically adjacent (upar neechey sequence mein).
  - Bookings: Card 'Complete' button styled with light green background as 'Mark as Completed' turning solid green 'Completed' on action; removed 'AED' currency prefix from card charges.

- fix(build): type errors from the multi-screen batch fixed so `npm run check` (and the deploy Check step) passes — Modal gets a `footer` (the Save / Cancel buttons of Edit Job and New Booking were not shown) and a `5xl` size; Bookings bell delete prop name; busy-cleaner tags in New Booking; `addDailyJob` accepts a chosen id
- feat(jobs): a cleaner can no longer be given two jobs at the same time — Add Job Entry (live red warning + refused), Edit Job, Daily Job Sheet inline edits and the Excel Job Sheet (cell, time dropdown, row popup, Save) show the clash and refuse the entry; Daily Job Sheet Add Job keeps the date chosen in the form (R-JOB-01)
- feat(clients): a new address on Add Job Entry / Excel Job Sheet / row edit opens the Clients screen's "Add New Client" popup with the address filled in; the Add Job form is not submitted with it (R-DATA-11)
- fix(excel-studio): cell dropdowns stayed invisible when opened (the position was computed before the cell was known) — the dropdown now finds its cell itself and shows on the first click (UX-35)
- feat(excel-studio): Address, Location, Material, Mode, Start time and End time cells open their dropdown with one click (or double-click), also when empty, and show a small ▾; Material dropdown offers Yes, No, Sofa, custom values already used on the sheet and a custom box (UX-35)
- fix(excel-studio): Save — a job with several cleaners is saved as one job again: editing the lead cleaner's row no longer removes the other cleaners, editing another cleaner's row no longer adds a duplicate job each save, and no false "changed on another screen" prompt (R-SYNC-08); the button returns to "Saved" when nothing is left to write
- fix(excel-studio): Address dropdown opens with every client (current address highlighted and scrolled to) like Add Job Entry, filters when typing; a new address opens Add New Client and, once registered, the row keeps the client's address and area (they were overwritten when the popup closed); picking a client sets its area. Area, Material and Time lists also open in full. Time list 9:00 AM – 11:00 PM (UX-35)
- feat(bookings, daily-job-sheet, settings): Multi-screen UX refinement batch:
  - Bookings: Replaced 'Complete' with dynamic 'Mark as Completed' button (light green -> solid green 'Completed'), removed 'AED' from card charges, replaced Details button with direct card interactions, added Delete action in header, standardized Add New Booking layout with Daily Job Sheet, added Row Color Theme option, and integrated 12h AM/PM time dropdowns.
  - Daily Job Sheet: Professional header theme on Jobs widget, proactive cleaner time-overlap error prevention, removed '(AED)' bracket labels from charges and received fields, unified Add Job & Edit Job modals, and recent jobs display order.
  - Attendance: Added header KPI summary cards displaying Total Cleaners, Active, Present, and Absent stats (R-ATT-01..03).
  - Settings & Backend: Removed Appearance tab, expanded Backup & Disaster Recovery Center to 100% full width, and resolved Supabase service role key auto-loading in webhookServer for user management (R-SEC-01).

- fix(excel-studio): Excel Job Sheet dropdowns (Address, Area, Start / End Time, Material, Mode) no longer flicker when the mouse moves over them — they open in a portal above the grid, next to the cell, and flip up near the bottom of the screen; all six share the Address design (header, search, green custom row, list with check) via `ExcelCellPopover` (UX-35)
- fix(sync): Bookings ↔ Daily Job Sheet — editing a job-sheet card no longer wipes the collected amount (BJ-01); booking edits are saved to the job row in the database (BJ-02); booking payments land on the job row (BJ-03); monthly visits only after load and once per day (BJ-04); one completion path with linked invoice + next visit with its own row (BJ-05…07); cancel/delete/re-import keep the link or a copy (BJ-08…10); link by booking_id (BJ-11); card buttons work (BJ-12); material/notes/area sync (BJ-14…15); bookings do not rewrite monthly contracts (BJ-16); BK badge + delete confirm on the job sheet (BJ-17); Dubai due date (BJ-18) — R-SYNC-06
- fix(cloud): website leads saved in Supabase (webhook + backfill + outbox); browser-only rows uploaded once per device; missing columns no longer block rows (migration `2026-11-01_cloud_columns.sql` adds `daily_jobs.team_name`); service types, review requests, GHL settings, Drive webhook URL cloud-synced; settings / profile saves report failures — R-SYNC-07

- docs(audit): Bookings ↔ Daily Job Sheet audit — sync not complete: editing a job-sheet card on Bookings wipes received (BJ-01), booking edits not saved to the database for the job row (BJ-02), booking payments not on the job sheet (BJ-03), duplicate monthly visits (BJ-04) and BJ-05…18; suggestions BJS-01…16

- chore(quality): technical-audit fixes — booking popup hooks crash (TA-06); tests in the repo + `npm run check`, deploy blocked on lint errors / type errors / failing tests (TA-07, TA-08); pinned VPS host key (TA-17); dead services removed (TA-05, TA-22); app error log on the VPS shown in Data health (TA-24); full-storage warning (TA-21); first load 1.4 → 0.68 MB (TA-13); security headers on the HTML + HSTS + CSP report-only (TA-16); GHL key on the server (TA-18); shared zod rules + import row checks (TA-19); database CHECK rules migration (TA-20); one `cleanNum` (TA-04)

- docs(audit): technical audit — architecture, code quality, scalability, security, validation, error handling (TA-01…TA-24); includes a hooks crash in the booking detail popup (TA-06) and the recommendation to keep Drivers inside the CRM

- feat(drivers): Drivers module — route plan from the Daily Job Sheet with colour-coded site cards (cleaners, drop / pick-up), manual or auto-assign by area, Google Maps route per driver; driver shifts and duty sheets without OT / Material sent by WhatsApp, print or Excel with "changed since sent"; My Duties phone view with live location sharing; Drivers → Live location (R-DRV-01…03). Migration `2026-10-31_driver_locations.sql`
- feat(time): Standardized 12-hour AM/PM time format project-wide across Bookings, Daily Job Sheet, Excel Studio, Monthly Clients, Client Profiles, and Invoices. Implemented `parseTimeToMinutes`, `formatTime12h`, and `formatTime24h` with bulletproof handling for all time strings, dates, and fraction values, guaranteeing seamless calculation of duty hours and overtime (R-OT-01). Enhanced all pop-up modals (`NewBookingModal`, `AddJobModal`, `EditJobModal`, `AddMonthlyClientModalForm`, `SpreadsheetEditModal`) with formatted 12-hour time preview badges and 12-hour time options datalists.
- feat(excel-studio): Redesigned Excel Job Sheet Studio (`JobSheetSpreadsheet.tsx`) header with a consolidated 3-dot dropdown menu containing 'Save to Google Drive' and 'Monthly Sync', added a dedicated 'Add Job' button to easily insert jobs, and integrated quick filter chips ('ALL', 'Monthly', 'Cash', 'Online', 'Pending') with real-time count badges.
- feat(excel-studio): Removed auto-sum/formula lines from Cashier columns, formula bar quick buttons, and table footer. Updated 'Add Row' functionality (`insertRowAt`) so top/bottom row insertion adds completely empty rows without copying client names, start times, or end times.
- feat(excel-studio): Cleaned and reorganized spreadsheet columns: removed 'Row' (#) and 'Date' columns, renamed 'Client & Address' to 'Client', 'Location/Area' to 'Area', 'Payment Mode' to 'Mode', removed '(AED)' from financial columns, removed 'Service' column, repositioned 'Material' immediately before 'Charges', and added a dedicated 'Notes' column.
- feat(excel-studio): Added 'Edit' button alongside 'Delete' in every row's Action column, opening a professional `SpreadsheetEditModal` with dynamic dropdowns for Client (with search and auto-fill), Address/Area, and Staff Name, plus 12-hour AM/PM time selection and responsive duty/overtime calculation.

- fix(security): /api calls carry the signed-in user's token; the VPS refuses unsigned requests once user management is configured, the Fluent Forms webhook takes FLUENT_WEBHOOK_SECRET, CORS only for the dashboard addresses (SEC-04); print windows escape user text (SEC-07)
- feat(data): duplicate client / employee checks, UAE phone and Emirates ID format (R-DATA-09, VAL-01…04); before-delete copies with restore (R-DATA-10, BAK-5); Settings → Data health (AUD-67); Analytics recurring revenue and collected fixed (AUD-64)

- feat(security): real accounts — Supabase Auth login with Login IDs (SW-0001 …), no sign-up, admin creates users / resets passwords / disables accounts (server endpoint holds the service key), roles Admin / Manager / Employee with per-screen permissions and a "No access" guard; row-level security so the database only answers signed-in users; old browser-only login and the password inside the JavaScript removed; backup endpoint path traversal fixed (R-SEC-01, R-SEC-03, SEC-01/02/03/05, DEC-014). New migration `2026-10-30_initial_schema_and_auth.sql` creates every table — the live project had none (AUD-69). Setup: `docs/setup-auth.md`

## 2026-10-30 (Deploy to Production VPS)
- feat(daily-job-sheet): Redesigned 'Add Job' popup with clean, professional theme matching Add New Booking & Add New Agency — added conditional 'Team Name' field auto-generated on 2+ cleaner selection with click-to-edit, responsive bidirectional timing calculations across Start Time, End Time, Duty Hours, and OT hours (R-OT-01), light circular Row Color presets, removed Service field, and added Material dropdown with custom input support.
- feat(daily-job-sheet): Multi-cleaner jobs show Received amount and payment details exclusively under the primary cleaner, with other staff displaying Team Reference badge ('Team A' / 'Team B') to eliminate duplicate figures and ensure ledger accuracy.
- feat(daily-job-sheet): Resolved job widget scroll issues with precision container scrolling on #main-content-scroll and breathing margins.
- feat(daily-job-sheet): Removed 'Closed Day' strip and 'Monthly Client Auto Sync' notification bar from beneath summary cards, consolidating Monthly Client Sync and Day Close/Reopen into the top header 3-dot dropdown menu.

- **Overtime Policy (R-OT-01, DEC-013):** Documented and implemented two-scenario Overtime policy:
  - Scenario 1: Work performed after 8:00 PM (20:00) is strictly Overtime, regardless of basic hours worked.
  - Scenario 2: Work performed before 8:00 PM exceeding standard 8 basic hours counts as Overtime.
  - Updated `rules.md`, `AGENTS.md`, `docs/decisions.md`, `src/components/dailyJobSheet/jobSheetUtils.ts` (`calcOTHours`), and `src/lib/clientDataSync.ts` (`calcJobOTHours`).


- fix(bookings, clients): Fixed client redirection from Booking Details popup (`BookingDetailModal`) — clicking Client ID or Client Name now redirects directly to that specific client's profile (`/clients/:id`), eliminating fallback to the generic clients table (`/clients`). Enhanced `ClientProfile.tsx` resolution to match client by ID, code, name, phone, or dynamically synthesize client history from Bookings/DailyJobs.
- feat(bookings): Added synchronized 'Invoice' and 'Payment' quick action buttons to every booking card across Card Grid, Table View, Kanban Board, and Booking Details popup.
- feat(bookings): Created `BookingInvoiceModal` (`BookingInvoiceModal.tsx`) matching CRM Slate-Teal & Emerald theme — supports instant Tax Invoice preview, PDF printing via shared `invoicePrint.ts`, payment status tracking, and 1-click tax invoice generation with UAE VAT (5% / 0% Exempt).
- feat(payments): Enhanced `RecordPaymentModal` (`RecordPaymentModal.tsx`) with booking context header and two-way collection sync — recording payment directly updates booking `received_amount`, marks status completed on full settlement, and syncs to Daily Job Sheet.

- feat(sync, bookings): Implemented bidirectional sync from Daily Job Sheet to regular Bookings — edits to one-time job shifts (`updateDailyJob`) automatically update the linked booking's date, start/end time, duty duration, cleaner assignments, address, charges, and completion status while strictly preserving Monthly Clients schedule isolation (`R-SCHED-01..03`, `R-SYNC-03`).
- feat(bookings): Added live Daily Job Sheet synchronization indicator (`Sheet Linked ✓` vs `+ Push to Sheet`) across Card Grid, Kanban Board, Table View, and Booking Details Modal with 1-click `pushBookingToDailyJob` capability.
- feat(bookings): Added partial payment & collection tracking on Bookings screen — shows live received amounts and pending dues (`Paid: AED X · Due: AED Y`), dedicated 'Collection & Sync' Table View column, and live collections widget in Booking Details Modal.
- feat(settings): Added centralized 'Backup' tab to Settings (`Settings.tsx`) consolidating all database protection features — Instant Multi-Sheet Excel export (7 sheets), technical JSON dump, safe non-destructive JSON restore/import engine with record counts validation and progress feedback, direct Google Drive OAuth upload, and automated n8n/Webhook pipeline configuration with test ping. Includes comprehensive "How-To & Backup Help Guide" modal detailing storage locations (Supabase Cloud, VPS `/data/backups/`, Google Drive, Local PC) and recovery steps, plus a streamlined Data & Storage quick widget in the right sidebar.
- feat(bookings): Softened font weight and lightened text color for Scheduled Date, Start Time, and End Time fields in Schedule & Timing section of Add New Booking popup (`NewBookingModal.tsx`) from heavy bold to balanced medium (`font-medium text-slate-600`) for enhanced visual hierarchy and clarity.
- feat(bookings): Refined Duty Hours and Material toggle in Add New Booking popup (`NewBookingModal.tsx`) — renamed label to 'Duty Hours' with subtle 'hrs' suffix, limited Material strictly to 'Yes' (first) and 'No' (second), removed '(required)' label, and removed redundant bottom shift, time, duty, and material summary strip.

- feat(daily-job-sheet): Removed trapped inner vertical scrollbar from data table and A-Z rail; displayed page entries naturally using responsive flow and View All pagination (UX-27)
- feat(daily-job-sheet): Multi-cleaner assignment rows split into individual cleaner entries — each employee's shifts grouped together chronologically with dedicated staff-specific color palettes and proportional revenue split (R-ATT-04, R-PAY-01)
- feat(daily-job-sheet): Made 'Received' column directly editable inline via double-click and pencil icon across all job types (Cash, Monthly, Online, Pending)
- feat(excel-studio): Excel Job Sheet Studio Flat Grid Mode default color scheme switched to light pastel palettes; redesigned right-click context menu color picker to clean light theme with circular swatches and removed color text labels
- feat(daily-job-sheet): Redesigned 'Edit Job Entry' popup (EditJobModal) into an executive 3-card layout matching Add New Booking & Add New Agency with prominent fields for staff, address, charges, and received amount

## 2026-10-29 (Deploy to Production VPS)

- feat(bookings): Enhanced Table View with full column customization — interactive "Customize Columns" popover checklist with localStorage persistence, drag-and-drop column reordering across table headers, dedicated "Duty Hours" reorderable column, and a Page Summary Duty Hours footer row. Added toggles for crew size, payment method, and special notes.
- fix(bookings): Resolved Monthly Clients count vs cards discrepancy (6 vs 5 conflict) by strictly calculating in-scope monthly shifts (`isMonthlyBooking`) and synchronizing recurring monthly contract shifts into the active booking view.
- feat(bookings): Added direct navigation to Client Profile (`/clients/:id`) from the Booking Details popup header by making the client name an interactive link with an external link indicator.

- docs(backlog): Created PENDING.md documenting the 4-tier corner radii & spacing design system hierarchy with Expenses.tsx as the gold-standard specimen page and checklist for future screen rollout (CLR-04)

- feat(design): De-escalated harsh red alarms across Expenses and PendingPayments — replaced aggressive red-600 buttons, pills, inputs, and borders with calm executive Slate & Teal accents; switched Pending Dues to warm amber for regular receivables and reserved soft rose tones strictly for priority dues (CLR-03)

- feat(design): Unified hero banners to CRM signature Dark Slate-Teal palette across ClientProfile and Attendance — replaced divergent royal indigo and flat green gradients with gradient-card / dark slate-teal (from-[#021f24] via-[#062c32] to-[#02181b]) with ambient emerald/teal glow and synchronized accent icons (CLR-01, CLR-02)

- feat(analytics): Purged all hardcoded dummy data from BusinessAnalytics; wired live metrics from dailyJobs, dailyExpenses, clients, and employees (revenue & profit trends, service share, cleaner performance, real MRR, dynamic insights, Excel report export); removed 'Coming Soon' badge from Overview in Sidebar

- feat(bookings): Updated Board View (Kanban) to display strictly first 3 entries vertically per status column with "View All" button; unified status color hierarchy consistency across "Today", "All Time", and all date presets with status normalization and descending date sorting
- feat(bookings): Redesigned Booking Details popup (BookingDetailModal) into an executive layout — moved Edit and Delete buttons to top header next to Close (X) button, added Save button in header, restricted bottom footer strictly to workflow status transitions
- feat(bookings): Updated booking card background colors for "All Statuses" mode — Pending: light orange, Scheduled: light green, Live: light blue, Completed: light grey, Cancelled: light red across Card Grid and Kanban views

- feat(bookings): Removed status toggle from Add Booking popup header; removed "Balcony wash needed" tag from Access & Special Notes to display all quick adds on a single clean row

- feat(daily-job-sheet): Repositioned "LIVE Daily Schedule" tag as a superscript badge directly next to letter "t" in "Daily Job Sheet"; moved "Monthly Sync" button from main header toolbar into the three-dot menu right below "Print Sheet" with live status indicator

- feat(daily-job-sheet): Automated recurring monthly clients generation and background sync system — automatically populates Daily Job Sheet on app startup and single date loads, robust day-matching across 7-day schedules/service_days, interactive Monthly Clients Auto-Sync Bar with status badges & 1-click missing shift generation, multi-day batch generator (Today, Tomorrow, Next 7 Days) with Schedule Isolation protection (R-SCHED-01..03, R-SYNC-03)

- feat(bookings): Add Booking pop-up complete redesign (dynamic client sync, typing + selection address picker, custom service types CRUD, light background widgets); view mode buttons borderless card style; Board view 5-entry limit + View All toggle; professional calendar tab; active header notifications bell (view, read, read all, delete); default date filter set to Today; status-based card backgrounds for All Statuses (Scheduled: light green, Pending: light orange, Live: slightly dark green, Completed: professional neutral); Monthly Clients card + expandable metrics row; full Daily Job Sheet sync for recurring monthly bookings (R-SYNC-03, R-SCHED-01..03)
- docs(audit): full CRM audit — security SEC-01…09 (browser-only login, password in bundle, open database policies, unauthenticated VPS endpoints, backup path traversal), sync AUD-59…68 (leads in two stores, fake Analytics data), backup BAK-1…7 + recovery runbook, validation VAL-01…12, screens UX-41…60, colours CLR-01…08
- feat(daily-job-sheet): Phases 2 + 3 — shared cleaner roster (no hard-coded names), one bogus-row rule, pending/collected use the Pending/Overview rules, day delete through the outbox, toasts instead of alerts (AUD-51…57); import preview with editable date and duplicates (UX-28); row checks + "Checks" filter (UX-27); close / reopen day (UX-26, R-DATA-08); "+ Assign job" on available cleaners (UX-30); Excel mode: arrows/Tab/Enter/F2/Delete keys, Ctrl+V block paste, Ctrl+C, Ctrl+D fill-down, autocomplete, column presets, 300-row paging, row history from audit_log (UX-32, 35, 36, 38, 39, 40); import parsing moved to `src/lib/jobSheetImport.ts` (UX-31, partly)
- fix(dates): business dates follow Dubai time app-wide — `todayDubai`/`monthDubai` replace 84 UTC "today" calls; Excel import no longer saves dates one day early, `dd/mm/yyyy` text read correctly (R-DATA-06, AUD-46, AUD-47, DEC-012)
- fix(daily-job-sheet): Phase 1 — no more auto-delete of total/stub rows (hidden + "Show to review" notice); Excel mode keeps unsaved edits through background changes, saves only changed rows with an "N changes" counter and conflict prompt, keeps a local draft and warns before closing the tab; new rows start empty instead of a fake AED 200 cash job; `is_overtime` saved on edits (R-DATA-07, AUD-44, AUD-48, AUD-49, AUD-50, AUD-58, UX-33, UX-34). AUD-45 kept by owner decision.
- docs(audit): Daily Job Sheet & Excel mode audit — AUD-44…AUD-58 (auto-purge deletes rows, one-click Delete All, Excel unsaved edits lost, Save All deletes unseen jobs, import dates one day early in Dubai, fake new-row values) and UX-25…UX-40
- feat(daily-job-sheet): "Pending Received" and "Advance" pop-ups share one client picker fed by the Clients screen list (live clients, real balances, no demo data); Cancel / Add moved to the header (D-09); Advance redesigned like Pending Received with notes/remarks shown in the advance list
- feat(ux): UI/UX recommendations UX-01…UX-24 — receivables module (tabs, dues by client with ageing + WhatsApp reminder, bulk collection, cash book), invoice part payments + job linking + statement-to-invoice (R-FIN-06), toasts/confirm dialog, paging, shared date presets, KPI source tooltips, expense budgets + receipts + full profit card, inventory edit/usage/purchase orders/suppliers, attendance monthly calendar + export, client ledger invoices, lead pipeline board + response time + duplicates (DEC-011, D-11…D-14); migration adds invoices.job_ids / amount_paid and daily_expenses.receipt_url
- refactor(quality): Phase 4 React 19 cleanup, strict typing & subcomponent optimization — resolved all React 19 hook warnings (cascading renders, impure render functions, setState-in-effect) across `NotificationCenter.tsx`, `AgencyDashboard.tsx`, `CRMAIBotModal.tsx`, `Agencies.tsx`, and `DailyJobModals.tsx`. Converted `jobSheetUtils.tsx` into pure TypeScript utility `jobSheetUtils.ts` with typed inputs (`unknown`) and extracted UI components into `JobSheetBadges.tsx`, resolving Fast Refresh export warnings. Verified 0 errors across all `src/components/dailyJobSheet/*` components and validated full project production build (`tsc -b && vite build`) passing in 1.69s.
- refactor(dailyJobSheet, dataContext): Phase 3 modularization & data engine cleanup — modularized mammoth DailyJobSheet (4,411 lines down to 3,798 lines, -613 lines) into 3 dedicated subcomponents in `src/components/dailyJobSheet/`: `JobSheetKPIs.tsx` (2-row executive clickable financial metrics), `ExpensesAndDriversPanel.tsx` (Expenses log & driver collections summary), and `ReconciliationWidgets.tsx` (Today Pending, Pending Received, and Advance reconciliation tables). Cleaned up `DataContext.tsx` by isolating `defaultAgencies` into `src/lib/defaultAgencies.ts`, removing `any` types in supabase query timeout guards, and resolving `react-refresh` export warnings.
- refactor(employees): Phase 2 modularization — created unified reusable `EmployeeFormModal.tsx` and modular `EmployeeWidgets.tsx`. Slashed duplicate code in `Employees.tsx` from 3,276 lines down to 1,940 lines (-1,336 lines, bundle dropped from 113.5 kB to 72.8 kB) and in `EmployeeProfile.tsx` from 1,744 lines down to 1,141 lines (-603 lines, bundle dropped from 70.6 kB to 47.1 kB). Both Add Employee and Edit Employee modals now share one consolidated form with dynamic driver/cleaner fields, document uploads, and live client assignments.
- refactor(core): Phase 1 audit improvements — purged dead file `DailyJobSheet.backup.tsx`, pruned unused dependencies (`leaflet`, `react-leaflet`, `@tanstack/react-query`), updated package name to `safaeewala-dashboard`, resolved K-02 by standardizing Agency payouts to `MONTHLY_WORK_HOURS` (200h, R-EMP-02, R-PAY-01), and resolved React 19 `react-hooks/purity` warning in `NotificationContext.tsx` with a reactive 60s timer
- fix: remaining audit items — one monthly-salary rule, no per-hour or invented pay values (AUD-06/09, R-EMP-02); agency delete also deletes its staff with a warning (R-AGN-06, DEC-010); deleted clients/staff not re-created from history (AUD-17, R-DATA-05); no seed/demo data (AUD-12); no invented duty hours (AUD-11); safer client matching (AUD-16); one bogus-row rule (AUD-21); client totals from job sheet (AUD-22); payment method on receipts (AUD-29); attendance keyed by employee id (AUD-38)
- fix(finance): finance & operations audit fixes — monthly visits out of receivables (AUD-24), recoveries in payment history/totals (AUD-27/28), expenses revenue = collected (AUD-30/31), real inventory receiving + delete (AUD-33), company details & TRN from Settings (AUD-34), sequential SAF-YYYY-NNNN invoice numbers (AUD-36), monthly statements from job-sheet visits (AUD-37), period-matched monthly balances (AUD-39), no fake KPI deltas (AUD-32/35), no name-based lead hiding (AUD-41), lead save retry + store merge (AUD-42), settings saves no longer wipe other settings (AUD-43), pending notes/staff split/overpay warning (AUD-25/26) — R-FIN-01/04/05, R-DATA-04
- docs(audit): finance & operations screens audit — Pending, Payments, Expenses, Inventory, Invoices, Monthly Invoices, Attendance, Monthly Clients, Fluent Forms (AUD-24…AUD-42, UX-01…UX-24)
- fix(staff, clients, agencies): audit phase 3 — no hard-coded roster, job-sheet-only staff inactive after 60 days (AUD-08), attendance splits shared shifts (AUD-18, R-ATT-04), Live Cleaners no double booking/job (AUD-19), one agency-staff rule everywhere (AUD-14), agency rename keeps staff (AUD-13), booking rows linked to clients by id (AUD-15)
- fix(sync): audit phase 2 — Supabase write outbox with retry + banner (AUD-03, AUD-20), cloud copy of browser-only payments/attendance in `app_state` (AUD-02), agencies merged from both stores and saved per agency (AUD-04, K-03), loader pages past the 1000-row limit (AUD-23); migration `supabase/migrations/2026-10-27_phase2_sync.sql` (R-SYNC-05)
- fix(reports, overview, agencies, employees): audit phase 1 — revenue counted once (AUD-01, AUD-05, R-FIN-03), agency revenue split for shared shifts (AUD-07, R-PAY-01), no invented AED 2500 salary (AUD-10, R-EMP-02)
- docs(audit): data synchronisation & dummy-data audit — 22 findings AUD-01…AUD-22 with locations and fix order
- feat(clients): Redesigned Add New Client / Edit Client Profile modal (`ClientModalForm.tsx`) with 3 organized, professional cards: Primary Contact & Identity, Address & Crew Assignment, and Opening Financial Balances (Advance, ADJ, Pending) & Access Notes
- feat(employees): Updated Live Status column label from "On Duty Today" to "On Duty" across employee status badges (`Employees.tsx`)
- feat(employees): Replaced row-hiding eye icon with Column Visibility Management dropdown menu with localStorage persistence, letting users show/hide specific table columns (Employee, Role, Status, Duty Hours, OT, Total Hours, Shifts, Salary, Visa, Actions)
- feat(employees): Updated Employee Profile hero header to CRM's signature Dark Slate-Teal palette (`#021f24` → `#062c32`) with teal/emerald glows, borders, and accents for unified visual cohesion (`EmployeeProfile.tsx`)
- feat(clients): Updated Client Profile hero header to dark Midnight Navy / Sapphire Indigo palette (`#070d1e` → `#0c1633`), making it distinct from Employee Profile; redesigned the 6 summary cards with high-contrast dark glassmorphism and glowing accents (Total Charges, Received, Overtime, Pending, Advance, ADJ) (`ClientProfile.tsx`)
- feat(payments, clients): Added `RecordPaymentModal` with dynamic client autocomplete/suggestions and quick chips; added "Add Payment" action button right after "Add Client" in Clients screen hero; added "Record Payment" button to Client Profile top header and financial ledger with instant live sync across Payment Processing and Client Profile (R-SYNC-01, R-DATA-03)
- feat(employees, agencies): Document upload fields modernized to pure image upload (thumbnail preview, replace, remove, full preview modal) with issue/expiry dates; removed text input fields for Emirates ID, Passport, Visa, Work Permit, Medical Insurance, Trade License, Tax/NOC & Agreements; unified Edit Employee and Edit Agency popups to exact same structures as Add Employee and Add Agency (R-EMP-04, R-AGN-05)
- feat(clients): Single row of 6 summary cards with pulsing expander button for secondary metrics; added Pending Balances & Client Distribution widgets; expanded Sorted By options (highest due, bookings, Z-A, service dates)
- feat(employees): Employee Profile dark hero header integrating staff name and health status; Edit Profile popup unified to Add Employee max-w-6xl 3-row layout (D-09, R-EMP-03)
- docs: documentation structure — README, rules registry with IDs, design, architecture, prod, data model, workflow, decision log (DEC-008) — `ad70b43`
- feat(agencies, employees): Agency popup agreement / workmen compensation / bank rows, Live Cleaners modal, Edit Employee popups in tinted layout (Antigravity) — `8c9dfb8`
- feat(agencies): Agencies bell shows document, contract, payout and staff-compliance alerts (R-AGN-04) — `a0d99b9`
- fix(bookings): job sheet gets cleaner names instead of employee IDs; agency payouts now count booking shifts (R-SYNC-02) — `28d15cd`
- feat(employees): tinted document cards in Add Employee popup, insurance/NOC row, live-only client lists (D-05, R-DATA-03) — `3f83c01`
- feat(employees): Health Score, profile photo upload, row show/hide, Import/Export labels, Employees bell alerts (R-EMP-03, R-EMP-04) — `ac0e0c7`
- feat(employees): Add Employee popup redesigned like Add Agency; agency filter from Agencies list only (R-AGN-03) — `1bf35cb`
- feat(agencies): Add New Agency popup reorganised with identity, insurance and bank fields — `5a00dc6`
- feat(employees): employee document fields and uploads; "Ducting" role renamed "Technical" (R-EMP-01) — `51e65ca`

## 2026-10-28

- feat(bookings): Redesigned Add Booking popup matching Add Agency reference layout with 2-row compact card design (UX-15, D-05)
  - **Reference Layout & Color Scheme**: Transformed the modal into an expansive `max-w-6xl` dialog matching the "Add New Agency" reference styling. The header includes the status toggle (`Confirmed` vs `Pending`), clean `Cancel` button, primary `Save Booking` button in teal with `Check` icon, and the close `X` icon.
  - **Removed Redundant Rows**: Completely removed the "Quick Service Picks" chips row, "+ Enter custom service name" free-text mode, and "Fast Start Time Picks" chip row per user instructions.
  - **Compact 2-Row Layout (Zero Scrolling)**: Replaced tall vertical tabs with a high-density, horizontal card layout:
    - Row 1 (3-column grid): Client Information (autocomplete + phone + address), Service & Frequency (16 standard clean services select + frequency + total amount), and Schedule & Timing (date, start/end time, duration, and synchronized shift pill).
    - Row 2 (2-column grid): Crew Assignment (cleaner search picker + assigned chips) and Special Instructions & Access Notes (clean textarea for gate codes, keys, and special preferences).
- feat(bookings): Two-row toolbar layout, 6 informative KPI cards, and brand teal border refinements (UX-15, D-05)
  - **Two-Row Toolbar Architecture**: Split the bookings controls into 2 clean, purposeful rows. Top Row houses Search, All Time (Date Preset dropdown), View Mode Toggles (`Cards`, `Table`, `Board`, `Calendar`), All Services dropdown, and a 3-dot kebab menu (`MoreVertical`) containing Excel Import, Excel Export, and Reset Filters. Bottom Row is exclusively dedicated to "All Statuses" segmented pills (`All Statuses`, `Pending`, `Scheduled`, `Live Now`, `Completed`, `Cancelled`) with live counts and active filter badges.
  - **6 Informative KPI Executive Cards**: Expanded the KPI cards from 4 to 6 informative metric cards: Total Bookings (with workload hours and scheduled revenue), Pending Confirmation (action-needed indicator), Scheduled Upcoming (% of workload), Live Now (pulsing live cleaners badge), Completed & Billed (total billed revenue & completion %), and Crew Assigned (assigned vs unassigned warning badge, 1-click filterable to unassigned jobs).
  - **Brand Color Scheme & Grey Border Purge**: Eliminated dull grey borders (`border-slate-200`, `border-[#E4E8EC]`) across all booking widgets, replacing them with the CRM's signature deep teal/emerald palette (`border-teal-100/90`, `border-teal-200/80`, `bg-teal-50/20`, `bg-teal-50/40`) across KPI cards, toolbar, Cards Grid, Table list view, Week Calendar, Kanban board, and Pagination controls.
- feat(bookings): Redesigned Add Booking popup with top action buttons, dynamic time & duration presets, and service type combobox (UX-15, D-05)
  - **Top Action Buttons Placement**: Moved "Create Booking" and "Cancel" action buttons directly to the popup header, immediately preceding the `X` (close/cross) icon for 1-click access without scrolling down long forms. Complementary action buttons also maintained at form bottom.
  - **Service Types Dropdown & Custom Entry**: Added combobox suggestions featuring 16 comprehensive, industry-relevant cleaning services (Deep Cleaning, Move-in/out, Post-Construction, Office/Commercial, Sofa & Upholstery, Carpet Deep Clean, Window & Glass, Kitchen Deep Clean, Bathroom Sanitization, AC Duct Cleaning, etc.) with clickable quick-pick chips for popular services, plus seamless "+ Enter custom service name" free-text mode.
  - **Dynamic Start Time & Duration Presets**: Added clickable fast-entry chips for Start Time (`08:00 AM` through `05:00 PM`) and Duration (`2h`, `3h`, `4h`, `5h`, `6h`, `8h`) with instant 2-way automatic synchronization between Start Time, Duration, and End Time, plus live summary visual pill.
  - **Modular Architecture**: Consolidated form logic into reusable component `src/components/bookings/NewBookingModal.tsx`, eliminating duplicate form implementations across both `Bookings.tsx` and `Overview.tsx` (-400 lines of duplicate code) with built-in client autocomplete, phone auto-fill, and cleaner assignment.
- feat(bookings): Bookings page audit, executive card redesign, unified single-row filter toolbar with date dropdown, and multi-view table mode (R-DATA-03, UX-15)
  - **Comprehensive Audit & Data Sanitization**: Removed fake/invented KPI deltas (`+2`, `+5`, `+12%`, AUD-32/AUD-35) and replaced them with live percentage computations and actionable status badges. Enriched synthetic bookings generated from `dailyJobs` with real client phone numbers and IDs by joining with `clients`, enabling direct WhatsApp messaging and phone calling.
  - **Single-Row Unified Filter Toolbar**: Converted multi-row button date filters into a compact dropdown (`Today`, `Next 7 Days`, `Next 30 Days`, `Last 3 Months`, `Last 6 Months`, `Last 1 Year`, `All Dates`, `Custom Range...`). Combined Search, Date Filter, Status Filter (with live counts), Service Type filter, View Mode switcher (`Cards`, `Table`, `Board`, `Calendar`), and Excel Import/Export into one sleek, space-saving horizontal toolbar (saving ~150px of vertical height).
  - **Executive Card Design**: Upgraded booking cards with top accent status gradients (`in_progress` blue/cyan, `confirmed` emerald/teal, `pending` amber, `completed` slate), client initials avatar with curated palette, frequency/monthly badges, structured timing and address blocks, real assigned cleaner name chips (`👤 Maria Santos`), and direct call (`tel:`) and WhatsApp (`wa.me`) shortcuts.
  - **Multi-View Mode & Data Table**: Added a full-width **Table View** option (`TableIcon`) displaying Ref/Source, Client Contact, Service & Frequency, Date & Time, Assigned Cleaners, Service Address, Amount (AED), Status badges, and quick action buttons. Added client-side pagination (12 items for Cards, 20 items for Table) for instant response and smooth navigation.
- feat(agencies, employees): Agency audit, documents tab redesign & driver license types (R-AGN-05, R-EMP-04, R-DATA-03)
  - **Agency Profile License & Documents Redesign**: Current active documents now display at the top directly beneath the 4 compliance cards (Trade License, NOC, TRN, Contract Ref). Full Document History displays underneath in a clean, single-row layout with fixed column widths (`w-12` Version, `flex-1` Document Details, `w-48` Category, `w-32` Status, `w-40` Dates, `w-20` Actions). Category badges redesigned as color-coded icon pills and Status badges styled with aligned active/archived indicators, completely resolving alignment jitter.
  - **Agency Audit & Data Sanitization**: Removed hardcoded dummy TRN `100234567800001` and placeholder certificate dates across `AgencyDashboard.tsx`, `Agencies.tsx`, and `agencyCertificates.ts` (now displays actual registered TRN or 'TRN Not Registered'). Fixed Agency staff count metrics to exclude inactive employees from active capacity counts (AUD-12, R-DATA-03).
  - **Employee Driver License Options**: Updated `driving_license_type` select options in `EmployeeFormModal.tsx` to strictly include `Light Vehicle (Manual)`, `Light Vehicle (Automatic)`, and `Van`; removed obsolete heavy bus, truck, motorcycle, and forklift options.
  - **Employee Form Header & Cleanup**: Replaced `DollarSign` icon with `CreditCard` in the Employment & Salary header and removed the redundant "Standard hourly rate calculated at 200 hours/month" note from both Add New Employee and Edit Employee popups (D-05, R-EMP-04).
- fix(ci): Updated Supabase URL and anon key in GitHub Actions deploy workflow to point to active project (`razvvxpaiqvykeatlvjl.supabase.co`) resolving `TypeError: Failed to fetch` errors on VPS.
- feat(ui, sync): Added dismiss (`X`) close button to `SyncStatusBanner.tsx` with responsive layout and shadow styling, allowing users to dismiss cloud sync warning notifications at any time while keeping the manual Retry action accessible (AUD-20).
- fix(agencies, employees): Removed redundant duplicate document title labels above upload buttons across Add New Agency, Edit Agency (`Agencies.tsx`), Agency Profile (`AgencyDashboard.tsx`), Add Employee, and Edit Employee (`EmployeeFormModal.tsx`) popups; placed high-contrast `ATTACHED` status badges cleanly inside the card headers and passed clean, descriptive button labels (`buttonText`) to prevent duplication (R-EMP-04, R-AGN-05).
- feat(employees): Redesigned Add New Employee and Edit Employee Profile popups (`EmployeeFormModal.tsx`) with distinct light background color tints matching Add Agency modal — Emirates ID (Sky Blue), Passport (Purple), Residency Visa (Amber), and Work Permit (Emerald), plus Blue tint for UAE Driving License; added issue/expiry date consistency validation, tailored hover states, and pure React 19 state initialization (R-EMP-04, D-05, D-09)

## 2026-10-27

- fix: data consistency and calculation parity across employees and clients — `18036b2`
- fix: Parent Company name "Safaeewala" persists via backend — `b512a01`
- feat: Salary Payout & Advance system synced with the Daily Job Sheet (R-PAY-01, R-PAY-02) — `3ea25a6`
- feat: Safaeewala master agency widget, agency profile edit modal, licence & documents tab — `65c3723`, `6f95f1c`, `3eb3a58`, `c24eba5`

## 2026-10-23 → 2026-10-25

- feat: Employees screen redesign with prominent Duty & OT; login bypass on localhost (R-SEC-01) — `ac4b0df`
- feat: AI bot improvements — `a453a45`
- feat: Subscriptions merged into Monthly Clients; Daily Job Sheet cards — `58af1c0`
- perf: route-based code splitting — `7ee5613`
- feat: job sheet ↔ employees/clients sync; Fluent Forms leads module (R-SYNC-01) — `f3de790`

## 2026-06

- Daily Job Sheet OT auto-calculation and row highlights (R-OT-01); Monthly Clients / Invoices redesign; initial VPS deployment pipeline.
