import * as fs from 'node:fs';
import * as path from 'node:path';

import { findMatchingFiles, listSourceFiles } from './source-scan';

// The poison only fires for code a jest suite imports. A route nothing unit-tests
// could still reach expo-sqlite, so this reads the source tree as text instead -
// a different mechanism against the same failure.
//
// It never imports expo-sqlite; it reads files.

const repoRoot = path.resolve(__dirname, '..', '..');
const SELF = path.join('lib', 'guards', 'sqlite-confined.test.ts');

// lib/db/ is the one place allowed to import it. The poison guard and its
// fixtures have to name it to do their job.
const EXEMPT = [
  SELF,
  path.join('lib', 'guards', 'sqlite-poison.test.ts'),
  'lib/db/',
  'test-fixtures/',
];

// import / import type / export ... from / require() / dynamic import(),
// including multi-line forms.
const REACHES =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]expo-sqlite(?:\/[^'"]*)?['"]/;

function trackedSourceFiles(): string[] {
  return listSourceFiles(repoRoot, EXEMPT);
}

describe('expo-sqlite is confined to lib/db/', () => {
  it('no source file outside lib/db/ reaches it', () => {
    const files = trackedSourceFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(findMatchingFiles(repoRoot, files, REACHES)).toEqual([]);
  });

  it('catches a violation planted in a scanned file', () => {
    const planted = path.join(repoRoot, 'lib', 'planted-violation.ts');
    fs.writeFileSync(planted, "export { openDatabaseAsync } from 'expo-sqlite/next';\n");
    try {
      const offenders = findMatchingFiles(repoRoot, trackedSourceFiles(), REACHES);
      expect(offenders).toContain(path.join('lib', 'planted-violation.ts'));
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });
});
