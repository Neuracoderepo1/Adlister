-- Adlister Africa: restrict SECURITY DEFINER execution and index foreign keys.
-- Apply after 0001_initial_schema.sql.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.get_my_default_organization_id() from public, anon;
grant execute on function public.get_my_default_organization_id() to authenticated;
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public, anon;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists organizations_created_by_idx on public.organizations(created_by);
create index if not exists inventory_created_by_idx on public.inventory(created_by);
create index if not exists execution_jobs_requested_by_idx on public.execution_jobs(requested_by);
create index if not exists execution_jobs_store_idx on public.execution_jobs(store_id);
create index if not exists execution_job_items_org_idx on public.execution_job_items(organization_id);
create index if not exists execution_job_items_inventory_idx on public.execution_job_items(inventory_id);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
