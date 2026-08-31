import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

// Stage 1 observed jest-expo/node returning `ROWS: []` from
// expo-sqlite/web/SQLiteModule.node.ts - a shim whose every method is a no-op.
// A unit test asserting "no rows" passes against a database that was never
// opened, with no signal at all. These two runs prove the poison fires instead.
//
// This file never imports expo-sqlite; it observes a separate jest run from the
// outside, which is why it can carry an `integration` binding.

const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureConfig = path.join(repoRoot, 'test-fixtures', 'jest.fixtures.config.js');

const EXPECTED =
  'expo-sqlite is unavailable to unit tests; put database code in lib/db/ and test it through Playwright';

function runFixture(fixture: string): { status: number | null; output: string } {
  const result = spawnSync(
    'npx',
    [
      'jest',
      '--config', fixtureConfig,
      '--runTestsByPath', path.join(repoRoot, 'test-fixtures', fixture),
      // The child exists to observe the poison, not to exercise watchman, which
      // is broken on this machine and would only add noise.
      '--watchman=false',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  // jest wraps and indents its own error output, so compare with runs of
  // whitespace collapsed rather than on exact line breaks.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\s+/g, ' ');
  return { status: result.status, output };
}

describe('expo-sqlite is poisoned for jest', () => {
  it('fails a suite that imports it directly', () => {
    const { status, output } = runFixture('direct-import.fixture.ts');
    expect(status).not.toBe(0);
    expect(output).toContain(EXPECTED);
  });

  it('fails a suite that reaches it through another module, via a subpath', () => {
    const { status, output } = runFixture('transitive-import.fixture.ts');
    expect(status).not.toBe(0);
    expect(output).toContain(EXPECTED);
  });
});
