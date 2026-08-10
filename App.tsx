import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { AuthProvider, type Account, useAuth } from './src/auth/AuthProvider';
import { AuthScreen } from './src/auth/AuthScreen';
import { AIWorkspace, type ReceiptPrefill } from './src/ai/AIWorkspace';
import { addOrganizationMember, fetchAuditEvents, fetchPayments, fetchProperties, savePaymentRecord, savePropertyRecord, type StoredAuditEvent, type StoredPayment, type StoredProperty } from './src/data/records';
import { ThemeProvider, themes, type ThemeName, type ThemePalette, useTheme } from './src/theme/ThemeProvider';

type Screen = 'overview' | 'properties' | 'collections' | 'ai' | 'activity';
type PaymentStatus = 'Paid' | 'Partial' | 'Overdue';

type Property = {
  id?: string;
  houseNumber: string;
  tenant: string;
  rent: number;
  services: number;
  status: PaymentStatus | 'Vacant';
};

type Payment = {
  id: string;
  houseNumber: string;
  tenant: string;
  rent: number;
  services: number;
  deposit: number;
  accountName: string;
  date: string;
  reference: string;
  status: PaymentStatus;
  recordedBy: string;
  recordedAt: string;
};

type CollectionDraft = Omit<Payment, 'id' | 'status' | 'recordedBy' | 'recordedAt'>;

type AuditEvent = {
  id: string;
  actorName: string;
  actorRole: string;
  action: 'Created' | 'Updated' | 'Deleted';
  entity: 'Payment' | 'Property' | 'Tenant' | 'Account';
  subject: string;
  detail: string;
  occurredAt: string;
};

const colors: ThemePalette = {
  ink: '#172622',
  muted: '#687670',
  canvas: '#F4F6F1',
  surface: '#FFFFFF',
  line: '#DEE5DE',
  brand: '#176B52',
  brandDark: '#0C4B39',
  brandPale: '#E1F2EA',
  amber: '#C57A22',
  amberPale: '#FFF1D9',
  red: '#B84A43',
  redPale: '#FBE7E5',
  bluePale: '#E4EEF9',
  glowOne: '#A9E5CA',
  glowTwo: '#D7E7A8',
};

const demoProperties: Property[] = [
  { houseNumber: '274', tenant: 'Jane Wanjiku', rent: 28000, services: 2000, status: 'Paid' },
  { houseNumber: '118', tenant: 'Brian Ouma', rent: 22000, services: 1500, status: 'Overdue' },
  { houseNumber: '203', tenant: 'Amina Yusuf', rent: 26000, services: 1800, status: 'Paid' },
  { houseNumber: '312', tenant: 'No tenant', rent: 32000, services: 2000, status: 'Vacant' },
  { houseNumber: '105', tenant: 'Lydia Njeri', rent: 18000, services: 1200, status: 'Partial' },
  { houseNumber: '405', tenant: 'Peter Mwangi', rent: 30000, services: 2000, status: 'Paid' },
];

const initialPayments: Payment[] = [
  {
    id: '1', houseNumber: '274', tenant: 'Jane Wanjiku', rent: 28000, services: 2000,
    deposit: 0, accountName: 'Kamau Properties', date: '1 Aug 2026', reference: 'QH82K4D6PZ', status: 'Paid', recordedBy: 'Ray Kamau', recordedAt: '1 Aug 2026, 9:14 AM',
  },
  {
    id: '2', houseNumber: '203', tenant: 'Amina Yusuf', rent: 26000, services: 1800,
    deposit: 0, accountName: 'Kamau Properties', date: '3 Aug 2026', reference: 'QH93TM2L8A', status: 'Paid', recordedBy: 'Grace Njeri', recordedAt: '3 Aug 2026, 11:32 AM',
  },
  {
    id: '3', houseNumber: '105', tenant: 'Lydia Njeri', rent: 10000, services: 1200,
    deposit: 0, accountName: 'Kamau Properties', date: '5 Aug 2026', reference: 'QH54WN7C1R', status: 'Partial', recordedBy: 'Ray Kamau', recordedAt: '5 Aug 2026, 4:08 PM',
  },
];

const initialAuditEvents: AuditEvent[] = [
  { id: 'a1', actorName: 'Ray Kamau', actorRole: 'Owner', action: 'Updated', entity: 'Property', subject: 'House 274', detail: 'Monthly rent changed from KES 27,000 to KES 28,000', occurredAt: 'Today, 9:42 AM' },
  { id: 'a2', actorName: 'Grace Njeri', actorRole: 'Collector', action: 'Created', entity: 'Payment', subject: 'House 203', detail: 'Recorded payment QH93TM2L8A for KES 27,800', occurredAt: '3 Aug 2026, 11:32 AM' },
  { id: 'a3', actorName: 'Ray Kamau', actorRole: 'Owner', action: 'Updated', entity: 'Tenant', subject: 'House 118', detail: 'Updated tenant contact and marked the account overdue', occurredAt: '2 Aug 2026, 2:15 PM' },
  { id: 'a4', actorName: 'Ray Kamau', actorRole: 'Owner', action: 'Created', entity: 'Account', subject: 'Grace Njeri', detail: 'Added a team member with the Collector role', occurredAt: '1 Aug 2026, 8:30 AM' },
];

const money = (value: number) => `KES ${value.toLocaleString('en-KE')}`;
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
const firstName = (name: string) => name.trim().split(' ')[0] || 'there';
const relationName = (relation: { full_name: string } | Array<{ full_name: string }> | null) => Array.isArray(relation) ? relation[0]?.full_name : relation?.full_name;
const displayDate = (value: string, includeTime = false) => new Intl.DateTimeFormat('en-KE', includeTime
  ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
  : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

const paymentFromRecord = (record: StoredPayment): Payment => ({
  id: record.id,
  houseNumber: record.house_number,
  tenant: record.tenant_name,
  rent: Number(record.rent_amount),
  services: Number(record.service_amount),
  deposit: Number(record.deposit_amount),
  accountName: record.paid_to_name,
  date: displayDate(record.payment_date),
  reference: record.payment_reference,
  status: `${record.status.charAt(0).toUpperCase()}${record.status.slice(1)}` as PaymentStatus,
  recordedBy: relationName(record.creator) ?? 'Former team member',
  recordedAt: displayDate(record.created_at, true),
});

const auditFromRecord = (record: StoredAuditEvent): AuditEvent => {
  const values = record.new_values ?? record.old_values ?? {};
  const house = String(values.house_number ?? 'record');
  const entity = record.entity_type === 'payments' ? 'Payment' : record.entity_type === 'organization_members' ? 'Account' : 'Property';
  const action = record.action === 'INSERT' ? 'Created' : record.action === 'DELETE' ? 'Deleted' : 'Updated';
  const changed = record.changed_fields.length ? `Changed ${record.changed_fields.join(', ').replaceAll('_', ' ')}` : `${action} this ${entity.toLowerCase()}`;
  return {
    id: `${record.id}`,
    actorName: relationName(record.actor) ?? 'Former team member',
    actorRole: 'Team member',
    action,
    entity,
    subject: entity === 'Account' ? 'Team access' : `House ${house}`,
    detail: changed,
    occurredAt: displayDate(record.occurred_at, true),
  };
};

const propertyFromRecord = (record: StoredProperty): Property => ({
  id: record.id,
  houseNumber: record.house_number,
  tenant: record.tenant_name || 'No tenant',
  rent: Number(record.monthly_rent),
  services: Number(record.service_charge),
  status: `${record.status.charAt(0).toUpperCase()}${record.status.slice(1)}` as Property['status'],
});

export default function App() {
  return <ThemeProvider><AuthProvider><RentFlowApp /></AuthProvider></ThemeProvider>;
}

function RentFlowApp() {
  const { width } = useWindowDimensions();
  const compact = width < 840;
  const { palette } = useTheme();
  Object.assign(colors, palette);
  styles = createStyles();
  const { account, loading, passwordRecovery, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>('overview');
  const [payments, setPayments] = useState(initialPayments);
  const [propertyRecords, setPropertyRecords] = useState(demoProperties);
  const [auditEvents, setAuditEvents] = useState(initialAuditEvents);
  const [latestPayment, setLatestPayment] = useState<Payment | null>(null);
  const [notice, setNotice] = useState('');
  const [receiptPrefill, setReceiptPrefill] = useState<ReceiptPrefill | null>(null);

  useEffect(() => {
    if (!account) return;
    if (account.demo) {
      setPayments(initialPayments);
      setPropertyRecords(demoProperties);
      setAuditEvents(initialAuditEvents);
      setLatestPayment(null);
      return;
    }
    if (!account.organizationId) return;
    let active = true;
    setPayments([]);
    setPropertyRecords([]);
    setAuditEvents([]);
    Promise.all([fetchPayments(account.organizationId), fetchProperties(account.organizationId), fetchAuditEvents(account.organizationId)])
      .then(([storedPayments, storedProperties, storedEvents]) => {
        if (!active) return;
        setPayments(storedPayments.map(paymentFromRecord));
        setPropertyRecords(storedProperties.map(propertyFromRecord));
        setAuditEvents(storedEvents.map(auditFromRecord));
      })
      .catch((caught) => {
        if (active) setNotice(caught instanceof Error ? caught.message : 'Could not load workspace records.');
      });
    return () => { active = false; };
  }, [account?.id, account?.organizationId, account?.demo]);

  if (loading) {
    return <View style={styles.loadingPage}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  if (passwordRecovery || !account) return <AuthScreen />;

  const addPayment = async (draft: CollectionDraft) => {
    const liveId = account.organizationId && !account.demo
      ? await savePaymentRecord({ ...draft, organizationId: account.organizationId, actorId: account.id })
      : `${Date.now()}`;
    const payment: Payment = {
      ...draft,
      id: liveId,
      status: 'Paid',
      recordedBy: account.fullName,
      recordedAt: 'Just now',
    };
    setPayments((current) => [payment, ...current]);
    setLatestPayment(payment);
    setAuditEvents((current) => [{
      id: `audit-${Date.now()}`,
      actorName: account.fullName,
      actorRole: account.role,
      action: 'Created',
      entity: 'Payment',
      subject: `House ${payment.houseNumber}`,
      detail: `Recorded payment ${payment.reference} for ${money(payment.rent + payment.services + payment.deposit)}`,
      occurredAt: 'Just now',
    }, ...current]);
    setNotice(`Payment for House ${payment.houseNumber} saved successfully.`);
  };

  const addTeamMember = async (email: string, role: 'Manager' | 'Collector' | 'Viewer') => {
    if (account.organizationId && !account.demo) {
      await addOrganizationMember(account.organizationId, email, role.toLowerCase() as 'manager' | 'collector' | 'viewer');
    }
    setAuditEvents((current) => [{
      id: `audit-member-${Date.now()}`,
      actorName: account.fullName,
      actorRole: account.role,
      action: 'Created',
      entity: 'Account',
      subject: email,
      detail: `Added a team member with the ${role} role`,
      occurredAt: 'Just now',
    }, ...current]);
    setNotice(`${email} added as ${role}.`);
  };

  const addProperty = async (draft: Omit<Property, 'status'>) => {
    if (account.organizationId && !account.demo) {
      await savePropertyRecord({ ...draft, organizationId: account.organizationId, actorId: account.id });
    }
    const property: Property = { ...draft, status: draft.tenant.trim() ? 'Overdue' : 'Vacant' };
    setPropertyRecords((current) => [...current, property].sort((a, b) => a.houseNumber.localeCompare(b.houseNumber, undefined, { numeric: true })));
    setAuditEvents((current) => [{
      id: `audit-property-${Date.now()}`,
      actorName: account.fullName,
      actorRole: account.role,
      action: 'Created',
      entity: 'Property',
      subject: `House ${property.houseNumber}`,
      detail: `Created property record with monthly rent of ${money(property.rent)}`,
      occurredAt: 'Just now',
    }, ...current]);
    setNotice(`House ${property.houseNumber} added successfully.`);
  };

  const useScannedReceipt = (prefill: ReceiptPrefill) => {
    setReceiptPrefill(prefill);
    setScreen('collections');
    setNotice('Receipt matched. Review every field before saving the collection.');
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.appAmbient}>
        <View style={[styles.appGlow, styles.appGlowOne]} />
        <View style={[styles.appGlow, styles.appGlowTwo]} />
      </View>
      <View style={[styles.shell, compact && styles.shellCompact]}>
        {!compact && <Sidebar active={screen} onNavigate={setScreen} account={account} onSignOut={signOut} />}

        <View style={styles.main}>
          <Topbar compact={compact} screen={screen} account={account} />
          {notice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeDot}>✓</Text>
              <Text style={styles.noticeText}>{notice}</Text>
              <Pressable onPress={() => setNotice('')} hitSlop={10}>
                <Text style={styles.noticeClose}>×</Text>
              </Pressable>
            </View>
          ) : null}

          {screen === 'overview' && (
            <OverviewScreen
              compact={compact}
              payments={payments}
              properties={propertyRecords}
              onCollect={() => setScreen('collections')}
            />
          )}
          {screen === 'properties' && <PropertiesScreen compact={compact} properties={propertyRecords} onAdd={addProperty} canManage={account.role === 'Owner' || account.role === 'Manager'} />}
          {screen === 'collections' && (
            <CollectionsScreen
              compact={compact}
              properties={propertyRecords}
              prefill={receiptPrefill}
              latestPayment={latestPayment}
              onSave={addPayment}
            />
          )}
          {screen === 'ai' && <AIWorkspace compact={compact} account={account} properties={propertyRecords} onUseReceipt={useScannedReceipt} />}
          {screen === 'activity' && <ActivityScreen events={auditEvents} account={account} onSignOut={signOut} onAddMember={addTeamMember} compact={compact} />}
        </View>
      </View>
      {compact && <BottomNav active={screen} onNavigate={setScreen} />}
    </SafeAreaView>
  );
}

function Brand() {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
      <View>
        <Text style={styles.brandName}>RentFlow</Text>
        <Text style={styles.brandTag}>Property manager</Text>
      </View>
    </View>
  );
}

function Sidebar({ active, onNavigate, account, onSignOut }: { active: Screen; onNavigate: (screen: Screen) => void; account: Account; onSignOut: () => Promise<void> }) {
  return (
    <View style={styles.sidebar}>
      <Brand />
      <Text style={styles.navLabel}>WORKSPACE</Text>
      <NavButton label="Overview" symbol="◫" selected={active === 'overview'} onPress={() => onNavigate('overview')} />
      <NavButton label="Properties" symbol="⌂" selected={active === 'properties'} onPress={() => onNavigate('properties')} />
      <NavButton label="Collections" symbol="↗" selected={active === 'collections'} onPress={() => onNavigate('collections')} />
      <NavButton label="AI tools" symbol="✦" selected={active === 'ai'} onPress={() => onNavigate('ai')} />
      <NavButton label="Activity" symbol="◷" selected={active === 'activity'} onPress={() => onNavigate('activity')} />
      <View style={styles.sidebarSpacer} />
      <View style={styles.helpCard}>
        <Text style={styles.helpEyebrow}>SECURE WORKSPACE</Text>
        <Text style={styles.helpTitle}>Changes stay traceable</Text>
        <Text style={styles.helpBody}>Every important record is tied to a named account.</Text>
      </View>
      <Pressable onPress={onSignOut} style={({ pressed }) => [styles.profileRow, pressed && styles.pressed]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(account.fullName)}</Text></View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{account.fullName}</Text>
          <Text style={styles.profileRole}>{account.role} · Sign out</Text>
        </View>
      </Pressable>
    </View>
  );
}

function NavButton({ label, symbol, selected, onPress }: { label: string; symbol: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navButton, selected && styles.navButtonSelected, pressed && styles.pressed]}>
      <Text style={[styles.navSymbol, selected && styles.navTextSelected]}>{symbol}</Text>
      <Text style={[styles.navText, selected && styles.navTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Topbar({ compact, screen, account }: { compact: boolean; screen: Screen; account: Account }) {
  const titles: Record<Screen, [string, string]> = {
    overview: [`Good morning, ${firstName(account.fullName)}`, 'Here is how rent collection is going this month.'],
    properties: ['Properties', 'Manage houses, tenants, rent, and service charges.'],
    collections: ['Record a collection', 'Capture payment details and prepare an invoice.'],
    ai: ['RentFlow AI', 'Scan receipts, draft reminders, ask questions, and review risk alerts.'],
    activity: ['Activity history', 'See who created or edited every important record.'],
  };
  return (
    <View style={[styles.topbar, compact && styles.topbarCompact]}>
      <View style={styles.topbarTitleWrap}>
        {compact && <Brand />}
        <Text style={[styles.pageTitle, compact && styles.pageTitleCompact]}>{titles[screen][0]}</Text>
        <Text style={styles.pageSubtitle}>{titles[screen][1]}</Text>
      </View>
      <WorkspaceThemePicker compact={compact} />
      {!compact && (
        <View style={styles.periodPill}>
          <Text style={styles.periodPillLabel}>Period</Text>
          <Text style={styles.periodPillValue}>August 2026⌄</Text>
        </View>
      )}
    </View>
  );
}

function WorkspaceThemePicker({ compact }: { compact: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <View style={styles.workspaceThemePicker}>
      {(Object.keys(themes) as ThemeName[]).map((name) => (
        <Pressable key={name} accessibilityLabel={`Use ${themes[name].label} theme`} onPress={() => setTheme(name)} style={[styles.workspaceThemeChoice, theme === name && styles.workspaceThemeChoiceActive]}>
          <View style={[styles.workspaceThemeDot, { backgroundColor: themes[name].palette.brand }]} />
          {!compact && <Text style={[styles.workspaceThemeText, theme === name && styles.workspaceThemeTextActive]}>{themes[name].label}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

function OverviewScreen({ compact, payments, properties, onCollect }: { compact: boolean; payments: Payment[]; properties: Property[]; onCollect: () => void }) {
  const collected = payments.reduce((total, payment) => total + payment.rent + payment.services + payment.deposit, 0);
  const expected = properties.filter((property) => property.status !== 'Vacant').reduce((total, property) => total + property.rent + property.services, 0);
  const outstanding = Math.max(expected - collected, 0);
  const occupiedCount = properties.filter((property) => property.status !== 'Vacant').length;
  const occupancy = properties.length ? Math.round((occupiedCount / properties.length) * 100) : 0;
  const collectionPercent = expected ? Math.min(Math.round((collected / expected) * 100), 100) : 0;
  const paidCount = properties.filter((property) => property.status === 'Paid').length;
  const partialCount = properties.filter((property) => property.status === 'Partial').length;
  const overdueCount = properties.filter((property) => property.status === 'Overdue').length;
  const paidPercent = occupiedCount ? Math.round((paidCount / occupiedCount) * 100) : 0;
  const attentionProperty = properties.find((property) => property.status === 'Overdue');

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.metricsGrid}>
        <MetricCard label="Collected" value={money(collected)} detail={`${collectionPercent}% of expected`} tone="green" />
        <MetricCard label="Expected" value={money(expected)} detail="Rent + service charges" tone="blue" />
        <MetricCard label="Outstanding" value={money(outstanding)} detail="Follow-up required" tone="amber" />
        <MetricCard label="Occupancy" value={`${occupancy}%`} detail={`${occupiedCount} of ${properties.length} houses occupied`} tone="plain" />
      </View>

      <View style={[styles.dashboardColumns, compact && styles.columnStack]}>
        <View style={styles.dashboardMainColumn}>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Recent collections</Text>
                <Text style={styles.sectionSubtitle}>Latest rent and service payments</Text>
              </View>
              <Pressable onPress={onCollect} style={({ pressed }) => [styles.primaryButtonSmall, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>+ Record payment</Text>
              </Pressable>
            </View>
            <View style={styles.paymentList}>
              {payments.slice(0, 5).map((payment) => (
                <PaymentRow key={payment.id} payment={payment} compact={compact} />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.dashboardSideColumn}>
          <View style={[styles.sectionCard, styles.progressCard]}>
            <Text style={styles.sectionTitle}>Collection progress</Text>
            <View style={styles.progressRing}>
              <Text style={styles.progressValue}>{paidPercent}%</Text>
              <Text style={styles.progressLabel}>fully paid</Text>
            </View>
            <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: colors.brand }]} /><Text style={styles.legendText}>Paid</Text><Text style={styles.legendNumber}>{paidCount}</Text></View>
            <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: colors.amber }]} /><Text style={styles.legendText}>Partial</Text><Text style={styles.legendNumber}>{partialCount}</Text></View>
            <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: colors.red }]} /><Text style={styles.legendText}>Overdue</Text><Text style={styles.legendNumber}>{overdueCount}</Text></View>
          </View>

          {attentionProperty && <View style={[styles.sectionCard, styles.attentionCard]}>
            <Text style={styles.attentionEyebrow}>NEEDS ATTENTION</Text>
            <Text style={styles.attentionTitle}>House {attentionProperty.houseNumber} is overdue</Text>
            <Text style={styles.attentionBody}>{attentionProperty.tenant} has an outstanding balance of {money(attentionProperty.rent + attentionProperty.services)}.</Text>
          </View>}
        </View>
      </View>
    </ScrollView>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'green' | 'blue' | 'amber' | 'plain' }) {
  const backgrounds = { green: colors.brandPale, blue: colors.bluePale, amber: colors.amberPale, plain: colors.surface };
  return (
    <View style={[styles.metricCard, { backgroundColor: backgrounds[tone] }]}>
      <View style={styles.metricTopRow}>
        <Text style={styles.metricLabel}>{label}</Text>
        <View style={[styles.metricDot, tone === 'green' && { backgroundColor: colors.brand }, tone === 'amber' && { backgroundColor: colors.amber }]} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function PaymentRow({ payment, compact }: { payment: Payment; compact: boolean }) {
  const total = payment.rent + payment.services + payment.deposit;
  return (
    <View style={[styles.paymentRow, compact && styles.paymentRowCompact]}>
      <View style={styles.houseBadge}><Text style={styles.houseBadgeText}>{payment.houseNumber}</Text></View>
      <View style={styles.paymentPerson}>
        <Text style={styles.paymentName}>{payment.tenant}</Text>
        <Text style={styles.paymentMeta}>{payment.date} · {payment.reference}</Text>
        <Text style={styles.paymentEditor}>Recorded by {payment.recordedBy}</Text>
      </View>
      <View style={styles.paymentAmountWrap}>
        <Text style={styles.paymentAmount}>{money(total)}</Text>
        <StatusBadge status={payment.status} />
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: Property['status'] }) {
  const style = status === 'Paid' ? styles.badgePaid : status === 'Partial' ? styles.badgePartial : status === 'Vacant' ? styles.badgeVacant : styles.badgeOverdue;
  return <View style={[styles.statusBadge, style]}><Text style={[styles.statusText, status === 'Overdue' && styles.statusTextOverdue]}>{status}</Text></View>;
}

function PropertiesScreen({ compact, properties, onAdd, canManage }: { compact: boolean; properties: Property[]; onAdd: (draft: Omit<Property, 'status'>) => Promise<void>; canManage: boolean }) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [draft, setDraft] = useState({ houseNumber: '', tenant: '', rent: '', services: '' });
  const filtered = properties.filter((property) => `${property.houseNumber} ${property.tenant}`.toLowerCase().includes(query.toLowerCase()));
  const updateDraft = (field: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const submitProperty = async () => {
    setFormError('');
    if (!draft.houseNumber.trim()) return setFormError('Enter a house number.');
    if (!draft.rent || Number(draft.rent) <= 0) return setFormError('Enter the monthly rent.');
    setSaving(true);
    try {
      await onAdd({
        houseNumber: draft.houseNumber.trim(), tenant: draft.tenant.trim(),
        rent: Number(draft.rent), services: Number(draft.services || 0),
      });
      setDraft({ houseNumber: '', tenant: '', rent: '', services: '' });
      setAdding(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not add this property.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search house or tenant"
          placeholderTextColor="#87918D"
          style={styles.searchInput}
        />
        {canManage && <Pressable onPress={() => setAdding((value) => !value)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{adding ? 'Close form' : '+ Add property'}</Text>
        </Pressable>}
      </View>
      {adding && (
        <View style={[styles.sectionCard, styles.propertyFormCard]}>
          <View><Text style={styles.sectionTitle}>New property</Text><Text style={styles.sectionSubtitle}>Create the house and optionally assign its first tenant.</Text></View>
          <View style={styles.propertyFormGrid}>
            <FormField label="House number" value={draft.houseNumber} onChangeText={(value) => updateDraft('houseNumber', value)} placeholder="e.g. 274" />
            <FormField label="Tenant name (optional)" value={draft.tenant} onChangeText={(value) => updateDraft('tenant', value)} placeholder="Leave blank if vacant" />
            <FormField label="Monthly rent" value={draft.rent} onChangeText={(value) => updateDraft('rent', value.replace(/[^0-9]/g, ''))} placeholder="0" keyboardType="numeric" prefix="KES" />
            <FormField label="Water & garbage" value={draft.services} onChangeText={(value) => updateDraft('services', value.replace(/[^0-9]/g, ''))} placeholder="0" keyboardType="numeric" prefix="KES" />
          </View>
          {formError ? <Text style={styles.saveError}>{formError}</Text> : null}
          <Pressable disabled={saving} onPress={submitProperty} style={({ pressed }) => [styles.propertySubmitButton, (pressed || saving) && styles.pressed]}>
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Create property record</Text>}
          </Pressable>
        </View>
      )}
      <View style={styles.propertyGrid}>
        {filtered.map((property) => (
          <View key={property.houseNumber} style={styles.propertyCard}>
            <View style={styles.propertyCardTop}>
              <View>
                <Text style={styles.propertyEyebrow}>HOUSE</Text>
                <Text style={styles.propertyNumber}>{property.houseNumber}</Text>
              </View>
              <StatusBadge status={property.status} />
            </View>
            <View style={styles.propertyDivider} />
            <Text style={styles.propertyTenant}>{property.tenant}</Text>
            <Text style={styles.propertyTenantLabel}>{property.status === 'Vacant' ? 'Ready for occupancy' : 'Current tenant'}</Text>
            <View style={styles.propertyMoneyRow}>
              <View><Text style={styles.miniLabel}>MONTHLY RENT</Text><Text style={styles.miniValue}>{money(property.rent)}</Text></View>
              <View><Text style={styles.miniLabel}>WATER & GARBAGE</Text><Text style={styles.miniValue}>{money(property.services)}</Text></View>
            </View>
          </View>
        ))}
        {!filtered.length && <View style={styles.emptyState}><Text style={styles.emptyTitle}>No properties found</Text><Text style={styles.emptyText}>{query ? 'Try another house number or tenant name.' : 'Create the first property to start keeping records.'}</Text></View>}
      </View>
    </ScrollView>
  );
}

function ActivityScreen({ events, account, onSignOut, onAddMember, compact }: { events: AuditEvent[]; account: Account; onSignOut: () => Promise<void>; onAddMember: (email: string, role: 'Manager' | 'Collector' | 'Viewer') => Promise<void>; compact: boolean }) {
  const [filter, setFilter] = useState<'All' | AuditEvent['entity']>('All');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'Manager' | 'Collector' | 'Viewer'>('Collector');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberMessage, setMemberMessage] = useState('');
  const [memberError, setMemberError] = useState('');
  const visibleEvents = filter === 'All' ? events : events.filter((event) => event.entity === filter);
  const filters: Array<'All' | AuditEvent['entity']> = ['All', 'Payment', 'Property', 'Tenant', 'Account'];

  const submitMember = async () => {
    setMemberError('');
    setMemberMessage('');
    if (!memberEmail.includes('@')) return setMemberError('Enter the email address used for their RentFlow account.');
    setMemberBusy(true);
    try {
      await onAddMember(memberEmail.trim(), memberRole);
      setMemberMessage(`${memberEmail.trim()} can now access this workspace as ${memberRole}.`);
      setMemberEmail('');
    } catch (caught) {
      setMemberError(caught instanceof Error ? caught.message : 'Could not add this team member.');
    } finally {
      setMemberBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.accountSummary, compact && styles.accountSummaryCompact]}>
        <View style={styles.accountIdentity}>
          <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{initials(account.fullName)}</Text></View>
          <View>
            <Text style={styles.accountName}>{account.fullName}</Text>
            <Text style={styles.accountMeta}>{account.email} · {account.role}{account.demo ? ' · Demo workspace' : ''}</Text>
          </View>
        </View>
        <Pressable onPress={onSignOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.auditAssurance}>
        <View style={styles.auditShield}><Text style={styles.auditShieldText}>✓</Text></View>
        <View style={styles.auditAssuranceCopy}>
          <Text style={styles.auditAssuranceTitle}>Protected audit trail</Text>
          <Text style={styles.auditAssuranceText}>Live records are time-stamped by the database and cannot be edited or deleted from staff accounts.</Text>
        </View>
      </View>

      {account.role === 'Owner' && (
        <View style={[styles.sectionCard, styles.teamCard]}>
          <View>
            <Text style={styles.sectionTitle}>Add a team account</Text>
            <Text style={styles.sectionSubtitle}>They should create their account first; then add the same email here.</Text>
          </View>
          <View style={[styles.teamForm, compact && styles.teamFormCompact]}>
            <TextInput
              value={memberEmail}
              onChangeText={setMemberEmail}
              placeholder="team.member@example.com"
              placeholderTextColor="#97A19D"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.teamEmailInput}
            />
            <View style={styles.teamRoles}>
              {(['Manager', 'Collector', 'Viewer'] as const).map((role) => (
                <Pressable key={role} onPress={() => setMemberRole(role)} style={[styles.teamRole, memberRole === role && styles.teamRoleActive]}>
                  <Text style={[styles.teamRoleText, memberRole === role && styles.teamRoleTextActive]}>{role}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable disabled={memberBusy} onPress={submitMember} style={({ pressed }) => [styles.addMemberButton, (pressed || memberBusy) && styles.pressed]}>
              {memberBusy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.addMemberText}>Add member</Text>}
            </Pressable>
          </View>
          {memberError ? <Text style={styles.memberError}>{memberError}</Text> : null}
          {memberMessage ? <Text style={styles.memberSuccess}>{memberMessage}</Text> : null}
        </View>
      )}

      <View style={styles.sectionCard}>
        <View style={[styles.sectionHeader, compact && styles.auditHeaderCompact]}>
          <View>
            <Text style={styles.sectionTitle}>Record history</Text>
            <Text style={styles.sectionSubtitle}>{visibleEvents.length} recorded activities</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.auditFilters}>
            {filters.map((item) => (
              <Pressable key={item} onPress={() => setFilter(item)} style={[styles.auditFilter, filter === item && styles.auditFilterActive]}>
                <Text style={[styles.auditFilterText, filter === item && styles.auditFilterTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.auditList}>
          {visibleEvents.map((event) => (
            <View key={event.id} style={[styles.auditRow, compact && styles.auditRowCompact]}>
              <View style={styles.auditActorAvatar}><Text style={styles.auditActorInitials}>{initials(event.actorName)}</Text></View>
              <View style={styles.auditBody}>
                <View style={styles.auditTitleRow}>
                  <Text style={styles.auditActor}>{event.actorName}</Text>
                  <Text style={styles.auditAction}> {event.action.toLowerCase()} </Text>
                  <Text style={styles.auditSubject}>{event.subject}</Text>
                </View>
                <Text style={styles.auditDetail}>{event.detail}</Text>
                <View style={styles.auditMetaRow}>
                  <Text style={styles.auditRole}>{event.actorRole}</Text>
                  <Text style={styles.auditMetaDot}>•</Text>
                  <Text style={styles.auditTime}>{event.occurredAt}</Text>
                </View>
              </View>
              <View style={styles.auditEntityBadge}><Text style={styles.auditEntityText}>{event.entity}</Text></View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function CollectionsScreen({ compact, latestPayment, properties, prefill, onSave }: { compact: boolean; latestPayment: Payment | null; properties: Property[]; prefill: ReceiptPrefill | null; onSave: (draft: CollectionDraft) => Promise<void> }) {
  const selectedProperty = properties[0] ?? { houseNumber: '', tenant: '', rent: 0, services: 0, status: 'Vacant' as const };
  const [form, setForm] = useState({
    houseNumber: selectedProperty.houseNumber,
    tenant: selectedProperty.tenant,
    rent: `${selectedProperty.rent}`,
    services: `${selectedProperty.services}`,
    deposit: '0',
    accountName: 'Kamau Properties',
    date: '1 Aug 2026',
    reference: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!prefill) return;
    setForm((current) => ({
      ...current,
      houseNumber: prefill.houseNumber,
      tenant: prefill.tenant,
      rent: `${prefill.rent}`,
      services: `${prefill.services}`,
      accountName: prefill.accountName || current.accountName,
      date: prefill.date,
      reference: prefill.reference,
    }));
    setErrors({});
    setSaveError('');
  }, [prefill]);

  const total = useMemo(
    () => Number(form.rent || 0) + Number(form.services || 0) + Number(form.deposit || 0),
    [form.rent, form.services, form.deposit],
  );

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.houseNumber.trim()) nextErrors.houseNumber = 'House number is required.';
    if (!form.tenant.trim()) nextErrors.tenant = 'Tenant name is required.';
    if (!form.rent || Number(form.rent) <= 0) nextErrors.rent = 'Enter the rent amount.';
    if (!form.accountName.trim()) nextErrors.accountName = 'Enter the M-Pesa account name.';
    if (!form.date.trim()) nextErrors.date = 'Payment date is required.';
    if (!form.reference.trim()) nextErrors.reference = 'Enter the M-Pesa or rent reference.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        houseNumber: form.houseNumber.trim(),
        tenant: form.tenant.trim(),
        rent: Number(form.rent),
        services: Number(form.services || 0),
        deposit: Number(form.deposit || 0),
        accountName: form.accountName.trim(),
        date: form.date.trim(),
        reference: form.reference.trim().toUpperCase(),
      });
      update('reference', '');
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save this payment.');
    } finally {
      setSaving(false);
    }
  };

  const invoiceData: CollectionDraft = latestPayment ?? {
    houseNumber: form.houseNumber,
    tenant: form.tenant,
    rent: Number(form.rent || 0),
    services: Number(form.services || 0),
    deposit: Number(form.deposit || 0),
    accountName: form.accountName,
    date: form.date,
    reference: form.reference || 'Pending',
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.collectionColumns, compact && styles.columnStack]}>
          <View style={[styles.sectionCard, styles.collectionForm]}>
            <View style={styles.formHeading}>
              <View style={styles.formStep}><Text style={styles.formStepText}>01</Text></View>
              <View>
                <Text style={styles.sectionTitle}>Payment details</Text>
                <Text style={styles.sectionSubtitle}>All fields from the rent collection note</Text>
              </View>
            </View>

            <View style={styles.fieldGrid}>
              <FormField label="House number" value={form.houseNumber} onChangeText={(value) => update('houseNumber', value)} error={errors.houseNumber} placeholder="e.g. 274" />
              <FormField label="Tenant name" value={form.tenant} onChangeText={(value) => update('tenant', value)} error={errors.tenant} placeholder="Full name" />
              <FormField label="Amount to pay (rent)" value={form.rent} onChangeText={(value) => update('rent', value.replace(/[^0-9]/g, ''))} error={errors.rent} placeholder="0" keyboardType="numeric" prefix="KES" />
              <FormField label="Water & garbage" value={form.services} onChangeText={(value) => update('services', value.replace(/[^0-9]/g, ''))} placeholder="0" keyboardType="numeric" prefix="KES" />
              <FormField label="Deposit paid" value={form.deposit} onChangeText={(value) => update('deposit', value.replace(/[^0-9]/g, ''))} placeholder="0" keyboardType="numeric" prefix="KES" />
              <FormField label="Paid-to M-Pesa name" value={form.accountName} onChangeText={(value) => update('accountName', value)} error={errors.accountName} placeholder="Account holder" />
              <FormField label="Payment date" value={form.date} onChangeText={(value) => update('date', value)} error={errors.date} placeholder="e.g. 1 Aug 2026" />
              <FormField label="Rent / M-Pesa reference" value={form.reference} onChangeText={(value) => update('reference', value)} error={errors.reference} placeholder="e.g. QH82K4D6PZ" autoCapitalize="characters" />
            </View>

            <View style={styles.totalBar}>
              <View><Text style={styles.totalLabel}>TOTAL RECEIVED</Text><Text style={styles.totalHelper}>Rent + services + deposit</Text></View>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>
            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
            <Pressable disabled={saving} onPress={save} style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}>
              {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Save collection & issue invoice</Text>}
              {!saving && <Text style={styles.saveButtonArrow}>→</Text>}
            </Pressable>
          </View>

          <View style={styles.invoiceColumn}>
            <Text style={styles.previewLabel}>INVOICE PREVIEW</Text>
            <InvoicePreview payment={invoiceData} saved={Boolean(latestPayment)} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({ label, error, prefix, ...inputProps }: {
  label: string;
  error?: string;
  prefix?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputFrame, error && styles.inputFrameError]}>
        {prefix && <Text style={styles.inputPrefix}>{prefix}</Text>}
        <TextInput
          {...inputProps}
          style={styles.textInput}
          placeholderTextColor="#97A19D"
          selectionColor={colors.brand}
        />
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function InvoicePreview({ payment, saved }: { payment: CollectionDraft; saved: boolean }) {
  const total = payment.rent + payment.services + payment.deposit;
  return (
    <View style={styles.invoiceCard}>
      <View style={styles.invoiceAccent} />
      <View style={styles.invoiceHeader}>
        <View>
          <Text style={styles.invoiceLogo}>RentFlow</Text>
          <Text style={styles.invoiceMuted}>Payment invoice</Text>
        </View>
        <View style={styles.invoiceNumberBox}>
          <Text style={styles.invoiceNumberLabel}>HOUSE</Text>
          <Text style={styles.invoiceNumber}>{payment.houseNumber || '—'}</Text>
        </View>
      </View>
      <View style={styles.invoiceRule} />
      <View style={styles.invoiceInfoRow}>
        <View><Text style={styles.invoiceKey}>BILLED TO</Text><Text style={styles.invoiceStrong}>{payment.tenant || 'Tenant name'}</Text></View>
        <View style={styles.invoiceInfoRight}><Text style={styles.invoiceKey}>DATE</Text><Text style={styles.invoiceStrong}>{payment.date || '—'}</Text></View>
      </View>
      <View style={styles.invoiceItems}>
        <InvoiceLine label="Monthly rent" value={payment.rent} />
        <InvoiceLine label="Water & garbage" value={payment.services} />
        <InvoiceLine label="Deposit" value={payment.deposit} />
      </View>
      <View style={styles.invoiceTotalRow}>
        <Text style={styles.invoiceTotalLabel}>Total paid</Text>
        <Text style={styles.invoiceTotal}>{money(total)}</Text>
      </View>
      <View style={styles.invoiceReference}>
        <Text style={styles.invoiceKey}>PAYMENT REFERENCE</Text>
        <Text style={styles.invoiceReferenceValue}>{payment.reference || 'Pending'}</Text>
      </View>
      <View style={styles.invoiceFooter}>
        <View style={[styles.invoiceStatusDot, !saved && { backgroundColor: colors.amber }]} />
        <Text style={styles.invoiceFooterText}>{saved ? `Paid to ${payment.accountName}` : 'Preview — save to confirm payment'}</Text>
      </View>
    </View>
  );
}

function InvoiceLine({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.invoiceLine}>
      <Text style={styles.invoiceLineLabel}>{label}</Text>
      <Text style={styles.invoiceLineValue}>{money(value)}</Text>
    </View>
  );
}

function BottomNav({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <View style={styles.bottomNav}>
      <BottomNavItem label="Overview" symbol="◫" selected={active === 'overview'} onPress={() => onNavigate('overview')} />
      <BottomNavItem label="Properties" symbol="⌂" selected={active === 'properties'} onPress={() => onNavigate('properties')} />
      <BottomNavItem label="Collect" symbol="＋" selected={active === 'collections'} onPress={() => onNavigate('collections')} />
      <BottomNavItem label="AI" symbol="✦" selected={active === 'ai'} onPress={() => onNavigate('ai')} />
      <BottomNavItem label="Activity" symbol="◷" selected={active === 'activity'} onPress={() => onNavigate('activity')} />
    </View>
  );
}

function BottomNavItem({ label, symbol, selected, onPress }: { label: string; symbol: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.bottomNavItem}>
      <Text style={[styles.bottomNavSymbol, selected && styles.bottomNavSelected]}>{symbol}</Text>
      <Text style={[styles.bottomNavLabel, selected && styles.bottomNavSelected]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  flexOne: { flex: 1 },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  app: { flex: 1, backgroundColor: colors.canvas },
  appAmbient: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  appGlow: { position: 'absolute', width: 430, height: 430, borderRadius: 215, opacity: 0.28 },
  appGlowOne: { backgroundColor: colors.glowOne, right: -190, top: -180 },
  appGlowTwo: { backgroundColor: colors.glowTwo, left: '22%', bottom: -310 },
  shell: { flex: 1, flexDirection: 'row' },
  shellCompact: { paddingBottom: 70 },
  main: { flex: 1, minWidth: 0 },
  sidebar: { width: 244, paddingHorizontal: 22, paddingVertical: 26, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: '#FFFFFFB8', shadowColor: colors.brandDark, shadowOpacity: 0.06, shadowRadius: 24, elevation: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.surface, fontSize: 21, fontWeight: '800' },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  brandTag: { color: colors.muted, fontSize: 10, marginTop: 1 },
  navLabel: { color: '#98A29E', fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginTop: 45, marginBottom: 10 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 12, marginBottom: 5 },
  navButtonSelected: { backgroundColor: colors.brandPale },
  navSymbol: { width: 20, color: colors.muted, fontSize: 18, textAlign: 'center' },
  navText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  navTextSelected: { color: colors.brandDark },
  pressed: { opacity: 0.72 },
  sidebarSpacer: { flex: 1 },
  helpCard: { backgroundColor: colors.brandDark, padding: 16, borderRadius: 16, marginBottom: 22 },
  helpEyebrow: { color: '#8CC4B1', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  helpTitle: { color: colors.surface, fontSize: 15, fontWeight: '700', marginTop: 7 },
  helpBody: { color: '#C5DAD2', fontSize: 12, lineHeight: 18, marginTop: 5 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.amberPale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.amber, fontWeight: '800', fontSize: 12 },
  profileCopy: { flex: 1 },
  profileName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  profileRole: { color: colors.muted, fontSize: 10, marginTop: 2 },
  topbar: { minHeight: 116, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 38, paddingVertical: 22 },
  topbarCompact: { minHeight: 154, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, alignItems: 'flex-end' },
  topbarTitleWrap: { gap: 3 },
  pageTitle: { color: colors.ink, fontSize: 27, fontWeight: '800', letterSpacing: -0.8, marginTop: 6 },
  pageTitleCompact: { fontSize: 23, marginTop: 20 },
  pageSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  workspaceThemePicker: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, backgroundColor: '#FFFFFF91', borderWidth: 1, borderColor: '#FFFFFFD1' },
  workspaceThemeChoice: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30, paddingHorizontal: 8, borderRadius: 999 },
  workspaceThemeChoiceActive: { backgroundColor: '#FFFFFFE8', shadowColor: colors.brandDark, shadowOpacity: 0.09, shadowRadius: 6, elevation: 2 },
  workspaceThemeDot: { width: 7, height: 7, borderRadius: 4 },
  workspaceThemeText: { color: colors.muted, fontSize: 8, fontWeight: '800' },
  workspaceThemeTextActive: { color: colors.ink },
  periodPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 10, minWidth: 162 },
  periodPillLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  periodPillValue: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 3 },
  notice: { marginHorizontal: 38, marginBottom: 4, backgroundColor: colors.brandPale, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeDot: { color: colors.brand, fontWeight: '900' },
  noticeText: { flex: 1, color: colors.brandDark, fontSize: 12, fontWeight: '600' },
  noticeClose: { color: colors.brandDark, fontSize: 21, lineHeight: 21 },
  scrollContent: { paddingHorizontal: 38, paddingBottom: 50 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: { flexGrow: 1, flexBasis: 210, minWidth: 180, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#FFFFFFC7', shadowColor: colors.brandDark, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  metricTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  metricDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#A6B2AD' },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.7, marginTop: 16 },
  metricDetail: { color: colors.muted, fontSize: 10, marginTop: 4 },
  dashboardColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginTop: 16 },
  columnStack: { flexDirection: 'column' },
  dashboardMainColumn: { flex: 1.75, minWidth: 0 },
  dashboardSideColumn: { flex: 0.75, minWidth: 245, gap: 16 },
  sectionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#FFFFFFC7', borderRadius: 22, padding: 20, shadowColor: colors.brandDark, shadowOpacity: 0.055, shadowRadius: 17, shadowOffset: { width: 0, height: 9 }, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 4 },
  primaryButtonSmall: { backgroundColor: colors.brand, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10 },
  primaryButton: { backgroundColor: colors.brand, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, justifyContent: 'center' },
  primaryButtonText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  paymentList: { marginTop: 13 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#EDF0ED', paddingVertical: 13 },
  paymentRowCompact: { flexWrap: 'wrap' },
  houseBadge: { width: 41, height: 41, borderRadius: 12, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  houseBadgeText: { color: colors.brandDark, fontWeight: '800', fontSize: 12 },
  paymentPerson: { flex: 1, minWidth: 140 },
  paymentName: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  paymentMeta: { color: colors.muted, fontSize: 9, marginTop: 4 },
  paymentEditor: { color: '#8B9691', fontSize: 8, marginTop: 3 },
  paymentAmountWrap: { alignItems: 'flex-end', gap: 4 },
  paymentAmount: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgePaid: { backgroundColor: colors.brandPale },
  badgePartial: { backgroundColor: colors.amberPale },
  badgeOverdue: { backgroundColor: colors.redPale },
  badgeVacant: { backgroundColor: '#ECEFED' },
  statusText: { color: colors.brandDark, fontSize: 9, fontWeight: '800' },
  statusTextOverdue: { color: colors.red },
  progressCard: { alignItems: 'stretch' },
  progressRing: { width: 118, height: 118, borderRadius: 59, borderWidth: 12, borderColor: colors.brand, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: 21 },
  progressValue: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  progressLabel: { color: colors.muted, fontSize: 9, marginTop: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#EDF0ED' },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  legendText: { flex: 1, color: colors.muted, fontSize: 11 },
  legendNumber: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  attentionCard: { backgroundColor: colors.amberPale, borderColor: '#F0DDBB' },
  attentionEyebrow: { color: colors.amber, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  attentionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 9 },
  attentionBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  toolbar: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  toolbarCompact: { flexDirection: 'column' },
  searchInput: { flex: 1, minHeight: 46, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 15, color: colors.ink, fontSize: 13 },
  propertyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  propertyFormCard: { marginBottom: 14 },
  propertyFormGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 17 },
  propertySubmitButton: { alignSelf: 'flex-end', minHeight: 43, backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  emptyState: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 30, alignItems: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 10, marginTop: 5, textAlign: 'center' },
  propertyCard: { flexGrow: 1, flexBasis: 290, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 19 },
  propertyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  propertyEyebrow: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  propertyNumber: { color: colors.ink, fontSize: 27, fontWeight: '800', marginTop: 2 },
  propertyDivider: { height: 1, backgroundColor: '#EDF0ED', marginVertical: 16 },
  propertyTenant: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  propertyTenantLabel: { color: colors.muted, fontSize: 10, marginTop: 4 },
  propertyMoneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, marginTop: 22 },
  miniLabel: { color: '#929C98', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  miniValue: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: 5 },
  accountSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 17, marginBottom: 14 },
  accountSummaryCompact: { alignItems: 'flex-start', gap: 14 },
  accountIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  accountAvatar: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.brandDark, alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  accountName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  accountMeta: { color: colors.muted, fontSize: 9, marginTop: 4 },
  signOutButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 },
  signOutText: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  auditAssurance: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.brandPale, borderWidth: 1, borderColor: '#CBE3D7', borderRadius: 16, padding: 16, marginBottom: 14 },
  auditShield: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  auditShieldText: { color: colors.surface, fontSize: 16, fontWeight: '900' },
  auditAssuranceCopy: { flex: 1 },
  auditAssuranceTitle: { color: colors.brandDark, fontSize: 12, fontWeight: '800' },
  auditAssuranceText: { color: '#527064', fontSize: 9, lineHeight: 14, marginTop: 3 },
  teamCard: { marginBottom: 14 },
  teamForm: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  teamFormCompact: { flexDirection: 'column', alignItems: 'stretch' },
  teamEmailInput: { flex: 1, minWidth: 210, height: 43, backgroundColor: '#FAFBF9', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, color: colors.ink, fontSize: 10 },
  teamRoles: { flexDirection: 'row', backgroundColor: colors.canvas, borderRadius: 10, padding: 3 },
  teamRole: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  teamRoleActive: { backgroundColor: colors.surface },
  teamRoleText: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  teamRoleTextActive: { color: colors.brandDark },
  addMemberButton: { height: 43, minWidth: 102, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  addMemberText: { color: colors.surface, fontSize: 9, fontWeight: '800' },
  memberError: { color: colors.red, fontSize: 9, marginTop: 10 },
  memberSuccess: { color: colors.brandDark, fontSize: 9, marginTop: 10 },
  auditHeaderCompact: { alignItems: 'flex-start', flexDirection: 'column' },
  auditFilters: { flexDirection: 'row', gap: 6 },
  auditFilter: { backgroundColor: colors.canvas, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  auditFilterActive: { backgroundColor: colors.brandDark },
  auditFilterText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  auditFilterTextActive: { color: colors.surface },
  auditList: { marginTop: 14 },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#EDF0ED' },
  auditRowCompact: { flexWrap: 'wrap' },
  auditActorAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  auditActorInitials: { color: colors.brandDark, fontSize: 9, fontWeight: '900' },
  auditBody: { flex: 1, minWidth: 190 },
  auditTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  auditActor: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  auditAction: { color: colors.muted, fontSize: 10 },
  auditSubject: { color: colors.brandDark, fontSize: 10, fontWeight: '800' },
  auditDetail: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  auditMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  auditRole: { color: colors.amber, fontSize: 8, fontWeight: '800' },
  auditMetaDot: { color: '#AAB2AE', fontSize: 8 },
  auditTime: { color: '#8C9692', fontSize: 8 },
  auditEntityBadge: { backgroundColor: colors.canvas, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  auditEntityText: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  collectionColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  collectionForm: { flex: 1.3, minWidth: 0 },
  invoiceColumn: { flex: 0.7, minWidth: 280 },
  previewLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  formStep: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.brandPale, alignItems: 'center', justifyContent: 'center' },
  formStepText: { color: colors.brand, fontSize: 12, fontWeight: '900' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  fieldWrap: { flexGrow: 1, flexBasis: 230, minWidth: 190 },
  fieldLabel: { color: colors.ink, fontSize: 10, fontWeight: '700', marginBottom: 7 },
  inputFrame: { height: 47, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFBF9', borderWidth: 1, borderColor: colors.line, borderRadius: 11, paddingHorizontal: 12 },
  inputFrameError: { borderColor: colors.red },
  inputPrefix: { color: colors.muted, fontSize: 10, fontWeight: '700', marginRight: 8 },
  textInput: { flex: 1, color: colors.ink, fontSize: 12, paddingVertical: 0 },
  fieldError: { color: colors.red, fontSize: 9, marginTop: 4 },
  totalBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.canvas, borderRadius: 13, padding: 15, marginTop: 19 },
  totalLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  totalHelper: { color: '#98A19D', fontSize: 9, marginTop: 4 },
  totalValue: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  saveButton: { minHeight: 51, marginTop: 12, backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveError: { color: colors.red, backgroundColor: colors.redPale, borderRadius: 9, padding: 10, fontSize: 9, marginTop: 12 },
  saveButtonText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  saveButtonArrow: { color: colors.surface, fontSize: 20 },
  invoiceCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 21, overflow: 'hidden' },
  invoiceAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 6, backgroundColor: colors.brand },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 6 },
  invoiceLogo: { color: colors.brandDark, fontSize: 17, fontWeight: '900' },
  invoiceMuted: { color: colors.muted, fontSize: 9, marginTop: 3 },
  invoiceNumberBox: { alignItems: 'flex-end' },
  invoiceNumberLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  invoiceNumber: { color: colors.ink, fontSize: 24, fontWeight: '900', marginTop: 2 },
  invoiceRule: { height: 1, backgroundColor: colors.line, marginVertical: 19 },
  invoiceInfoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  invoiceInfoRight: { alignItems: 'flex-end' },
  invoiceKey: { color: '#929C98', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  invoiceStrong: { color: colors.ink, fontSize: 11, fontWeight: '700', marginTop: 4 },
  invoiceItems: { marginTop: 23, borderTopWidth: 1, borderTopColor: colors.line },
  invoiceLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EDF0ED' },
  invoiceLineLabel: { color: colors.muted, fontSize: 10 },
  invoiceLineValue: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  invoiceTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  invoiceTotalLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  invoiceTotal: { color: colors.brandDark, fontSize: 19, fontWeight: '900' },
  invoiceReference: { backgroundColor: colors.canvas, borderRadius: 10, padding: 11, marginTop: 20 },
  invoiceReferenceValue: { color: colors.ink, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 5 },
  invoiceFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 },
  invoiceStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  invoiceFooterText: { color: colors.muted, fontSize: 9 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 8 : 0 },
  bottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomNavSymbol: { color: colors.muted, fontSize: 19 },
  bottomNavLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  bottomNavSelected: { color: colors.brand },
});

let styles = createStyles();
