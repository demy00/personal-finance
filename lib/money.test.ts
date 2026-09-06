import { CURRENCY_MINOR_UNITS, formatAmountMinor } from './money';

describe('formatAmountMinor', () => {
  it.each([
    [1200000, 'HUF', '12000.00'],
    [349900, 'EUR', '3499.00'],
    [1, 'HUF', '0.01'],
    [1, 'JPY', '1'],
    [-50, 'EUR', '-0.50'],
    [8905600350800199, 'HUF', '89056003508001.99'],
  ])('renders %d %s as %s', (amountMinor, currency, expected) => {
    expect(formatAmountMinor(amountMinor, currency)).toBe(expected);
  });

  it('throws on an amountMinor that is not a safe integer', () => {
    expect(() => formatAmountMinor(1.5, 'EUR')).toThrow();
    expect(() => formatAmountMinor(Number.MAX_SAFE_INTEGER + 2, 'EUR')).toThrow();
  });

  it('throws on a currency that is not three uppercase letters', () => {
    expect(() => formatAmountMinor(100, 'eur')).toThrow();
    expect(() => formatAmountMinor(100, 'EURO')).toThrow();
  });

  it('throws on a well-formed code that is absent from the table', () => {
    expect(CURRENCY_MINOR_UNITS.ZZZ).toBeUndefined();
    expect(() => formatAmountMinor(100, 'ZZZ')).toThrow();
  });
});
