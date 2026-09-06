import { TRANSACTIONS } from '../lib/fixtures/transactions';
import { formatAmountMinor } from '../lib/money';
import { APP_IDENTITY, expect, test } from './fault-collector';

// The happy path. It takes the fixture's opened page, so identity (R1.2.2) is
// already asserted before the first line of this test runs.

test('the route renders every fixture transaction, reachable by testID', async ({
  page,
  faults,
}) => {
  await expect(page.getByTestId('app-identity')).toHaveText(APP_IDENTITY);

  const list = page.getByTestId('txn-list');
  await expect(list).toBeAttached();

  for (const txn of TRANSACTIONS) {
    const row = list.getByTestId(`txn-${txn.id}`);
    // Every row is in the DOM at once, and laid out, without anything having
    // scrolled: a virtualised list fails on the first row it drops.
    await expect(row).toBeAttached();
    await expect(row).toBeVisible();

    await expect(row).toContainText(txn.merchant);
    await expect(row).toContainText(formatAmountMinor(txn.amountMinor, txn.currency));
    await expect(row).toContainText(txn.currency);
  }

  // After this journey's last assertion, and after the page has stopped making
  // requests, so a fault arriving late is still caught rather than raced past.
  // toEqual prints the offending entries - channel, url and detail - rather than
  // only reporting that an array was non-empty.
  await page.waitForLoadState('networkidle');
  expect(faults).toEqual([]);
});
