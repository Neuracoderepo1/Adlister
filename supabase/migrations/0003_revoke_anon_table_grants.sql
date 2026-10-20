-- Adlister Africa: defence in depth. RLS already denies anon (no anon policies exist),
-- but Supabase default privileges may grant table access to anon. Remove it explicitly.
-- Forward-compatible and non-destructive: touches privileges only, no data or schema.
revoke all on public.organizations, public.organization_members, public.stores,
  public.marketplace_connections, public.inventory, public.execution_jobs,
  public.execution_job_items, public.audit_logs from anon;
revoke all on all sequences in schema public from anon;
