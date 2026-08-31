# Stage 3 - phases: the application skeleton

Pipeline stage 3 (`implementation-planner`), against `analysis.md` and `approach.md`.

## Verdict on the architect's split

The architect's slice ordering (1 -> 2 -> 3) is taken, but **resized into four phases plus an
un-gated Phase 0**. Two reasons its three slices cannot ship as three phases:

1. **Slice 1 exceeds the requirement cap on its own** - roughly 20 requirements (command
   existence, runner disjointness, poison, purity guard, route, testID, fault list, four states,
   deadline, `?source=`, money invariants, row guard). The gate would force a sibling split
   anyway; better that split lands on a behavioural seam than on a mechanical count.
2. **Slice 1 bundles two different claims** - "the repo is a running, drivable app whose declared
   commands are real" and "the read it performs is honest". Separately observable, and the second
   is where R1 gets measured.

## Phase 0 - the wasm probe · no spec, no gate, no verifier

**Where the biggest risk dies, and deliberately not a phase.**

- **Delivers:** numbers and a yes/no, plus a `## Learnings` entry in `AGENTS.md`. **No committed
  application code.**
- **Answers:** R4 - does `PRAGMA foreign_keys = ON` actually enforce on the wasm backend, and does
  `INSERT ... ON CONFLICT DO UPDATE` work. R2 - cold-profile OPFS open time on a fresh Playwright
  context. R5 residue - 10 consecutive fresh-context opens, pass rate.
- **Verifiable as:** observed output from a throwaway probe, in the analyst's own idiom. Deleted
  afterwards.
- **Depends on:** nothing. **Feeds:** P3's schema requirements and P3's deadline constant.

### Why the biggest risk gets a spike rather than a first phase

The rule is that the phase proving or killing the biggest risk goes first even if it delivers
less. That rule is applied to the *work*, not to the ceremony:

- **R5's headline question is already answered, empirically.** The stage-1 probe ran a real
  `openDatabaseAsync`, got real rows, and had Playwright assert `Tesco 1200000 HUF` out of SQLite
  with an empty fault list. "Is the alpha web backend usable at all" is observed, not open. What is
  live is narrower - R4's two constructs, plus stability and timing. A 40-line question.
- **A phase cannot be cheaper than its vehicle.** Observing SQLite in a browser needs
  `package.json`, `babel.config.js`, `metro.config.js`, `playwright.config.ts`, a route and a
  harness. Ordering SQLite first does not skip P1's work, it *merges* it - producing a first phase
  that is the entire repo bootstrap and the risk probe at once. Over one sitting, and it puts the
  config files, the ones most likely to be rubber-stamped, next to the SQL, the code most needing
  an attentive reader.
- **R5's blast radius is already bounded** by the `TransactionSource` port. If the backend fails,
  P1 and P2 survive untouched and one file changes. Front-loading buys less than usual because the
  mitigation is designed in.
- **Decisive: R1 is falsifiable only in this order.** R1 says write the `loadRecent` and
  `toTransaction` tests before any SQLite code exists and count the meaningful assertions. Putting
  SQLite first destroys that measurement permanently. R1 failing changes the *binding of every later
  requirement*.
- **Ceremony is a named cost.** Spec, two gate runs, tdd cycle and a verifier run, to produce code
  that gets deleted, is exactly the "setup project rather than a working method" failure flagged
  after two deferrals.

Risk-killing work goes first. It just does not get a spec, because a spike has no requirements for
a gate to block on.

## Phase 1 - the app runs and is drivable

- **Delivers:** repo bootstrap (`package.json`, `app.json`, `tsconfig.json`, `babel.config.js`,
  `metro.config.js`, `jest.config.js`, `playwright.config.ts`, `eslint.config.js`, `.gitignore`).
  Every command in `AGENTS.md`'s `## Pipeline` and `## Commands` exists and exits zero.
  `app/_layout.tsx` plus one route rendering the frozen fixture directly - no port, no state
  machine. The Playwright fault-collector fixture (`pageerror` + `console.error` + `requestfailed`).
  `lib/money.ts`. The jest poison of `expo-sqlite` and the grep-based purity guard.
- **Verifiable on its own:** a clean checkout runs `npm install && npm run lint && npm run
  typecheck && npm test && npm run e2e`, all zero, and the e2e asserts a specific fixture merchant
  on screen with an empty fault list. Mixed bindings - `integration` on `formatMoney` and fixture
  validity (both provably SQLite-free, and the poison proves it), `e2e` on the rendered row, `none`
  on command existence.
- **Candidate specs:** **R1.1** repo bootstrap, declared commands, runner disjointness, poison,
  purity guard. **R1.2** first drivable screen, fault harness, `formatMoney`, and the
  `## Validating your work` amendment from finding 3.
- **Depends on:** nothing. Two owner decisions close before its gate - D10 (eslint added
  deliberately) and whether the finding-3 contract amendment lands here.

**At the edge of one sitting.** Nine config files is the bulk, and a config file is the archetypal
thing approved unread. Mitigations: keep the eslint dependency addition as its own commit inside
the phase, and hold the state machine out - that is what R1.2 buys by being thin.

Two stage-1 facts belong in R1.1's acceptance criteria verbatim: **jest exits 1 with zero tests**,
so the phase must ship a real jest test or fails its own done-criterion by construction; and the
servers' criterion is **HTTP 200 at the declared URL within a stated timeout**, not "exits zero".

## Phase 2 - the read is honest

- **Delivers:** `TransactionSource` and its four fakes (fixture, empty, rejecting, never-settling).
  `toTransaction`. Four-armed `ReadState`. `loadRecent(source, deadlineMs, clock)` with
  first-outcome-wins and late-settle-ignored. The `switch` into four mutually exclusive `testID`s.
  Dev-only `?source=`. `waitForTerminalState()`.
- **Verifiable on its own:** jest drives all four outcomes against the four fakes with fake timers,
  at full speed and above the line. Playwright drives all four states through `?source=` and asserts
  the fault list empty. No database anywhere, so nothing here can be graded against the silent shim.
- **Candidate specs:** **R2.1** the row guard and money invariants at the boundary (well-formed row,
  missing currency, float amount, non-ISO code, and D8's whole-read-fails). **R2.2** the four read
  states, the deadline, the dev-only source selector, the terminal-state wait.
- **Depends on:** P1.

**This phase is the R1 measurement.** Its jest suite is exactly the "before any SQLite code exists"
suite R1 names. Count the meaningful assertions at the verifier run: under about five, the purity
boundary is in the wrong place, and P3's bindings change before P3 is specified. That makes P2 the
second de-risking phase and another reason it precedes the database.

The deadline stays a **parameter** here. The constant is chosen in P3 from Phase 0's cold-open
measurement - a number picked against in-memory fakes is not a number about OPFS.

## Phase 3 - the truth comes from the database

- **Delivers:** `assetExts.push('wasm')`. `lib/db/sqlite.ts` (open, pragmas, `CREATE TABLE IF NOT
  EXISTS` for both tables, per-row upsert seed). `lib/db/sqlite-source.ts` returning raw
  `unknown[]`. `ORDER BY occurred_at DESC, id DESC LIMIT 20`. SQLite becomes the default source.
  The stalled deadline constant. The `expo-sqlite` divergence entry on the standing unverified
  list, by name.
- **Verifiable on its own: e2e only, and this needs saying plainly.** Nothing below the purity
  boundary can carry a jest or `integration` binding - the owner's decision forbids it, and the
  `jest-expo/node` shim would grade it green while returning `[]`. The verifier can run the journey,
  check the purity guard and review the tests; it cannot trace unit coverage into `lib/db/`.
  Acceptance is a Playwright assertion on a seeded merchant *and* amount that could only have come
  from SQLite, a second page load proving the upsert is convergent, and ten fresh-context runs with
  no `stalled`.
- **Candidate specs:** **R3.1** schema, seed, the SQLite port and the seeded journey. Roughly ten
  requirements - one spec, no sibling.
- **Depends on:** P2 and **Phase 0**. If Phase 0 says the wasm backend cannot enforce foreign keys
  or cannot upsert, this phase does not get specified - it becomes the finding worth more than the
  skeleton, and P1/P2 still stand as delivered work.

Also at the edge, for a different reason than P1: small in lines, large in consequence. It is the
only code in the repo no automated check can execute meaningfully, so the sitting it needs is a slow
read of about eighty lines of SQL and open/seed sequencing, not a skim of four hundred.

## Phase 4 - the engines exist and are selectable

- **Delivers:** the engine interfaces, their fakes, `createEngines(config)`, `fake` as the only
  registered profile, an unknown profile throwing loudly.
- **Verifiable on its own:** pure jest, `integration` bindings throughout - these seams provably
  never import `expo-sqlite` and the P1 poison executes that proof. **The only phase with no e2e
  leg**, which is also why it can never block anything.
- **Candidate specs:** **R4.1**, about five requirements. Thin - at the small edge.
- **Depends on:** P1 only. Escalation-blocked on owner sign-off for the interface shapes and on
  whether bank sync ships.

### Where the engines go, and why

**Last, as its own phase, and bank sync should be cut.**

- Ordering is by what unblocks what. This slice has zero callers and unblocks nothing. That is the
  definition of last.
- Its content is the most likely to be wrong (R6). Putting it first spends the earliest and most
  attentive review budget on the material least likely to survive its first real caller.
- Its only reason to exist this phase is contract consistency - `AGENTS.md` asserts the fakes exist
  and are what tests drive, so either they ship or the contract softens. That is an obligation, not
  a capability, and obligations go where they cost least.
- **Not folded into P1**, despite being pure above-the-line TypeScript exactly like `money.ts`.
  Folding it there would block the phase that gets the app running on an escalation about interface
  shapes that has nothing to do with getting the app running.
- **Not folded into P3** - that would put speculative interface design in the same sitting as the
  one file nothing can test for you.
- If three phases are wanted rather than four, this is the one to fold, and the way to fold it is as
  a sibling spec **inside the last phase**, never as extra scope in the middle.

On bank sync: `AGENTS.md`'s strongest claim is in `## Validating your work` - *"Both engines have
fakes, and the fakes are what you drive"* - **two** engines, OCR and categoriser. Only the softer
`## Conventions` sentence names three. Dropping bank sync costs one sentence in Conventions and
leaves the contract's load-bearing claim intact. Against that: `fetchSince(since)` presupposes an
answer to "how transactions arrive", which the contract parks as the highest-value unknown in the
project. Shipping it answers that question silently. Owner's call; it changes R4.1 by roughly two
requirements, not its position.

## The order

| Phase | Kills / delivers | Blocked by |
|---|---|---|
| 0 (spike, un-gated) | R4, R2's number, R5's residue | - |
| 1 | drivable app, real commands, fault harness | - |
| 2 | honest read, four states; **measures R1** | 1 |
| 3 | real database behind it | 2, 0 |
| 4 | engines, contract consistency | 1, owner sign-off |

At the edge of one sitting: **P1** (volume - nine config files), **P3** (consequence -
unexecutable-by-jest SQL). At the small edge: **P4**.


## Decisions taken at the phase-list handback

1. **Phase 0's results accepted.** Foreign keys enforce (off by default), `ON CONFLICT DO UPDATE`
   works, full load 68ms, 10/10 fresh contexts. Phase 3 stays in the plan; its `stalled` deadline
   constant is **3000ms**. See `phase0-findings.md`.
2. **Bank sync is cut from Phase 4.** `AGENTS.md`'s load-bearing claim - "both engines have fakes" -
   names two, OCR and categoriser; only the softer Conventions sentence names three. `fetchSince`
   would have silently answered "how transactions arrive", which the contract parks as the project's
   highest-value unknown. The Conventions sentence gets softened instead. R4.1 loses ~2 requirements.
3. **eslint and eslint-config-expo are added deliberately**, as their own commit inside Phase 1,
   rather than letting `expo lint` self-install 208 packages into whatever diff runs it first.
4. **The finding-3 contract correction lands inside Phase 1**, as a requirement with binding `none`,
   so the contract and the harness that honours it are reviewed together. It also carries Phase 0's
   second learning: foreign keys are off by default on this backend, and violations report the
   generic `Error finalizing statement`.
