# API contract

The public service is stateless. Both deployment and local development use `lib/http.js`. No model-provider key is needed.

## GET /api/health

Returns `status`, `appVersion`, `modelVersion` and `valuationDate`. This is service health, not a statement that financial evidence is complete. Application release `3.1.0` retains audited financial model `3.0.0` and valuation date `2026-10-18`.

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

Success responses are `{appVersion, modelVersion, valuationDate, result}`. `appVersion` is an additive release identifier; the model/date/result fields retain their existing meanings. Validation failures are HTTP 400 with `{error}`. Unsupported media returns 415, more than 16 KiB returns 413, unsupported methods return 405, and unknown routes return 404. Each sensitivity axis contains 1–9 finite numbers.

All supplied model inputs must be finite numeric values. Strings, booleans, missing fields and unexpected assumption names are rejected. No result is serialized with Infinity or NaN. POST responses use `Cache-Control: no-store`; requests are not persisted by application code. Hosting access logs remain subject to the hosting provider's normal operation.

## Shared analytics

The browser and server import the same dependency-free `public/lib/analytics.js`, which exports `ANALYTICS_VERSION = '1.0.0'`, `comparePair`, `stressPair`, and `driverImpacts`. These functions call the unchanged `project` financial engine. They copy supplied assumptions and never change caller-owned objects. The new analytics actions reject unrecognized top-level request fields as well as unexpected nested fields.

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

## Interpretation

`pv_explicit` includes `pv_stub`. Reconcile EV as `pv_explicit + pvtv`; do not add the stub a second time. `peak_funding_need` is the retained code identifier for peak cumulative economic FCFF deficit before opening liquidity and financing. It is not a literal cash requirement. `tv_share` is unavailable when EV is nonpositive.

A reverse DCF changes only `g1`, the growth rate for 2027–2030. Margins, later growth, capital efficiency, discount rate, terminal returns and the initial revenue assumption remain fixed. Multiple solutions are all returned; no unique required growth or probability is implied.

The public calculation has bounded inputs, body size and iteration counts. It needs no authentication because it accesses no account data, incurs no paid AI/data call, and changes no server-side records. There is no application-layer distributed rate limiter; hosting-level traffic protection controls deployment-wide abuse.
