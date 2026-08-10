import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Feature = 'mpesa_scan' | 'reminder' | 'reporting';

type Workspace = {
  organizationId: string;
  userId: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const outputText = (response: Record<string, unknown>) => {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  throw new Error('The AI response did not contain readable output.');
};

async function callOpenAI(input: unknown, format?: Record<string, unknown>) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey || apiKey === 'your-key' || !apiKey.startsWith('sk-')) {
    throw new Error('OpenAI is not connected. Replace OPENAI_API_KEY in Supabase Edge Function secrets with a valid API key.');
  }

  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input,
      ...(format ? { text: { format } } : {}),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error('OpenAI rejected the configured API key. Replace OPENAI_API_KEY in Supabase Edge Function secrets.');
    if (response.status === 429) throw new Error('OpenAI usage is temporarily unavailable. Check API billing or wait for the rate limit to reset.');
    const message = payload?.error?.message || `OpenAI request failed with ${response.status}.`;
    throw new Error(message);
  }
  return { text: outputText(payload), model };
}

async function getWorkspace(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !authorization) throw new Error('Missing Supabase authentication configuration.');

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Your session is no longer valid. Please sign in again.');

  const { data: membership, error: membershipError } = await client
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
    .order('joined_at', { ascending: false })
    .limit(1)
    .single();
  if (membershipError || !membership) throw new Error('No RentFlow workspace was found for this account.');

  return {
    client,
    workspace: { organizationId: membership.organization_id, userId: auth.user.id } as Workspace,
  };
}

async function enforceRateLimit(client: ReturnType<typeof createClient>, workspace: Workspace) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await client
    .from('ai_request_logs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', workspace.organizationId)
    .eq('created_by', workspace.userId)
    .gte('created_at', since);
  if ((count ?? 0) >= 10) throw new Error('AI request limit reached. Please wait one minute and try again.');
}

async function startLog(client: ReturnType<typeof createClient>, workspace: Workspace, feature: Feature, inputKind: 'text' | 'image' | 'data') {
  const { data, error } = await client.from('ai_request_logs').insert({
    organization_id: workspace.organizationId,
    created_by: workspace.userId,
    feature,
    input_kind: inputKind,
    status: 'started',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

async function finishLog(client: ReturnType<typeof createClient>, id: string, values: Record<string, unknown>) {
  await client.from('ai_request_logs').update({ completed_at: new Date().toISOString(), ...values }).eq('id', id);
}

async function scanMpesa(client: ReturnType<typeof createClient>, workspace: Workspace, body: Record<string, unknown>) {
  const receiptText = typeof body.receiptText === 'string' ? body.receiptText.trim().slice(0, 4000) : '';
  const imageDataUrl = typeof body.imageDataUrl === 'string' && body.imageDataUrl.startsWith('data:image/') ? body.imageDataUrl : '';
  if (!receiptText && !imageDataUrl) throw new Error('Paste an M-Pesa message or attach a receipt screenshot.');
  if (imageDataUrl.length > 7_000_000) throw new Error('The receipt image is too large. Choose a smaller screenshot.');

  const content: Array<Record<string, unknown>> = [{
    type: 'input_text',
    text: `Extract the M-Pesa transaction facts. Do not guess missing values.\n\nMessage text:\n${receiptText || '[image only]'}`,
  }];
  if (imageDataUrl) content.push({ type: 'input_image', image_url: imageDataUrl, detail: 'high' });

  const schema = {
    type: 'json_schema',
    name: 'mpesa_receipt',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        transaction_reference: { type: ['string', 'null'] },
        amount: { type: ['number', 'null'] },
        transaction_date: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD when known' },
        transaction_time: { type: ['string', 'null'] },
        payer_name: { type: ['string', 'null'] },
        payer_phone: { type: ['string', 'null'] },
        recipient_name: { type: ['string', 'null'] },
        house_number_hint: { type: ['string', 'null'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['transaction_reference', 'amount', 'transaction_date', 'transaction_time', 'payer_name', 'payer_phone', 'recipient_name', 'house_number_hint', 'confidence', 'warnings'],
    },
  };

  const ai = await callOpenAI([{ role: 'user', content }], schema);
  const receipt = JSON.parse(ai.text);
  if (receipt.transaction_reference) receipt.transaction_reference = String(receipt.transaction_reference).toUpperCase().trim();

  const { data: duplicate } = receipt.transaction_reference
    ? await client.from('payments').select('id, house_number, tenant_name').eq('organization_id', workspace.organizationId).eq('payment_reference', receipt.transaction_reference).maybeSingle()
    : { data: null };
  const { data: properties } = await client.from('properties')
    .select('id, house_number, tenant_name, monthly_rent, service_charge')
    .eq('organization_id', workspace.organizationId);

  const candidates = (properties ?? []).map((property: Record<string, unknown>) => {
    let score = 0;
    const reasons: string[] = [];
    if (receipt.house_number_hint && String(property.house_number).toLowerCase() === String(receipt.house_number_hint).toLowerCase()) {
      score += 70; reasons.push('house number matches');
    }
    const expected = Number(property.monthly_rent) + Number(property.service_charge);
    if (receipt.amount && Math.abs(Number(receipt.amount) - expected) < 1) {
      score += 25; reasons.push('amount matches rent and services');
    }
    if (receipt.payer_name && property.tenant_name && String(receipt.payer_name).toLowerCase().includes(String(property.tenant_name).split(' ')[0].toLowerCase())) {
      score += 20; reasons.push('payer resembles tenant');
    }
    return { property, score: Math.min(score, 100), reasons };
  }).filter((candidate: { score: number }) => candidate.score > 0).sort((a: { score: number }, b: { score: number }) => b.score - a.score).slice(0, 3);

  return { receipt, duplicate, candidates, model: ai.model };
}

async function generateReminder(client: ReturnType<typeof createClient>, workspace: Workspace, body: Record<string, unknown>) {
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
  const tone = ['polite', 'firm', 'final'].includes(String(body.tone)) ? String(body.tone) : 'polite';
  const language = body.language === 'sw' ? 'Swahili' : 'English';
  if (!propertyId) throw new Error('Choose a tenant before generating a reminder.');

  const { data: property, error } = await client.from('properties')
    .select('id, house_number, tenant_name, monthly_rent, service_charge, status')
    .eq('organization_id', workspace.organizationId).eq('id', propertyId).single();
  if (error || !property) throw new Error('The selected property could not be found.');
  if (!['overdue', 'partial'].includes(property.status)) throw new Error('Reminders can only be drafted for overdue or partially paid properties.');

  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { data: payments } = await client.from('payments')
    .select('rent_amount, service_amount, deposit_amount')
    .eq('organization_id', workspace.organizationId)
    .eq('property_id', propertyId)
    .gte('payment_date', monthStart.toISOString().slice(0, 10));
  const paid = (payments ?? []).reduce((sum: number, payment: Record<string, unknown>) => sum + Number(payment.rent_amount) + Number(payment.service_amount), 0);
  const due = Math.max(Number(property.monthly_rent) + Number(property.service_charge) - paid, 0);

  const format = {
    type: 'json_schema', name: 'rent_reminder', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      properties: { message: { type: 'string' }, subject: { type: 'string' } },
      required: ['message', 'subject'],
    },
  };
  const prompt = `Write a ${tone}, respectful rent reminder in ${language}. Never threaten or shame the tenant. Tenant: ${property.tenant_name}. House: ${property.house_number}. Current balance: KES ${due.toLocaleString('en-KE')}. Keep it under 500 characters and ask them to contact management if the record is incorrect.`;
  const ai = await callOpenAI(prompt, format);
  const draft = JSON.parse(ai.text);

  const { data: stored, error: storeError } = await client.from('reminder_drafts').insert({
    organization_id: workspace.organizationId,
    property_id: property.id,
    house_number: property.house_number,
    tenant_name: property.tenant_name || 'Tenant',
    created_by: workspace.userId,
    channel: 'whatsapp', tone, message: draft.message,
  }).select('id').single();
  if (storeError) throw storeError;
  return { ...draft, id: stored.id, balance: due, model: ai.model };
}

async function answerReport(client: ReturnType<typeof createClient>, workspace: Workspace, body: Record<string, unknown>) {
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1200) : '';
  if (!question) throw new Error('Enter a question about your RentFlow records.');

  const [{ data: properties }, { data: payments }, { data: audits }, { data: alerts }] = await Promise.all([
    client.from('properties').select('house_number, tenant_name, monthly_rent, service_charge, status').eq('organization_id', workspace.organizationId).limit(500),
    client.from('payments').select('house_number, tenant_name, rent_amount, service_amount, deposit_amount, payment_date, payment_reference, status').eq('organization_id', workspace.organizationId).order('payment_date', { ascending: false }).limit(500),
    client.from('audit_logs').select('action, entity_type, changed_fields, occurred_at, actor:profiles!audit_logs_actor_id_fkey(full_name), old_values, new_values').eq('organization_id', workspace.organizationId).order('occurred_at', { ascending: false }).limit(100),
    client.from('fraud_alerts').select('severity, alert_type, title, details, status, created_at').eq('organization_id', workspace.organizationId).order('created_at', { ascending: false }).limit(100),
  ]);

  const snapshot = { properties: properties ?? [], payments: payments ?? [], recent_audit_events: audits ?? [], alerts: alerts ?? [] };
  const format = {
    type: 'json_schema', name: 'rentflow_report_answer', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        answer: { type: 'string' },
        supporting_facts: { type: 'array', items: { type: 'string' } },
        caveat: { type: ['string', 'null'] },
      },
      required: ['answer', 'supporting_facts', 'caveat'],
    },
  };
  const input = `You are RentFlow's read-only reporting assistant. Answer only from the supplied JSON. Never claim you changed records. If the data is insufficient, say so. Use KES for money.\n\nQuestion: ${question}\n\nWorkspace data: ${JSON.stringify(snapshot)}`;
  const ai = await callOpenAI(input, format);
  return { ...JSON.parse(ai.text), model: ai.model };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let requestLogId: string | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    const feature = body.feature as Feature;
    if (!['mpesa_scan', 'reminder', 'reporting'].includes(feature)) return json({ error: 'Unknown AI feature.' }, 400);

    const { client, workspace } = await getWorkspace(req);
    await enforceRateLimit(client, workspace);
    const inputKind = feature === 'mpesa_scan' && body.imageDataUrl ? 'image' : feature === 'reporting' ? 'data' : 'text';
    requestLogId = await startLog(client, workspace, feature, inputKind);

    const result = feature === 'mpesa_scan'
      ? await scanMpesa(client, workspace, body)
      : feature === 'reminder'
        ? await generateReminder(client, workspace, body)
        : await answerReport(client, workspace, body);

    await finishLog(client, requestLogId, {
      status: 'completed', model: result.model,
      response_summary: feature === 'mpesa_scan' ? 'Receipt extracted and matching candidates ranked.' : feature === 'reminder' ? 'Reminder draft created.' : 'Reporting question answered.',
    });
    return json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected AI request failure.';
    try {
      if (requestLogId) {
        const { client } = await getWorkspace(req);
        await finishLog(client, requestLogId, { status: 'failed', error_message: message.slice(0, 500) });
      }
    } catch { /* Do not replace the original error. */ }
    const status = message.includes('session') ? 401 : message.includes('limit') ? 429 : 400;
    return json({ error: message }, status);
  }
});
