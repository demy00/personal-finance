// Used only by the guard that proves the poison fires. Same preset and same
// mapper as the real config - a fixture run without them would pass for the
// wrong reason, or fail for one.
const path = require('node:path');

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  preset: 'jest-expo/node',
  roots: ['<rootDir>/test-fixtures'],
  testMatch: ['**/*.fixture.ts'],
  moduleNameMapper: {
    '^expo-sqlite(/.*)?$': '<rootDir>/test-fixtures/poison.js',
  },
};
