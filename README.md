# Adlister Africa

A fresh, deployable React + TypeScript dashboard with a Supabase/PostgreSQL backend foundation. It preserves the supplied dark operations-dashboard direction and replaces fake publishing with auditable execution-job creation.

## What is implemented

- Responsive dashboard UI, African market/currency selector, inventory table, search, selection, CSV export, posting-rule controls, terminal log, job list, analytics snapshot.
- Supabase magic-link sign-in UI.
- PostgreSQL schema for organizations, memberships, stores, inventory, marketplace connections, execution jobs, per-marketplace job items, and audit logs.
- Row Level Security with organization membership and role checks.
- Inventory read/create/update client calls with Zod validation.
- Authenticated Edge Function that validates organization membership, inventory scope, role, idempotency key and request payload; persists job and operation rows; writes audit history.
- Honest demo mode: sample catalog is presentation-only, and execution is disabled until signed in and backed by real records.
- CSV formula-injection mitigation for exported cells.
- Marketplace integration requirements and versioned API contracts.

## Not implemented (deliberately)

- Real listing publishing, repricing, refresh/boost, proxying, image metadata rewriting, anti-detection or browser automation.
- Scheduled worker, automatic retries, remote marketplace status polling, real revenue/ROI data, and marketplace credentials.
- Production launch is not complete until the Supabase project is configured, migration is applied, deployment is tested, and each marketplace adapter is approved and verified.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
npm run dev
```

Without Supabase env vars, the dashboard runs in preview mode with sample rows. Sample rows are not saved and cannot be submitted for execution.

## Supabase setup

1. Confirm the existing Supabase project is specifically for Adlister Africa. Do not reuse an unrelated production project. See [`docs/RENDER_EXISTING_SUPABASE_DEPLOYMENT.md`](docs/RENDER_EXISTING_SUPABASE_DEPLOYMENT.md) for the read-only check and deployment checklist.
2. Back up and review the target project, then apply `supabase/migrations/0001_initial_schema.sql` using the project's migration workflow or SQL Editor. Review SQL in staging first.
3. In Authentication settings, configure allowed redirect URLs for local and production origins and set up email delivery/SMTP appropriate for launch.
4. Copy project URL and publishable/anon key to frontend environment variables. Never use a service-role key in any `VITE_` variable.
5. Deploy the Edge Function:

```bash
supabase functions deploy create-execution-job
supabase secrets set ALLOWED_ORIGIN=https://YOUR-FRONTEND-DOMAIN.example
```

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into the Edge Function runtime. Do not expose the service role key to clients.
6. Add the production frontend origin to Supabase Auth redirect URLs.
7. Test signup, organization provisioning, RLS isolation with two accounts, inventory CRUD, idempotent job creation, and denial of cross-organization inventory IDs.

### Important database setup note

The `handle_new_user` trigger creates a personal organization on each new user signup. For an existing Supabase project with users already present, create organizations and memberships for those users through a controlled admin migration before testing. Do not disable RLS to make the UI work.

## Deployment

This frontend is a static Vite app and can be deployed to Render Static Sites. For the chosen Render + existing Supabase path, follow [`docs/RENDER_EXISTING_SUPABASE_DEPLOYMENT.md`](docs/RENDER_EXISTING_SUPABASE_DEPLOYMENT.md).

Build command: `npm install && npm run build` (a lockfile is not included in this starter; generate and commit `package-lock.json` after the first successful install to make future builds reproducible).
Publish directory: `dist`

Configure environment variables in the host:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

For single-page routing, configure fallback rewrites to `/index.html` if routes are added later. Currently the app uses section anchors.

Deploy the Supabase Edge Function separately. A frontend deployment alone does not deploy SQL schema or Edge Functions.

## Security and operational launch checklist

- [ ] Apply migration to staging; inspect all RLS policies and trigger behavior.
- [ ] Generate and commit `package-lock.json` after a successful dependency install; then switch CI/deployment to `npm ci` for reproducible builds.
- [ ] Confirm account signup/magic link works on the deployed domain.
- [ ] Test two organizations cannot read/update each other's data.
- [ ] Add rate limiting / abuse controls for signup and job creation (edge gateway or server-side limits).
- [ ] Set allowed CORS origin to the exact production domain.
- [ ] Configure email provider and production redirect URLs.
- [ ] Add database backups/PITR and monitoring appropriate to the plan.
- [ ] Add worker lease/claim/retry/dead-letter design before consuming jobs automatically.
- [ ] Verify every marketplace API and secure written access before implementing adapters.
- [ ] Configure observability without logging credentials, tokens, or unnecessary personal data.
- [ ] Complete dependency audit, accessibility review, security review, and load tests.

## Architecture

```text
Browser (React + TypeScript)
  | Supabase Auth session / publishable key
  v
Supabase API + PostgreSQL + RLS
  | authenticated job request
  v
Supabase Edge Function: create-execution-job
  | validated request + org/role/scope checks
  v
execution_jobs -> execution_job_items -> audit_logs
  |
  | Future worker (not included)
  v
Approved marketplace adapter -> official/approved API -> verified remote result
```

## API contract

See [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) and marketplace access gates in [`docs/MARKETPLACE_INTEGRATIONS.md`](docs/MARKETPLACE_INTEGRATIONS.md).
