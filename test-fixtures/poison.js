// Resolved in place of expo-sqlite for jest only. jest-expo's node preset would
// otherwise hand back a no-op shim whose every method returns empty, so a test
// asserting "no rows" passes against a database that was never opened.
throw new Error(
  'expo-sqlite is unavailable to unit tests; put database code in lib/db/ and test it through Playwright'
);
