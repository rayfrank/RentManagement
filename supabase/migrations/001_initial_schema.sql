-- RentFlow multi-tenant schema
-- Run this migration in a new Supabase project before connecting the app.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'collector', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  house_number text not null,
  tenant_name text,
  monthly_rent numeric(12, 2) not null default 0 check (monthly_rent >= 0),
  service_charge numeric(12, 2) not null default 0 check (service_charge >= 0),
  status text not null default 'vacant' check (status in ('paid', 'partial', 'overdue', 'vacant')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, house_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  house_number text not null,
  tenant_name text not null,
  rent_amount numeric(12, 2) not null default 0 check (rent_amount >= 0),
  service_amount numeric(12, 2) not null default 0 check (service_amount >= 0),
  deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  paid_to_name text not null,
  payment_date date not null,
  payment_reference text not null,
  status text not null default 'paid' check (status in ('paid', 'partial', 'overdue')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, payment_reference)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity_type text not null,
  entity_id uuid not null,
  old_values jsonb,
  new_values jsonb,
  changed_fields text[] not null default '{}',
  occurred_at timestamptz not null default now()
);

create index properties_organization_idx on public.properties(organization_id);
create index payments_organization_date_idx on public.payments(organization_id, payment_date desc);
create index audit_logs_organization_time_idx on public.audit_logs(organization_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, occurred_at desc);

create or replace function public.set_updated_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_table_name in ('properties', 'payments') then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger properties_updated_metadata
before update on public.properties
for each row execute function public.set_updated_metadata();

create trigger payments_updated_metadata
before update on public.payments
for each row execute function public.set_updated_metadata();

create trigger organizations_updated_metadata
before update on public.organizations
for each row execute function public.set_updated_metadata();

create trigger profiles_updated_metadata
before update on public.profiles
for each row execute function public.set_updated_metadata();

create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  org_id uuid := coalesce((new_row ->> 'organization_id')::uuid, (old_row ->> 'organization_id')::uuid);
  row_id uuid := coalesce((new_row ->> 'id')::uuid, (old_row ->> 'id')::uuid);
  fields text[] := '{}';
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}')
      into fields
      from jsonb_each(new_row)
     where new_row -> key is distinct from old_row -> key
       and key not in ('updated_at');
  end if;

  insert into public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_values, new_values, changed_fields
  ) values (
    org_id, auth.uid(), tg_op, tg_table_name, row_id, old_row, new_row, fields
  );
  return coalesce(new, old);
end;
$$;

create trigger properties_audit
after insert or update or delete on public.properties
for each row execute function public.capture_audit_log();

create trigger payments_audit
after insert or update or delete on public.payments
for each row execute function public.capture_audit_log();

create or replace function public.capture_membership_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_values, new_values, changed_fields
  ) values (
    coalesce(new.organization_id, old.organization_id),
    auth.uid(),
    tg_op,
    'organization_members',
    coalesce(new.user_id, old.user_id),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    case when tg_op = 'UPDATE' then array['role'] else '{}' end
  );
  return coalesce(new, old);
end;
$$;

create trigger organization_members_audit
after insert or update or delete on public.organization_members
for each row execute function public.capture_membership_audit();

create or replace function public.handle_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
  display_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, display_name, new.email);

  insert into public.organizations (name, created_by)
  values (display_name || '''s Properties', new.id)
  returning id into organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (organization_id, new.id, 'owner');
  return new;
end;
$$;

create trigger auth_user_created
after insert on auth.users
for each row execute function public.handle_new_account();

create or replace function public.is_organization_member(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization and user_id = auth.uid()
  );
$$;

create or replace function public.has_organization_role(target_organization uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create or replace function public.shares_organization_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
     where mine.user_id = auth.uid()
       and theirs.user_id = target_user
  );
$$;

create or replace function public.add_organization_member(
  target_organization uuid,
  member_email text,
  member_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
begin
  if not public.has_organization_role(target_organization, array['owner']) then
    raise exception 'Only workspace owners can manage team accounts.';
  end if;
  if member_role not in ('manager', 'collector', 'viewer') then
    raise exception 'Invalid team role.';
  end if;

  select id into member_id
    from public.profiles
   where lower(email) = lower(trim(member_email));
  if member_id is null then
    raise exception 'That person must create a RentFlow account first.';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (target_organization, member_id, member_role)
  on conflict (organization_id, user_id)
  do update set role = excluded.role;
  return member_id;
end;
$$;

grant execute on function public.add_organization_member(uuid, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.properties enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles are visible to organization members"
on public.profiles for select to authenticated
using (id = auth.uid() or public.shares_organization_with(id));

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "Members can view their organizations"
on public.organizations for select to authenticated
using (public.is_organization_member(id));

create policy "Owners can update their organizations"
on public.organizations for update to authenticated
using (public.has_organization_role(id, array['owner']))
with check (public.has_organization_role(id, array['owner']));

create policy "Members can view organization membership"
on public.organization_members for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Owners can manage organization membership"
on public.organization_members for all to authenticated
using (public.has_organization_role(organization_id, array['owner']))
with check (public.has_organization_role(organization_id, array['owner']));

create policy "Members can view properties"
on public.properties for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Owners and managers can create properties"
on public.properties for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'manager'])
  and created_by = auth.uid() and updated_by = auth.uid()
);

create policy "Owners and managers can edit properties"
on public.properties for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']))
with check (public.has_organization_role(organization_id, array['owner', 'manager']));

create policy "Owners can delete properties"
on public.properties for delete to authenticated
using (public.has_organization_role(organization_id, array['owner']));

create policy "Members can view payments"
on public.payments for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Collectors can record payments"
on public.payments for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'manager', 'collector'])
  and created_by = auth.uid() and updated_by = auth.uid()
);

create policy "Owners and managers can edit payments"
on public.payments for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']))
with check (public.has_organization_role(organization_id, array['owner', 'manager']));

create policy "Owners can delete payments"
on public.payments for delete to authenticated
using (public.has_organization_role(organization_id, array['owner']));

create policy "Members can view audit history"
on public.audit_logs for select to authenticated
using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.audit_logs from authenticated;
