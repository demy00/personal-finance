// Reaches expo-sqlite by its bare name. Must fail to run.
import * as SQLite from 'expo-sqlite';

it('never gets this far', () => {
  expect(SQLite).toBeDefined();
});
