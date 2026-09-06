// The frozen fixture the one route renders. No database is read in this phase:
// this value IS the data. It is fixed - every date predates 2025 - so nothing
// downstream of it can be time-dependent.
//
// This module imports nothing from `react-native` or `expo-*`, so jest and
// Playwright can both load it under a plain TypeScript loader.

export type Transaction = Readonly<{
  /** Also a `testID` suffix and a literal inside a browser selector. */
  id: string;
  merchant: string;
  /** Integer minor units. Never a float, never a bare amount. */
  amountMinor: number;
  /** ISO 4217. Carried by every amount, per AGENTS.md. */
  currency: string;
  /** ISO 8601, `YYYY-MM-DDTHH:MM:SSZ`. Carried, not rendered in this phase. */
  occurredAt: string;
}>;

export const TRANSACTIONS: readonly Transaction[] = Object.freeze(
  [
    {
      id: 'tesco-2024-11-03',
      merchant: 'Tesco',
      amountMinor: 1200000,
      currency: 'HUF',
      occurredAt: '2024-11-03T09:14:00Z',
    },
    {
      id: 'bolt-2024-11-02',
      merchant: 'Bolt',
      amountMinor: 289000,
      currency: 'HUF',
      occurredAt: '2024-11-02T18:41:00Z',
    },
    {
      id: 'lidl-2024-10-29',
      merchant: 'Lidl',
      amountMinor: 349900,
      currency: 'EUR',
      occurredAt: '2024-10-29T11:05:00Z',
    },
    {
      id: 'family-mart-2024-10-14',
      merchant: 'FamilyMart',
      amountMinor: 1280,
      currency: 'JPY',
      occurredAt: '2024-10-14T07:22:00Z',
    },
    {
      id: 'dm-refund-2024-10-02',
      merchant: 'dm drogerie markt',
      amountMinor: -50,
      currency: 'EUR',
      occurredAt: '2024-10-02T15:30:00Z',
    },
  ].map((row) => Object.freeze(row))
);
