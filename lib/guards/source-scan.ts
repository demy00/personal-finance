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
  // -z is what keeps the guard honest about its own input: without it git
  // C-quotes any path holding a non-ASCII byte, so `app/árak.tsx` arrives as
  // `"app/\303\241rak.tsx"` - a name ending in `"` that the extension filter
  // drops, silently leaving the file unguarded. NUL-separated output is verbatim,
  // which also means a path may legitimately start or end with a space.
  const out = execFileSync('git', ['ls-files', '-co', '-z', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out
    .split('\0')
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

/**
 * The listed files whose contents match `pattern`.
 *
 * Matching goes through `String.prototype.search`, which ignores and preserves
 * `lastIndex`. `pattern.test` would not: a caller passing a `/g` or `/y` regex
 * would have each match resume from where the last one ended, dropping offenders
 * from a guard without any error.
 */
export function findMatchingFiles(
  repoRoot: string,
  files: readonly string[],
  pattern: RegExp
): string[] {
  return files.filter((f) => {
    const text = readListedFile(repoRoot, f);
    return text !== undefined && text.search(pattern) !== -1;
  });
}
