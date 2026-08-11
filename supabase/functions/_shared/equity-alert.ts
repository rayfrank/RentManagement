export type EquityCreditAlert = {
  event_type: 'credit';
  provider: 'equity_bank';
  currency: 'KES';
  amount: number;
  payer_name: string;
  payer_phone: string;
  transaction_reference: string;
  transaction_date: string;
  transaction_time: string;
  occurred_at: string;
  source_channel: 'mpesa';
  destination_channel: 'bank';
};

const equityMpesaCreditPattern = /^Confirmed\.\s*KES\.?\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)\s+Phone\s+No\.?\s*(\+?[\d\s-]{9,18})\s+received\s+via\s+M-?Pesa\s+Ref\.?\s*([A-Z0-9]{8,16})\s+on\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+at\s+(\d{1,2}):(\d{2})\.\s*Thank\s+you\.?$/i;

const twoDigits = (value: number) => `${value}`.padStart(2, '0');

const validCalendarDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const normalizeKenyanPhone = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) digits = `254${digits.slice(1)}`;
  if (!digits.startsWith('254') || digits.length !== 12) return null;
  return `+${digits}`;
};

/**
 * Parses the complete Equity credit alert format without guessing partial data.
 * The destination is the Equity account; `via M-Pesa` is retained as the rail.
 */
export function parseEquityCreditAlert(input: string): EquityCreditAlert | null {
  const normalized = input
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(equityMpesaCreditPattern);
  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ''));
  const payerName = match[2].trim();
  const payerPhone = normalizeKenyanPhone(match[3]);
  const reference = match[4].toUpperCase();
  const day = Number(match[5]);
  const month = Number(match[6]);
  const year = Number(match[7]);
  const hour = Number(match[8]);
  const minute = Number(match[9]);

  if (!Number.isFinite(amount) || amount <= 0 || !payerName || !payerPhone) return null;
  if (!validCalendarDate(year, month, day) || hour > 23 || minute > 59) return null;

  const transactionDate = `${year}-${twoDigits(month)}-${twoDigits(day)}`;
  const transactionTime = `${twoDigits(hour)}:${twoDigits(minute)}`;
  return {
    event_type: 'credit',
    provider: 'equity_bank',
    currency: 'KES',
    amount,
    payer_name: payerName,
    payer_phone: payerPhone,
    transaction_reference: reference,
    transaction_date: transactionDate,
    transaction_time: transactionTime,
    occurred_at: `${transactionDate}T${transactionTime}:00+03:00`,
    source_channel: 'mpesa',
    destination_channel: 'bank',
  };
}
