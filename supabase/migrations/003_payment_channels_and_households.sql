-- Separate payment channels and support multiple occupants per house.

alter table public.payments
  add column if not exists payment_method text not null default 'mpesa'
  check (payment_method in ('mpesa', 'bank'));

create index if not exists payments_organization_method_date_idx
  on public.payments (organization_id, payment_method, payment_date desc);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists household_members_property_name_idx
  on public.household_members (property_id, full_name);
create index if not exists household_members_organization_property_idx
  on public.household_members (organization_id, property_id);

create or replace function public.set_updated_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_table_name in ('properties', 'payments', 'household_members') then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists household_members_updated_metadata on public.household_members;
create trigger household_members_updated_metadata
before update on public.household_members
for each row execute function public.set_updated_metadata();

drop trigger if exists household_members_audit on public.household_members;
create trigger household_members_audit
after insert or update or delete on public.household_members
for each row execute function public.capture_audit_log();

alter table public.household_members enable row level security;

create policy "Members can view household members"
on public.household_members for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Owners and managers can create household members"
on public.household_members for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'manager'])
  and created_by = auth.uid() and updated_by = auth.uid()
);

create policy "Owners and managers can edit household members"
on public.household_members for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']))
with check (public.has_organization_role(organization_id, array['owner', 'manager']));

create policy "Owners and managers can remove household members"
on public.household_members for delete to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']));
