# TechDev updated handover — 12 October 2026

This package includes the full existing TechDev Vite/React application and original TechDev JPEG branding.

## Updated in this handover

- Replaced the permanently exposed sidebar and crowded phone tabs with a searchable hamburger drawer on desktop and phone. Four mobile actions are Home, Tasks, Time and More.
- Simplified Home to the clock, three quick actions, next unfinished tasks and one company announcement. Secondary tools and manager controls are in the drawer.
- Grouped workplace areas and collapsed record-creation forms; added responsive spacing, readable inputs, touch targets and safe-area padding.
- Added keyboard focus containment, Escape dismissal, body scroll locking and inaccessible background controls while the drawer is open.
- Added database-backed threaded discussions, identifiable survey ratings/feedback and per-employee onboarding/learning/security-training completion. Repeated ratings/completions update the same row.
- Added native workforce dashboards and task/attendance CSV exports with formula injection protection.
- Added optional SAML SSO login code behind an explicit company domain setting, HTTPS resource links and a GitHub Actions test/build workflow.
- Fixed the manager task-status handler, stale/denied record updates/deletes, pay amount/date validation and duplicate submissions through the main mutation handler.
- Hidden public signup by default. Supabase signup permissions must still be configured by the project owner.
- Loaded activity separately so activity events do not crowd workplace tools out of their query.
- Recorded native activity without exposing private responses; blocked authenticated rewriting of activity records.
- Retained the earlier fixes for auth/token-refresh loading, reconnects, bounded requests, original logo/favicon, existing-user backfill, PostgreSQL reserved-word syntax and retry-safe clock-in.

## Verification

18 automated checks passed, along with five server-rendered UI scenarios. The final production build passed. Browser/visual/device testing was unavailable. Tests are included in `tests/` and run with `npm test`; PostgreSQL fixtures simulate Supabase auth identity/roles. `npm run build` validates the production bundle. No real Supabase login/email/SSO, deployment, physical-device/browser acceptance or complete security audit is claimed.

## Required setup

Extract into a new folder, copy your existing `.env.local` locally, run the complete `supabase/schema.sql` in your Supabase SQL Editor, then run `npm ci` and `npm run dev`. Keep the previous folder as a backup. Read `README.md` and `COVERAGE.md` for exact scope and provider setup. No working credentials, screenshots, logs, runtime employee data or node_modules are packaged.
