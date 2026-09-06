import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { findMatchingFiles, listSourceFiles, readListedFile } from './source-scan';

// The race this pins down: `git ls-files -co` lists untracked files, and the
// guards plant and delete untracked files to prove they can fail. Under jest's
// parallel workers a listed path can be gone by the time it is read, and the
// scan then failed with ENOENT for a reason unrelated to what it guards.
//
// Both halves are exercised deterministically - the listing really does include
// a file another worker may own, and the read really is given a path that no
// longer exists - rather than by re-running and hoping for the interleaving.

const repoRoot = path.resolve(__dirname, '..', '..');
const MARKER = /SOURCE_SCAN_FIXTURE_MARKER/;

describe('source scan', () => {
  it('lists untracked source files, which another worker may delete', () => {
    const rel = path.join('lib', 'guards', 'source-scan-untracked-fixture.ts');
    const abs = path.join(repoRoot, rel);
    fs.writeFileSync(abs, 'export const untracked = true;\n');
    try {
      expect(listSourceFiles(repoRoot, [])).toContain(rel);
    } finally {
      fs.rmSync(abs, { force: true });
    }
  });

  it('lists a source file whose name git would C-quote', () => {
    const rel = path.join('lib', 'guards', 'source-scan-árak-fixture.ts');
    const abs = path.join(repoRoot, rel);
    fs.writeFileSync(abs, 'export const nonAscii = true;\n');
    try {
      expect(listSourceFiles(repoRoot, [])).toContain(rel);
    } finally {
      fs.rmSync(abs, { force: true });
    }
  });

  it('skips a listed path that vanished before the read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-scan-'));
    try {
      fs.writeFileSync(path.join(dir, 'present.ts'), '// SOURCE_SCAN_FIXTURE_MARKER\n');
      fs.writeFileSync(path.join(dir, 'vanishing.ts'), '// SOURCE_SCAN_FIXTURE_MARKER\n');
      const listed = ['present.ts', 'vanishing.ts'];

      fs.rmSync(path.join(dir, 'vanishing.ts'));

      expect(findMatchingFiles(dir, listed, MARKER)).toEqual(['present.ts']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds every match when the caller supplies a global pattern', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-scan-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.ts'), '// SOURCE_SCAN_FIXTURE_MARKER\n');
      fs.writeFileSync(path.join(dir, 'b.ts'), '// SOURCE_SCAN_FIXTURE_MARKER\n');

      expect(findMatchingFiles(dir, ['a.ts', 'b.ts'], /SOURCE_SCAN_FIXTURE_MARKER/g)).toEqual([
        'a.ts',
        'b.ts',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still fails loudly on a read error that is not a vanished path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-scan-'));
    try {
      fs.mkdirSync(path.join(dir, 'a-directory.ts'));
      expect(() => readListedFile(dir, 'a-directory.ts')).toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
