-- Adlister Africa: initial multi-tenant schema
-- Apply through Supabase migrations or SQL editor. Review in staging before production.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'operator', 'viewer');
create type public.listing_status as enum ('draft', 'active', 'paused', 'archived');
create type public.execution_status as enum ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled');
create type public.operation_status as enum ('pending', 'running', 'succeeded', 'failed', 'skipped');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  country_code char(2) not null check (country_code in ('GH','NG','KE','ZA')),
  currency char(3) not null check (currency in ('GHS','NGN','KES','ZAR')),
  timezone text not null default 'Africa/Accra',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  marketplace text not null check (marketplace in ('Tonaton','Jiji','Jumia','Konga','Takealot')),
  status text not null default 'unconfigured' check (status in ('unconfigured','pending_review','connected','disabled','error')),
  external_account_label text,
  credential_secret_ref text, -- reference to server-side secret storage only; never store raw access tokens here
  capabilities jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, marketplace),
  unique (organization_id, id)
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 180),
  sku text,
  image_url text check (image_url is null or (image_url ~ '^https://[^[:space:]]+$' and char_length(image_url) <= 2048)),
  base_price numeric(14,2) not null check (base_price >= 0),
  currency char(3) not null check (currency in ('GHS','NGN','KES','ZAR')),
  age_days integer not null default 0 check (age_days between 0 and 36500),
  status public.listing_status not null default 'draft',
  platforms text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_id, sku)
);
create index inventory_org_created_idx on public.inventory (organization_id, created_at desc);
create index inventory_org_status_idx on public.inventory (organization_id, status);
create index inventory_store_idx on public.inventory (store_id);

create table public.execution_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  requested_by uuid not null references auth.users(id),
  status public.execution_status not null default 'queued',
  requested_count integer not null check (requested_count between 1 and 100),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  platforms text[] not null check (cardinality(platforms) between 1 and 5),
  price_offset_percent numeric(5,2) not null default 0 check (price_offset_percent between -50 and 100),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  message text not null default 'Queued for adapter validation; no marketplace action has been confirmed.',
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  check (completed_count + failed_count <= requested_count)
);
create index execution_jobs_org_created_idx on public.execution_jobs (organization_id, created_at desc);
create index execution_jobs_status_created_idx on public.execution_jobs (status, created_at);

create table public.execution_job_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.execution_jobs(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  marketplace text not null check (marketplace in ('Tonaton','Jiji','Jumia','Konga','Takealot')),
  status public.operation_status not null default 'pending',
  external_listing_id text,
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, inventory_id, marketplace)
);
create index job_items_job_status_idx on public.execution_job_items (job_id, status);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_org_created_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.has_org_role(p_org_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = (select auth.uid()) and m.role = any(p_roles)
  );
$$;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

create or replace function public.get_my_default_organization_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select organization_id from public.organization_members
  where user_id = (select auth.uid())
  order by created_at asc limit 1;
$$;
revoke all on function public.get_my_default_organization_id() from public;
grant execute on function public.get_my_default_organization_id() to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger inventory_set_updated_at before update on public.inventory
for each row execute function public.set_updated_at();

-- New accounts receive a personal organization and owner membership.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare new_org_id uuid;
begin
  insert into public.organizations(name, created_by)
  values (coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1), 'My organization'), new.id)
  returning id into new_org_id;
  insert into public.organization_members(organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_adlister on auth.users;
create trigger on_auth_user_created_adlister
after insert on auth.users for each row execute function public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.stores enable row level security;
alter table public.marketplace_connections enable row level security;
alter table public.inventory enable row level security;
alter table public.execution_jobs enable row level security;
alter table public.execution_job_items enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can read own organizations" on public.organizations for select to authenticated
using (public.is_org_member(id));
create policy "owners and admins can update organizations" on public.organizations for update to authenticated
using (public.has_org_role(id, array['owner','admin']::public.member_role[]))
with check (public.has_org_role(id, array['owner','admin']::public.member_role[]));

create policy "members can view memberships" on public.organization_members for select to authenticated
using (public.is_org_member(organization_id));
create policy "owners can manage memberships" on public.organization_members for all to authenticated
using (public.has_org_role(organization_id, array['owner']::public.member_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));

create policy "members read stores" on public.stores for select to authenticated
using (public.is_org_member(organization_id));
create policy "operators manage stores" on public.stores for all to authenticated
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.member_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.member_role[]));

create policy "members read marketplace connections" on public.marketplace_connections for select to authenticated
using (public.is_org_member(organization_id));
create policy "admins manage marketplace connections" on public.marketplace_connections for all to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "members read inventory" on public.inventory for select to authenticated
using (public.is_org_member(organization_id));
create policy "operators insert inventory" on public.inventory for insert to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','operator']::public.member_role[])
  and created_by = (select auth.uid())
  and (store_id is null or exists (select 1 from public.stores s where s.id = store_id and s.organization_id = inventory.organization_id))
);
create policy "operators update inventory" on public.inventory for update to authenticated
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.member_role[]))
with check (
  public.has_org_role(organization_id, array['owner','admin','operator']::public.member_role[])
  and (store_id is null or exists (select 1 from public.stores s where s.id = store_id and s.organization_id = inventory.organization_id))
);
create policy "admins delete inventory" on public.inventory for delete to authenticated
using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "members read jobs" on public.execution_jobs for select to authenticated
using (public.is_org_member(organization_id));
create policy "members read job items" on public.execution_job_items for select to authenticated
using (public.is_org_member(organization_id));
create policy "members read audit logs" on public.audit_logs for select to authenticated
using (public.is_org_member(organization_id));

-- Deliberately no client INSERT/UPDATE policy on jobs, job items or audit logs.
-- Jobs are created through the Edge Function using server-side validation.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.inventory to authenticated;
grant select on public.organizations, public.organization_members, public.stores,
  public.marketplace_connections, public.execution_jobs, public.execution_job_items, public.audit_logs to authenticated;
