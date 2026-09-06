import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Shared machinery for the guards that read the source tree as text.
//
// Listing and reading are two separate moments. `git ls-files -co` includes
// untracked files, and the guards themselves plant and delete untracked files
// to prove they can fail - so under jest's parallel workers a path can be
// listed by one worker and deleted by another before it is read.

const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;

/** True when `file` (repo-relative) is covered by an EXEMPT entry. */
function isExempt(file: string, exempt: readonly string[]): boolean {
  return exempt.some((e) => (e.endsWith('/') ? file.startsWith(e) : file === e));
}

/**
 * Repo-relative source files git knows about - tracked and untracked alike, so
 * a file added but not yet committed is still guarded.
 */
export function listSourceFiles(repoRoot: string, exempt: readonly string[]): string[] {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((f) => SOURCE_FILE.test(f))
    .filter((f) => !isExempt(f, exempt));
}

/**
 * Contents of a listed file, or `undefined` if it vanished between the listing
 * and the read. A file that no longer exists cannot violate anything, so it is
 * skipped - but only ENOENT is tolerated. Every other read failure still throws,
 * so a guard can never go quiet by failing to read what it is meant to scan.
 */
export function readListedFile(repoRoot: string, file: string): string | undefined {
  try {
    return fs.readFileSync(path.join(repoRoot, file), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** The listed files whose contents match `pattern`. */
export function findMatchingFiles(
  repoRoot: string,
  files: readonly string[],
  pattern: RegExp
): string[] {
  return files.filter((f) => {
    const text = readListedFile(repoRoot, f);
    return text !== undefined && pattern.test(text);
  });
}
