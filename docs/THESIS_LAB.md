# Thesis Lab: compare, explain and investigate

## Purpose and scope

Charles Dai requested a further substantial advance to the published fintech portfolio project. The selected addition is a separate `/thesis.html` analysis workspace. A viewer compares two cases for one company, inspects the complete change in operating enterprise value, explores a two-input valuation landscape, and takes an exact comparison away as a link or presentation brief. Existing instructions authorize autonomous implementation, verification, publication and desktop delivery without further questions.

Application 3.2.0 uses the existing financial engine 3.0.0 and the 18 October 2026 research snapshot. The existing model, six presets, research register, workbook and PDF remain the quantitative baseline. This update changes analytical and presentation capabilities, not the dated financial-data snapshot. Node 24, browser ES modules and ordinary HTML/CSS/SVG remain the runtime; no new production dependencies, accounts or paid services are required.

## User flow

The direct route starts with Anthropic Base versus Bull. A company selector switches both cases to the corresponding presets. Each case can use Bear, Base or Bull, or accept edits to any of its 13 assumptions. Edited values are identified as custom assumptions. A swap action reverses the comparison. Exact loaded numbers are retained until their individual fields are edited, including numbers that cannot round-trip through a short percentage display.

The opening presents both operating EVs and their signed difference. A waterfall explains that difference through six fixed assumption groups. An adjacent table exposes the numerical contribution and the exact inputs covered by each group. Negative values retain their sign and geometry. Relative EV change is undefined when the reference EV is nonpositive.

The landscape holds the alternative case's other eleven inputs fixed, changes WACC and the 2036 EBIT margin, and plots the resulting EV. The margin input also changes the interpolated 2031–2036 margin path. The user sets a target operating EV and a visible view window. A frontier identifies the margin required at each displayed WACC to reach that target within the selected margin range. It is a deterministic calculation, not an estimated probability, optimal strategy or comparison to financing equity value.

A selected point has a persistent numerical readout and an explicit action to apply its WACC/margin to the alternative case. Selection is also possible through keyboard-operable native controls. A reference-case marker must not be plotted as if its other eleven assumptions match the alternative surface.

The original workbench links to the new route with its exact current case. The new route can reopen either case in the original workbench. Any carried hypothetical equity bridge survives those transfers, while the attribution itself concerns operating EV. A versioned two-case link restores both cases and the landscape window/target. A standalone, script-free HTML comparison brief includes current outputs, changed assumptions, signed attribution, frontier, evidence context and reopening links. Presenter mode emphasizes the analysis and keeps a visible exit control.

## Financial method

### Fixed grouping

| Key | Display label | Inputs |
| --- | --- | --- |
| growth | Revenue scale & growth | rev2026, g1, g2 |
| margins | Operating margins | m27, m30, m36 |
| capital | Capital efficiency | turns |
| continuation | Long-run economics | g3, wacc, tg, roic |
| tax | Tax rate | tax |
| stub | Remaining-2026 cash flow | stub |

The model couples `g3`, `tg`, `wacc` and `roic`: late growth must be at least terminal growth, while WACC and terminal ROIC must exceed terminal growth. Keeping those four in one group prevents ordinary valid endpoint cases from producing invalid combinations of those constraints. Grouping is a declared modeling choice; a different partition can produce different contributions.

For each subset of groups, construct a hybrid with the selected groups from the alternative and the remaining groups from the reference. Evaluate all 64 hybrids. For group i, sum its marginal EV difference across subsets not containing i, weighted by `k! (5-k)! / 6!`, where k is the subset size. This equals averaging over all 720 group replacement orders. It allocates interaction effects without depending on a single replacement order.

The method reconciles to alternative EV minus reference EV, subject to floating-point rounding. Do not sample orders, equally weight all subsets, normalize bars to 100%, omit failed hybrids, or put a reconciliation residual into a chosen group. Report the actual sum and residual. The allocation is conditional on the two endpoint assumptions and this grouping; it does not establish causality, confidence or the economic truth of either case.

Every endpoint and hybrid is checked through `project()`, which validates calculated outputs as well as individual assumptions. Finite endpoints can still produce an overflowing extreme hybrid. In that case, retain valid endpoints but report attribution as unavailable with a reason. Nonfinite EV deltas or ratios are rejected rather than serialized as valid numbers.

### Landscape and target frontier

The rate and margin axes each contain 2–21 finite, strictly increasing values. The target is a finite operating EV greater than zero and at most $1,000,000,000,000B. Each grid cell directly calls the shared model. Model-invalid points are null with an explanation; negative EVs remain negative values. The API never clips input axes or changes the other eleven assumptions.

For this model with the other inputs fixed, EV increases with the positive 2036 margin: revenues remain positive, the tax rate is below 100%, the interpolated operating profit response is increasing, and the terminal cash flow response is positive under valid terminal constraints. Use bounded bisection for the target margin between the first and last displayed margins. Return an exact endpoint when it already reaches the target. Classify required margins below or above the displayed range separately from invalid calculations. Never extrapolate a solution outside the range, draw a line through unavailable points, or assume comparable monotonic behavior for other model inputs.

## Shared interfaces

`public/lib/thesis.js` exports `THESIS_VERSION = '1.0.0'`, the frozen `THESIS_GROUPS`, `compareTheses(reference, alternative)` and `valuationLandscape(assumptions, {rates, margins, target})`.

Comparison returns `version`, full reference/alternative assumption snapshots and projections, `evDelta`, `evChangeRatio`, `changedInputs`, and `attribution`. Attribution includes `status`, `method`, `groupCount`, `coalitions`, `orderings`, signed `groups`, `sum`, `residual` and `reason`.

Landscape returns `version`, `assumptions`, `rates`, `margins`, `target`, margin-row/rate-column `values`, corresponding `invalidReasons`, `validCount`, `minEv`, `maxEv` and `frontier`. Each frontier entry supplies `wacc`, `status`, `margin`, `ev`, `residual` and `reason`; only solved entries supply a required margin.

The new API actions are `attribute` with `reference`/`alternative`, and `landscape` with `assumptions`/`rates`/`margins`/`target`. They preserve the existing wrapper versions, request-size limit, strict envelope validation and no-store responses. Browser verification checks both complete current results and cancels stale work.

`public/lib/thesis-share.js` exports `normalizeThesis`, `encodeThesis`, `decodeThesis` and `thesisUrl`. A draft contains `company`, `reference`, `alternative` and `landscape`. Each case contains a known originating `scenario`, all `assumptions` and a nullable validated `bridge`. The envelope is bounded and includes the share schema, model version and research date. Incoming links are fully validated before replacing current state.

`public/lib/thesis-brief.js` exports `createThesisBrief({draft, research, shareUrl})`. It recomputes current values, escapes any text, allows safe web links only, contains no executable script and provides print styling.

## Experience and verification requirements

The visual language continues the navy, cream, peach and mint identity with direct labels, comparable scales and clear grouping. It supports 360, 390, 768 and 1440 pixel layouts, 200% zoom, native keyboard interaction and reduced motion. Invalid drafts suppress stale results and exports. Delayed API or clipboard responses cannot overwrite newer input or success/error state. A malformed shared link leaves the visitor's valid case intact.

Evidence links provide company context; they do not imply every forecast input is disclosed. All forecast paths remain analyst/user assumptions. Research metadata stays visible in presenter and printed views. The original Sources tab is reached through its supported `#sources` link, or the new route uses direct safe source URLs.

Verification includes an independent permutation oracle for grouped attribution, independent target fixtures, invalid hybrids and axes, negative values, exact sharing and round-trip transfer, real HTTP contract/error checks, mobile and keyboard inspection, stale-response tests and current-brief numerical fidelity. Publication requires matching source/deployment identities, successful CI, ordinary HTTPS checks and public browser verification. Production evidence belongs to the corresponding GitHub release.

## Primary method references

- [Sundararajan & Najmi, The Many Shapley Values for Model Explanation, ICML 2020](https://proceedings.mlr.press/v119/sundararajan20b.html): the baseline replacement game and the dependence of attribution on its stated definition and context. The application uses the exact baseline formulation with the six declared groups as its players.
- [Jullum, Redelmeier & Aas, groupShapley, 2021](https://arxiv.org/abs/2106.12228): grouping is a partition choice and generally differs from summing individual-feature attributions. This application does not use that paper's conditional-expectation value function.
- [Moehle, Boyd & Ang, Portfolio Performance Attribution via Shapley Value, 2022](https://web.stanford.edu/~boyd/papers/port_attrib_shapley.html): finance-specific motivation for attribution across interacting changes. The implementation follows the marginal-difference/permutation definition, with the reference value subtracted only through the endpoint difference.
- [Damodaran, Estimating Terminal Value](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/termvalue.pdf): growth requires reinvestment, with return on capital affecting the continuation economics. The application evaluates its own full model; it does not assume terminal growth always increases EV.
- [NIST/SEMATECH, Contour Plot](https://www.itl.nist.gov/div898/handbook/eda/section3/contour.htm): equal-response values describe a two-input surface. Here each displayed required-margin point is solved directly at its WACC; lines connecting those points are visual guides, not additional solved observations.

These references inform the method and presentation. They do not certify the app or establish the financial assumptions of either company. The target-margin monotonicity and piecewise-linear oracle are derived from this repository's explicit margin interpolation and tax policy.
