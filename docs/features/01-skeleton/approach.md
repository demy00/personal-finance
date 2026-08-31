# Stage 2 - approach: the application skeleton

Pipeline stage 2 (`solution-architect`), against `analysis.md` and the re-derived `AGENTS.md`.

## The shape

The organising idea is a single **purity boundary**. Exactly one directory may import
`expo-sqlite`; everything else talks to it through a port that knows nothing about SQLite.
That is not architectural taste - it is the direct consequence of finding 1. Above the line
jest runs logic at full speed. Below it, jest is not merely useless, it is *actively lying*,
so nothing that matters is allowed to live there.

Below the line: a thin SQLite gateway. Open the database, `PRAGMA`, `CREATE TABLE IF NOT
EXISTS` for both tables, upsert the fixture, issue exactly one `SELECT`. It returns **raw
rows as `unknown[]`** - no mapping, no validation, no error interpretation. Deliberately the
dumbest module in the repo, because it is the only one that cannot be tested cheaply.

Above the line: everything with a decision in it - the row guard, the money type and its
formatter, the read-state machine including the never-settled deadline, the fixture, the
three engine interfaces and fakes, the runtime config. Plain TypeScript in `lib/`, importable
by a `jest-expo/node` project. This is where the money rules live.

Between them: `TransactionSource`, a port with one method returning raw rows, with a SQLite
implementation and a family of fakes - fixture-backed, empty, rejecting, never-settling. The
fakes let jest exercise load orchestration *and* let Playwright reach the failure states,
which is otherwise impossible.

The screen is deliberately near-empty: a thin hook, a four-armed discriminated union, a
`switch` into four `testID`s. With no component renderer, anything the screen does that a
`switch` cannot express is untestable by construction - so it does nothing else.

The harness is a Playwright *fixture*, not a per-spec preamble, because the thing it must
catch is the thing nobody remembers to wire by hand. It collects `pageerror`, `console.error`
**and** `requestfailed` into one fault list, and exposes a wait that resolves on any of the
four state `testID`s. That separates *slow* from *dead*: a cold Metro bundle is slow and the
wait absorbs it; a dead database renders `stalled` after the app's own deadline. The harness
never infers a non-event from a timeout, because the app turned the non-event into a DOM node.

### Component sketch

```
app/
  _layout.tsx                 Stack, nothing else
  index.tsx                   switch(ReadState) -> four testIDs

features/transactions/
  useRecentTransactions.ts    effect -> loadRecent(source) -> ReadState. No logic.
  RecentTransactions.tsx      list + row. testIDs. No logic.

lib/                          ---- above the purity boundary: jest runs all of this ----
  money.ts                    Money, isIso4217, formatMoney (integer-only)
  runtime-config.ts           which source, which engines. env + (dev-only) ?source=
  transactions/
    types.ts                  Transaction, LineItem
    rows.ts                   toTransaction(unknown): Transaction | RowError
    read-state.ts             loading | ready(rows) | failed(reason) | stalled
    load.ts                   loadRecent(source, deadlineMs, clock): ReadState
    source.ts                 interface TransactionSource { listRecent(limit): Promise<readonly unknown[]> }
    fixture.ts                seed data, frozen, pure
    fakes.ts                  fixture / empty / rejecting / never-settling sources
  engines/
    types.ts                  BankSync, OcrEngine, Categoriser
    fakes.ts                  the three fakes
    index.ts                  createEngines(config)

lib/db/                       ---- below the boundary: the ONLY expo-sqlite importers ----
  sqlite.ts                   openDatabaseAsync, pragmas, ensureSchema, seed
  sqlite-source.ts            TransactionSource over sqlite. Raw rows out, no mapping.

lib/no-sqlite-outside-db.test.ts    static guard: greps source for the forbidden import

e2e/
  support/harness.ts          fault collectors + waitForTerminalState()
  recent-transactions.spec.ts the journey

root: package.json app.json babel.config.js metro.config.js jest.config.js
      playwright.config.ts tsconfig.json eslint.config.js .gitignore
```

## The seams

| | Seam | Observable as |
|---|---|---|
| S1 | `TransactionSource`, raw `unknown[]` | fakes and the SQLite impl interchangeable at the call site; provably never imports `expo-sqlite`, and that proof is executed (S5) |
| S2 | `toTransaction(unknown)` | well-formed row becomes a `Transaction`; a missing currency, a float amount or a non-ISO code becomes an error value, never a dropped row |
| S3 | `loadRecent(source, deadlineMs, clock)` | four distinguishable outcomes driven by four fakes, with fake timers for the deadline. **The only place the never-settled mode is provable at speed** |
| S4 | `formatMoney(Money)` | a string. Pure |
| S5 | jest module poison + purity guard | a suite importing `expo-sqlite`, directly or transitively, fails to run with an explanatory message |
| S6 | four state `testID`s | `txn-list` / `txn-empty` / `txn-failed` / `txn-stalled`, mutually exclusive, in the browser |
| S7 | harness fault list | an array asserted empty - a superset of what `AGENTS.md` describes |
| S8 | `createEngines(config)` | fake profile gives three objects; unknown profile fails loudly, never silently falls back |

**S5 is verified, not proposed.** Against the probe: with `moduleNameMapper: { '^expo-sqlite$':
<throwing module> }` under `jest-expo/node`, a pure test passed in 0.44s while an importing
test reported `Test suite failed to run` with the message. The silent `ROWS: []` shim became a
loud failure, and the preset itself does not pull `expo-sqlite`, so nothing else broke. The
grep-based guard is the second layer, catching a rename of the specifier.

## Decisions

**D1 - One module may import `expo-sqlite`, and jest enforces it by poisoning the specifier.**
*Rejected:* rely on convention and review. The failure it guards against is invisible - a test
bound `integration` at a SQLite seam passes green against a shim returning `[]`, with no signal
at all. A convention checkable only by a careful human is not a guard against a failure mode
whose whole character is looking fine. Four lines of config turn the repo's most dangerous
property into its loudest.

**D2 - The port returns raw rows, not domain objects.**
*Rejected:* `listRecent(): Promise<readonly Transaction[]>`. That pushes mapping and validation
into every implementation, so the SQLite one - the module jest cannot execute - grows the logic
that most needs testing. Raw rows keep the untestable module trivial and let fakes inject
malformed rows, which is how "never swallow a query error into an empty list" gets tested at all.

**D3 - `ReadState` is four-armed; `stalled` is a first-outcome-wins race against an app-level
deadline, and a late settle is ignored.**
*Rejected:* three states plus a Playwright-side timeout. A spec timeout cannot distinguish "the
database never settled" from "the Metro bundle is cold" - measured at 300ms vs 30s+. Putting the
deadline in the app makes the two independently observable. *Also rejected:* letting a late settle
overwrite `stalled` - honest, but non-terminal, so a Playwright assertion on it is racy.

**D4 - Failure and empty states are reachable in e2e through a dev-only `?source=` parameter.**
*Rejected:* env vars per state - each needs a server restart, so one run needs N servers, which
destroys the ~5s loop. *Rejected:* leaving those states unverified - `AGENTS.md` makes
distinguishability a contract rule, and an unobservable acceptance criterion is one of the gate's
four blocking kinds. The parameter is inert outside dev. Honest cost: we observe *the app's*
failure rendering, never a real SQLite failure.

**D5 - jest runs one project, `jest-expo/node`, with `e2e/` in `testPathIgnorePatterns`.**
*Rejected:* the probe's two-preset setup. With no component renderer nothing under test is
platform-divergent, so two presets buy 2x runtime and zero information; jsdom exists only to
serve a renderer we refused. A platform-suffixed file is a *claim* that platforms differ - adding
one now would be a false claim.

**D6 - Seeding is a per-row upsert keyed on the fixture's fixed ids.**
*Rejected:* count-then-insert - not convergent, and a human's OPFS profile survives restarts, so
someone who opened the app once would never see a fixture that later gained a row. *Rejected:*
drop-and-recreate - convergent but destroys anything not in the fixture; harmless today, wrong the
moment writes land.

**D7 - Fixture is fixed ISO 8601 literals, two currencies, no total on screen.**
*Rejected:* dates relative to now - the e2e asserts on rendered content, so a relative date makes
the assertion time-dependent and the fixture stops being reproducible. *Rejected:* one currency -
the currency-carrying invariant would never be exercised. Two currencies with no total exercises
the money rule without triggering the no-rate-source rule.

**D8 - A row validation failure makes the whole read `failed`, not a shorter list.**
*Rejected:* skip the bad row and render the rest. On the contract's own terms - a wrong number is
the only unacceptable outcome, and a silently missing transaction is a wrong total waiting to happen.

**D9 - No Zod; hand-written type guards at the row boundary.**
A deliberate departure from the typescript skill's preference for a schema validator. Zod is
outside the pre-authorised set, there are exactly two row shapes of five columns, and the guard is
a short function that is itself jest-tested. This inverts the moment a third or fourth external
shape appears.

**D10 - `eslint` and `eslint-config-expo` are added deliberately, committed with `eslint.config.js`.**
*Rejected:* letting `expo lint` self-install. `AGENTS.md` forbids unasked dependency additions, and
the observed behaviour is 208 packages plus a `package.json` edit arriving unattended in whatever
diff happens to run lint first. `expo lint` is the declared command so its dependencies are
authorised by implication - but they should land in a reviewed commit, not ambush one.
**This needs the owner's sign-off.**

**D11 - `watchman: false` is not pinned in the repo config.**
*Rejected:* pinning it - that encodes one broken machine into a contract every future machine
reads, and hides an environment defect rather than fixing it. `--watchman=false` is the local
workaround.

**D12 - Playwright `webServer` timeout is 120s; the app deadline is short.**
*Rejected:* Playwright's 30s default. The genuinely first bundle exceeded it, and a default that
fails once per machine teaches people to rerun - which is how real failures get reflexively rerun too.

## The three interfaces - proposed, for sign-off

Escalation-class. The argument running through all three: **nothing in this phase calls them**, so
every field is a guess, and the only defence against a wrong guess is narrowness. A speculative
field is a false claim about what the engine gives us.

**Bank sync** - `fetchSince(since: string): Promise<readonly Transaction[]>`. ISO 8601 in, domain
transactions out, no line items.
*Rejected:* a PSD2-shaped connect/consent/accounts/cursor API - "how transactions arrive" is a
parked question the contract calls the highest-value unknown, and modelling PSD2 now silently
answers it.
*What makes it wrong:* if transactions arrive by CSV or manual entry this is not a network engine
at all - it is a parser, its input is a file, and "since" is meaningless. **Most likely of the
three to be wrong.** Dropping bank sync from this phase and softening the one `AGENTS.md` clause
that names it is a defensible alternative.

**OCR engine** - `extract(image: { uri: string }): Promise<{ currency: string; lines: readonly
{ description: string; amountMinor: number }[] }>`.
*Rejected:* confidences, bounding boxes, merchant/date header fields, progress callbacks - nothing
consumes them, and each is a claim about a provider we have not chosen.
*What makes it wrong:* it assumes a receipt attaches to an existing transaction, so no header is
needed. If receipts can stand alone the return type needs merchant and date.

**Categoriser engine** - `categorise(descriptions: readonly string[]): Promise<readonly (string |
null)[]>`. The **model edge only**. Batched because one receipt is N items and one call.
*Rejected:* putting the cache behind the interface. For a privacy reason, not an aesthetic one:
`AGENTS.md`'s device-boundary table says extracted text leaves **on cache miss only**. If the cache
sits behind the engine boundary that property belongs to the implementation, and a future engine
swap silently loses it. The cache must be app code *outside* the interface - which also makes it
deterministic and jest-testable.
**Consequence: the cache does not ship this phase.** Nothing has items to categorise yet.
*What makes it wrong:* if accuracy needs context - merchant, currency, the other items on the same
receipt - a bare description list is too narrow. If categories are a closed taxonomy the interface
should carry it. Both are product decisions.

**Selection** - `createEngines(config)` as a pure factory plus a thin module-level singleton;
`fake` is the only registered profile and an unknown profile throws.
*Rejected:* a React context provider - no component renderer exists to test one, so the wiring
would be verifiable only through the browser, the exact trap this approach avoids.

## What this does not change

No writes. No second route, no navigation, no detail view, no styling system, no state library.
No network at all - fakes only; the `## What leaves the device` table is untouched. No category
derivation. No migration mechanism. No component renderer, now or later - a design consequence,
not a deferral. No device leg, no CI, no cross-origin isolation, no synchronous SQLite.
`AGENTS.md` changes in at most two named places, both about finding 3, and only with sign-off.

## Risks

**R1 - The purity boundary is decorative.** If the interesting logic is SQL, seeding and ordering,
jest tests trivia. *Find out early:* write the `loadRecent` and `toTransaction` tests first, before
any SQLite code exists, and count whether they would catch a real bug. Under ~5 meaningful
assertions, the boundary is in the wrong place and the honest answer is to bind almost everything
`e2e` and stop pretending.

**R2 - The `stalled` deadline flakes on a cold profile.** 297ms warm was measured; cold OPFS
initialisation never was. If real cold opens exceed the deadline the app renders `stalled` on a
healthy database - worse than no state, because a flaky honest signal gets muted. *Find out early:*
measure cold-profile open time before fixing the constant, then run the happy path ~10 times on
fresh contexts.

**R3 - We never observe a real SQLite failure.** D4's consequence. If real `expo-sqlite` breaks in
a shape our fakes do not model - resolving with garbage rather than rejecting or hanging - the app
has no state for it. The row guard is the backstop. Record as a method limitation, not as coverage.

**R4 - The wasm backend may not support what the schema needs.** `PRAGMA foreign_keys = ON` and
`INSERT ... ON CONFLICT DO UPDATE` were never exercised, and the backend is alpha. *Find out early:*
exercise both in the first browser run of the SQLite slice, before anything depends on them.

**R5 - The alpha backend is unstable enough to be an unsuitable foundation.** The scenario that
makes the whole approach wrong, because the verification surface rests on it. The `TransactionSource`
port is the deliberate insurance: a different web-side implementation is one file and nothing above
the line changes.

**R6 - Three interfaces with no callers will be wrong.** Guaranteed to some degree. Mitigation is
narrowness plus zero dependants. Changing them at the first real caller is normal, not a defect.

**R7 - `Intl` on Hermes.** If `formatMoney` uses `Intl`, device behaviour may diverge. Web proves
nothing here. Goes on the standing unverified list **by name**.

## Where the split lines are

Three behavioural slices; none is "a layer".

1. **The shell tells the truth** - the app runs on `:8081`, all config files exist and their
   commands exit zero, the four read states render distinguishably from an in-memory source, and the
   harness catches a fault that throws nothing. Ends with a browser that can prove a dead data
   layer is dead.
2. **The truth comes from the database** - schema, fixture, upsert seed, the SQLite port, the purity
   guard and the poison. Ends with the e2e asserting a seeded merchant and amount that could only
   have come from SQLite.
3. **The engines exist and are selectable** - three interfaces, three fakes, the factory, its tests.

The first two split cleanly because the first delivers observable behaviour on its own. The third
is independent of both and could sit anywhere, including first. Ordering is stage 3's.

## For the gate to settle

- The exact rendered output of `formatMoney` (user-visible copy, escalation-class). Its *contract*
  is fixed: integer arithmetic only, currency always present.
- What each row shows, and what "recent" means. Proposed: `ORDER BY occurred_at DESC, id DESC` with
  an explicit tiebreak so the e2e assertion is deterministic, limit 20.
- Whether the e2e must assert all four states or only `ready` plus one failure state.
- Whether `AGENTS.md` gets the finding-3 amendment in this phase.
- Whether bank sync ships at all.
