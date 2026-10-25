# TechDev Workforce

A responsive employee workspace built from the supplied Vite/React app. Supabase provides authentication, Postgres and row-level security. Techdev retains its original separate icon and wordmark.

## Start here

1. Extract this ZIP into a **new folder**. Keep the previous project as a backup.
2. Copy your existing `.env.local` into the extracted `techdev-workforce` folder. Working credentials are not included in this ZIP.
3. In your Supabase project's SQL Editor, run **all of `supabase/schema.sql`**. It includes the original app and the new discussion, survey, training and activity workflows. It is designed to be safe to reapply. It does not erase employee or workforce records.
4. Open a terminal in `techdev-workforce` and run:

```sh
npm ci
npm run dev
```

Open the local URL shown by Vite. For verification, run `npm test` and `npm run build`.

Requirements: Node.js 20.19+ or 22.12+, and a Supabase project.

If you do not have an environment file, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Only use the Supabase publishable/anon key. Never put a secret/service-role key, database password or provider token in browser variables.

## Employee and manager access

Existing auth accounts are backfilled into the employee directory when the schema runs. New accounts receive an employee profile from the database trigger.

Public account creation is hidden by default. Provision approved employees from Supabase Authentication's user management. For a demo only, `VITE_ALLOW_SIGNUP=true` shows the existing account-creation form. **Also disable public signups in Supabase for company use**: hiding a form alone does not restrict the authentication API.

Email/password login, sign-out and password recovery are included. In Supabase Authentication's URL configuration, set the Site URL and allow your local and deployed application URLs. Password reset and confirmation links need these settings. Email confirmation/delivery depends on your Supabase authentication configuration.

An authorized project owner can grant the first administrator in the SQL Editor:

```sql
update public.employees
set role = 'admin'
where id = (select id from auth.users where email = 'authorized-person@your-company.com');
```

Replace the example with the authorized person's real email. Use `role = 'manager'` for a manager account. Regular employees cannot assign themselves privileged roles. Managers can assign tasks, publish notices/payslips, schedule shifts and review requests.

## Navigation and responsive layout

- Home shows the workday clock, three quick actions, the next three unfinished tasks and one company update.
- Phones have four bottom actions: Home, Tasks, Time and More.
- Desktop has the same three primary pages across the header.
- The hamburger/More menu holds payslips, leave/schedules, notices, activity, reports, manager tools and the six groups of workplace tools.
- Tool groups and record-creation forms expand when opened. The drawer supports keyboard focus containment, Escape dismissal, background scroll locking and menu search.
- The layout uses a banking-app navigation pattern while keeping Techdev branding. It is not affiliated with Standard Bank.

## New native workflows

**Discussions:** employees can post replies on visible workplace records. Replies on private records remain private to authorized users. Team posts and their replies update through Supabase Realtime when the publication is enabled by the schema.

**Surveys:** publish a survey statement with status `published`. Employees submit a 1–5 rating and optional feedback, and can update their response. One response per employee is enforced in the database. Responses are identifiable, visible to the respondent and managers; they are not anonymous. Managers see the average of loaded responses.

**Learning/onboarding:** publish steps under Onboarding, Learning management or Security training. Employees can mark their own completion. Repeated submission updates the same completion record; managers see loaded completion counts. This is completion tracking, not certification or a complete course-authoring platform.

**Reports:** native dashboards derive task progress, overdue tasks, recorded hours and pending requests from authorized workspace data. Task and attendance exports are CSV, with spreadsheet formula injection neutralized. Reports describe loaded records: attendance loads up to 300 recent rows, suite records up to 500 plus 100 recent activity events, interactions up to 1,000 and notices up to 40. They are not full historical warehouse reports.

**Activity:** core workforce changes and new workplace changes produce database-recorded events. Pay, leave, time and survey/completion events are private. Core events already recorded by older app versions are not automatically rewritten by this package. The feed is in-app; external email/push delivery is not implemented.

**Resource links:** managers can attach HTTPS links to tools or documents. URLs with embedded credentials or unsafe schemes are rejected. Linked services run in their own systems; adding a link does not connect their APIs.

## Optional company SSO

A company SSO button is implemented using Supabase `signInWithSSO`. Register/configure the company's SAML identity provider in Supabase first, allow the application redirect URL, then set `VITE_SSO_DOMAIN=your-company-domain.com` in the local/hosting environment. Leave it blank to use email/password only. The domain is a public configuration value; no identity-provider credentials belong in the frontend. SSO has not been tested against your company provider.

Official reference: https://supabase.com/docs/reference/javascript/auth-signinwithsso

## Coverage and boundaries

Read `COVERAGE.md` before presenting this app as complete against the broader enterprise brief. The core employee workflows and added native responses/reports are implemented in code. Other workplace sections provide records, approvals, search, resource links and status tracking.

The app does not provision cloud environments, run remote CI jobs, index repositories, ingest monitoring telemetry, control external release flags, provide VPN/endpoint agents, send phishing emails, connect benefit/payment providers, query data warehouses or train/serve ML models. Those services require separately implemented provider integrations and infrastructure. Payroll values are employer-entered; Techdev calculates take-home as gross minus supplied deductions, but does not calculate taxes/overtime/statutory entitlements. Existing monetary records and labels remain ZAR; they have not been silently relabelled as rand.

## Checks and CI

`npm test` runs PostgreSQL-compatible PGlite tests for schema reapplication, profile backfill, clock retries, role/task/pay privacy, survey constraints, training completion, discussions, activity privacy and safe CSV/URL handling. Test-only auth fixtures simulate the relevant database identity and roles; these tests do not replace real Supabase login/email/SSO tests.

`.github/workflows/ci.yml` runs installation, tests and production build for pushes to main/master and pull requests. It will run after this project is pushed to a GitHub repository with Actions enabled. No repository has been pushed or CI run remotely by this handover.

## Deploy

For Vercel: push this folder to GitHub, import the repository as a Vite project, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and optional SSO/signup values) in hosting environment settings, then deploy. Build command: `npm run build`. Output: `dist`. `vercel.json` includes a client-side route fallback.

For Render: the included `render.yaml` is a static-site Blueprint. Connect the repository, supply the public Supabase environment variables, and deploy.

In either case, run the full SQL schema in Supabase and configure the deployed URL in Supabase authentication. Environment changes require a new frontend build. The `.env.local` file is ignored by Git; do not commit it.

## Acceptance before company use

Test actual employee and manager accounts: sign-in/recovery, clock-in/out, claiming/updating tasks, notices, leave approvals, PDF statements, surveys, private replies and completion tracking. Open the deployed app on a phone and desktop. Verify the approved employee registration policy in the hosted project. This handover does not claim a live deployment, live identity-provider check, physical-device/browser acceptance test or complete security audit.
