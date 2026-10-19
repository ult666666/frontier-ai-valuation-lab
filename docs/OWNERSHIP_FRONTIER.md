# Ownership Frontier

## The question

**How much primary capital is consistent with retaining a chosen fraction of existing ownership?**

Application **3.6.0** extends the existing Financing Lens with one optional ownership constraint. It holds the entered equity quote fixed under its selected pre-money or post-money interpretation and varies primary capital. The result is conditional round arithmetic, not a cash-need forecast, a negotiated financing offer, a recommendation or an estimate of capital the company can raise.

The financial engine remains **3.0.0**, Financing Lens remains **1.0.0**, and Ownership Frontier is **1.0.0**. The valuation date remains **18 October 2026**. Company evidence, operating forecasts and existing financial calculations are unchanged. This addition introduces no additional company balance-sheet or capitalization-table claims.

All capital amounts are **USD billions**. All ownership values are **decimal fractions**. A retention floor of `0.9` means retaining 90% of each starting stake: a holder starting at 10% must retain at least 9% of the company. The floor is a fraction of starting ownership, not a target to own 90% of the entire post-round company.

## Inputs and the two bases

The existing complete `round` contains `basis`, `quote`, `primaryCapital`, and `holderStake`. The optional constraint is exactly:

```js
ownership: {retentionFloor: 0.9}
```

`retentionFloor` must be a finite numeric fraction from **0.01 through 1**, inclusive. The 1–100% supported range is a product boundary, not a suggested financing policy. Missing ownership is a legacy financing analysis; supplied `null`, `undefined`, a partial record, extra keys, numeric strings, booleans and nonfinite numbers are rejected. Direct calls require ordinary or null-prototype records containing only own enumerable data properties. Accessors, symbols and inherited fields are rejected without invoking getters.

Let `R` be new primary capital, `f` the selected retention floor, and `u` the tracked holder's starting stake.

| Measure | Fixed pre-money quote `Q` | Fixed post-money quote `P` |
| --- | --- | --- |
| Pre-money price | `Q` | `P − R` |
| Post-money price | `Q + R` | `P` |
| Fraction of starting ownership retained | `Q / (Q + R)` | `(P − R) / P` |
| New investors' ownership | `R / (Q + R)` | `R / P` |
| Tracked holder after | `u × Q / (Q + R)` | `u × (P − R) / P` |
| Tracked holder's requested floor | `u × f` | `u × f` |
| Analytical primary-capital ceiling | `Q × (1 − f) / f` | `P × (1 − f)` |

The ceiling follows by solving `retained fraction >= f` for `R`. In pre-money mode, additional capital increases the post-money quote. In post-money mode, additional capital lowers the implied pre-money quote while the post-money quote stays fixed. Switching the basis reinterprets the same entered quote; it does not keep the pre-money price fixed in both modes.

The cohort retention fraction is independent of `holderStake`. Zero tracked ownership is valid, with a zero holder floor. The function never divides the holder's post-round stake by its starting stake to compute cohort retention.

## Worked example

Consider an explicitly hypothetical **$250B quote**, **$25B primary raise**, **90% retention floor**, and a tracked holder starting at **10%**.

| Result | Pre-money basis | Post-money basis |
| --- | --- | --- |
| Primary capital at the selected floor | $27.7778B | $25.0000B |
| Current fraction of starting ownership retained | 90.9091% | 90.0000% |
| Tracked holder after the current round | 9.0909% | 9.0000% |
| Tracked holder's requested floor | 9.0000% | 9.0000% |
| Current status | Above floor | At floor within numerical precision |

An independent share-count derivation starts with 100 old shares. At a fixed $250B pre-money quote, each old share is priced at $2.5B. Retaining 90% of starting stakes permits `100 / 0.9` total shares, so investors may buy `100 / 0.9 − 100` new shares. Multiplying by $2.5B gives the same $27.7778B ceiling. At an 80% floor, the corresponding ceilings are **$62.5B pre-money** and **$50B post-money**.

## Numerical boundaries

The analysis uses the same IEEE-754 double-precision inputs as the existing model. It does not round financial inputs to their displayed number of decimals.

Current retention is calculated directly as `preMoney / postMoney`. Except at the special 100% floor, status is `at-floor` when:

```text
abs(retainedFraction − retentionFloor)
  <= 32 × Number.EPSILON × max(retainedFraction, retentionFloor)
```

This is an explicit numerical comparison band, not exact rational equality or a probability statement. Outside that band, status is `above-floor` or `below-floor`. At a **100% floor**, zero capital is `at-floor` and **any positive capital is `below-floor`**, even if floating-point division rounds displayed retention to 100%.

When status is `at-floor`, both capital headroom and excess are reported as zero to avoid a fictitious tiny capital shortfall from boundary rounding. Otherwise they are the positive parts of analytical ceiling minus current capital, and current capital minus analytical ceiling, respectively. They are `null` if the analytical ceiling cannot be resolved. The amount is measured against the analytical ownership ceiling, not the technical input cap.

The pre-money candidate is evaluated as `quote × ((1 − f) / f)`, computing the dimensionless factor before multiplying. This avoids losing a representable subnormal ceiling through premature multiplication. The post-money candidate is `quote × (1 − f)`. Each candidate is checked through direct round arithmetic and against the same comparison band.

| Ceiling status | Meaning | `analyticalCapital` | `supportedCapital` |
| --- | --- | --- | --- |
| `resolved` | The analytical boundary is representable and inside the capital input limit | Number, including true zero at a 100% floor | Same number |
| `input-cap-limited` | The analytical boundary is above the supported capital input range | Full analytical number | `1e12` USD billions |
| `below-resolution` | A mathematically positive candidate rounds to zero | `null` | `null` |
| `unresolved` | The positive boundary cannot reproduce the floor or satisfy the round precision policy | `null` | `null` |

The analytical amount is never silently replaced by the input cap. For example, a $1e12B pre-money quote and 1% retention floor imply an analytical ceiling of $99e12B, while the capital input remains limited to $1e12B. These caps are numerical domain limits, not economically plausible transaction sizes.

If a positive tracked-holder floor underflows to zero, `holderFloor` is `null` with a warning; an actual zero tracked holder retains a numeric zero floor. Current `holderAfter` remains consistent with the frozen Financing Lens calculation. The cohort constraint remains available.

The existing post-money rules still apply: positive capital must leave positive pre-money equity above `32 × Number.EPSILON × max(quote, capital)`. Positive ownership interests that underflow their directly calculated fraction to zero are rejected. A valid current round remains available when only its frontier ceiling or graph is numerically unavailable.

## Graph domain and sampling

The chart focuses on the current raise and selected boundary. Its desired capital maximum is:

```text
max(quote × 0.05, current primary capital × 1.2, supported ceiling × 1.2)
```

An unavailable supported ceiling contributes zero to that expression. The 5% quote fallback creates a positive visual interval when both current capital and the ceiling are zero; it is not a capital target or financial conclusion.

The final domain is bounded by the existing capital input cap. A post-money domain also stops before the zero-pre-money endpoint, using `quote × (1 − 2 × 32 × Number.EPSILON)` as a conservative display boundary. A valid current round closer to that endpoint is retained in the domain. Every sampled point must satisfy the existing round rules.

The graph contains 49 uniformly spaced capital samples plus the exact current and analytical-ceiling amounts when they lie in the domain. Points are sorted and duplicates removed, giving at most **51 points**. Only round arithmetic is evaluated for each point; the operating FCFF model is not rerun for the curve.

If the positive interval or all 49 distinct base samples cannot be resolved, the graph is `unavailable`, with `capitalMax: null`, empty `points`, and both inclusion flags false. An invalid sample is never replaced with zero or omitted while drawing an uninterrupted curve. The current round and any resolved analytical ceiling remain available independently. Connecting sampled points is a visual guide, not additional precision.

## Pure functions and result contract

[`public/lib/ownership.js`](../public/lib/ownership.js) exports:

```js
OWNERSHIP_VERSION = '1.0.0';
ownershipFrontier(round, {retentionFloor: 0.9});
financingAnalysis(assumptions, {bridge, round, ownership: {retentionFloor: 0.9}});
```

Without an own `ownership` field, `financingAnalysis` returns the exact legacy `financingLens` result, including its field shape and financial values. With a valid constraint, the existing result is unchanged and receives one additive `ownership` field:

```js
{
  version: '1.0.0',
  constraint: {retentionFloor},
  current: {
    primaryCapital, retainedFraction, holderAfter,
    holderFloor, // number or null if a positive floor underflows
    status, // above-floor | at-floor | below-floor
    capitalHeadroom, capitalExcess // number or null
  },
  ceiling: {
    analyticalCapital, supportedCapital, // number or null
    status // resolved | input-cap-limited | below-resolution | unresolved
  },
  graph: {
    status, // ready | unavailable
    capitalMax, // number or null
    points: [{primaryCapital, retainedFraction, holderAfter}],
    ceilingInDomain, currentInDomain
  },
  method: {
    basis: 'fixed-quote-primary-round',
    fixedQuoteBasis: 'pre', // or post
    retentionScope: 'fraction-of-starting-stakes',
    existingHoldersSubscribe: false,
    retentionFloorMin: 0.01,
    retentionFloorMax: 1,
    comparisonBand: 32 * Number.EPSILON,
    capitalInputLimit: 1e12,
    sampleIntervals: 48
  },
  warnings: []
}
```

All results are detached from caller-owned records. No result contains `NaN` or `Infinity`. The snapshot records the exact floor; graph points and other derived results are recalculated.

## API and portable compatibility

The existing `POST /api/valuation` action `financing` accepts an optional `ownership` field. `action`, `assumptions`, `bridge` (or `null`), and `round` remain required. An absent constraint preserves the exact legacy result; a supplied invalid constraint returns HTTP 400 without a result. Existing content type, UTF-8, 16 KiB body and no-store response protections apply. See [API contract](API.md).

The complete snapshot accepts either legacy `{case, round}` or `{case, round, ownership}`. Legacy snapshots continue to encode with their original schema 1 payload. Ownership snapshots encode schema 2 with exactly these fields:

```js
{
  schema: 2,
  financing: '1.0.0',
  model: '3.0.0',
  date: '2026-10-18',
  case: 'existing encoded model-case token',
  round: {basis, quote, primaryCapital, holderStake},
  ownership: {retentionFloor},
  ownershipVersion: '1.0.0'
}
```

Both schemas decode and recalculate. Schema 1 does not silently acquire a constraint. Schema 2 rejects missing, unknown or mismatched ownership/version fields. The existing share-link size limit and financial model/date checks remain in force. This is a versioned financing envelope; existing Model and Casebook formats retain their current scope.

## Interpretation and primary sources

The frontier inherits one primary priced round, equal participating economic rights, no subscription by existing holders, retained proceeds and zero fees. It excludes SAFE or note conversion, option-pool changes, preferences, secondary transfers, pro-rata reinvestment, debt repayment and future rounds. Other uncovered claims remain outside the participating ownership pool. A negative model equity residual or an undisclosed bridge does not invalidate a separately entered positive round price.

The operating forecast and cash bridge do not determine this ownership ceiling. The model's cumulative economic FCFF deficit is not deducted again or converted into a recommended raise. Primary proceeds remain cash, and operating enterprise value stays fixed under the unchanged forecast.

Primary method sources reviewed **19 October 2026**:

1. Geoff Ralston, Y Combinator, [A Guide to Seed Fundraising](https://www.ycombinator.com/blog/how-to-raise-a-seed-round), 7 January 2016, **Equity** section. Derives new share issuance, post-money value and dilution from a priced primary round, while identifying contractual terms omitted by a simple example. Its historical fundraising benchmarks are not used as current market assumptions.
2. Carta, [Share dilution](https://carta.com/learn/startups/equity-management/share-dilution/), 11 July 2025. Explains the changing share denominator and the effects of valuation basis, option pools and convertible instruments. Those additional instruments remain outside this implementation.
3. Aswath Damodaran, NYU Stern, [What should you subtract out to get to equity value?](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/debttosubtract.htm). Supports consistent treatment of current claims in the separate operating-value-to-equity bridge.

The inverse ceiling formulas, numerical policy, sampling domain and portable schemas are this project's explicit implementation decisions. They do not establish either company's real financing terms or capitalization table.
