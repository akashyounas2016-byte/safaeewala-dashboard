# Setting up the database and secure login (one time)

> For the owner. Do the steps in order. Steps 1–5 take about 20 minutes.
> Rule references: R-SEC-01, R-SEC-03, DEC-014.

## Why
The live Supabase project had **no tables**, so all CRM data was saved only inside each browser.
After these steps the data is saved in the cloud, every person signs in with their own Login ID,
and the database refuses anyone who is not signed in.

---

## Step 0 — Backup first (on every computer/phone that has real data)
1. Open the dashboard on that device (the same address you normally use).
2. **Settings → Backup → Download backup** (JSON). Keep the file.
3. Do **not** clear the browser's site data — unsaved changes wait there and upload by themselves later.

## Step 1 — Create the tables
1. supabase.com → your project → **SQL Editor** → **New query**.
2. Paste the whole file `supabase/migrations/2026-10-30_initial_schema_and_auth.sql` → **Run**.
3. You should see "Success. No rows returned".
   (Do not run `2026-10-27_phase2_sync.sql` — it is replaced by this file.)

## Step 2 — Turn off sign-up
1. Supabase → **Authentication → Sign In / Providers → Email**.
2. **Allow new users to sign up: OFF.**
3. **Confirm email: OFF** (users are created by the admin; no emails are sent).
4. Password requirements: minimum length **10**, require **lowercase, uppercase and digits**. Save.

## Step 3 — Create the first admin (you)
1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Email: `akashyounas2016@gmail.com` (the owner's own email — you sign in by typing this email).
   Password: a strong password only you know. Tick **Auto Confirm User**. Create.
3. SQL Editor → New query → paste and Run:
   ```sql
   insert into public.profiles (id, login_id, email, full_name, role, status)
   select id, email, email, 'Akash Younas', 'admin', 'active'
   from auth.users where email = 'akashyounas2016@gmail.com'
   on conflict (id) do update set role = 'admin', status = 'active';
   ```

## Step 4 — Give the server its key (never in the website code)
1. Supabase → **Project Settings → API Keys** → copy the **service_role** key
   (under "Legacy API keys"; or create a **Secret key**).
2. On the VPS, in `/var/www/safaeewala/`, create a file named `.env` with:
   ```
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<the key from step 1>
   FLUENT_WEBHOOK_SECRET=<a long random text you choose>
   # optional — only if you use the GoHighLevel API (TA-18)
   GHL_API_KEY=<GHL private integration token>
   GHL_LOCATION_ID=<GHL location id>
   ```
   This file stays only on the server. Never put this key in a `VITE_` variable, in git or in chat.
   (Antigravity or Claude can do this step with your permission — it touches the VPS.)
3. WordPress → Fluent Forms → each form → **Settings → Webhook**: add the secret to the request URL,
   e.g. `https://crm.srv1646539.hstgr.cloud/api/webhook/fluent-forms?secret=<same text>`.
   Once the secret is set on the server, website leads without it are refused (SEC-04).

## Step 5 — Deploy, then sign in
1. Deploy the new version (needs your permission; `git push origin main` deploys).
2. Open the dashboard → sign in with **akashyounas2016@gmail.com** and your password.
3. **Settings → Users → Add user** for each person:
   - pick the employee (optional) — name fills in, Login ID is suggested (SW-0001, SW-0002 …);
   - choose the role: **Admin**, **Manager** or **Employee**;
   - a strong password is generated — click **Create**, then **Copy** and give it to the person.
4. **Settings → Roles & Access** — tick which screens Manager and Employee may open → **Save**.

## Step 5b — Drivers (live location)
1. Supabase SQL Editor → run `supabase/migrations/2026-10-31_driver_locations.sql`.
2. Settings → Users → Add user for each driver, **link the driver's employee record**, role **Employee**
   (My Duties is allowed for Employee by default).
3. The driver opens the dashboard on the phone → My Duties → **Start shift — share my location**.

## Step 6 — Check the data arrived
1. On each device from Step 0, sign in once and leave the dashboard open for a minute — waiting
   changes upload by themselves.
2. If something is missing: **Settings → Backup → Restore** with the file from Step 0.

---

## Everyday use
| Need | Where |
|---|---|
| New staff member | Settings → Users → Add user |
| Forgot password | Settings → Users → key icon → new password → give it to them |
| Someone leaves | Settings → Users → power icon (disable) — they are signed out and cannot sign in |
| Change what a role can see | Settings → Roles & Access |

Rules built in: nobody can sign up; only an admin creates users and changes roles; the last admin
cannot be disabled or demoted; an admin cannot disable themselves; Employees cannot delete records
(the database blocks it); passwords need 10+ characters with upper case, lower case and a number.
