# Adlister Africa — Render + existing Supabase deployment

## Verified Supabase target

The intended backend is the existing Supabase project **Adlister**, reference `lmpjmlrloupxcygtosvb`, API URL `https://lmpjmlrloupxcygtosvb.supabase.co`.

Read-only inspection before changes found that it was healthy and had no public tables, migrations, or Edge Functions. The initial Adlister schema and security/index hardening were then applied to this project only. A post-migration inspection confirmed these tables exist with RLS enabled: `organizations`, `organization_members`, `stores`, `marketplace_connections`, `inventory`, `execution_jobs`, `execution_job_items`, and `audit_logs`. The migration tracker records `adlister_initial_schema`; a follow-up security/index migration was also applied. The `create-execution-job` Edge Function was deployed with JWT verification enabled. This verifies backend provisioning, not frontend deployment or end-to-end behavior.

## Render Static Site configuration

- **Service type:** Static Site
- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- **Environment variables:**
  - `VITE_SUPABASE_URL` = `https://lmpjmlrloupxcygtosvb.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = the Adlister project's publishable key (preferred) or legacy anon key

Never add a Supabase `service_role` or secret key to Render frontend variables or any variable beginning with `VITE_`.

### Deploy steps

1. Put the project files in a Git repository you control, including `render.yaml`. Do not commit `.env` files, tokens, or credentials.
2. In Render, choose **New → Static Site**, connect that repository, and select the branch to deploy. Verify the build command and publish directory above.
3. Add the two frontend environment variables above to the Render service.
4. Once Render assigns the public URL (or a custom domain is configured), add that exact origin to Supabase Edge Function secret `ALLOWED_ORIGINS`. Use comma-separated exact origins only if multiple frontends are required, e.g. `https://your-site.onrender.com,http://localhost:5173`. Do not include URL paths or a trailing slash. The function currently defaults to localhost and will reject browser requests from the Render domain until this allowlist is set.
5. Configure Supabase Auth **Site URL** and allowed redirect URLs for the exact Render origin, plus local development if needed. Configure production email delivery/SMTP for magic links.
6. After a successful dependency install, generate and commit `package-lock.json`; then change the Render build command to `npm ci && npm run build` for reproducible builds.

## Backend security and verification

- RLS is enabled on all eight application tables.
- Public execution of the user-provisioning trigger function is revoked; organization helper RPCs are limited to authenticated callers.
- An initial Supabase security-advisor scan identified overly broad execution grants on `SECURITY DEFINER` helpers. A hardening migration was applied to revoke unnecessary public/anonymous execution and retain authenticated access where needed. Re-run security and performance advisors before production and review any remaining findings.
- Verify signup creates one organization and owner membership; inventory CRUD persists; a second user cannot read or mutate the first user's organization; cross-organization inventory IDs are rejected by the job function; and idempotency behaves as intended.
- Check Edge Function logs and browser network responses after setting `ALLOWED_ORIGINS` and Auth redirects.

## Publishing status

The `create-execution-job` Edge Function only validates and records jobs. It does **not** call external marketplaces. Creating a job is not a successful listing. Marketplace publishing remains unimplemented until approved integrations, credentials, a worker, and a verified remote marketplace response exist.

## Current verification state

The Supabase schema and Edge Function are provisioned in the confirmed Adlister project and were checked through the connected Supabase account. Render has not been deployed or connected to a Git repository from this workflow. A complete frontend build/test run is still unverified because dependency installation previously timed out. Treat the first Render build and the end-to-end checks above as required verification gates.
