import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

// Playwright's collection is confined to e2e/. R1.1 enforces the jest half of the
// disjointness claim - jest never collects a browser spec - and this is the other
// half: Playwright never collects a jest suite.
//
// The plant is what stops "every collected path is under e2e/" being vacuously
// true. It lands in test-fixtures/, which jest already ignores, so a crashed run
// cannot pollute `npm test` - while a widened Playwright scope would still reach
// it, which is the only thing the plant is there to detect.
//
// It never imports expo-sqlite; it shells out to a build tool.

const repoRoot = path.resolve(__dirname, '..', '..');
const e2eDir = path.join(repoRoot, 'e2e');
// Matches the configured testMatch of playwright.config.ts.
const planted = path.join(repoRoot, 'test-fixtures', 'gate-plant.spec.ts');

type ListJson = {
  config: { rootDir: string };
  suites: { file: string }[];
  errors?: { message?: string }[];
};

function collectedFiles(): string[] {
  // Playwright refuses to load a spec when JEST_WORKER_ID is set in the
  // environment - it assumes jest is trying to run browser tests, which is the
  // very thing this guard exists to prove is not happening. The child inherits
  // that variable from the jest worker, so it has to be dropped: this asks a
  // build tool a question, it does not run Playwright inside jest.
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;

  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--list', '--reporter=json'],
    { cwd: repoRoot, encoding: 'utf8', env }
  );
  if (result.status !== 0) {
    throw new Error(
      `playwright --list exited ${result.status} (signal ${result.signal}): ` +
        `${result.error?.message ?? ''} ${result.stderr ?? ''} ${(result.stdout ?? '').slice(0, 400)}`
    );
  }
  const listed = JSON.parse(result.stdout) as ListJson;
  if (listed.errors?.length) {
    throw new Error(`playwright --list reported errors: ${JSON.stringify(listed.errors)}`);
  }
  return listed.suites.map((suite) => path.resolve(listed.config.rootDir, suite.file));
}

// Holds the port for the duration of a check. A null result means something else
// already holds it, which is the same precondition by another route - so the
// caller proceeds either way rather than failing because a dev server is up.
function occupy(port: number): Promise<net.Server | null> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function release(server: net.Server | null): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const settle = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(2000);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

describe('playwright never collects anything outside e2e/', () => {
  it('collects only e2e/, and would still exclude a file planted where it could see one', () => {
    const before = collectedFiles();
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((f) => !f.startsWith(e2eDir + path.sep))).toEqual([]);

    fs.writeFileSync(
      planted,
      "import { test } from '@playwright/test';\ntest('planted', () => {});\n"
    );
    try {
      const after = collectedFiles();
      expect(after).not.toContain(planted);
      expect(after.filter((f) => !f.startsWith(e2eDir + path.sep))).toEqual([]);
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });

  // This check binds `integration` and therefore runs inside `npm test`, so
  // `npm test` has to pass unchanged with a dev server already on 8081. The port
  // is held for real rather than merely observed: reading the port before and
  // after proves nothing on its own, because the listing has fully exited by the
  // time it is read and Playwright tears down anything it started on exit. Held,
  // the claim is falsifiable - the config refuses to reuse an existing server, so
  // a listing that tried to start one would exit non-zero on the used port.
  it('lists unchanged with a server already listening on 8081', async () => {
    const baseline = collectedFiles();
    expect(baseline.length).toBeGreaterThan(0);

    const held = await occupy(8081);
    try {
      const before = await isListening(8081);
      expect(before).toBe(true);

      const collected = collectedFiles();

      const after = await isListening(8081);
      expect(collected).toEqual(baseline);
      expect(after).toBe(before);
    } finally {
      await release(held);
    }
  });
});
