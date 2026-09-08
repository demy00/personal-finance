# AGENTS.md

## What this project is

A personal finance app for one user: me. It answers **"where did the money go"** -
spending, categorised, from receipts and bank transactions - on my own device, with
no accounts and no auth.

The unit is a **transaction with line items nested underneath it**. A row is a bank
transaction; a scanned receipt attaches its line items beneath one, and the
transaction's category is *derived* from its items when they exist. Categories are
per-item, not per-merchant, because "Tesco, 12,000 HUF" is not an answer to where
the money went.

"Good" here means correct arithmetic and a fast, honest feedback loop. There are
no other users to be gentle with, so a wrong number is the only unacceptable
outcome. Speed of the dev loop is a first-class requirement, not a nicety - see
`## Validating your work`.

## What leaves the device, and what does not

This app is **local-first, not local-only**, and the difference is deliberate. Do
not describe it as private without qualification, and do not add a network call
outside this list without asking.

| Leaves | To what | When |
|---|---|---|
| Receipt images | the OCR engine | on every capture |
| Extracted line-item text | the categoriser engine | **cache miss only** - a known item never leaves |

Everything else stays: bank transactions, balances, totals, the item->category
mapping, and every derived figure.

**Why this is written down.** An earlier design kept OCR on-device to protect the
photo, then sent the extracted item text to a cloud model anyway - paying for a
privacy property it was not getting. A structured list of what you bought is more
revealing than the photograph it came from. The current design is honest about the
boundary instead of implying a stronger one. Anything that widens this table is a
product decision, not an implementation detail - see `## Escalate`.

## Stack and layout

- Language / runtime: TypeScript, strict
- Framework: Expo / React Native, with **web as a real target** via `react-native-web`
- Package manager: npm
- Database: SQLite on device (`expo-sqlite`), local-first
- Entry point: `app/` (expo-router, file-based)
- Key directories:
  - `app/` - expo-router routes. The route tree IS this directory
  - `components/` - shared presentational components
  - `features/<x>/` - feature-scoped components, hooks, logic
  - `lib/` - platform-agnostic helpers, no React
  - `e2e/` - Playwright specs against the web target
  - `docs/features/` - pipeline specs, one directory per unit of work

**Expo Go works and must keep working.** Both cloud engines are plain network
calls, so nothing here needs a native module that would force dev builds. A change
that breaks Expo Go costs the fast loop this whole stack was chosen for - escalate
rather than absorb it.

## Pipeline

- language skill: `expo` (plus `typescript` for any `.ts`/`.tsx` discipline question)
- test:     `npm test` - `jest` with the `jest-expo` preset. **Not vitest**
- coverage: `npm run test:coverage` - `jest --coverage`. No threshold is enforced yet; the
            `verifier` traces coverage per requirement binding rather than against a global number
- e2e:      `npm run e2e` - `playwright test`. **Do not bring the stack up first.** The
            Playwright config owns `webServer` and sets `reuseExistingServer: false`, so
            `npm run e2e` starts its own server on :8081 and *fails* if one is already
            there - which is what stops a green run reporting on stale code
- lint:     `npm run lint` - `expo lint .`. **The trailing `.` is load-bearing**; without it
            `expo lint` lints only `app/` - see `## Learnings`
- typecheck: `npm run typecheck` - `tsc --noEmit`
- source:   `app/`, `components/`, `features/`, `lib/`
- tests:    colocated with the code, `*.test.ts(x)`. **`e2e/` belongs to Playwright and is
            excluded from jest's collection** via `testPathIgnorePatterns` in `jest.config.js` - the
            two runners must never claim the same file.
            Platform-suffixed variants (`.test.web.tsx`, `.test.ios.tsx`, `.test.native.tsx`,
            `.test.node.ts`) only where behaviour genuinely diverges - a suffixed file is a
            claim that the platforms differ
- mutation: `none`
- CI:       `.github/workflows/ci.yml` runs exactly the four commands above - lint, typecheck,
            `npm test`, then `npm run e2e` in a second job - on every pull request to `main`.
            A check that diverges from what `npm run ...` does locally is a check about
            something other than this repo, so change both together

**If a command above does not exist yet, that is a defect in the repo, not a licence to guess a
different one.** Add the script, or stop and say so.

## Commands

```sh
npm install              # install deps
npm run web              # expo web dev server, http://localhost:8081
npm start                # expo dev server (device / simulator)
npm test                 # jest, jest-expo preset
npm test -- <pattern>    # a single test file or name
npm run test:coverage    # jest --coverage
npx playwright install chromium   # once per machine; the binary lives in a cache outside the repo
npm run e2e              # playwright, starts the web server itself
npm run lint             # expo lint . - the trailing dot matters, see ## Learnings
npm run typecheck        # tsc --noEmit
```

## Validating your work

Before reporting a task complete you MUST exercise the real application, not only the test suite.
Unit tests passing is necessary but not sufficient.

**How to run the app end-to-end:**

```sh
npm run e2e              # starts its own server on :8081, drives it, tears it down
```

That is the whole procedure. **Do not start `npm run web` and leave it running.** The Playwright
config sets `reuseExistingServer: false`, so a server left behind makes the next `npm run e2e`
fail. To look at the app by hand, run `npm run web`, look, and **stop it** before running the suite.

**How to drive it:**

`npm run e2e` opens `http://localhost:8081` through the shared fixture in `e2e/fault-collector.ts`
and interacts with the feature the way the user would.

- Target elements by `testID`. On web `testID` becomes `data-testid`, so one prop serves both
  surfaces. Add one to anything a test needs to reach.
- Assert on **user-visible outcomes**, never on component internals or state.
- **Collect uncaught page errors, console errors *and failed requests*, and assert the list is
  empty.** Page errors alone are not enough. This is the correction of a rule that certified a dead
  app as healthy - see `## Learnings`. Attach the listeners **before the first navigation**, because
  the failure class this exists to catch happens during initial load, and obtain the list from the
  shared fixture rather than wiring your own: a collector nobody remembers to wire is precisely the
  thing that fails.
- **Know the limit of that collector.** It sees a failure that reaches the network. A promise that
  never settles and makes *no* failed request is still invisible to it, and telling that apart from
  an empty result needs the four-state read machine, which does not exist yet.
- **Watch the harness fail at least once.** A collector nobody has observed catching a failure is
  the same unbacked claim this section used to make. `e2e/fault-collector.spec.ts` is the standing
  demonstration: it induces a load-time request failure that throws nothing, and asserts the fault
  list caught it on the request channel.

**Claims in this file that are not yet true.** They describe where the project is going, not what is
on disk. Do not build against them without checking:

- *"The database is seeded from a fixture on a fresh profile"* - **not yet true.** No database is
  opened on any platform. One route renders a frozen in-memory fixture,
  `lib/fixtures/transactions.ts`.
- *"Both engines have fakes, and the fakes are what you drive"* - **not yet true.** Neither the OCR
  nor the categoriser engine exists yet, in any form.
- *"An empty state and a failed read must be distinguishable in the UI"*, which is stated in
  `## Conventions` rather than here - **not yet true**, and narrower than the distinction that
  matters. A read that never settles, an empty result and a failed read are three different
  outcomes, and the UI expresses none of them. That is the next phase's work.

**Evidence to produce**, in this exact shape, every time:

1. **What changed** - the diff in one paragraph
2. **What the fresh-context reviewer found**
3. **What was executed end-to-end and observed** - commands run and what you actually saw, not
   what you expected to see
4. **What was escalated and how it was decided**
5. **What remains unverified** - see below. This field is not optional and "nothing" is a claim
   you have to have earned

## Unverified on web - the standing list

The web target is the verification surface, and these genuinely differ on device. **A green web
suite says nothing about any of them**, so anything touching this list goes into the "remains
unverified" field and needs a device check before it ships:

- Camera / image picker - permission flows are entirely different. Note this is the *capture* step
  only; everything downstream of the captured image is web-verifiable through the OCR fake
- Push notifications - no web equivalent
- **Secure storage** - `expo-secure-store` is Keychain/Keystore on device; web falls back to
  something weaker, so a web test proves nothing about the security property
- Background tasks, haptics, biometrics
- Deep links - similar in shape, different in mechanics
- **`Intl` on Hermes.** Android ships a partial `Intl`, so anything locale-aware - currency symbols,
  grouping separators, date formatting - can behave differently on device than in the browser.
  Nothing depends on it today: `lib/money.ts` deliberately avoids `Intl` and returns a locale-free
  decimal string. The human-facing presentation layer built on top of it will not have that luxury
- **SQLite behaviour** where `expo-sqlite` differs between its native and web (wasm) backends.
  Expo documents the web backend as alpha; it is the verification surface's own foundation, so
  treat an oddity here as a finding about the method, not just about the app

## Conventions

- **Money is integer minor units, and every amount carries an ISO 4217 currency code.** Never a
  float, never a `number` of "pounds", and never a bare amount. This app is multi-currency from
  day one because the accounts behind it are. A value that reaches a component as a float, or as
  an amount with no currency, is a bug regardless of what it renders as.
- **No cross-currency total may be computed without a stated rate source.** There is no rate source
  yet. Until there is, totals are per-currency; a mixed-currency sum is not a rounding question,
  it is a wrong number.
- Dates are ISO 8601 strings at rest, parsed at the edges only.
- **Two things sit behind an interface with a fake implementation**, and the fakes are what tests
  run against: the **OCR engine** and the **categoriser engine**. Each is chosen at runtime by
  configuration. Cloud today; a local model or a personal AI subscription later must be a config
  change, not a rewrite. How transactions arrive is deliberately still open - see
  `## Open questions`.
- **The categoriser is a cache with a model at its edge.** A persisted item->category mapping is
  consulted first; only a miss calls the model, and the result is written back. The deterministic
  path is the tested one. The cache key must be **stable, not correct** - if OCR consistently
  mangles a product name, the mapping still works, so never "fix" a key by normalising it in a way
  that makes the same receipt produce different keys on different runs.
- Error handling: fail loudly in dev, never swallow a query error into an empty list. An empty
  state and a failed read must be distinguishable in the UI.
- Keep platform branching at the leaves. `Platform.select` inside a shared component is fine; a
  component that is 80% platform branches should be two files with a platform suffix.

## Do not

- Don't add a dependency without asking. The stack named under `## Stack and layout` and
  `## Pipeline` is pre-authorised; a UI kit, a state library, an ORM or a date library is not.
- Don't reformat files you weren't asked to change.
- Don't weaken a locked test. After the `verifier` passes a phase, its tests lock - a later gate
  may demand *added* tests, never weakened ones.
- Don't write a test the requirement's `binding:` does not call for. Writing an unrequested test is
  the same defect as skipping a required one.
- Don't reach for vitest. `jest-expo` handles the RN transform pipeline, platform-suffix
  resolution and native module mocks; replacing it means rebuilding all of that by hand.
- Don't call a real OCR or categoriser endpoint from a test. The fakes exist so the suite is
  deterministic and free; a test that hits the network is both flaky and billed.
- Don't commit anything under `.expo/`, `node_modules/`, or any real financial data - including a
  real receipt image as a fixture.

## Escalate to me, don't decide alone

- Any user-visible copy or UX change not specified in the task
- Schema changes, including migrations
- The shape of the OCR and categoriser interfaces, and anything that would make a real call to
  either of them
- **Anything that widens `## What leaves the device`**
- Anything that would break Expo Go, or require a dev build
- Anything that changes what the product does, vs. how it does it

## Open questions - do not answer these silently

These are settled with me, not by whoever hits them first. If a task requires one, stop and ask.

| Question | Blocks |
|---|---|
| Offline receipt capture: queue the image, block the capture, or degrade to manual entry? | Any receipt-capture spec. An unhandled critical edge case is one of the four things that block at the gate |
| How transactions arrive for daily use: PSD2 API, CSV import, or manual? | The first genuinely useful version. Highest-value unknown in the project |
| History depth on day one | Import design |
| Rate source for cross-currency totals | Any total spanning two currencies |

## Learnings

<!-- When something goes wrong, write the lesson here rather than having me fix it silently -
     this file is how the next session starts smarter than this one did. How to write one:
     `## Maintaining this file`. -->

- **This stack's characteristic failure is a promise that never settles, not a throw.** A wasm asset
  failed to resolve, `openDatabaseAsync()` neither resolved nor rejected, and the page sat on loading
  forever while emitting **no `pageerror` and no console error**. The only signal was a failed
  network request. `## Validating your work` used to say "collect page errors and assert the list is
  empty", and that rule called a completely dead database clean. On this stack, a harness that
  watches only thrown errors is not a harness.
- **`expo-sqlite`'s web backend has foreign keys off by default**, and reports the generic
  `Error finalizing statement` when one is violated rather than naming the constraint. Turn them on
  with `PRAGMA foreign_keys = ON` per connection, and do not expect the error text to say what went
  wrong.
- **`jest` cannot exercise `expo-sqlite` at all.** The `jest-expo/node` preset resolves the module to
  a shim that returns empty results, so a query test passes green against no database - the danger is
  not that it fails, it is that it *succeeds*. This repo does not rely on anyone noticing:
  `jest.config.js` maps `^expo-sqlite(/.*)?$` to `test-fixtures/poison.js`, which throws instead, so
  a jest suite that reaches the module fails loudly. Remove that mapping and the silent shim is what
  comes back. Either way, nothing below the purity boundary can carry a `jest` binding.
- **Playwright refuses to load a spec when `JEST_WORKER_ID` is set in the environment** - it assumes
  jest is trying to run browser tests, and exits 1 with "Playwright Test needs to be invoked via
  'npx playwright test'". Anything spawning `playwright` from inside a jest test - such as
  `lib/guards/playwright-collects-only-e2e.test.ts` - must strip that variable from the child's
  environment, or it gets a confident failure and an empty file list.
- **Two of this repo's own commands were passing while checking nothing.** Both were found the same
  way - by asking what the command actually ran, not whether it exited 0 - and both are the reason
  `npm run lint` and `npm test` carry the shapes they do now:
  - **`expo lint` with no path argument lints only `app/`.** `@expo/cli` defaults its inputs to
    whichever of `src/`, `app/`, `components/` exist, and passes *no* path to ESLint when none do -
    which is the only reason lint covered the tree before a route directory existed. The moment
    `app/` was created, `npm run lint` silently narrowed to it and went green over five real errors
    in `e2e/` and `lib/`. The script is `expo lint .` for that reason.
  - **A broken `watchman` makes `jest` run zero tests and exit 0.** Not fail - *pass*, with no
    summary and no "Ran all test suites". Observed on this machine: `npx jest --listTests` printed
    nothing and exited 0, while `--watchman=false` listed six suites. `jest.config.js` sets
    `watchman: false` so no `npm test` here can ever be vacuous for that reason.
- **`expo start --web` rewrites `tsconfig.json`** on startup, normalising its `include` array, and so
  does every `npm run e2e` by extension. The committed file is the post-rewrite form, so a run is a
  no-op against it. Hand-edit `include` and expect Expo to have an opinion.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
