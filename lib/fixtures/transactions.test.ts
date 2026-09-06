import { CURRENCY_MINOR_UNITS, formatAmountMinor } from '../money';
import { TRANSACTIONS } from './transactions';

// `YYYY-MM-DDTHH:MM:SSZ` by pattern, not merely by parsing - Date.parse accepts a
// great deal that is not ISO 8601.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FIXTURE_ID = /^[a-z0-9-]+$/;

// Written as literals here on purpose: a generated id fails this rather than
// passing whatever it produced.
const EXPECTED_IDS = [
  'tesco-2024-11-03',
  'bolt-2024-11-02',
  'lidl-2024-10-29',
  'family-mart-2024-10-14',
  'dm-refund-2024-10-02',
];

describe('the frozen transaction fixture', () => {
  it('is the exact set of rows this phase was written against', () => {
    expect(TRANSACTIONS.map((t) => t.id)).toEqual(EXPECTED_IDS);
    expect(new Set(EXPECTED_IDS).size).toBe(EXPECTED_IDS.length);
  });

  it('obeys the money rule on every row', () => {
    for (const txn of TRANSACTIONS) {
      expect(Number.isSafeInteger(txn.amountMinor)).toBe(true);
      expect(txn.currency).toMatch(/^[A-Z]{3}$/);
      expect(CURRENCY_MINOR_UNITS[txn.currency]).toBeDefined();
      // The domain R1.2.3 accepts, rather than the one it throws on.
      expect(() => formatAmountMinor(txn.amountMinor, txn.currency)).not.toThrow();
      expect(txn.merchant.length).toBeGreaterThan(0);
      expect(txn.id).toMatch(FIXTURE_ID);
      expect(txn.occurredAt).toMatch(ISO_INSTANT);
    }
  });

  it('spans at least two distinct currencies', () => {
    expect(new Set(TRANSACTIONS.map((t) => t.currency)).size).toBeGreaterThanOrEqual(2);
  });

  it('is fixed rather than clock-derived', () => {
    for (const txn of TRANSACTIONS) {
      expect(txn.occurredAt < '2025-01-01T00:00:00Z').toBe(true);
    }
  });
});
