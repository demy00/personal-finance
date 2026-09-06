// One project on jest-expo/node. The preset choice is load-bearing: it is what
// routes expo-sqlite to a shim that returns empty results instead of failing,
// which is the whole reason moduleNameMapper below exists.
module.exports = {
  preset: 'jest-expo/node',
  // Never ask watchman for the file list. A broken watchman binary does not make
  // jest fail: its crawler returns an empty list, jest runs **zero tests and
  // exits 0**, and every "npm test passes" claim in the repo becomes worthless.
  // That was observed on this machine. The node crawler is fast enough here and
  // cannot fail that way. R1.1's guards already pass this flag to their children,
  // which is why nobody noticed the parent run was empty.
  watchman: false,
  // Serial, deliberately. Three suites in lib/guards/ mutate the working tree -
  // one plants e2e/planted.test.ts, one plants test-fixtures/gate-plant.spec.ts,
  // and sqlite-confined.test.ts readFileSyncs every path `git ls-files -co`
  // returns. In parallel workers a delete landing between that listing and the
  // read throws ENOENT and fails an otherwise green run. Six test files cost
  // nothing to run in sequence.
  maxWorkers: 1,
  // Those same suites spawn `jest --listTests` and `playwright test --list`. A
  // cold listing comfortably exceeds jest's 5s default; this is still tight
  // enough that a genuinely hung test does not hold the suite for minutes.
  testTimeout: 60000,
  // Collect from the whole tree rather than a list of directories - jest errors
  // on a root that does not exist yet, and app/ and features/ arrive later.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/e2e/', // Playwright's. Running a browser spec in node is the failure here.
    '<rootDir>/test-fixtures/', // suites that must fail; they run only under their own config
  ],
  moduleNameMapper: {
    // Subpaths too - anchoring on the bare name alone lets expo-sqlite/kv-store
    // through to the shim.
    '^expo-sqlite(/.*)?$': '<rootDir>/test-fixtures/poison.js',
  },
};
