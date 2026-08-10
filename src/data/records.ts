import { supabase } from '../lib/supabase';

export type PaymentRecordInput = {
  organizationId: string;
  actorId: string;
  houseNumber: string;
  tenant: string;
  rent: number;
  services: number;
  deposit: number;
  accountName: string;
  date: string;
  reference: string;
};

export type StoredPayment = {
  id: string;
  house_number: string;
  tenant_name: string;
  rent_amount: number | string;
  service_amount: number | string;
  deposit_amount: number | string;
  paid_to_name: string;
  payment_date: string;
  payment_reference: string;
  status: 'paid' | 'partial' | 'overdue';
  created_at: string;
  creator: { full_name: string } | Array<{ full_name: string }> | null;
};

export type StoredAuditEvent = {
  id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  entity_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[];
  occurred_at: string;
  actor: { full_name: string } | Array<{ full_name: string }> | null;
};

export type StoredProperty = {
  id: string;
  house_number: string;
  tenant_name: string | null;
  monthly_rent: number | string;
  service_charge: number | string;
  status: 'paid' | 'partial' | 'overdue' | 'vacant';
};

const toIsoDate = (input: string) => {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

export async function savePaymentRecord(input: PaymentRecordInput) {
  if (!supabase) throw new Error('The database is not configured.');

  const { data: property } = await supabase
    .from('properties')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('house_number', input.houseNumber)
    .maybeSingle();

  const { data, error } = await supabase.from('payments').insert({
    organization_id: input.organizationId,
    property_id: property?.id ?? null,
    house_number: input.houseNumber,
    tenant_name: input.tenant,
    rent_amount: input.rent,
    service_amount: input.services,
    deposit_amount: input.deposit,
    paid_to_name: input.accountName,
    payment_date: toIsoDate(input.date),
    payment_reference: input.reference,
    status: 'paid',
    created_by: input.actorId,
    updated_by: input.actorId,
  }).select('id').single();

  if (error) throw error;
  return data.id as string;
}

export async function savePropertyRecord(input: {
  organizationId: string;
  actorId: string;
  houseNumber: string;
  tenant: string;
  rent: number;
  services: number;
}) {
  if (!supabase) throw new Error('The database is not configured.');
  const occupied = Boolean(input.tenant.trim());
  const { data, error } = await supabase.from('properties').insert({
    organization_id: input.organizationId,
    house_number: input.houseNumber.trim(),
    tenant_name: occupied ? input.tenant.trim() : null,
    monthly_rent: input.rent,
    service_charge: input.services,
    status: occupied ? 'overdue' : 'vacant',
    created_by: input.actorId,
    updated_by: input.actorId,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchPayments(organizationId: string) {
  if (!supabase) return [] as StoredPayment[];
  const { data, error } = await supabase
    .from('payments')
    .select('*, creator:profiles!payments_created_by_fkey(full_name)')
    .eq('organization_id', organizationId)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StoredPayment[];
}

export async function fetchProperties(organizationId: string) {
  if (!supabase) return [] as StoredProperty[];
  const { data, error } = await supabase
    .from('properties')
    .select('id, house_number, tenant_name, monthly_rent, service_charge, status')
    .eq('organization_id', organizationId)
    .order('house_number');
  if (error) throw error;
  return (data ?? []) as unknown as StoredProperty[];
}

export async function fetchAuditEvents(organizationId: string) {
  if (!supabase) return [] as StoredAuditEvent[];
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name)')
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as StoredAuditEvent[];
}

export async function addOrganizationMember(organizationId: string, email: string, role: 'manager' | 'collector' | 'viewer') {
  if (!supabase) throw new Error('The database is not configured.');
  const { error } = await supabase.rpc('add_organization_member', {
    target_organization: organizationId,
    member_email: email.trim(),
    member_role: role,
  });
  if (error) throw error;
}
