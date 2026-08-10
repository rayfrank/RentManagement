-- RentFlow AI features, request accountability, reminder drafts, and fraud alerts.

create table public.ai_request_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  feature text not null check (feature in ('mpesa_scan', 'reminder', 'reporting', 'alert_explanation')),
  input_kind text not null default 'text' check (input_kind in ('text', 'image', 'data')),
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  model text,
  response_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.reminder_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  house_number text not null,
  tenant_name text not null,
  created_by uuid not null references public.profiles(id),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'sms')),
  tone text not null default 'polite' check (tone in ('polite', 'firm', 'final')),
  message text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  alert_type text not null,
  title text not null,
  details text not null,
  evidence jsonb not null default '{}',
  fingerprint text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, fingerprint)
);

create index ai_request_logs_org_time_idx on public.ai_request_logs(organization_id, created_at desc);
create index reminder_drafts_org_time_idx on public.reminder_drafts(organization_id, created_at desc);
create index fraud_alerts_org_status_idx on public.fraud_alerts(organization_id, status, created_at desc);

create trigger reminder_drafts_updated_metadata
before update on public.reminder_drafts
for each row execute function public.set_updated_metadata();

create or replace function public.detect_payment_risk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_total numeric(12, 2);
  received_total numeric(12, 2);
  expected_tenant text;
  recent_edits integer;
begin
  received_total := new.rent_amount + new.service_amount + new.deposit_amount;

  select monthly_rent + service_charge, tenant_name
    into expected_total, expected_tenant
    from public.properties
   where id = new.property_id;

  if expected_total is not null and received_total < expected_total * 0.5 then
    insert into public.fraud_alerts (
      organization_id, payment_id, severity, alert_type, title, details, evidence, fingerprint
    ) values (
      new.organization_id,
      new.id,
      'medium',
      'amount_mismatch',
      'Payment is far below the expected amount',
      'The recorded amount is less than half of the configured rent and service charge.',
      jsonb_build_object('expected', expected_total, 'received', received_total, 'house_number', new.house_number),
      'amount-mismatch:' || new.id::text
    ) on conflict (organization_id, fingerprint) do nothing;
  end if;

  if expected_tenant is not null and lower(trim(expected_tenant)) <> lower(trim(new.tenant_name)) then
    insert into public.fraud_alerts (
      organization_id, payment_id, severity, alert_type, title, details, evidence, fingerprint
    ) values (
      new.organization_id,
      new.id,
      'medium',
      'tenant_mismatch',
      'Tenant name does not match the property record',
      'The payment tenant differs from the tenant currently assigned to this house.',
      jsonb_build_object('property_tenant', expected_tenant, 'payment_tenant', new.tenant_name, 'house_number', new.house_number),
      'tenant-mismatch:' || new.id::text
    ) on conflict (organization_id, fingerprint) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.created_at < now() - interval '24 hours' and (
    old.rent_amount is distinct from new.rent_amount
    or old.service_amount is distinct from new.service_amount
    or old.deposit_amount is distinct from new.deposit_amount
    or old.payment_reference is distinct from new.payment_reference
    or old.payment_date is distinct from new.payment_date
  ) then
    insert into public.fraud_alerts (
      organization_id, payment_id, severity, alert_type, title, details, evidence, fingerprint
    ) values (
      new.organization_id,
      new.id,
      'high',
      'late_financial_edit',
      'Financial payment details changed after 24 hours',
      'A settled payment was edited more than 24 hours after it was created.',
      jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)),
      'late-edit:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text
    ) on conflict (organization_id, fingerprint) do nothing;
  end if;

  if tg_op = 'UPDATE' then
    select count(*) into recent_edits
      from public.audit_logs
     where organization_id = new.organization_id
       and entity_type = 'payments'
       and entity_id = new.id
       and action = 'UPDATE'
       and occurred_at > now() - interval '1 hour';

    if recent_edits >= 3 then
      insert into public.fraud_alerts (
        organization_id, payment_id, severity, alert_type, title, details, evidence, fingerprint
      ) values (
        new.organization_id,
        new.id,
        'high',
        'repeated_edits',
        'Payment edited repeatedly',
        'This payment was changed at least three times within one hour.',
        jsonb_build_object('recent_edit_count', recent_edits, 'house_number', new.house_number),
        'repeated-edits:' || new.id::text || ':' || to_char(now(), 'YYYYMMDDHH24')
      ) on conflict (organization_id, fingerprint) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger payments_risk_detection
after insert or update on public.payments
for each row execute function public.detect_payment_risk();

alter table public.ai_request_logs enable row level security;
alter table public.reminder_drafts enable row level security;
alter table public.fraud_alerts enable row level security;

create policy "Members can view AI request history"
on public.ai_request_logs for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Members can create their AI request history"
on public.ai_request_logs for insert to authenticated
with check (public.is_organization_member(organization_id) and created_by = auth.uid());

create policy "Members can finish their AI request history"
on public.ai_request_logs for update to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "Members can view reminder drafts"
on public.reminder_drafts for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Collection staff can create reminder drafts"
on public.reminder_drafts for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'manager', 'collector'])
  and created_by = auth.uid()
);

create policy "Collection staff can update reminder drafts"
on public.reminder_drafts for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager', 'collector']))
with check (public.has_organization_role(organization_id, array['owner', 'manager', 'collector']));

create policy "Members can view fraud alerts"
on public.fraud_alerts for select to authenticated
using (public.is_organization_member(organization_id));

create policy "Owners and managers can review fraud alerts"
on public.fraud_alerts for update to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']))
with check (
  public.has_organization_role(organization_id, array['owner', 'manager'])
  and reviewed_by = auth.uid()
);

revoke insert, delete on public.fraud_alerts from anon, authenticated;
