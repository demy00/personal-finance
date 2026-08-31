import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// e2e/ belongs to Playwright. Stage 1 found jest collecting all five of the
// probe's browser specs, which would run them in a node process.
//
// The directory is empty in this phase, so asserting "no collected path is under
// e2e/" would be vacuously true and would stay green if the exclusion were
// deleted. Planting a file jest would otherwise collect is what gives the guard
// something to actually fail on.

const repoRoot = path.resolve(__dirname, '..', '..');
const e2eDir = path.join(repoRoot, 'e2e');
const planted = path.join(e2eDir, 'planted.test.ts');

function collectedFiles(): string[] {
  const result = spawnSync('npx', ['jest', '--listTests', '--watchman=false'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`jest --listTests failed: ${result.stderr ?? ''}`);
  }
  // Broken watchman noises stderr, so read stdout alone.
  return (result.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('jest never collects a browser spec', () => {
  it('excludes e2e/, and would still exclude it if a collectable file were there', () => {
    const before = collectedFiles();
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((f) => f.startsWith(e2eDir + path.sep))).toEqual([]);

    const dirExisted = fs.existsSync(e2eDir);
    fs.mkdirSync(e2eDir, { recursive: true });
    fs.writeFileSync(planted, "it('planted', () => { expect(1).toBe(1); });\n");
    try {
      const after = collectedFiles();
      expect(after.filter((f) => f.startsWith(e2eDir + path.sep))).toEqual([]);
    } finally {
      fs.rmSync(planted, { force: true });
      if (!dirExisted) fs.rmSync(e2eDir, { recursive: true, force: true });
    }
  });
});
