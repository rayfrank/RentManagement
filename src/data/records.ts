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
  method: 'mpesa' | 'bank';
  status?: 'paid' | 'partial';
};

export type StoredHouseholdMember = {
  id: string;
  full_name: string;
  phone: string | null;
  is_primary: boolean;
  active: boolean;
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
  payment_method: 'mpesa' | 'bank';
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
  household_members: StoredHouseholdMember[] | null;
};

const githuraiRegister = [
  { house: 'M1', members: ['Seline Apondi'], rent: 4400, status: 'overdue' },
  { house: 'M2', members: ['Alphine Jepngetich'], rent: 4400, status: 'overdue' },
  { house: 'M3', members: ['Ramadan Limo Kurgat'], rent: 5200, status: 'overdue' },
  { house: 'M4', members: ['Grace Muthoni'], rent: 5350, status: 'paid' },
  { house: 'M5', members: ['Beatrice Njuhi Ndegwa'], rent: 8400, status: 'overdue' },
  { house: 'M6', members: ['Susan Madangi'], rent: 5200, status: 'overdue' },
  { house: 'M7', members: ['Joan Muthoni Mwangi'], rent: 5200, status: 'overdue' },
  { house: 'M8', members: ['Mary Wanjiru Wanjiku'], rent: 8400, status: 'paid' },
  { house: 'M9', members: ['Charity Ruheni'], rent: 4400, status: 'overdue' },
  { house: 'M10', members: ['Henry Jumah Ouma'], rent: 7400, status: 'overdue' },
  { house: 'M11', members: ['Alex Maingi Maithya'], rent: 5400, status: 'overdue' },
  { house: 'M12', members: ['Kelvin Katua Mutiso'], rent: 5200, status: 'overdue' },
  { house: 'N14', members: ['Rehab Wanjiru'], rent: 6400, status: 'overdue' },
  { house: 'N15', members: ['Rachel Purity Mukami', 'Emmanuel Simiyu'], rent: 5200, status: 'overdue' },
  { house: 'N16', members: ['Emmanuel Simiyu'], rent: 5200, status: 'partial' },
  { house: 'N17', members: ['Wilfred Chau Ngugi'], rent: 5400, status: 'overdue' },
  { house: 'N18', members: ['Joseph Gicharu Njuguna', 'Veronica'], rent: 8400, status: 'paid' },
  { house: 'N19', members: ['Julias Barakachi'], rent: 5200, status: 'paid' },
  { house: 'N20', members: ['Kelvin Fundi Muthee'], rent: 5200, status: 'paid' },
  { house: 'N21', members: ['Moses Wendo Ngolanye'], rent: 8400, status: 'paid' },
  { house: 'N22', members: ['Mary Wambui Wanjiru', 'Mary Njoki Kamau'], rent: 5200, status: 'overdue' },
  { house: 'N23', members: ['John Wanyoike Wairegi'], rent: 7400, status: 'overdue' },
  { house: 'N24', members: ['Denis Munene Gituma'], rent: 5200, status: 'overdue' },
  { house: 'N25', members: ['Chris', 'Agnes Mukina Ngure'], rent: 5200, status: 'overdue' },
] as const;

const githuraiOpeningTotals = [
  { method: 'mpesa', amount: 13600, reference: 'GITHURAI-AUG-2026-MPESA', accountName: 'Githurai M-Pesa total' },
  { method: 'bank', amount: 39810, reference: 'GITHURAI-AUG-2026-BANK', accountName: 'Githurai bank total' },
] as const;

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
    payment_method: input.method,
    status: input.status ?? 'paid',
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
  if (occupied) {
    const { error: memberError } = await supabase.from('household_members').insert({
      organization_id: input.organizationId,
      property_id: data.id,
      full_name: input.tenant.trim(),
      is_primary: true,
      created_by: input.actorId,
      updated_by: input.actorId,
    });
    if (memberError) throw memberError;
  }
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
    .select('id, house_number, tenant_name, monthly_rent, service_charge, status, household_members(id, full_name, phone, is_primary, active)')
    .eq('organization_id', organizationId)
    .order('house_number');
  if (error) throw error;
  return (data ?? []) as unknown as StoredProperty[];
}

export async function updatePropertyPaymentStatus(propertyId: string, status: 'paid' | 'partial' | 'overdue') {
  if (!supabase) throw new Error('The database is not configured.');
  const { error } = await supabase.from('properties').update({ status }).eq('id', propertyId);
  if (error) throw error;
}

export async function addHouseholdMember(input: {
  organizationId: string;
  propertyId: string;
  actorId: string;
  fullName: string;
  phone?: string;
}) {
  if (!supabase) throw new Error('The database is not configured.');
  const { data, error } = await supabase.from('household_members').insert({
    organization_id: input.organizationId,
    property_id: input.propertyId,
    full_name: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    created_by: input.actorId,
    updated_by: input.actorId,
  }).select('id, full_name, phone, is_primary, active').single();
  if (error) throw error;
  return data as StoredHouseholdMember;
}

export async function importGithuraiRegister(organizationId: string, actorId: string) {
  if (!supabase) throw new Error('The database is not configured.');

  const { data: existing, error: existingError } = await supabase.from('properties')
    .select('id, house_number')
    .eq('organization_id', organizationId)
    .in('house_number', githuraiRegister.map((entry) => entry.house));
  if (existingError) throw existingError;
  const existingByHouse = new Map((existing ?? []).map((property) => [property.house_number, property.id]));

  for (const entry of githuraiRegister) {
    const existingId = existingByHouse.get(entry.house);
    const propertyValues = {
      tenant_name: entry.members.join(' + '),
      monthly_rent: entry.rent,
      service_charge: 0,
      status: entry.status,
      updated_by: actorId,
    };
    const propertyRequest = existingId
      ? supabase.from('properties').update(propertyValues).eq('id', existingId).select('id').single()
      : supabase.from('properties').insert({
          ...propertyValues,
          organization_id: organizationId,
          house_number: entry.house,
          created_by: actorId,
        }).select('id').single();
    const { data: property, error: propertyError } = await propertyRequest;
    if (propertyError) throw propertyError;

    const memberRows = entry.members.map((fullName, index) => ({
      organization_id: organizationId,
      property_id: property.id,
      full_name: fullName,
      is_primary: index === 0,
      created_by: actorId,
      updated_by: actorId,
    }));
    const { error: memberError } = await supabase.from('household_members')
      .upsert(memberRows, { onConflict: 'property_id,full_name', ignoreDuplicates: true });
    if (memberError) throw memberError;
  }

  const { data: existingTotals, error: totalsLookupError } = await supabase.from('payments')
    .select('payment_reference')
    .eq('organization_id', organizationId)
    .in('payment_reference', githuraiOpeningTotals.map((total) => total.reference));
  if (totalsLookupError) throw totalsLookupError;
  const existingReferences = new Set((existingTotals ?? []).map((payment) => payment.payment_reference));
  const missingTotals = githuraiOpeningTotals.filter((total) => !existingReferences.has(total.reference)).map((total) => ({
    organization_id: organizationId,
    property_id: null,
    house_number: 'ALL',
    tenant_name: 'August 2026 workbook opening total',
    rent_amount: total.amount,
    service_amount: 0,
    deposit_amount: 0,
    paid_to_name: total.accountName,
    payment_date: '2026-08-01',
    payment_reference: total.reference,
    payment_method: total.method,
    status: 'paid',
    created_by: actorId,
    updated_by: actorId,
  }));
  if (missingTotals.length) {
    const { error: totalsError } = await supabase.from('payments').insert(missingTotals);
    if (totalsError) throw totalsError;
  }

  return fetchProperties(organizationId);
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
