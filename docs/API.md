# API contract

The public service is stateless. Both deployment and local development use [`lib/http.js`](../lib/http.js). Application **3.4.0** adds the Value Horizon `horizon` action alongside the existing eight financial actions. No model-provider key is needed.

## GET /api/health

Returns `status`, `appVersion`, `modelVersion` and `valuationDate`. This is service health, not a statement that financial evidence is complete. Application release `3.4.0` retains financial engine `3.0.0` and valuation date `2026-10-18`.

## GET /api/valuation

Returns application version, model version, valuation date, units, six scenario presets and source records. Operating forecasts are assumptions even where a revenue baseline is derived from reported historical quarters.

## POST /api/valuation

Use `Content-Type: application/json`. Amounts are USD billions and model percentage inputs are decimal fractions. Stress controls use percentage points or percent, as explicitly defined below. The financial input contract is defined in [methodology](METHODOLOGY.md).

| Action | Required fields | Result |
| --- | --- | --- |
| `value` | `assumptions` | Annual FCFF schedule, stub PV, terminal calculation, EV and diagnostics |
| `reverse` | `assumptions`, positive numeric `target` | `solved`, `multiple_solutions` or `unreachable`, with forward-model residuals |
| `sensitivity` | `assumptions`, `rates`, `growthRates` | Matrix indexed by WACC row and perpetual-growth column; invalid combinations are `null` |
| `compare` | `assumptionsByCompany` | Both company projections, signed value components, and annual/cumulative FCFF milestones |
| `stress` | `assumptionsByCompany`; optional complete `shocks` object | Baseline and jointly stressed comparisons, with signed EV changes |
| `drivers` | `assumptions` | Four independent, fixed-size assumption changes and their EV effects |
| `attribute` | `reference`, `alternative` | Both complete projections and exact grouped attribution of alternative EV minus reference EV |
| `landscape` | `assumptions`, `rates`, `margins`, positive numeric `target` | EV matrix indexed by margin row and WACC column, invalid-point reasons, and a required-margin frontier |
| `horizon` | `assumptions`, integer `years` from 0–100; optional positive numeric or `null` `target` | Complete baseline, 101 finite-continuation points, retained/excluded terminal PV, capture milestones and bounded whole-year target requirement |

Success responses are `{appVersion, modelVersion, valuationDate, result}`. `appVersion` is an additive release identifier; the model/date/result fields retain their existing meanings. Validation failures are HTTP 400 with `{error}`. Unsupported media returns 415, more than 16 KiB returns 413, unsupported methods return 405, and unknown routes return 404. Each original `sensitivity` axis contains 1–9 finite numbers. Each `landscape` axis contains 2–21 finite, strictly increasing numbers.

All supplied model inputs must be finite numeric values. Strings, booleans, missing fields and unexpected assumption names are rejected. No result is serialized with Infinity or NaN. POST responses use `Cache-Control: no-store`; requests are not persisted by application code. Hosting access logs remain subject to the hosting provider's normal operation.

## Thesis Lab analytics

The browser and server share [`public/lib/thesis.js`](../public/lib/thesis.js), which exports `THESIS_VERSION = '1.0.0'`, the frozen `THESIS_GROUPS`, `compareTheses(reference, alternative)` and `valuationLandscape(assumptions, {rates, margins, target})`. These functions call the unchanged financial engine. They retain detached copies of submitted assumptions and do not mutate caller-owned objects.

Every assumption object contains exactly these 13 fields:

```text
rev2026, g1, g2, g3, m27, m30, m36, turns, wacc, tg, roic, stub, tax
```

All model bounds apply, including `0 <= tg < wacc <= 0.60`, `tg < roic <= 1`, `g3 >= tg`, and a positive `m36`. Both new actions reject unknown top-level fields. Direct JavaScript calls also reject inherited, non-enumerable or accessor fields, symbol keys and non-plain records. Own enumerable data properties on ordinary or null-prototype objects satisfy the record contract.

See the [Thesis Lab specification](THESIS_LAB.md) for the visitor flow and method, and the [independent reference report](verification/thesis-reference.json) for the separate Python/permutation verification and hashes of its tested sources. Reproduce that report with:

```sh
python3 scripts/check_thesis_reference.py --output /tmp/thesis-reference.json
```

### `attribute`: explain the difference between two cases

Send `{action: 'attribute', reference, alternative}`. `reference` and `alternative` are complete **assumption objects**, not the scenario/bridge envelopes used by share links. The request contains no company or preset-label field; callers supply the two cases they intend to compare. The Thesis Lab interface associates both with the same company.

This complete request compares the published Anthropic Base and Bull assumptions:

```json
{
  "action": "attribute",
  "reference": {
    "rev2026": 53.26, "g1": 0.45, "g2": 0.24, "g3": 0.12,
    "m27": -0.02, "m30": 0.18, "m36": 0.22, "turns": 2.5,
    "wacc": 0.125, "tg": 0.03, "roic": 0.20, "stub": -3, "tax": 0.25
  },
  "alternative": {
    "rev2026": 56.62, "g1": 0.65, "g2": 0.30, "g3": 0.15,
    "m27": 0.05, "m30": 0.25, "m36": 0.30, "turns": 3.5,
    "wacc": 0.105, "tg": 0.035, "roic": 0.25, "stub": -1, "tax": 0.25
  }
}
```

Inside the common response envelope, `result` has this shape. `Projection` denotes the complete [`project()` result](../public/lib/model.js), including all ten annual rows, stub PV, terminal calculation, signed EV, funding-deficit measure and warnings; it is not an EV-only summary.

```text
{
  version: "1.0.0",
  reference: { assumptions, result: Projection },
  alternative: { assumptions, result: Projection },
  evDelta: number,
  evChangeRatio: number | null,
  changedInputs: [{ key, reference, alternative, delta }],
  attribution: {
    status: "ok" | "unavailable",
    method: "exact-grouped-shapley",
    groupCount: 6,
    coalitions: 64,
    orderings: 720,
    groups: [{ key, label, keys, contribution }],
    sum: number | null,
    residual: number | null,
    reason: string | null
  }
}
```

`evDelta` is `alternative.result.ev - reference.result.ev`, in USD billions. `evChangeRatio` is `evDelta / reference.result.ev` when reference EV is positive, and `null` otherwise. Negative EV and signed dollar differences remain available. An invalid endpoint or nonfinite projection, EV difference or ratio rejects the request with HTTP 400.

`changedInputs` contains only changed fields, in model-input order. Each `delta` is alternative minus reference in the input's native units. For example, a WACC change of `0.02` means two percentage points; it is not returned as `2`.

#### Fixed groups and reconciliation

The six groups are returned in this order:

| Key | Label | Input keys |
| --- | --- | --- |
| `growth` | Revenue scale & growth | `rev2026`, `g1`, `g2` |
| `margins` | Operating margins | `m27`, `m30`, `m36` |
| `capital` | Capital efficiency | `turns` |
| `continuation` | Long-run economics | `g3`, `wacc`, `tg`, `roic` |
| `tax` | Tax rate | `tax` |
| `stub` | Remaining-2026 cash flow | `stub` |

The continuation inputs move together because the model requires terminal growth below WACC and terminal ROIC and no higher than late forecast growth. This preserves the linked constraints when combining ordinary valid endpoint assumptions.

For each subset of groups, use that subset's alternative inputs and the remaining reference inputs. The method evaluates all **64 combinations**, including the two endpoints. Each group's marginal EV change receives weight `k! (5-k)! / 6!`, where `k` is the number of other groups already changed. This is equivalent to averaging its contribution across all **720 group replacement orders**. It is complete enumeration without sampling; results remain subject to floating-point arithmetic.

When attribution is available, `status` is `"ok"`, `groups` contains six signed contributions, and `reason` is `null`:

```text
sum = sum of group.contribution
residual = evDelta - sum
reference.result.ev + sum + residual = alternative.result.ev
```

The residual is reported as calculated. It is not inserted into a group or used to normalize the bars. An unchanged group contributes zero. Reversing the two cases negates the group contributions, subject to rounding. Different inputs can have equal endpoint EVs while their nonzero group contributions offset.

Finite endpoints can still produce an overflowing combined case. If a hybrid or the attribution arithmetic cannot produce finite results, the response retains the endpoint projections and change metrics but returns `status: "unavailable"`, `groups: []`, `sum: null`, `residual: null` and an explanatory `reason`. The HTTP response remains 200. Failed combinations are not skipped, clipped or assigned zero. The `coalitions` and `orderings` fields describe the fixed method even when calculation stops because it is unavailable.

This is a **conditional allocation of a modeled difference**. Its counterfactual combinations are hypothetical model evaluations, not observed business outcomes. The selected reference, alternative and grouping determine the result; changing the partition can change the allocation. Contributions do not establish causality, probability, global importance or investor returns. Hypothetical cash, debt and other claims are outside this operating-EV attribution.

### `landscape`: value WACC/margin combinations and solve a target

Send `{action: 'landscape', assumptions, rates, margins, target}`. The submitted `assumptions` must itself be a complete, valid, numerically representable case, even when its current WACC or margin is outside the supplied axes.

| Field | Contract |
| --- | --- |
| `rates` | Array of 2–21 finite, strictly increasing WACC fractions; no duplicates |
| `margins` | Array of 2–21 finite, strictly increasing 2036 EBIT-margin fractions; no duplicates |
| `target` | Finite operating EV with `0 < target <= 1e12`, in USD billions |

Each cell evaluates `project({...assumptions, wacc: rate, m36: margin})`. The other eleven inputs remain fixed. Changing `m36` also changes the interpolated 2031–2036 margins and the terminal margin; WACC discounts every modeled cash flow, including the stub. No input is clipped or otherwise adjusted.

Axis values may describe combinations outside the model's domain. Their cells become unavailable rather than causing an otherwise valid request to fail. Invalid axis structure, an invalid active case or an invalid target rejects the request with HTTP 400.

This request holds the Anthropic Bull case's other inputs fixed:

```json
{
  "action": "landscape",
  "assumptions": {
    "rev2026": 56.62, "g1": 0.65, "g2": 0.30, "g3": 0.15,
    "m27": 0.05, "m30": 0.25, "m36": 0.30, "turns": 3.5,
    "wacc": 0.105, "tg": 0.035, "roic": 0.25, "stub": -1, "tax": 0.25
  },
  "rates": [0.08, 0.10, 0.125, 0.16],
  "margins": [0.05, 0.15, 0.25, 0.35, 0.50],
  "target": 1000
}
```

The result shape is:

```text
{
  version: "1.0.0",
  assumptions,
  rates,
  margins,
  target,
  values: (number | null)[][],
  invalidReasons: (string | null)[][],
  validCount: number,
  minEv: number | null,
  maxEv: number | null,
  frontier: [{ wacc, status, margin, ev, residual, reason }]
}
```

**Rows are margins; columns are WACC.** Thus `values[i][j]` uses `margins[i]` and `rates[j]`. This differs from the original `sensitivity` action, whose rows are WACC and columns are perpetual growth. `invalidReasons` has the same dimensions as `values`.

A valid cell contains its signed EV and a `null` reason. A model-invalid or numerically overflowing cell contains `null` EV and a reason string. Negative or zero EV is valid and must not be conflated with `null`. `validCount` counts available cells. `minEv` and `maxEv` are extrema of those sampled cells, retaining negative values; both are `null` when no cell is available.

#### Required-margin frontier

`frontier` contains one entry per rate, in the supplied order. The first and last supplied margins bound the search. For this model with all other inputs fixed, EV increases with positive `m36`; the tax rule makes the response piecewise linear. The solver uses at most 80 bisection iterations and returns an exact supplied endpoint when its EV already equals the target.

| `status` | Meaning | Numeric output fields |
| --- | --- | --- |
| `solved` | A margin in the supplied range reaches the target within numerical precision | Numeric `margin`, `ev`, `residual`; `reason: null` |
| `below_range` | Target EV is below EV at the lowest supplied margin | `margin`, `ev`, `residual` are `null`; explanatory `reason` |
| `above_range` | Target EV exceeds EV at the highest supplied margin | `margin`, `ev`, `residual` are `null`; explanatory `reason` |
| `invalid` | A bounding/interior calculation is invalid, overflows, or the target cannot be resolved numerically | `margin`, `ev`, `residual` are `null`; explanatory `reason` |

Each entry also supplies its numeric `wacc`. For a solved point, `ev` is the forward-model value at the returned margin and `residual = ev - target`. The final residual must be within `max(Number.MIN_VALUE, abs(target) * 1e-10)`. A very small positive target can be mathematically bracketed yet unresolvable after floating-point cancellation; it returns `invalid`, not a false solution.

No solution is extrapolated outside the supplied margin range. An invalid bounding margin makes that rate's frontier entry unavailable even if some interior grid cells are valid. Clients should leave gaps through unavailable entries and treat connecting lines between solved rates as visual guides.

The map is deterministic and conditional on the supplied assumptions. Grid counts are not scenario probabilities, sampled extrema are not global optima, and the frontier is not a financing equity price or a recommendation. In particular, a reference case with different fixed assumptions must not be plotted as though it belongs to this surface.

## Shared paired analytics

The application retains the 3.1 paired analytics. Browser and server import the same dependency-free `public/lib/analytics.js`, which exports `ANALYTICS_VERSION = '1.0.0'`, `comparePair`, `stressPair`, and `driverImpacts`. These functions call the unchanged `project` financial engine. They copy supplied assumptions and never change caller-owned objects. The `compare`, `stress` and `drivers` actions reject unrecognized top-level request fields as well as unexpected nested fields.

### Paired input

`assumptionsByCompany` must contain exactly the case-sensitive keys `Anthropic` and `OpenAI`. Each value must supply exactly these 13 finite numeric assumptions:

```text
rev2026, g1, g2, g3, m27, m30, m36, turns, wacc, tg, roic, stub, tax
```

All existing model bounds and cross-field conditions apply independently to each company. An invalid company input reports the company name, for example `OpenAI: Forecast growth must be between 0% and 200%.` Direct JavaScript calls also reject inherited fields, non-enumerable fields, accessor properties, symbol keys and non-plain records. JSON objects and plain objects with a null prototype are accepted when their own fields satisfy the contract.

### `compare`

Send `{action: 'compare', assumptionsByCompany}`. `result` is `{companies}`, with `companies.Anthropic` and `companies.OpenAI` each containing:

| Field | Meaning and suggested display label |
| --- | --- |
| `assumptions` | A complete copy of the company's submitted assumptions |
| `result` | The complete unchanged `project(assumptions)` result, including all ten annual forecast rows |
| `firstPositiveFcfYear` | **First positive annual FCFF:** earliest 2027–2036 forecast year with `fcf > 0`; later years may become negative again |
| `sustainedPositiveFcfYear` | **Sustained positive annual FCFF:** earliest forecast year from which every remaining explicit year through 2036 has `fcf > 0` |
| `cumulativeBreakEvenYear` | **Cumulative FCFF recovery:** earliest year-end at which cumulative, undiscounted modeled FCFF is at least zero and stays at least zero at every remaining year-end through 2036 |
| `valueComposition` | Four signed USD-billion amounts: `{stub, explicitForecast, terminal, total}` |

All three milestone fields are a numeric year or `null` when no qualifying year exists in the modeled horizon. Zero annual FCFF does not qualify as positive. A sustained milestone describes the remaining explicit forecast only; it makes no claim about years after 2036.

Cumulative recovery starts with the remaining-2026 stub, then adds 2027–2036 FCFF. Thus `2026` is possible when the stub is nonnegative and the cumulative path never subsequently falls below zero. A temporary recovery followed by another deficit does not qualify. This metric excludes opening liquidity, debt, equity funding and other financing; it is not a forecast of reported cash balances or historical losses recovered.

Value components reconcile as:

```text
stub = pv_stub
explicitForecast = sum of the 2027–2036 row.pv values, excluding the stub
terminal = pvtv
total = stub + explicitForecast + terminal = ev
```

All signs are retained, including negative explicit forecast PV and negative EV. Positive terminal PV can exceed total EV. These amounts should not be forced into a 0–100% composition chart. The underlying `tv_share` remains `null` for nonpositive EV.

### `stress`

Send `{action: 'stress', assumptionsByCompany, shocks}`. Omitting `shocks` gives four zero shocks. In direct JavaScript, `undefined` has the same meaning. A supplied shock object must contain **all four and only these four finite numeric fields**; `null`, partial objects, strings, booleans and extra fields are errors.

| Shock field | Inclusive bounds | Transformation applied to both companies |
| --- | --- | --- |
| `growthPp` | −20 to +20 percentage points | `g1 + growthPp / 100` |
| `marginPp` | −10 to +10 percentage points | `m36 + marginPp / 100` |
| `waccPp` | −5 to +5 percentage points | `wacc + waccPp / 100` |
| `capitalEfficiencyPct` | −50% to +50% | `turns * (1 + capitalEfficiencyPct / 100)` |

For example, `growthPp: 5` moves 4% early growth to 9%; `capitalEfficiencyPct: 20` moves capital turns from 2.5 to 3.0. Early growth applies to 2027–2030. Changing `m36` also changes the interpolated 2031–2036 margins and terminal operating margin under the existing model. Changing capital turns affects explicit growth reinvestment; it does not change terminal ROIC. All other input assumptions remain fixed.

The complete transformed assumptions must still satisfy every model bound and relationship. A shock within the permitted shock range can therefore fail, such as a −20 pp growth shock applied to 4% growth. Inputs are never clipped. A failed company validation rejects the whole paired stress calculation with a company-specific error.

The result shape is:

```text
{
  shocks,
  baseline: { companies: { Anthropic, OpenAI } },
  stressed: { companies: { Anthropic, OpenAI } },
  changes: {
    Anthropic: { evDelta, evChangeRatio },
    OpenAI: { evDelta, evChangeRatio }
  }
}
```

The `baseline` and `stressed` values each have the complete `compare` result shape. `evDelta` is stressed EV minus baseline EV in USD billions. `evChangeRatio` is `evDelta / baselineEV` when baseline EV is positive; `0.08` means an 8% change. It is `null` when baseline EV is zero or negative, while signed EV and dollar changes remain available. A nonfinite projection or derived change produces an explicit numeric-range error instead of a silent JSON `null`.

This browser or Node example submits a complete stress request:

```javascript
const p = {
  rev2026: 100, g1: 0.04, g2: 0.04, g3: 0.04,
  m27: 0.20, m30: 0.20, m36: 0.20, turns: 2.5,
  wacc: 0.10, tg: 0.03, roic: 0.20, stub: -3, tax: 0.25
};
const response = await fetch('http://127.0.0.1:4321/api/valuation', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    action: 'stress',
    assumptionsByCompany: {
      Anthropic: p,
      OpenAI: {...p, rev2026: 50, stub: -1.5}
    },
    shocks: {growthPp: 5, marginPp: 2, waccPp: 1, capitalEfficiencyPct: 20}
  })
});
const body = await response.json();
if (!response.ok) throw new Error(body.error);
console.log(body.result.changes.Anthropic.evDelta); // About $17.430053B
```

### `drivers`

Send `{action: 'drivers', assumptions}` for one complete assumption set. `result` contains `{assumptions, baseline, impacts}`, where `baseline` is the full baseline projection and `impacts` has the following fixed order:

| Key | Label | Individual input change |
| --- | --- | --- |
| `g1` | Early growth +5 pp | `change: 0.05` |
| `m36` | Terminal margin +2 pp | `change: 0.02` |
| `wacc` | Cost of capital +1 pp | `change: 0.01` |
| `turns` | Capital efficiency +20% | `factor: 1.2` |

Every impact starts from the same baseline and changes only its named input. Its fields are `{key, label, change or factor, assumptions, result, evDelta, evChangeRatio, reason}`. `assumptions` records the attempted transformed inputs. A valid point has a full projected `result` and `reason: null`; its change metrics follow the same units and nonpositive-baseline rule as paired stress. If the transformed point violates the model or numeric limits, `result`, `evDelta` and `evChangeRatio` are `null`, with a descriptive `reason`. An invalid baseline rejects the whole request with HTTP 400.

These are separate scenario effects at explicitly different shock sizes. They are not comparable unit sensitivities, causal estimates, probabilities, or a ranking of economic importance. In particular, faster revenue growth can reduce EV when the growth reinvestment burden exceeds incremental operating returns.

## Value Horizon analytics

Send `{action: 'horizon', assumptions, years, target}`. `assumptions` contains exactly the same thirteen model fields documented above. `years` is a whole number from **0 through 100**, inclusive, counting annual terminal cash flows after 2036. An omitted `target` is normalized to `null`; a supplied non-null target must be positive, finite and at most `1e12` USD billions. All other request fields are rejected.

The shared [`public/lib/horizon.js`](../public/lib/horizon.js) exports `valueHorizon(assumptions, {years, target: null})`, `HORIZON_VERSION = '1.0.0'`, `HORIZON_MAX_YEARS = 100`, and `HORIZON_SOLVER_MAX_YEARS = 10000`. Direct JavaScript calls reject inherited/accessor/non-enumerable fields, symbols, missing assumptions and unknown fields before evaluating the model.

The complete response result is:

```js
{
  version: '1.0.0',
  assumptions: { /* exact detached 13-field snapshot */ },
  baseline: { /* complete unchanged project() result */ },
  years: 10,
  target: 250, // or null
  maxYears: 100,
  solverMaxYears: 10000,
  selected: HorizonPoint,
  curve: HorizonPoint[], // every whole year from 0 through 100, ordered
  capture: CaptureRequirement[], // fractions 0.5, 0.75, 0.9, 0.95
  targetRequirement: TargetRequirement // or null when no target is set
}
```

Each `HorizonPoint` contains:

```js
{
  years: 10,
  throughYear: 2046,
  ev: number,
  retainedTerminalPv: number,
  excludedTerminalPv: number,
  terminalPvFraction: number | null,
  remainingTerminalFraction: number | null
}
```

Let `E = baseline.pv_explicit`, `T = baseline.pvtv`, and `q = (1 + tg) / (1 + wacc)`. The calculation is `ev = E + T × (1 − q^years)`, with excluded tail PV `T × q^years`. The explicit forecast, including the stub once, is retained. The selected cutoff assumes **zero residual value** afterward. It does not truncate the explicit forecast, change operating assumptions, or assign salvage proceeds. Dollar outputs keep their signs. The two fractions use **terminal PV** as their denominator; they are `null` when the model's terminal PV is zero at numerical precision.

`CaptureRequirement` is `{fraction, status, years, throughYear, reason}`. Its status is `finite`, `beyond_range`, `precision_limit`, or `unavailable`. A finite result is the first whole continuation year retaining at least the requested share of terminal PV, with the adjacent boundary outside the numerical guard described below. A requirement beyond **10,000 years** has null years; a numerically zero terminal PV is unavailable. `precision_limit` also has null `years` and `throughYear`, with a reason explaining that the whole-year threshold is too close to numerical precision to assign a year. This bound is separate from the 100-year chart limit.

`TargetRequirement` is `{status, years, throughYear, ev, previousEv, withinChart, reason}`:

| Status | Meaning |
| --- | --- |
| `explicit` | PV of the explicit forecast already reaches the target. `years` is 0, `throughYear` is 2036, `previousEv` is null, and `withinChart` is true. |
| `finite` | First whole year whose continuation PV reaches the target, with the selected and preceding boundaries outside the numerical guard. The preceding EV is below the target. Requirements from 101–10,000 years have `withinChart: false`. |
| `asymptotic` | Target equals the positive-terminal-PV perpetual baseline. It is not reported as a finite solution, even when a finite point rounds to the same EV. |
| `unreachable` | Target exceeds perpetual EV, or no positive numerical terminal PV can bridge the explicit forecast's shortfall. |
| `beyond_range` | Target is below perpetual EV but not reached within 10,000 continuation years. This does not mean that extending continuation can never reach it. |
| `precision_limit` | The target is too close to the perpetual, selected/prior-year or search-cap boundary to resolve a first whole year reliably at the model's numerical precision. |

For `asymptotic`, `unreachable`, `beyond_range` and `precision_limit`, all year/value/within-chart fields are null and `reason` explains the result. These are successful HTTP 200 analytical outcomes; invalid inputs still return HTTP 400. An exact submitted match to explicit PV retains `explicit`; an exact match to the positive-terminal-PV perpetual baseline retains `asymptotic`.

The binary search compares retained terminal PV with `target − E` in the first half of terminal PV, or compares excluded tail PV with a compensated `E + T − target` gap nearer perpetuity. It does not infer an exact year from rounded total-EV equality. A conservative guard uses `32 × Number.EPSILON` times the relevant monetary component scale: `max(abs(E), abs(target), abs(retained PV))` for an early boundary, and `max(abs(E), abs(T), abs(target))` for a late or perpetual boundary. The monetary band has a floor of 32 smallest positive representable numbers so it cannot underflow to zero. Capture boundaries use a dimensionless band of `32 × Number.EPSILON × max(1, abs(N × log(q)))`. Both searches check the candidate/prior year, or the 10,000-year cap when no candidate qualifies.

A target copied from a rounded curve point may therefore be `precision_limit`, even though a higher-precision calculation can assign an exact year. This policy also avoids a false `unreachable` classification just above rounded perpetual EV. It is a conservative numerical policy, not a formal exact-arithmetic error bound, an economic confidence interval or a forecast uncertainty estimate. Ordinary targets, including the $250B example below, remain finite when their boundaries are clearly separated.

Example request:

```sh
curl -X POST http://127.0.0.1:4321/api/valuation \
  -H 'Content-Type: application/json' \
  -d '{"action":"horizon","assumptions":{"rev2026":53.26,"g1":0.45,"g2":0.24,"g3":0.12,"m27":-0.02,"m30":0.18,"m36":0.22,"turns":2.5,"wacc":0.125,"tg":0.03,"roic":0.2,"stub":-3,"tax":0.25},"years":10,"target":250}'
```

Under these frozen Anthropic Base assumptions, retaining ten terminal years through 2046 gives about **$248.4558B operating EV**, versus **$367.7713B** under perpetual continuation. The $250B target first clears with **11** continuation years, through **2047**. Neither result is a financing equity price or a probability.

See [Value Horizon methodology, numerical limits and portable outputs](VALUE_HORIZON.md). The API receives only assumptions and the two lens parameters. Company labels, optional hypothetical bridges and original research metadata travel in the separate share/export format and do not affect horizon operating EV.

## Interpretation

`pv_explicit` includes `pv_stub`. Reconcile EV as `pv_explicit + pvtv`; do not add the stub a second time. `peak_funding_need` is the retained code identifier for peak cumulative economic FCFF deficit before opening liquidity and financing. It is not a literal cash requirement. `tv_share` is unavailable when EV is nonpositive.

A reverse DCF changes only `g1`, the growth rate for 2027–2030. Margins, later growth, capital efficiency, discount rate, terminal returns and the initial revenue assumption remain fixed. Multiple solutions are all returned; no unique required growth or probability is implied.

The public calculation has bounded inputs, body size and iteration counts. It needs no authentication because it accesses no account data, incurs no paid AI/data call, and changes no server-side records. There is no application-layer distributed rate limiter; hosting-level traffic protection controls deployment-wide abuse.
