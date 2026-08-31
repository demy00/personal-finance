// Reaches expo-sqlite through barrel.ts, using a subpath specifier.
import * as Barrel from './barrel';

it('never gets this far either', () => {
  expect(Barrel).toBeDefined();
});
