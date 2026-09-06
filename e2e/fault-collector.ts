import { test as base, expect, type Page } from '@playwright/test';

/**
 * The fault collector every spec in this suite obtains its fault list from.
 *
 * `AGENTS.md` used to say "collect page errors and assert the list is empty", and
 * stage 1 watched that rule call a completely dead database clean: the wasm asset
 * failed to resolve, `openDatabaseAsync()` neither resolved nor rejected, and the
 * page emitted **no `pageerror` and no console error**. The only signal was a
 * failed network request. So this collects three channels, not one, and it
 * attaches them **before any navigation** - the failure it exists to catch
 * happens during initial load, and a collector wired after `page.goto` would miss
 * exactly the thing it is for.
 *
 * Its limit is worth stating: a promise that never settles and makes no failed
 * request is still invisible here. Seeing that needs the four-state read machine,
 * which is Phase 2.
 */

export type FaultChannel = 'pageerror' | 'console' | 'request';

export type Fault = {
  /** Which channel saw it. R1.2.7 asserts on this. */
  channel: FaultChannel;
  /** The URL the fault applies to; the page URL for a page error. */
  url: string;
  detail: string;
};

/**
 * The exclusion set is the implementer's to own, and it is **empty**.
 *
 * That is an observation, not an aspiration. An Expo web dev load of this app was
 * instrumented and makes exactly two HTTP requests - the document and the entry
 * bundle, both 200 - with no favicon fetch, no source-map fetch, no `pageerror`
 * and no `console.error`. It *does* open two websockets (`/hot` and `/message`),
 * but Playwright surfaces those on the `websocket` event, not `request`, so
 * nothing here ever sees them; that is why they need no exclusion, rather than
 * because they are absent.
 *
 * The spec pins this set from both sides: too narrow and the happy-path
 * journey's empty assertion fails, too wide and the induced failure of
 * `fault-collector.spec.ts` stops being caught. Anything added here has to be
 * justified against both.
 */
function isExcluded(_url: string, _detail: string): boolean {
  return false;
}

function attachCollector(page: Page, faults: Fault[]): void {
  page.on('pageerror', (error) => {
    faults.push({ channel: 'pageerror', url: page.url(), detail: error.message });
  });

  page.on('console', (message) => {
    // Only error level. Warnings are noise, not failure.
    if (message.type() !== 'error') return;
    const detail = message.text();
    const url = message.location().url || page.url();
    if (isExcluded(url, detail)) return;
    faults.push({ channel: 'console', url, detail });
  });

  page.on('requestfailed', (request) => {
    const detail = request.failure()?.errorText ?? 'request failed';
    if (isExcluded(request.url(), detail)) return;
    faults.push({ channel: 'request', url: request.url(), detail });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;
    const detail = `HTTP ${response.status()}`;
    if (isExcluded(response.url(), detail)) return;
    faults.push({ channel: 'request', url: response.url(), detail });
  });
}

/** `app.json`'s `slug`, which the page must render rather than a second copy of. */
export const APP_IDENTITY = 'personal-finance';

type Fixtures = {
  /** Created per test, so one spec's faults can never reach another's assertion. */
  faults: Fault[];
  /**
   * Collector attached, nothing loaded. Asked for **by name** - the only spec
   * that does is the collector self-test, which needs somewhere to inject a
   * load-time failure.
   */
  unopenedPage: Page;
};

// Playwright's second fixture argument is conventionally called `use`, which
// `react-hooks/rules-of-hooks` reads as a React hook called outside a component.
// It is named `provide` here so `npm run lint` has nothing to say about it.
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- an empty pattern is how a Playwright fixture declares no dependencies
  faults: async ({}, provide) => {
    await provide([]);
  },

  unopenedPage: async ({ context, faults }, provide) => {
    const page = await context.newPage();
    attachCollector(page, faults);
    await provide(page);
  },

  // The default. A journey gets identity without opting in and cannot forget it.
  page: async ({ unopenedPage }, provide) => {
    await unopenedPage.goto('/');
    await expect(unopenedPage.getByTestId('app-identity')).toHaveText(APP_IDENTITY);
    await provide(unopenedPage);
  },
});

export { expect };
