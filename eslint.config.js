// Committed deliberately, with eslint and eslint-config-expo as declared
// devDependencies. `expo lint` installs both plus ~200 transitive packages on
// its first run otherwise, editing package.json inside whatever diff happened to
// run it first.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'coverage/*',
      '.expo/*',
      // These files exist to fail: they reach expo-sqlite on purpose so the
      // poison guard has something to observe. Linting code written to be
      // broken reports on the intent, not on a defect.
      'test-fixtures/*',
      // Written by `npm run e2e`, and full of bundled JavaScript. .gitignore
      // covers both, but ESLint 9's flat config does not read .gitignore - so
      // without these `npm run lint` passes or fails depending on whether e2e
      // happened to run first.
      'playwright-report/*',
      'test-results/*',
    ],
  },
]);
