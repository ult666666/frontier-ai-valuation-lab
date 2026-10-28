# Final model review (AI-assisted)

**Review date:** 18 October 2026 · **Release:** 3.0.0 · **Scope:** model, workbook, application and evidence presentation.

This is an AI-assisted self-review of the project, supported by reproducible calculations. No third party performed it, and it is not an audit opinion on either company's financial statements. The original desktop HTML files and the recovered October 16 package were preserved. A separate original workbook and PDF were not available; they are outside the reviewed baseline.

## Material findings and dispositions

| Finding | Reproduction or consequence | V3 disposition |
| --- | --- | --- |
| Reverse solver assumed a monotonic relationship between growth and EV | A valid low-margin Anthropic scenario reaches a $5B EV target at approximately 14.76% and 81.22% early growth. The predecessor returned no solution. A tangent root can also exist. | Replace the one-interval solver with derivative critical-point partitioning of the exact quartic. Return zero, one or multiple solutions; verify every solution in the forward model. Both multiple and tangent cases are regression fixtures. |
| Spreadsheet input checks could show PASS for invalid capital turns | In the V2 workbook, changing `Assumptions!C14` to −2.5 raised Anthropic Base EV from $367.534B to $598.968B by turning reinvestment into an inflow. Arithmetic identities still passed. | Rebuild the assumptions layer with numeric, range and cross-input checks. Invalid inputs suppress model outputs. Avoid treating accounting identities as input validation. |
| Finite inputs could overflow | A finite starting revenue of `1e308` produced Infinity and NaN in the predecessor. | Bound inputs, reject unknown keys and test calculated outputs for finiteness. The API serializes validation failures as errors. |
| Workbook terminal-year control had no formula consumers | An apparently editable horizon did not change calculations. | Fix and label the 2036 horizon; remove the unused control. One scenario selector governs both company forecasts. |
| Source definitions were easy to mix | Run-rate, quarterly revenue, post-money equity, pre-money asks and capital commitments answer different questions. | Add a dated source register and evidence labels; keep operating EV primary and the equity bridge explicitly hypothetical. |

## Corrections retained from V2

The original desktop analysis used a terminal reinvestment treatment that could release capital while still growing indefinitely. V2 had already replaced it with next-year NOPAT multiplied by `1 − g / ROIC`. V2 also corrected actual-date discounting, separated the 2026 stub, removed unsupported current cash balances, and exposed negative continuation values without imposing a floor. V3 retains those corrections.

The six operating presets are unchanged from October 16. Advancing the valuation calendar date by two days explains the small default EV movement; the release does not manufacture a new investment thesis by relabeling assumptions as facts. The remaining-2026 cash-flow inputs remain illustrative at the revised date.

| Company | V2 Base EV, Oct 16 | V3 Base EV, Oct 18 | Interpretation |
| --- | ---: | ---: | --- |
| Anthropic | $367.534B | $367.771B | Same operating assumptions; date shift only |
| OpenAI | $258.696B | $258.863B | Same operating assumptions; date shift only |

## Arithmetic evidence

The recovered V2 package passed its seven Python tests and 60 JavaScript assertions. A separate review reconciled 1,164 workbook cached values across all six scenarios, both sensitivity matrices and reverse iterations; maximum absolute difference was approximately `1.82e-12` USD billions. Those checks confirmed calculation consistency, while the invalid-input example demonstrated why additional controls were still necessary.

The V3 production engine is checked with a hand-calculated constant-growth fixture, all six presets, negative operating values, accounting invariance, hypothetical equity adjustments, invalid inputs, sensitivity domains and both multiple-root and tangent-root reverse cases. The fixture produces **$200.314718645B EV** using actual-day discounting and terminal FCFF of **$19.439308072B**.

A separately executed numerical exercise sampled 20,000 deterministic valid scenarios. For the 11,203 with positive supported forward targets, every reverse result recovered the known early growth within `1e-6`. This exercise is evidence for the current algebraic contract, not a proof about a future model that adds NOLs or growth-dependent margins. The repeatable core regression cases remain in `tests/model.test.js`.

Browser/server agreement checks deployment consistency because both intentionally share the same code. `scripts/reference_model.py` is a separate implementation; `tests/reference_parity.py` checks all numerical forecast fields under presets and varied valid/invalid economics. See [verification results](VERIFICATION.md) for release execution evidence.

## Judgments that remain visible

**Terminal concentration.** Base EV depends heavily on the perpetuity: approximately 78.4% for Anthropic and 99.9% for OpenAI. The latter means discounted explicit-period FCFF is close to zero in this scenario. These are consequences of the chosen assumptions, not market-implied probabilities.

**Capital productivity transition.** Explicit reinvestment uses incremental sales divided by capital turns; the terminal state uses a separate ROIC. A large transition can change FCFF sharply. The application shows both implied incremental ROIC and terminal FCFF change so the user can inspect that discontinuity. The model does not silently force them equal.

**Tax losses.** Losses have no modeled tax benefit, and no opening NOL asset is inferred from net losses. A complete tax schedule would need taxable income, jurisdiction, loss limitations and timing.

**Funding and claims.** Cumulative economic FCFF deficit measures the most negative accumulated modeled operating flow. It excludes opening liquidity, intrayear seasonality and financing mechanics. It is not cash runway or a literal capital-raise recommendation. Discounted operating deficits already reduce EV and must not be deducted again in the equity bridge.

**Economic stock compensation.** The margin convention retains a cash-equivalent cost for stock compensation. This reduces the risk of presenting dilution-sensitive labor costs as free economics, but it means the model is not a GAAP cash-flow statement.

**Contract commitments.** A multiyear compute headline cannot be subtracted wholesale as current debt while related costs and investment remain in the forecast. A consistent reconciliation needs the contractual payment schedule and accounting classification.

## Release decision

The model is suitable as a transparent educational fintech project under its documented assumptions and input domain. It is not a verified current security valuation: balance sheets, preference waterfalls, financing conditions and comparable accounting disclosures remain incomplete. No probability weights, price targets, per-share values or investment recommendations are inferred.
