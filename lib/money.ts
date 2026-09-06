// An amount is an integer count of minor units plus an ISO 4217 code. This turns
// one into an exact decimal string, by string arithmetic - never a float, and
// never through `Intl`, which formats through the host locale and would render
// `12 000,00` under `hu-HU`.
//
// This module imports nothing from `react-native` or `expo-*`, so jest and
// Playwright can both load it under a plain TypeScript loader.

// Authority is ISO 4217, the standard AGENTS.md already names. This differs from
// CLDR/ICU for HUF, which treats the app's own primary currency as zero-decimal.
// The divergence is deliberate and is flagged in the spec for the human pass.
export const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  BHD: 3,
  CHF: 2,
  EUR: 2,
  GBP: 2,
  HUF: 2,
  JPY: 0,
  KWD: 3,
  TND: 3,
  USD: 2,
});

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * The exact decimal string for `amountMinor` in `currency`: ASCII digits, an
 * optional leading `-`, and a `.` separating major from minor units when the
 * currency has minor units.
 *
 * Throws on an `amountMinor` that is not a safe integer, on a `currency` that is
 * not three uppercase letters, and on a well-formed code absent from the table.
 * Silence is the failure mode being avoided: `Intl` formats an unknown code at
 * two decimals without complaint.
 */
export function formatAmountMinor(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`amountMinor must be a safe integer, got ${String(amountMinor)}`);
  }
  if (!CURRENCY_CODE.test(currency)) {
    throw new Error(`currency must be three uppercase letters, got ${JSON.stringify(currency)}`);
  }
  const exponent = CURRENCY_MINOR_UNITS[currency];
  if (exponent === undefined) {
    throw new Error(`currency ${currency} is not in the ISO 4217 minor-unit table`);
  }

  const sign = amountMinor < 0 ? '-' : '';
  const digits = Math.abs(amountMinor).toString();
  if (exponent === 0) return sign + digits;

  const padded = digits.padStart(exponent + 1, '0');
  const split = padded.length - exponent;
  return `${sign}${padded.slice(0, split)}.${padded.slice(split)}`;
}
