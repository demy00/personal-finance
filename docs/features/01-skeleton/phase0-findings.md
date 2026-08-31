# Phase 0 - the wasm probe: results

Un-gated spike. No spec, no gate, no verifier, **no committed application code**. Run against the
real `expo-sqlite` web backend in a real browser via Playwright, reusing stage 1's throwaway probe.

**Verdict: Phase 3 is viable.** The schema as specified works on the alpha backend, the seed
strategy works, and the deadline risk is dead.

## R4a - does `PRAGMA foreign_keys = ON` actually enforce? Yes.

| Observation | Value |
|---|---|
| `PRAGMA foreign_keys` before setting | `0` - **off by default** |
| after `PRAGMA foreign_keys = ON` | `1` |
| insert child with non-existent parent | **rejected** |
| orphan rows actually present afterwards | `0` |
| insert child with a real parent | succeeds |

The last row matters: a backend that rejected *everything* would have passed the orphan test for
the wrong reason. It enforces, and it enforces selectively.

**One caveat worth carrying into Phase 3.** The rejection message is
`Error: Error finalizing statement` - entirely generic. A foreign-key violation is
indistinguishable by message from any other statement failure. Anything that needs to tell a
constraint violation apart from a broken query has to do it by some means other than reading the
error text, and `AGENTS.md` requires an empty state and a failed read be distinguishable.

## R4b - does `INSERT ... ON CONFLICT DO UPDATE` work? Yes.

Inserted `t1`, then upserted the same id with a different merchant and amount:

| Observation | Value |
|---|---|
| merchant after second write | `Tesco Extra` (updated) |
| row count | `1` (no duplicate) |

D6's per-row convergent seed is viable exactly as the architect specified it.

## R2 - cold-profile open time. The deadline risk is dead.

Eleven fresh Playwright contexts, each a genuinely fresh OPFS origin:

| Measurement | Observed |
|---|---|
| `openDatabaseAsync` alone | **26-57 ms** (first run in a batch highest, then settles ~27 ms) |
| Full sequence - open, pragmas, 3 `CREATE`, 6 inserts, 5 selects | **68 ms** |

R2 feared the app-level `stalled` deadline would flake on a cold profile. It will not. The full
load is ~70 ms against a workload heavier than the real one.

**Recommended constant for Phase 3: 3000 ms** - roughly 44x headroom over the observed full load,
and still far below Playwright's own waits, so a genuine hang still surfaces as `stalled` quickly
rather than as a test timeout.

## R5 residue - stability. 10/10.

Ten consecutive fresh-context runs, all passing, no flake, no fault-list entries
(`pageerror`, `console.error` and `requestfailed` all empty throughout). The alpha label is
Expo's; the observed behaviour on this workload is not flaky.

## New finding - the backend switches numeric type by magnitude

Not something the probe was sent to look for. `amount_minor` comes back as:

| Stored value | `typeof` returned |
|---|---|
| `1200000` (12,000.00 HUF) | `number` |
| past `Number.MAX_SAFE_INTEGER` | **`bigint`** |

The probe's first run died on `Do not know how to serialize a BigInt` - the failure is how this was
noticed at all.

**This is not a SQLite precision bug.** The literal `9007199254740993` is already `...992` as a
JavaScript number before it ever reaches the database, so the observed value is a JS artifact, not
storage loss. The real finding is narrower and more useful: **`typeof row.amount_minor` is not
stable across magnitudes.**

The practical threshold is about 9.007e15 minor units - roughly 90 trillion HUF - so no real
amount reaches it. It is recorded because the architecture already handles it correctly and that
should be deliberate rather than lucky: a `bigint` fails the row guard's `typeof === 'number'`
check, so under D8 the whole read becomes `failed` rather than producing a wrong number. **Phase 2's
row guard should have an explicit test for it**, because "we get a loud failure instead of a wrong
number" is exactly the property `AGENTS.md` cares most about.

## Re-confirmed from stage 1

`crossOriginIsolated === false` and `SharedArrayBuffer` undefined, with every async query returning
real rows. The async API genuinely needs neither.

## Proposed `## Learnings` entry for AGENTS.md

Not applied - the contract is not edited while a decision about editing it is open.

> **The failure mode of `expo-sqlite` on web is a promise that never settles, not a throw.** When a
> wasm asset fails to resolve, the page emits no `pageerror` and no console error, and
> `openDatabaseAsync()` neither resolves nor rejects - the only signal is a failed network request.
> A page-error collector alone will report a completely dead database as clean. Collect
> `requestfailed` too, and give the app a state for "the read never settled" so the browser can see
> the difference between slow and dead.
>
> Foreign keys are **off by default** on this backend and must be enabled per connection. When they
> do reject, the message is the generic `Error finalizing statement`.

## Housekeeping

The probe lives at `scratchpad/probe2` and is throwaway - delete it once Phase 3 is verified, or
sooner. Nothing in it is committed.
