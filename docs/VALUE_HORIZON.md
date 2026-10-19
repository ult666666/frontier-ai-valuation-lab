# Value Horizon

**Application 3.4.0 · Horizon method 1.0.0 · Financial engine 3.0.0 · Valuation date 18 October 2026.**

Value Horizon asks how much operating value the selected case retains when the post-2036 cash-flow stream continues for a finite number of years. The explicit financial forecast, six presets and original research snapshot remain unchanged. The lens reveals dependency on distant assumptions; it does not estimate a company lifespan or a probability of survival.

## The analytical question

The existing model separates remaining-2026 FCFF, annual 2027–2036 FCFF and a perpetual continuation value. A large terminal-value percentage is useful, but does not show how that continuation value accumulates through time. Value Horizon retains the first `N` annual terminal cash flows, removes all later cash flows, and assigns **zero residual value** after the cutoff.

An `N` of 0 keeps the entire explicit forecast and no terminal cash flow. An `N` of 10 retains 2037–2046. The displayed curve includes every whole `N` from 0 through 100; its final finite cutoff is 2136. Perpetuity remains a separate baseline reference, with no finite year assigned to it.

## Formula and timing

Let:

- `E` be PV of the complete explicit forecast, including the remaining-2026 stub **once**.
- `T` be the unchanged financial engine's terminal PV.
- `g` be the terminal growth assumption and `r` the WACC assumption.
- `q = (1 + g) / (1 + r)`, where the model requires `0 ≤ g < r`.
- `N` be the number of annual continuation periods after 2036.

```text
Retained terminal PV = T × (1 − q^N)
Excluded tail PV     = T × q^N
Finite-continuation EV = E + retained terminal PV
Perpetual baseline EV  = E + T
```

The first retained terminal cash flow is the existing 2037 FCFF. It reflects the existing terminal margin, tax, growth and ROIC reinvestment policy. No capital expenditure, working-capital deduction, stock compensation charge, funding haircut or equity dilution is added by this lens.

The explicit forecast keeps the engine's actual-day discounting to 18 October 2026. Post-2036 continuation uses **equal annual periods**, consistent with the engine's Gordon-growth terminal formula. The year labels identify those periods; they do not substitute a new leap-year/actual-day convention into the perpetuity. Changing the continuation length does not change the model's fixed 2036 explicit horizon.

## Worked frozen-model comparison

The following values can be reproduced from `data/presets.json` using `valueHorizon`. Amounts are USD billions and display values are rounded.

| Quantity | Anthropic Base | OpenAI Base |
| --- | ---: | ---: |
| Explicit forecast PV through 2036 | 79.4677 | 0.1761 |
| Perpetual terminal PV | 288.3035 | 258.6865 |
| Perpetual operating EV | 367.7713 | 258.8626 |
| EV with continuation through 2046 | 248.4558 | 151.8042 |
| EV with continuation through 2056 | 318.3921 | 214.5560 |
| Years after 2036 to retain at least 90% of terminal PV | 27 | 27 |

The 90% milestone uses terminal PV as its denominator, not total EV. Both Base cases use the same WACC and terminal growth, so the retained terminal **fraction** follows the same curve while dollar values differ. The result provides no probability that those cash flows occur. It is not a duration statistic such as Macaulay duration.

For the default Anthropic Base example, a $250B operating-EV target requires eleven continuation years, through 2047. Ten years produces approximately $248.4558B. The complete original operating assumptions stay fixed during this requirement calculation.

## Whole-year requirements

The target accepts a positive finite operating EV, capped at `1e12` USD billions, or `null` for no target. Requirements search whole continuation years from 0 through **10,000**. This computational bound is distinct from the 100-year visible chart.

| Outcome | Interpretation |
| --- | --- |
| Explicit forecast already reaches target | No continuation cash flow is needed; the returned horizon is 0. |
| Finite requirement | The first whole-year continuation PV reaching the target, with the selected/prior-year boundaries outside the numerical guard. A requirement above 100 years is explicitly outside the chart. |
| Asymptotic | The target equals the positive-terminal-PV perpetual baseline. No finite continuation horizon is reported. |
| Unreachable | Extending the unchanged continuation stream cannot reach a target above perpetual EV. |
| Beyond range | The target is below perpetual EV but the first qualifying year lies beyond the 10,000-year search bound. |
| Precision limited | The target is too close to a numerical boundary to resolve its first whole year reliably. Year and value fields are null, with an explanation. |

Capture milestones use 50%, 75%, 90% and 95% of **terminal PV**. The result is unavailable if terminal PV is zero at the financial engine's numerical precision. A valid percentage requirement beyond 10,000 years is marked beyond range. A percentage threshold too close to a whole-year or search-cap boundary is precision limited, with no year assigned.

## Numerical behavior

The shared pure module computes the discount log as:

```js
logQ = Math.log1p(-(wacc - tg) / (1 + wacc));
retainedFraction = -Math.expm1(N * logQ);
remainingFraction = Math.exp(N * logQ);
```

Taking the rate difference first avoids cancellation from subtracting nearly equal logarithms when WACC and growth are adjacent representable values. `expm1` preserves small retained fractions. All inputs require exact own enumerable data properties; inherited values, accessors, symbols and unsupported keys are rejected before calculation.

The target search uses a bounded binary search over a monotonically increasing retained cash-flow stream. For a target requiring no more than half of terminal PV, it compares retained terminal PV with `target − E`. Nearer perpetuity, it compares the excluded tail with a compensated `E + T − target` gap. Compensated addition preserves the small remainder that can disappear when the rounded baseline is subtracted from a nearly equal target. It does not add precision to the financial inputs.

An exact submitted match to explicit PV keeps its zero-year `explicit` classification. An exact match to the positive-terminal-PV perpetual baseline keeps `asymptotic`. Other near-boundary cases are subject to a conservative precision guard:

- A target within `32 × Number.EPSILON × max(abs(E), abs(T), abs(target))` of perpetuity is `precision_limit`, on either side of the rounded baseline.
- Selected and preceding whole years use the same late-period monetary scale, or `max(abs(E), abs(target), abs(retained PV))` for the early-period comparison. The early scale avoids letting a huge terminal PV suppress an otherwise resolvable ordinary target when WACC and growth are adjacent values. The monetary band has a floor of 32 smallest positive representable numbers.
- Capture thresholds compare the remaining fraction with `1 − fraction`, using a dimensionless band of `32 × Number.EPSILON × max(1, abs(N × log(q)))` at the selected and preceding years.
- If a bounded search finds no qualifying year, the 10,000-year cap is checked for proximity to the same boundary before returning `beyond_range`.

`precision_limit` returns an explanatory reason and null year fields; target value and within-chart fields are also null. A target copied from the rounded value of an ordinary curve point can enter this state. A higher-precision calculation may still identify its mathematical first year; the application declines to make that exact-year claim from an unresolved floating-point boundary. The guard is a conservative policy, not a proven interval bound or an economic uncertainty estimate.

The regression evidence includes an Anthropic target of `367.77129479956005`, for which direct rounded-EV comparisons previously reported 407 years while a 100-digit calculation on the exact binary inputs and returned PV components requires 414. A faster-discounting fixture previously reported 68 rather than 69 years, within the visible chart. A 75% capture boundary similarly rounded to year 3 while exact-binary-input arithmetic requires year 4. These cases now return `precision_limit`; the ordinary Anthropic Base $250B target remains eleven years. A positive excluded tail may remain even when a displayed finite EV equals the displayed baseline.

Negative explicit PV and negative operating EV retain their signs. This lens does not divide those values into forced 0–100% shares. Terminal fractions are null when there is no positive numerical terminal PV. Overflowing baseline inputs remain validation errors rather than becoming misleading JSON nulls. Floating-point results remain numerical approximations, especially close to target boundaries and terminal singularities.

## Exact transport and standalone outputs

`public/lib/horizon-share.js` provides:

```js
normalizeHorizon(snapshot)
encodeHorizon(snapshot)
decodeHorizon(token)
horizonUrl(baseUrl, snapshot)
```

The snapshot is:

```js
{
  case: {
    company: 'Anthropic',
    scenario: 'Base',
    assumptions: { /* exact thirteen financial inputs */ },
    bridge: null // or exact hypothetical cash/debt/otherClaims
  },
  years: 10,
  target: 250 // or null
}
```

All fields shown are required by the codec. The nested case uses the existing scenario codec, preserving compatibility with the Model workbench. A hypothetical bridge travels unchanged but is excluded from horizon operating EV. Encoded values retain the submitted numerical precision; display rounding is never written back into the snapshot.

The outer token records schema 1, financial model version and valuation date. Decoding performs complete preflight validation before returning any snapshot. Unknown fields, invalid nested cases, malformed tokens, wrong model/date and tokens above 8,192 characters are rejected. A link uses `#horizon=`; query parameters and previous fragments are cleared. HTTP(S) bases containing embedded credentials are rejected.

`public/lib/horizon-brief.js` provides `createHorizonBrief({snapshot, research, baseUrl})` and `createHorizonExport({snapshot, research, baseUrl})`. Each function validates the matching original research metadata and recalculates from the snapshot. A caller cannot supply replacement valuation outputs or an arbitrary reopening URL.

The HTML brief contains its SVG curve without scripts, exact input values, selected horizon and target, horizon checkpoints, complete explicit forecast, original cutoff, methodology references, and exact horizon/model reopening links. The JSON export has its own `kind: 'frontier-value-horizon'` schema, with the complete baseline and 101-point curve, capture/target results, exact snapshot, token, reopening links and methodology. It is **not a Casebook schema-1 entry** and must not be imported into the Casebook as though the current Casebook schema captures horizon settings.

## Verification

`tests/horizon.test.js` checks annual-summation agreement for all six presets, signed and zero terminal values, close WACC/growth, separated first-whole-year boundaries, precision-limited target/capture boundaries, both sides of the search cap, outside-chart and beyond-search outcomes, immutable snapshots, strict transport and standalone output fidelity. `tests/horizon-api.test.js` adds normal/error contracts, successful precision-limited results, HTTP body/media boundaries, numerical overflow handling and actual concurrent local HTTP requests.

Run the independent reference with:

```sh
python3 -B scripts/check_horizon_reference.py --output /tmp/horizon-reference.json
```

The verifier uses the separate Python FCFF implementation, adds individual discounted continuation cash flows with compensated summation, and walks whole years linearly to check requirements. Its ordinary cases include all six presets, nine named arithmetic/boundary cases and 24 seeded valid inputs. Six additional precision fixtures use 100-digit `Decimal.from_float` arithmetic and repeated annual multiplication, without production logarithms, exponentials or binary search. They isolate the horizon calculation using the returned frozen explicit/terminal PV components and exact binary input rates, including the independently resolved 414-, 69- and 4-year regressions and both sides of the 10,000-year cap.

The receipt records all counts, numerical tolerances, maximum observed errors with their context, the high-precision first/prior-year residuals for eight boundary checks, and SHA-256 hashes of the production model, horizon module, presets and reference scripts. It does not validate company forecasts, source completeness or a probability distribution.

## Method references

- [Aswath Damodaran, *Valuing Young, Start-up and Growth Companies*, May 2009](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/younggrowth.pdf), printed pages 38–41. Discusses finite continuation and demonstrates the growing-annuity formulation with no salvage. This supports the method; it does not establish a specific horizon for Anthropic or OpenAI.
- [CFA Institute, 2026 *Free Cash Flow Valuation*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/free-cash-flow-valuation). Describes FCFF discounted at WACC, terminal valuation and separation of operating/non-operating assets and equity claims.

Method references were checked on 19 October 2026. Company financial evidence remains at the original 18 October 2026 cutoff. The two dates serve different purposes.

## Limits

This is a deterministic stress lens on an illustrative economic FCFF forecast. A finite cutoff with zero residual is not a liquidation appraisal, cash runway calculation, investor return model or assessment of security preferences. There is no inferred survival probability or likelihood assigned to a horizon. The user-selected target is operating enterprise value and must not be interpreted as upside to a financing equity price. Finite-continuation EV is presented alongside the original perpetual baseline, which remains the published financial-engine result.
