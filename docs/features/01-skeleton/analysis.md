# Stage 1 - analysis: the application skeleton

Pipeline stage 1 (`task-analyst`), run against the re-derived `AGENTS.md`.
The analyst built a throwaway probe app rather than reasoning about the stack, so the
findings below are observed, not predicted.

## Goal

Turn a zero-commit repo into a running Expo app whose **web target is the verification
surface**: `npm run web` serves an expo-router app on `:8081` that reads a real
`expo-sqlite` database seeded from a transaction fixture and renders the product's actual
first screen - a recent-transactions list - with `testID`s an agent can reach. Every command
declared in `AGENTS.md`'s `## Pipeline` and `## Commands` blocks exists and exits zero. The
jest and Playwright runners are provably disjoint. One Playwright spec asserts on a seeded
row that could only have come from the database.

Observable as: a clean checkout runs `npm install && npm run lint && npm run typecheck &&
npm test && npm run e2e`, all exiting zero, with the e2e run starting its own server and
asserting a specific merchant and amount rendered from SQLite.

The second audience is the harness itself. Every claim `AGENTS.md`'s `## Validating your
work` section makes must be backed by code that demonstrably behaves that way, because every
later feature is verified through it.

## Empirical findings

These are observations from a running probe, and they change the spec rather than the plan.

### 1. `jest-expo` cannot execute `expo-sqlite` in any environment

| preset | result |
|---|---|
| `jest-expo/node` | **`ROWS: []` - no throw, no rejection** |
| `jest-expo/web` (jsdom) | `ReferenceError: Worker is not defined` at `expo-sqlite/web/SQLiteModule.ts:23` |
| `jest-expo/ios` | `TypeError: _ExpoSQLite.default.NativeDatabase is not a constructor` |

The node case is the dangerous one. `expo-sqlite/web/SQLiteModule.node.ts` is a dummy shim -
every method a no-op returning empty - and `ExpoSQLite.web.ts` routes there whenever
`typeof window === 'undefined'`. **A test asserting "the list is empty" passes against it.**

There is no fix inside the pre-authorised dependency set: jsdom has no `Worker` and no OPFS,
and a real-browser jest environment is a new dependency.

### 2. COOP/COEP is not required. The sync API is permanently unavailable.

Expo's docs say the web backend needs cross-origin isolation for `SharedArrayBuffer`.
Observed on the running dev server: `crossOriginIsolated === false`, `SharedArrayBuffer ===
undefined`, and every async query returned real rows. `SharedArrayBuffer` is constructed in
exactly one place - `expo-sqlite/web/WorkerChannel.ts:104-106`, inside `invokeWorkerSync`.

The only genuinely required change is one line in `metro.config.js`:

```js
config.resolver.assetExts.push('wasm');
```

Without it Metro 500s on `worker.bundle`. **But the synchronous `expo-sqlite` API
(`openDatabaseSync`, `getAllSync`, sync `useSQLiteContext` paths) cannot work on the
verification surface at all.** The documented `headers` escape hatch applies to EAS Hosting
and static export, not `expo start --web`; getting isolation onto `npm run web` would need
custom Metro middleware.

### 3. The harness's error-detection claim is insufficient

When the wasm asset failed to resolve, the page emitted **zero `pageerror` events and zero
console errors**. `openDatabaseAsync()` neither resolved nor rejected. The UI sat on loading
forever. The only signal was `page.on('requestfailed')`.

`AGENTS.md` says *"Collect page errors and assert the list is empty."* That collector, as
written, **would have reported a completely dead database layer as clean**. The failure mode
of this stack is a promise that never settles, not a throw.

### 4. Runner disjointness - a real defect, one line to fix

`jest --listTests` under `jest-expo/web` returned all five Playwright specs: jest-expo's
`testMatch` includes `**/?(*.)+(spec|test).[jt]s?(x)` and its `testPathIgnorePatterns` is
only `/node_modules/`. Fixed and verified with:

```js
testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/']
```

Playwright's side is already disjoint via `testDir: './e2e'`.

### 5. The claims that do hold

- `testID` → `data-testid`: `page.getByTestId('txn-list')` resolved.
- **Fresh profile**: an OPFS marker written in test A was gone in test B. Playwright's
  per-test non-persistent context gives a fresh OPFS and therefore a fresh database with no
  setup step. *Caveat:* a human opening `localhost:8081` keeps OPFS across restarts, so the
  two audiences get different data lifecycles - the seed must be idempotent or reset explicitly.
- **Fast loop**: page-open to rendered list ~297ms warm; whole `npx playwright test` including
  server startup ~5s. First-ever cold Metro bundle exceeded 30s.
- `webServer: { command: 'npm run web', url: 'http://localhost:8081' }` starts the server
  itself; the spec asserted `Tesco 1200000 HUF` read out of SQLite with an empty failure list.
- `tsc --noEmit` → 0. `expo lint` → 0.

### 6. Smaller facts that shape the work

- **`babel.config.js` with `babel-preset-expo` is mandatory for jest.** Metro does not need it;
  without it every jest suite dies with `Must use import to load ES Module`.
- **`jest` exits 1 with zero tests.** The skeleton must ship at least one jest test, or
  `npm test` fails the done-criterion by construction.
- **`expo lint` on first run silently installs eslint + eslint-config-expo (208 packages),
  writes `eslint.config.js` and edits `package.json`.** It is the declared lint command, but
  this is an unattended dependency addition and should be a deliberate, reviewed commit.
- **`create-expo-app --template default` scaffolds into `src/app`, not `app/`,** and pulls
  ~10 dependencies outside the pre-authorised set. Root `app/` was verified to work. The
  skeleton is hand-assembled, not scaffolded from that template.
- **watchman on this machine is broken** - `Library not loaded: libfmt.11.dylib` (brew has
  12.2.0). Every jest run spews dyld errors before working. Environment defect, not a repo one.

## Out of scope

1. The device leg - simulator, `expo start` against a device, Maestro. `npm start` must exist
   as a script; it need not be exercised.
2. Native `expo-sqlite` behaviour. Only the web/wasm backend is verified; divergence goes on
   the standing unverified list by name.
3. Receipt capture, OCR, categorising and bank sync **as working features**. Their interfaces
   and fakes are in scope (see decisions); no real engine, no real network call.
4. Category derivation. `line_items.category` exists as a column; nothing computes it yet.
5. How transactions arrive (PSD2 / CSV / manual). Parked in `AGENTS.md`.
6. Cross-currency totals, and any aggregate spanning currencies. No rate source exists.
7. Any UI beyond the list - no navigation, no detail screen, no add/edit, no styling system.
8. CI. Commands pass locally.
9. Cross-origin isolation and the sync SQLite API. Ruled out empirically.
10. Coverage thresholds. The verifier traces per binding.

## Consumers

| Consumer | Needs | Failure mode |
|---|---|---|
| The Playwright/agent harness | drivable page, stable `testID`s, deterministic seed, a collector that catches non-throwing breakage | a green suite over a dead database - observed, not hypothetical |
| The `verifier` (stage 6) | each binding satisfiable by a test that can actually run | a requirement bound `integration` at a SQLite seam is graded against the silent shim |
| The gate (stage 4), twice | acceptance criteria that are observable | any criterion phrased against `expo-sqlite` under jest is untestable, which is one of the four blocking kinds |
| You, reading every line | a diff reviewable in one sitting (D16) | schema + fixture + fakes + list + harness in one phase exceeds a sitting |
| `AGENTS.md` itself | its `## Validating your work` claims made true, `## Learnings` appended | the contract starts out containing an assertion the code does not honour |
| The later device phase | persistence shaped so the native backend is a swap | web-only idioms baked into the data layer |

## Constraints

**From the contract:** integer minor units always paired with an ISO 4217 code; no
cross-currency total without a rate source; ISO 8601 at rest; empty state and failed read must
be visually distinguishable; Expo Go must keep working; only the named dependencies are
pre-authorised; no real financial data as a fixture; schema changes escalate; `e2e/` and jest
must never claim the same file; a declared command that does not exist is added, never substituted.

**Discovered:** async `expo-sqlite` API only, permanently. The web backend is alpha by Expo's
own label and it is the foundation of the verification surface. Cold Metro bundle >30s vs
~300ms warm, so Playwright's default 30s timeout is too tight for a first run. Broken watchman
noises every jest run. The repo has zero commits and no `.gitignore`. `docs/features/` did not
exist.

**Added by finding 3:** a read that never settles must be distinguishable from both an empty
state and a failed read.

## Decisions taken by the owner at the stage-1 handback

1. **Schema: transactions *and* `line_items` both ship.** `CREATE TABLE IF NOT EXISTS`; no
   versioned migration mechanism this phase.

   ```sql
   CREATE TABLE IF NOT EXISTS transactions (
     id           TEXT    PRIMARY KEY,
     merchant     TEXT    NOT NULL,
     amount_minor INTEGER NOT NULL,   -- integer minor units
     currency     TEXT    NOT NULL,   -- ISO 4217
     occurred_at  TEXT    NOT NULL    -- ISO 8601
   );

   CREATE TABLE IF NOT EXISTS line_items (
     id             TEXT    PRIMARY KEY,
     transaction_id TEXT    NOT NULL REFERENCES transactions(id),
     description    TEXT    NOT NULL,
     amount_minor   INTEGER NOT NULL,
     category       TEXT
   );
   ```

2. **The three interfaces and their fakes ship in this phase** - bank sync, OCR engine,
   categoriser engine. This resolves the contradiction the analyst found: `AGENTS.md`'s
   `## Validating your work` asserts the fakes exist and are what tests drive, so either they
   ship or the contract is softened. They ship. Their shapes remain escalation-class and need
   sign-off before implementation.

3. **`@testing-library/react-native` is refused.** No component renderer is added. Every UI
   requirement therefore binds `e2e` and is covered by the Playwright journey.

4. **`integration` is permitted only on seams that provably never import `expo-sqlite`** -
   row-to-domain mapping, the minor-units/currency invariants, fixture validity. Everything
   that must prove the database works binds `e2e`. Nothing may be bound `integration` at a
   SQLite seam, because the shim would grade it green.

5. **Done-criterion for the two long-running servers** (`npm run web`, `npm start`): serves
   HTTP 200 at its declared URL within a stated timeout. "Exits zero" is not the test.

## Open questions

**Settle at the spec:**

- Fixture content: how many transactions, and must it span at least two currencies? Two
  exercises the money rule but immediately raises the no-mixed-sum rule.
- Does the list show a total? If yes, the per-currency rule bites in this phase.
- What each row renders - merchant, amount, date, a subset.
- "Recent": ordering and limit.
- Must the skeleton render distinguishable empty, failed-read **and** never-settled states,
  and must the spec assert them?
- Fixture dates: fixed literals or relative to now.
- Should the Playwright helper collect `requestfailed` and a DB-open timeout in addition to
  `pageerror`, and should `AGENTS.md`'s validating section and `## Learnings` be amended in
  this phase to say so?
- watchman: pin `watchman: false` in the jest config, or fix the brew install?
- Commit shape: one commit or split per D16.

**Could not be determined:**

- True cold-start time on a virgin machine. The one genuinely first run exceeded 30s; the
  "cold" 5s measurement was polluted by warm caches. This sets the `webServer` timeout.
- Whether the chosen schema behaves identically on native. Only the web backend was exercised
  by design - belongs on the unverified list by name.
- Whether `expo lint` stays exit-0 once real code exists.
- Whether `react-test-renderer` remains resolvable; it is transitive today.
- What a gate call costs. Phase 1 wants it recorded; it is not observable at stage 1.
