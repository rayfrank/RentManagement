import { supabase } from '../lib/supabase';

export type MpesaReceipt = {
  transaction_reference: string | null;
  amount: number | null;
  transaction_date: string | null;
  transaction_time: string | null;
  payer_name: string | null;
  payer_phone: string | null;
  recipient_name: string | null;
  house_number_hint: string | null;
  confidence: number;
  warnings: string[];
};

export type MatchCandidate = {
  property: {
    id: string;
    house_number: string;
    tenant_name: string | null;
    monthly_rent: number | string;
    service_charge: number | string;
  };
  score: number;
  reasons: string[];
};

export type MpesaScanResult = {
  receipt: MpesaReceipt;
  duplicate: { id: string; house_number: string; tenant_name: string } | null;
  candidates: MatchCandidate[];
};

export type ReminderResult = {
  id: string;
  subject: string;
  message: string;
  balance: number;
};

export type ReportResult = {
  answer: string;
  supporting_facts: string[];
  caveat: string | null;
};

export type FraudAlert = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  alert_type: string;
  title: string;
  details: string;
  evidence: Record<string, unknown>;
  status: 'open' | 'reviewed' | 'dismissed';
  created_at: string;
  payment_id: string | null;
};

async function invokeAI<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('rentflow-ai', { body });
  if (error) {
    const context = await error.context?.json?.().catch?.(() => null);
    throw new Error(context?.error || error.message || 'The AI service could not complete this request.');
  }
  if (data?.error) throw new Error(data.error);
  return data.data as T;
}

export const scanMpesaReceipt = (receiptText: string, imageDataUrl?: string) =>
  invokeAI<MpesaScanResult>({ feature: 'mpesa_scan', receiptText, imageDataUrl });

export const generatePaymentReminder = (propertyId: string, tone: 'polite' | 'firm' | 'final', language: 'en' | 'sw') =>
  invokeAI<ReminderResult>({ feature: 'reminder', propertyId, tone, language });

export const askRentFlow = (question: string) =>
  invokeAI<ReportResult>({ feature: 'reporting', question });

export async function fetchFraudAlerts(organizationId: string) {
  if (!supabase) return [] as FraudAlert[];
  const { data, error } = await supabase.from('fraud_alerts')
    .select('id, severity, alert_type, title, details, evidence, status, created_at, payment_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FraudAlert[];
}

export async function updateFraudAlert(id: string, status: 'reviewed' | 'dismissed', reviewerId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('fraud_alerts').update({
    status,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}
