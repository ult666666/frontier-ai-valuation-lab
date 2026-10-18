# API contract

The public service is stateless. Both deployment and local development use `lib/http.js`. No model-provider key is needed.

## GET /api/health

Returns `status`, `modelVersion` and `valuationDate`. This is service health, not a statement that financial evidence is complete.

## GET /api/valuation

Returns model version, valuation date, units, six scenario presets and source records. Operating forecasts are assumptions even where a revenue baseline is derived from reported historical quarters.

## POST /api/valuation

Use `Content-Type: application/json`. Amounts are USD billions and percentage inputs are decimal fractions. The input contract is defined in [methodology](METHODOLOGY.md).

| Action | Required fields | Result |
| --- | --- | --- |
| `value` | `assumptions` | Annual FCFF schedule, stub PV, terminal calculation, EV and diagnostics |
| `reverse` | `assumptions`, positive numeric `target` | `solved`, `multiple_solutions` or `unreachable`, with forward-model residuals |
| `sensitivity` | `assumptions`, `rates`, `growthRates` | Matrix indexed by WACC row and perpetual-growth column; invalid combinations are `null` |

Success responses are `{modelVersion, valuationDate, result}`. Validation failures are HTTP 400 with `{error}`. Unsupported media returns 415, more than 16 KiB returns 413, unsupported methods return 405, and unknown routes return 404. Each sensitivity axis contains 1–9 finite numbers.

All supplied model inputs must be finite numeric values. Strings, booleans, missing fields and unexpected assumption names are rejected. No result is serialized with Infinity or NaN. POST responses use `Cache-Control: no-store`; requests are not persisted by application code. Hosting access logs remain subject to the hosting provider's normal operation.

## Interpretation

`pv_explicit` includes `pv_stub`. Reconcile EV as `pv_explicit + pvtv`; do not add the stub a second time. `peak_funding_need` is the retained code identifier for peak cumulative economic FCFF deficit before opening liquidity and financing. It is not a literal cash requirement. `tv_share` is unavailable when EV is nonpositive.

A reverse DCF changes only `g1`, the growth rate for 2027–2030. Margins, later growth, capital efficiency, discount rate, terminal returns and the initial revenue assumption remain fixed. Multiple solutions are all returned; no unique required growth or probability is implied.

The public calculation has bounded inputs, body size and iteration counts. It needs no authentication because it accesses no account data, incurs no paid AI/data call, and changes no server-side records. There is no application-layer distributed rate limiter; hosting-level traffic protection controls deployment-wide abuse.
