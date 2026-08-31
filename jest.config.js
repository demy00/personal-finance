// One project on jest-expo/node. The preset choice is load-bearing: it is what
// routes expo-sqlite to a shim that returns empty results instead of failing,
// which is the whole reason moduleNameMapper below exists.
module.exports = {
  preset: 'jest-expo/node',
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
