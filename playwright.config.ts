import { defineConfig, devices } from '@playwright/test';

// The e2e command is self-sufficient and always tests the working tree.
export default defineConfig({
  // R1.2.8's "every collected path is under e2e/" is measured against this.
  testDir: './e2e',
  // Narrowed so Playwright never sees R1.1's `e2e/planted.test.ts`, which holds a
  // bare `it(...)` that would throw on load, and never sees the fault-collector
  // fixture module either.
  testMatch: '*.spec.ts',

  // Unconditional, not derived from an environment variable: a stray `test.only`
  // must fail the run rather than quietly reduce the suite to one test and still
  // report success.
  forbidOnly: true,
  retries: 0,
  workers: 1,

  // The 120s the spec allows for a cold Metro bundle has to live here, not only
  // in `webServer.timeout`. The dev server answers `http://localhost:8081` with
  // an HTML shell in a couple of seconds, *before* bundling; the bundle is
  // fetched by the first `page.goto`, so it is the per-test timeout that a
  // first-ever bundle would blow through, not the server-start one.
  timeout: 180_000,

  // Non-interactive. The default HTML reporter opens and serves a report on
  // failure unless CI is set, which would leave a failing `npm run e2e` hanging
  // instead of exiting - the opposite of an agent-drivable harness.
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:8081',
    viewport: { width: 1280, height: 900 },

    // Failure-only capture, written to `test-results/`. A passing run produces
    // nothing, so the local loop stays cheap; a headless CI failure that does
    // not reproduce on a laptop is otherwise only a line of reporter stdout.
    // `retain-on-failure` and not `on-first-retry`: `retries` is 0 above, so a
    // retry-keyed setting would never capture anything at all.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Chromium is the only browser the suite requires.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  webServer: {
    command: 'npm run web',
    // Exactly this URL: Expo silently shifting to another port is a failure, not
    // a different green run.
    url: 'http://localhost:8081',
    // An existing process on 8081 makes the run fail rather than silently report
    // a green result about stale code. A stale server of this same app passes the
    // identity check while serving code that is not the working tree.
    reuseExistingServer: false,
    // A first-ever Metro bundle over 30s was observed in stage 1, and a default
    // that fails once per machine teaches people to reflexively rerun.
    timeout: 180_000,
    // Piped, non-TTY stdio: `expo start --web` otherwise runs an interactive
    // terminal UI, and BROWSER=none stops it opening a tab of its own.
    stdout: 'pipe',
    stderr: 'pipe',
    env: { BROWSER: 'none' },
  },
});
