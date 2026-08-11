import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEquityCreditAlert } from './equity-alert.ts';

test('classifies an Equity credit received via M-Pesa under the bank destination', () => {
  const result = parseEquityCreditAlert(
    'Confirmed. KES. 7,400.00 from Test Tenant Phone No. 254700123456 received via M-Pesa Ref. ABC12345 on 10-08-2026 at 20:59. Thank you.',
  );

  assert.deepEqual(result, {
    event_type: 'credit',
    provider: 'equity_bank',
    currency: 'KES',
    amount: 7400,
    payer_name: 'Test Tenant',
    payer_phone: '+254700123456',
    transaction_reference: 'ABC12345',
    transaction_date: '2026-08-10',
    transaction_time: '20:59',
    occurred_at: '2026-08-10T20:59:00+03:00',
    source_channel: 'mpesa',
    destination_channel: 'bank',
  });
});

test('normalizes whitespace, a local phone number, and a lowercase reference', () => {
  const result = parseEquityCreditAlert(
    'Confirmed.\nKES 5200 from Sample Person Phone No. 0700 123 456 received via M-Pesa Ref. abcd1234 on 1/8/2026 at 09:05. Thank you.',
  );

  assert.equal(result?.payer_phone, '+254700123456');
  assert.equal(result?.transaction_reference, 'ABCD1234');
  assert.equal(result?.transaction_date, '2026-08-01');
});

test('rejects an invalid calendar date instead of guessing', () => {
  const result = parseEquityCreditAlert(
    'Confirmed. KES 5200 from Sample Person Phone No. 254700123456 received via M-Pesa Ref. ABCD1234 on 31-02-2026 at 09:05. Thank you.',
  );
  assert.equal(result, null);
});

test('rejects debit and unrelated M-Pesa messages', () => {
  assert.equal(parseEquityCreditAlert('KES 5,200 sent to Sample Person.'), null);
});
