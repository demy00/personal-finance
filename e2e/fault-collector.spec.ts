import { expect, test } from './fault-collector';

// The anti-vacuity test of this phase. A harness nobody has watched fail is not
// evidence of anything, so this induces the exact class of failure that made the
// old contract unsafe - a request that fails during initial load while nothing
// throws - and asserts the collector caught it, on the request channel.
//
// It takes the **unopened** page and navigates itself, so it never goes through
// the identity assertion and is under no obligation to leave the page working.
// The induction targets the entry bundle rather than the document: failing the
// document would make `page.goto` itself reject and the test would error before
// any assertion ran.
//
// It fulfils a 503 rather than aborting. An abort produces `net::ERR_ABORTED`,
// which is also what a navigation cancelling an in-flight request produces - the
// archetypal noise an exclusion set is tempted to drop. A real HTTP status is
// unambiguous.

test('the collector catches a load-time failure that throws nothing', async ({
  unopenedPage,
  faults,
}) => {
  const blocked: string[] = [];
  await unopenedPage.route(
    (url) => url.pathname.endsWith('.bundle'),
    async (route) => {
      blocked.push(route.request().url());
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'induced by the collector self-test',
      });
    }
  );

  await unopenedPage.goto('/');

  expect(blocked.length).toBeGreaterThan(0);
  const failedUrl = blocked[0];

  // The settling point for everything below: the fault has arrived.
  await expect
    .poll(() => faults.filter((f) => f.channel === 'request' && f.url === failedUrl).length)
    .toBeGreaterThan(0);

  const caught = faults.find((f) => f.channel === 'request' && f.url === failedUrl);
  expect(caught).toBeDefined();

  // Nothing threw. That is the whole point: a collector watching only uncaught
  // errors would have reported this page clean.
  expect(faults.filter((f) => f.channel === 'pageerror')).toEqual([]);
});
