# Legion Workforce

Legion is an employee operations workspace for secure sign-in, time tracking, tasks, team announcements, leave and shift requests, and payslips. The app uses Supabase for authentication, Postgres data, and row-level security. It is configured as a Vite application for deployment on Vercel.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project

## Run locally

1. Install packages with `npm install`.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable (or legacy anon) key from **Project Settings → API**.
4. In Supabase **Authentication → URL Configuration**, add your local URL (for example `http://localhost:5173`) to the allowed redirect URLs.
5. Start the app with `npm run dev`.

For Windows PowerShell, make the environment file with `Copy-Item .env.example .env.local`, edit `.env.local`, and restart the development server.

The client uses only the Supabase publishable/anon key. Never put a `service_role` or secret key in a `VITE_` variable or browser code.

## Accounts and roles

To test the app, create an account from the sign-in screen with an email address you can access, then sign in. If email confirmation is enabled in Supabase, follow the confirmation link before signing in. Supabase Auth creates each new profile with the `employee` role.

This app currently uses Supabase email/password authentication; it is not connected to company SSO or an invite-only employee allowlist. Anyone able to sign up in the configured Supabase project can create an employee account. Before using it with real company data, decide who is authorized to create accounts and configure access accordingly.

To grant manager access, first confirm the person is authorized, then run this in the SQL Editor:

```sql
update public.employees
set role = 'manager'
where id = (
  select id from auth.users where email = 'manager@your-company.com'
);
```

Manager screens are a user-interface convenience, not an authorization boundary. Supabase row-level security policies enforce access to the underlying data. Clock events, leave submission, and approval decisions use database functions that validate the signed-in user and manager role.

## Features

- Supabase email/password sign-up, sign-in, sign-out, and password reset
- Employee dashboard for clock-in/out, assigned tasks, announcements, attendance history, and payslip downloads
- Task assignment, announcements, shifts, payslips, and approval workflows for managers
- Leave requests, shift-change requests, and a published shift schedule
- Realtime updates for announcements, tasks, and requests

Time records, schedules, and pay statements are company records. This project does not calculate payroll, taxes, overtime, or statutory leave entitlements. Add appropriate payroll, privacy, and employment-law review before production use.

## Deploy to Vercel

1. Push the project to your Git provider and import it into Vercel.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project environment settings for Preview and Production. Use a publishable/anon key only.
3. Deploy. `vercel.json` configures Vite's build output and client-side route fallback.
4. Add your deployed production URL and any preview URLs you use to Supabase's allowed redirect URLs.

Run `npm run build` to verify the production bundle.

## Deploy a CEO demo to Render

1. Push the project to GitHub, then create a new **Blueprint** in Render from that repository. Render will use [`render.yaml`](./render.yaml) to build and publish the Vite app.
2. Enter `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when Render asks for the Blueprint environment values. Use the project URL and publishable/anon key from Supabase **Project Settings → API**. Never use a database password or service-role/secret key.
3. In Supabase **Authentication → URL Configuration**, add the Render site URL (for example `https://legion-workforce.onrender.com`) to the allowed redirect URLs.
4. To test the live app, first run [`supabase/schema.sql`](./supabase/schema.sql), then create an account on the site using an email address you can access. The sample workspace preview has been removed; the app now requires Supabase authentication.

The local `.env.local` file is ignored by Git. Confirm it is not staged before pushing; only add the Supabase URL and publishable/anon key to Render's environment settings.
