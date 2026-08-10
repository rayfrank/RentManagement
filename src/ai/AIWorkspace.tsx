import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Account } from '../auth/AuthProvider';
import { type ThemePalette, useTheme } from '../theme/ThemeProvider';
import {
  askRentFlow,
  fetchFraudAlerts,
  generatePaymentReminder,
  scanMpesaReceipt,
  updateFraudAlert,
  type FraudAlert,
  type MatchCandidate,
  type MpesaScanResult,
  type ReminderResult,
  type ReportResult,
} from './api';

export type AIProperty = {
  id?: string;
  houseNumber: string;
  tenant: string;
  rent: number;
  services: number;
  status: 'Paid' | 'Partial' | 'Overdue' | 'Vacant';
};

export type ReceiptPrefill = {
  houseNumber: string;
  tenant: string;
  rent: number;
  services: number;
  accountName: string;
  date: string;
  reference: string;
};

type Tab = 'scanner' | 'reminders' | 'ask' | 'alerts';

const palette: ThemePalette = {
  ink: '#172622', muted: '#687670', canvas: '#F4F6F1', surface: '#FFFFFF', line: '#DEE5DE',
  brand: '#176B52', brandDark: '#0C4B39', brandPale: '#E1F2EA', amber: '#C57A22', amberPale: '#FFF1D9',
  red: '#B84A43', redPale: '#FBE7E5', bluePale: '#E4EEF9', glowOne: '#A9E5CA', glowTwo: '#D7E7A8',
};

export function AIWorkspace({ compact, account, properties, onUseReceipt }: {
  compact: boolean;
  account: Account;
  properties: AIProperty[];
  onUseReceipt: (prefill: ReceiptPrefill) => void;
}) {
  const { palette: activePalette } = useTheme();
  Object.assign(palette, activePalette);
  styles = createStyles();
  const [tab, setTab] = useState<Tab>('scanner');
  const tabs: Array<{ id: Tab; label: string; symbol: string }> = [
    { id: 'scanner', label: 'M-Pesa scanner', symbol: '▣' },
    { id: 'reminders', label: 'Reminders', symbol: '✦' },
    { id: 'ask', label: 'Ask RentFlow', symbol: '⌕' },
    { id: 'alerts', label: 'Fraud alerts', symbol: '!' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.safetyBanner}>
        <View style={styles.safetyMark}><Text style={styles.safetyMarkText}>AI</Text></View>
        <View style={styles.safetyCopy}>
          <Text style={styles.safetyTitle}>Suggestion-first AI</Text>
          <Text style={styles.safetyText}>RentFlow never changes a financial record from AI output without your confirmation.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((item) => (
          <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}>
            <Text style={[styles.tabSymbol, tab === item.id && styles.tabTextActive]}>{item.symbol}</Text>
            <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {account.demo ? (
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>Sign in to use live AI tools</Text>
          <Text style={styles.setupText}>AI requests use your Supabase session so every request remains tied to a user and workspace.</Text>
        </View>
      ) : tab === 'scanner' ? (
        <ScannerPanel compact={compact} onUseReceipt={onUseReceipt} />
      ) : tab === 'reminders' ? (
        <RemindersPanel compact={compact} properties={properties} />
      ) : tab === 'ask' ? (
        <ReportingPanel />
      ) : (
        <AlertsPanel account={account} />
      )}
    </ScrollView>
  );
}

function ScannerPanel({ compact, onUseReceipt }: { compact: boolean; onUseReceipt: (prefill: ReceiptPrefill) => void }) {
  const [receiptText, setReceiptText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MpesaScanResult | null>(null);

  const chooseImage = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Allow photo access to choose an M-Pesa screenshot.');
    const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.65 });
    if (selected.canceled) return;
    const asset = selected.assets[0];
    if (!asset.base64) return setError('The selected image could not be read.');
    setImageDataUrl(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    setResult(null);
  };

  const analyze = async () => {
    setError(''); setResult(null); setBusy(true);
    try { setResult(await scanMpesaReceipt(receiptText, imageDataUrl || undefined)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not scan this receipt.'); }
    finally { setBusy(false); }
  };

  const useCandidate = (candidate?: MatchCandidate) => {
    if (!result) return;
    const property = candidate?.property;
    const extractedAmount = Number(result.receipt.amount || 0);
    const services = property ? Number(property.service_charge) : 0;
    const configuredRent = property ? Number(property.monthly_rent) : extractedAmount;
    onUseReceipt({
      houseNumber: property?.house_number || result.receipt.house_number_hint || '',
      tenant: property?.tenant_name || result.receipt.payer_name || '',
      rent: Math.max(Math.min(configuredRent, extractedAmount || configuredRent), 0),
      services: extractedAmount >= configuredRent + services ? services : 0,
      accountName: result.receipt.recipient_name || '',
      date: result.receipt.transaction_date || new Date().toISOString().slice(0, 10),
      reference: result.receipt.transaction_reference || '',
    });
  };

  return (
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scan an M-Pesa receipt</Text>
        <Text style={styles.cardSubtitle}>Paste the confirmation message, attach a screenshot, or use both for the best match.</Text>
        <Text style={styles.label}>M-PESA MESSAGE</Text>
        <TextInput value={receiptText} onChangeText={setReceiptText} multiline placeholder="Paste the complete M-Pesa confirmation message…" placeholderTextColor="#97A19D" style={styles.messageInput} />

        {imageDataUrl ? <Image source={{ uri: imageDataUrl }} style={styles.receiptImage} resizeMode="contain" /> : null}
        <View style={[styles.actionRow, compact && styles.stack]}>
          <Pressable onPress={chooseImage} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>{imageDataUrl ? 'Replace screenshot' : '+ Attach screenshot'}</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={analyze} style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.pressed]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Analyze & match</Text>}
          </Pressable>
        </View>
        {error ? <ErrorBox message={error} /> : null}
      </View>

      <View style={styles.resultColumn}>
        {!result ? (
          <View style={[styles.card, styles.emptyCard]}><Text style={styles.emptySymbol}>▣</Text><Text style={styles.emptyTitle}>Receipt details appear here</Text><Text style={styles.emptyText}>The extracted payment is never saved automatically.</Text></View>
        ) : (
          <View style={styles.card}>
            <View style={styles.resultHeader}><Text style={styles.cardTitle}>Extracted payment</Text><Confidence value={result.receipt.confidence} /></View>
            <Detail label="Reference" value={result.receipt.transaction_reference || 'Not found'} />
            <Detail label="Amount" value={result.receipt.amount == null ? 'Not found' : `KES ${result.receipt.amount.toLocaleString('en-KE')}`} />
            <Detail label="Date" value={result.receipt.transaction_date || 'Not found'} />
            <Detail label="Payer" value={result.receipt.payer_name || 'Not found'} />
            <Detail label="Paid to" value={result.receipt.recipient_name || 'Not found'} />

            {result.duplicate ? <View style={styles.duplicateBox}><Text style={styles.duplicateTitle}>Possible duplicate</Text><Text style={styles.duplicateText}>This reference already exists for House {result.duplicate.house_number}. Do not record it again.</Text></View> : null}

            <Text style={styles.matchesLabel}>AUTOMATIC MATCHES</Text>
            {result.candidates.map((candidate) => (
              <Pressable key={candidate.property.id} disabled={Boolean(result.duplicate)} onPress={() => useCandidate(candidate)} style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}>
                <View style={styles.matchHouse}><Text style={styles.matchHouseText}>{candidate.property.house_number}</Text></View>
                <View style={styles.matchCopy}><Text style={styles.matchName}>{candidate.property.tenant_name || 'No tenant'}</Text><Text style={styles.matchReason}>{candidate.reasons.join(' · ')}</Text></View>
                <Text style={styles.matchScore}>{candidate.score}%</Text>
              </Pressable>
            ))}
            {!result.candidates.length && !result.duplicate ? <Pressable onPress={() => useCandidate()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Use extracted details manually</Text></Pressable> : null}
          </View>
        )}
      </View>
    </View>
  );
}

function RemindersPanel({ compact, properties }: { compact: boolean; properties: AIProperty[] }) {
  const eligible = properties.filter((property) => property.id && (property.status === 'Overdue' || property.status === 'Partial'));
  const [selectedId, setSelectedId] = useState(eligible[0]?.id || '');
  const [tone, setTone] = useState<'polite' | 'firm' | 'final'>('polite');
  const [language, setLanguage] = useState<'en' | 'sw'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ReminderResult | null>(null);

  const generate = async () => {
    if (!selectedId) return setError('Choose an overdue or partially paid tenant.');
    setBusy(true); setError(''); setDraft(null);
    try { setDraft(await generatePaymentReminder(selectedId, tone, language)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not generate the reminder.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Draft a payment reminder</Text>
        <Text style={styles.cardSubtitle}>Messages are saved as drafts. Review them before sending through WhatsApp or SMS.</Text>
        <Text style={styles.label}>TENANT</Text>
        <View style={styles.choiceList}>
          {eligible.map((property) => <Choice key={property.id} active={selectedId === property.id} label={`House ${property.houseNumber}`} detail={`${property.tenant} · ${property.status}`} onPress={() => setSelectedId(property.id!)} />)}
          {!eligible.length && <Text style={styles.emptyText}>No overdue or partially paid properties were found.</Text>}
        </View>
        <Text style={styles.label}>TONE</Text>
        <View style={styles.pills}>{(['polite', 'firm', 'final'] as const).map((item) => <Pill key={item} active={tone === item} label={item} onPress={() => setTone(item)} />)}</View>
        <Text style={styles.label}>LANGUAGE</Text>
        <View style={styles.pills}><Pill active={language === 'en'} label="English" onPress={() => setLanguage('en')} /><Pill active={language === 'sw'} label="Swahili" onPress={() => setLanguage('sw')} /></View>
        <Pressable disabled={busy || !eligible.length} onPress={generate} style={({ pressed }) => [styles.primaryButton, (pressed || busy || !eligible.length) && styles.pressed]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Generate draft</Text>}
        </Pressable>
        {error ? <ErrorBox message={error} /> : null}
      </View>
      <View style={[styles.card, !draft && styles.emptyCard]}>
        {draft ? <><Text style={styles.draftSubject}>{draft.subject}</Text><Text selectable style={styles.draftMessage}>{draft.message}</Text><Text style={styles.draftBalance}>Calculated balance: KES {draft.balance.toLocaleString('en-KE')}</Text><Text style={styles.reviewNote}>Review this message before copying or sending it.</Text></> : <><Text style={styles.emptySymbol}>✦</Text><Text style={styles.emptyTitle}>Your draft appears here</Text><Text style={styles.emptyText}>AI will not send it automatically.</Text></>}
      </View>
    </View>
  );
}

function ReportingPanel() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<ReportResult | null>(null);
  const suggestions = ['Who has not fully paid this month?', 'How much rent was collected?', 'Who edited payment records recently?', 'Show open fraud alerts'];
  const ask = async (value = question) => {
    if (!value.trim()) return setError('Enter a question about your RentFlow records.');
    setQuestion(value); setBusy(true); setError(''); setAnswer(null);
    try { setAnswer(await askRentFlow(value)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not answer this question.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Ask RentFlow</Text>
      <Text style={styles.cardSubtitle}>A read-only assistant for payments, properties, audit history, and alerts.</Text>
      <View style={styles.suggestionWrap}>{suggestions.map((item) => <Pressable key={item} onPress={() => ask(item)} style={styles.suggestion}><Text style={styles.suggestionText}>{item}</Text></Pressable>)}</View>
      <TextInput value={question} onChangeText={setQuestion} multiline placeholder="Ask a question about your records…" placeholderTextColor="#97A19D" style={styles.askInput} />
      <Pressable disabled={busy} onPress={() => ask()} style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.pressed]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Ask securely</Text>}</Pressable>
      {error ? <ErrorBox message={error} /> : null}
      {answer ? <View style={styles.answerCard}><Text style={styles.answerText}>{answer.answer}</Text>{answer.supporting_facts.map((fact) => <View key={fact} style={styles.factRow}><View style={styles.factDot} /><Text style={styles.factText}>{fact}</Text></View>)}{answer.caveat ? <Text style={styles.caveat}>{answer.caveat}</Text> : null}</View> : null}
    </View>
  );
}

function AlertsPanel({ account }: { account: Account }) {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    if (!account.organizationId) return;
    setBusy(true); setError('');
    try { setAlerts(await fetchFraudAlerts(account.organizationId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load alerts.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [account.organizationId]);
  const review = async (alert: FraudAlert, status: 'reviewed' | 'dismissed') => {
    try { await updateFraudAlert(alert.id, status, account.id); setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, status } : item)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update the alert.'); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.resultHeader}><View><Text style={styles.cardTitle}>Audit & fraud alerts</Text><Text style={styles.cardSubtitle}>Deterministic checks run whenever payments are recorded or edited.</Text></View><Pressable onPress={load} style={styles.refreshButton}><Text style={styles.refreshText}>Refresh</Text></Pressable></View>
      {busy ? <ActivityIndicator color={palette.brand} style={styles.loader} /> : null}
      {error ? <ErrorBox message={error} /> : null}
      {!busy && !alerts.length ? <View style={styles.allClear}><Text style={styles.allClearMark}>✓</Text><View><Text style={styles.allClearTitle}>No alerts detected</Text><Text style={styles.allClearText}>RentFlow will flag unusual payment activity here.</Text></View></View> : null}
      {alerts.map((alert) => (
        <View key={alert.id} style={styles.alertCard}>
          <View style={[styles.severity, alert.severity === 'high' ? styles.severityHigh : alert.severity === 'medium' ? styles.severityMedium : styles.severityLow]}><Text style={styles.severityText}>{alert.severity.toUpperCase()}</Text></View>
          <View style={styles.alertBody}><Text style={styles.alertTitle}>{alert.title}</Text><Text style={styles.alertDetails}>{alert.details}</Text><Text style={styles.alertMeta}>{new Date(alert.created_at).toLocaleString('en-KE')} · {alert.status}</Text></View>
          {alert.status === 'open' && (account.role === 'Owner' || account.role === 'Manager') ? <View style={styles.alertActions}><Pressable onPress={() => review(alert, 'reviewed')}><Text style={styles.reviewLink}>Mark reviewed</Text></Pressable><Pressable onPress={() => review(alert, 'dismissed')}><Text style={styles.dismissLink}>Dismiss</Text></Pressable></View> : null}
        </View>
      ))}
    </View>
  );
}

function Confidence({ value }: { value: number }) { const percent = Math.round(value * 100); return <View style={[styles.confidence, percent < 70 && styles.confidenceLow]}><Text style={styles.confidenceText}>{percent}% confidence</Text></View>; }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
function ErrorBox({ message }: { message: string }) { return <View style={styles.errorBox}><Text style={styles.errorText}>{message}</Text></View>; }
function Pill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}><Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text></Pressable>; }
function Choice({ active, label, detail, onPress }: { active: boolean; label: string; detail: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><View style={[styles.radio, active && styles.radioActive]} /> <View><Text style={styles.choiceLabel}>{label}</Text><Text style={styles.choiceDetail}>{detail}</Text></View></Pressable>; }

const createStyles = () => StyleSheet.create({
  page: { paddingHorizontal: 38, paddingBottom: 50 },
  safetyBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 15, backgroundColor: palette.brandPale, borderWidth: 1, borderColor: '#CAE1D5' },
  safetyMark: { width: 37, height: 37, borderRadius: 12, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  safetyMarkText: { color: palette.surface, fontSize: 10, fontWeight: '900' }, safetyCopy: { flex: 1 },
  safetyTitle: { color: palette.brandDark, fontSize: 11, fontWeight: '800' }, safetyText: { color: '#587168', fontSize: 9, lineHeight: 14, marginTop: 3 },
  tabs: { flexDirection: 'row', gap: 7, paddingVertical: 14 }, tab: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  tabActive: { backgroundColor: palette.brandDark, borderColor: palette.brandDark }, tabSymbol: { color: palette.muted, fontSize: 13 }, tabText: { color: palette.muted, fontSize: 9, fontWeight: '700' }, tabTextActive: { color: palette.surface },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 }, stack: { flexDirection: 'column', alignItems: 'stretch' },
  card: { flex: 1, minWidth: 0, backgroundColor: palette.surface, borderWidth: 1, borderColor: '#FFFFFFC7', borderRadius: 22, padding: 20, shadowColor: palette.brandDark, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 3 }, resultColumn: { flex: 1, minWidth: 0 },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 }, cardSubtitle: { color: palette.muted, fontSize: 10, lineHeight: 16, marginTop: 5, marginBottom: 19 },
  label: { color: palette.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 7, marginTop: 6 },
  messageInput: { minHeight: 126, textAlignVertical: 'top', color: palette.ink, backgroundColor: '#FAFBF9', borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 13, fontSize: 11, lineHeight: 17 },
  receiptImage: { width: '100%', height: 190, backgroundColor: palette.canvas, borderRadius: 12, marginTop: 12 }, actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 9, marginTop: 13 },
  primaryButton: { minHeight: 44, backgroundColor: palette.brand, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, primaryButtonText: { color: palette.surface, fontSize: 10, fontWeight: '800' },
  secondaryButton: { minHeight: 44, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, secondaryButtonText: { color: palette.brandDark, fontSize: 9, fontWeight: '800' }, pressed: { opacity: 0.7 },
  errorBox: { backgroundColor: palette.redPale, borderRadius: 10, padding: 11, marginTop: 12 }, errorText: { color: palette.red, fontSize: 9, lineHeight: 14 },
  emptyCard: { minHeight: 290, alignItems: 'center', justifyContent: 'center' }, emptySymbol: { color: palette.brand, fontSize: 28 }, emptyTitle: { color: palette.ink, fontSize: 12, fontWeight: '800', marginTop: 11 }, emptyText: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 5, textAlign: 'center' },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, confidence: { backgroundColor: palette.brandPale, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, confidenceLow: { backgroundColor: palette.amberPale }, confidenceText: { color: palette.brandDark, fontSize: 8, fontWeight: '800' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: '#EDF0ED', paddingVertical: 11 }, detailLabel: { color: palette.muted, fontSize: 9 }, detailValue: { color: palette.ink, fontSize: 10, fontWeight: '700', textAlign: 'right', flex: 1 },
  duplicateBox: { backgroundColor: palette.redPale, borderRadius: 10, padding: 11, marginTop: 8 }, duplicateTitle: { color: palette.red, fontSize: 10, fontWeight: '800' }, duplicateText: { color: '#8B4B47', fontSize: 9, lineHeight: 14, marginTop: 3 }, matchesLabel: { color: palette.muted, fontSize: 8, letterSpacing: 0.8, fontWeight: '800', marginTop: 17, marginBottom: 7 },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 11, padding: 10, marginBottom: 7 }, matchHouse: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.brandPale, alignItems: 'center', justifyContent: 'center' }, matchHouseText: { color: palette.brandDark, fontSize: 10, fontWeight: '900' }, matchCopy: { flex: 1 }, matchName: { color: palette.ink, fontSize: 10, fontWeight: '700' }, matchReason: { color: palette.muted, fontSize: 8, marginTop: 3 }, matchScore: { color: palette.brand, fontSize: 10, fontWeight: '900' },
  choiceList: { gap: 7, marginBottom: 14 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 10 }, choiceActive: { borderColor: palette.brand, backgroundColor: palette.brandPale }, radio: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#A8B1AD' }, radioActive: { borderColor: palette.brand, backgroundColor: palette.brand }, choiceLabel: { color: palette.ink, fontSize: 10, fontWeight: '700' }, choiceDetail: { color: palette.muted, fontSize: 8, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }, pill: { backgroundColor: palette.canvas, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, pillActive: { backgroundColor: palette.brandDark }, pillText: { color: palette.muted, fontSize: 9, fontWeight: '700', textTransform: 'capitalize' }, pillTextActive: { color: palette.surface },
  draftSubject: { color: palette.ink, fontSize: 14, fontWeight: '900' }, draftMessage: { color: palette.ink, fontSize: 12, lineHeight: 21, backgroundColor: palette.canvas, borderRadius: 12, padding: 15, marginTop: 14 }, draftBalance: { color: palette.brandDark, fontSize: 10, fontWeight: '800', marginTop: 13 }, reviewNote: { color: palette.amber, fontSize: 8, marginTop: 6 },
  suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 13 }, suggestion: { backgroundColor: palette.canvas, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 }, suggestionText: { color: palette.brandDark, fontSize: 8, fontWeight: '700' }, askInput: { minHeight: 105, textAlignVertical: 'top', color: palette.ink, backgroundColor: '#FAFBF9', borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 13, fontSize: 11, marginBottom: 10 },
  answerCard: { backgroundColor: palette.brandPale, borderRadius: 13, padding: 15, marginTop: 15 }, answerText: { color: palette.ink, fontSize: 12, lineHeight: 19, fontWeight: '600' }, factRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 9 }, factDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.brand, marginTop: 5 }, factText: { color: '#4F665E', fontSize: 9, lineHeight: 14, flex: 1 }, caveat: { color: palette.amber, fontSize: 8, marginTop: 12 },
  refreshButton: { backgroundColor: palette.canvas, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 }, refreshText: { color: palette.brandDark, fontSize: 8, fontWeight: '800' }, loader: { marginVertical: 30 }, allClear: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: palette.brandPale, borderRadius: 12, padding: 14, marginTop: 4 }, allClearMark: { color: palette.brand, fontSize: 18, fontWeight: '900' }, allClearTitle: { color: palette.brandDark, fontSize: 11, fontWeight: '800' }, allClearText: { color: palette.muted, fontSize: 8, marginTop: 3 },
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, borderTopColor: '#EDF0ED', paddingVertical: 14 }, severity: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 }, severityHigh: { backgroundColor: palette.redPale }, severityMedium: { backgroundColor: palette.amberPale }, severityLow: { backgroundColor: palette.bluePale }, severityText: { color: palette.ink, fontSize: 7, fontWeight: '900' }, alertBody: { flex: 1 }, alertTitle: { color: palette.ink, fontSize: 10, fontWeight: '800' }, alertDetails: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 4 }, alertMeta: { color: '#929C98', fontSize: 7, marginTop: 6 }, alertActions: { alignItems: 'flex-end', gap: 8 }, reviewLink: { color: palette.brand, fontSize: 8, fontWeight: '800' }, dismissLink: { color: palette.muted, fontSize: 8 },
  setupCard: { backgroundColor: palette.amberPale, borderRadius: 16, padding: 22, alignItems: 'center' }, setupTitle: { color: palette.ink, fontSize: 13, fontWeight: '800' }, setupText: { color: palette.muted, fontSize: 9, lineHeight: 15, marginTop: 5, textAlign: 'center', maxWidth: 500 },
});

let styles = createStyles();
