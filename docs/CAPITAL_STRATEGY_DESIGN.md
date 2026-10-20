# Capital Strategy Studio — v4.0 design

## Product intent

Capital Strategy Studio connects engineering, financing, quantitative analysis and business judgment in one inspectable portfolio demonstration. Written design decisions, separate numerical references and release evidence make its assumptions and implementation reviewable.

The outcome is one complete decision workflow: define objectives, compare financing plans, challenge their modeled consequences across explicit scenarios, record a preference and review trigger, then reproduce the calculation and reasoning. The audience is a portfolio visitor or technical/finance reviewer. It is an illustrative research product, not a fundraising mandate.

## Selected design

A new `capital.html` workspace becomes the portfolio's main integrated demonstration. The existing Model, Thesis, Horizon, Financing and Research pages remain usable and serve as drill-down tools. The frozen financial engine and company evidence remain unchanged.

The central question is: **Which financing plan fits your objectives, and what would change your choice?**

Three editable hypothetical plans are compared against an explicit capital objective and retained-stake floor. Each plan is evaluated against the same named operating scenarios and the same explicit hypothetical equity bridge. The default has no probability weights. A scenario count is a count of submitted cases.

Options considered:

1. A Monte Carlo risk dashboard would require unsupported probability distributions and dependencies. It is not selected.
2. A modeled cash-runway optimizer would misstate the economic FCFF model, including its stock-compensation treatment. It is not selected.
3. A finite scenario comparison with exact round arithmetic, pairwise switching values, minimax regret under a declared metric, and a model-conditioned pricing envelope is selected. Its inputs, rule and limitations are all inspectable.

## Financial interpretation

All amounts are USD billions. Financial model 3.0.0 and valuation date 2026-10-18 remain fixed. This release adds capital method 1.0.0 and application 4.0.0.

Primary proceeds are retained as cash, operations are unchanged, participants have equal rights, and fees are zero. No investment-to-growth benefit is inferred. The capital objective is an analyst input and is never computed from cumulative economic FCFF deficits.

For scenario s, operating EV is the existing perpetual result, or `valueHorizon(...).selected.ev` when a finite continuation is specified. Finite continuation ends with zero residual after the selected cutoff. The common bridge yields a signed modeled pre-money residual:

`M_s = operating EV_s + cash - debt - otherClaims`.

A missing bridge is unavailable; an explicit all-zero bridge is hypothetical. Signed negative values are preserved. Neither the residual nor a negative allocation is a limited-liability common-share valuation.

For plan p, existing-cohort retention is `r_p = preMoney / postMoney`. The signed modeled residual allocated to the existing cohort under the fixed assumptions is:

`A_sp = r_p * (M_s + primaryCapital_p)`.

The tracked holder's allocation is `holderStake * A_sp`. These are conditional residual allocations, not investment returns or available transaction prices. Proceeds appear exactly once. The quoted paper mark of an old share is not presented as a gain from financing.

## Exact input contract

`capitalStrategy(snapshot)` is a pure synchronous function in `public/lib/capital-strategy.js`. `validateCapitalSnapshot(snapshot)` returns a detached validated canonical snapshot. Neither mutates callers.

```
snapshot = {
  company: 'Anthropic' | 'OpenAI',
  scenarios: [{
    id, label,
    assumptions: {rev2026,g1,g2,g3,m27,m30,m36,turns,wacc,tg,roic,stub,tax},
    continuationYears: null | integer 0..100
  }],
  plans: [{id, label, basis: 'pre' | 'post', quote, primaryCapital}],
  policy: {capitalTarget, retentionFloor, modelCoverageFloor, holderStake},
  bridge: null | {cash,debt,otherClaims}
}
```

All listed fields are required; unsupported fields are rejected. Every object must be a plain record with enumerable own data properties. Arrays must be dense, with no custom properties. One to nine scenarios and one to six plans are allowed. IDs are unique within their kind and match `^[a-z][a-z0-9-]{0,23}$`. Labels contain 1–60 Unicode code points with no control characters. Text is always rendered inert.

`capitalTarget` is finite in [0,1e12]; `retentionFloor` in [.01,1]; `modelCoverageFloor` in [.1,10]; `holderStake` in [0,1]. Round and bridge amounts retain existing financing/bridge bounds. Each scenario must pass the complete existing financial validation; failed cases are never dropped or replaced. An explicit finite horizon uses the existing horizon engine and bounds.

## Output contract

The complete result is JSON-safe and detached:

```
{
 version, modelVersion, valuationDate, snapshot,
 scenarios, plans, matrix, comparison, envelope, method, warnings
}
```

`scenarios` preserves input order. Each item has `id`, `label`, `assumptions`, `continuationYears`, `operatingEv`, `perpetualEv`, `modelPreMoneyEquity` (number or null), and `warnings`.

`plans` preserves input order. Each item has `id`, `label`, `round` (existing complete round shape with common holderStake), `pricing` (existing financing pricing shape), `capitalGap` (raise minus objective), `meetsCapital`, `retainedFraction`, `meetsRetention`, `eligible`, and `ownership` (existing ownershipFrontier output). Eligibility means only that the submitted plan meets the explicit capital and retention objectives.

`matrix` is a flat scenario-major, plan-minor array. Each item has `scenarioId`, `planId`, `modelPreMoneyEquity`, `modelPostMoneyEquity`, `existingCohortAllocation`, `trackedHolderAllocation`, `modelToQuote`, `meetsModelCoverage`, `regret`, and `warnings`. Unavailable derived values are null with an explanation. Model coverage is the scenario's modeled pre-money residual divided by the plan's positive implied pre-money quote. It is separate from capital/retention eligibility.

`comparison` has:

- `eligiblePlanIds` and `scenarioIds`;
- `metric: 'existing-cohort-signed-residual'`;
- `range: {minEquity,maxEquity}` (nulls if bridge unavailable);
- `perScenario: [{scenarioId,bestAllocation,bestPlanIds}]` over eligible plans;
- `planMetrics: [{planId,eligible,worstRegret,worstScenarioIds,minAllocation,maxAllocation,meetsModelCoverageIn,totalScenarios}]`;
- `minimax: {status,planIds,worstRegret}`, where status is available / no-eligible-plans / unavailable;
- `dominance: [{dominatingPlanId,dominatedPlanId}]` over eligible plans, and `dominanceStatus`;
- `crossovers: [{planA,planB,eligiblePair,status,equityResidual,allocation,inSelectedRange,higherResidualPreferred,lowerResidualPreferred}]` for all submitted pairs. Status is finite / parallel / identical / unavailable. Nonfinite or unresolved switching points are null, never zero substitutes.

`envelope` has `status`, `modelQuoteCeiling`, `limitingScenarioIds`, `maximumPrimaryCapital`, and `plans: [{planId,lowerPreMoney,upperPreMoney,status,includesLower,withinInputRange,currentQuoteMeets}]`. This tests *all submitted scenarios*. A nonpositive upper quote is preserved and labeled `no-positive-price`. A positive raise at a 100% floor yields `no-finite-quote`. Missing bridge or unresolved arithmetic yields unavailable. Other plan statuses are compatible / empty. `withinInputRange` separately identifies whether an analytical interval intersects the supported positive quote domain, instead of silently capping the analytical answer.

## Quantitative rules

Only capital/retention-eligible plans enter regret and dominance comparisons. For each scenario, the benchmark is the largest signed existing-cohort allocation among eligible plans. Regret is that benchmark minus the plan's allocation. A plan's worst regret is the maximum across the listed scenarios. Minimax identifies the plan(s) with the lowest such maximum. All ties are returned; the analyst's selection is never automatically changed.

The comparison is conditional on the listed scenarios, submitted plans and stated allocation metric. It is not a probability model or proof of global robustness. An unavailable required allocation makes the complete rule unavailable; do not discard that scenario.

For two plans `A(M)=r_A*M+b_A` and `B(M)=r_B*M+b_B`, where `b=r*raise`, the crossover is `(b_B-b_A)/(r_A-r_B)`. Parallel and identical cases remain distinct. Roots outside the selected residual range are labeled accordingly. A tiny unresolved slope difference does not create an enormous apparently exact threshold.

For model-coverage floor c, the all-scenario price ceiling is `Qmax=min_s(M_s/c)`. At retention floor rho<1, a given primary raise R requires pre-money quote at least `rho*R/(1-rho)`. The interval `[lower,Qmax]` makes conflicting conditions explicit. Quotes must be positive. R=0 has an open lower bound at zero; rho=1 with R=0 permits positive prices, while rho=1 and R>0 has no finite compatible quote. The analytical maximum primary capital is `Qmax*(1-rho)/rho` only when Qmax>0, with zero at rho=1. This does not establish available financing.

Use a documented 32*Number.EPSILON relative comparison band for numerical ties and ordinary threshold classifications, consistent with existing ownership conventions. Preserve the strict positive-capital/100%-retention rule. Avoid overflow through scaled comparisons where possible. Return unavailable for unresolved derived comparisons and retain usable component results. No floating-point result is mislabeled as exact rational arithmetic.

## Worked decision

Company: Anthropic. Scenarios: Bear, Base, Bull from current presets, each with perpetual continuation. Hypothetical bridge: cash20, debt5, otherClaims0. Capital objective25, retention floor.88, model coverage floor1, holderStake.1.

- a / Smaller round / pre250 / primary25
- b / More capital / pre300 / primary35
- c / Higher retention / pre300 / primary20

A and B meet capital and retention. C misses the capital objective by5. At a90% retention floor, B fails; at capital30 and retention90%, no plan qualifies. At capital30 and retention88%, B qualifies.

The A/B signed residual crossover is exactly635 in rational arithmetic, with cohort allocation600. Below635, B has the greater allocation; above635, A does. This fixture is independent of the selected company forecast. The example notes explicitly identify an illustrative analyst choice and tradeoff, not a real company financing recommendation.

## Portable decision and API

Use a dedicated capital record; existing Casebook types are unchanged.

`createCapitalRecord(snapshot, decision)` produces a strict record with kind `frontier-capital-decision`, schema1, modelVersion, valuationDate, capitalVersion, snapshot, decision and recomputed analysis. Decision fields: `selectedPlanId` (null or current id), `rationale`, `tradeoff`, `reviewTrigger`, `informationNeeded`. Each text field is at most1500 Unicode code points; empty drafts are allowed and labeled. Input edits mark an existing rationale as requiring review in the UI, without changing its text or selection.

`parseCapitalRecord(text)` validates a bounded256KiB UTF-8 JSON file, validates versions and inputs, and recomputes analysis. Supplied analysis is not authoritative. Unknown envelope fields reject. Unicode and HTML-like text remain inert. Import uses a preview and explicit apply step; failed imports preserve the current draft.

`encodeCapitalShare(record)` / `decodeCapitalShare(token)` use a deliberate UTF-8 base64url codec and include exact snapshot plus decision fields, without trusting stored output or API-verification badges. The token maximum is32768 characters; decoded JSON maximum is24576 bytes. Oversized valid records remain downloadable as JSON and the UI explains that link sharing is unavailable. Existing share schemas are unchanged.

`capitalUrl(record, baseUrl)` points to `capital.html#decision=<token>`. A settled shared link survives fresh-context navigation and reload. The canonical worked route is `capital.html#worked-decision`.

Add API action `{action:'capital',snapshot}` to the existing shared HTTP handler. It returns the usual application/model/date envelope and complete capitalStrategy result. Preserve existing16KiB request and streaming/media/method boundaries. Analyst prose is excluded from this computation request. Edits abort/invalidate an in-flight verification; a previous result cannot verify a new draft.

## Presentation

Keep the app's cream, navy and restrained green visual identity. Use a clear hero and numbered sections: Define / Compare / Challenge / Record. The main chart plots primary capital horizontally and starting stake retained vertically, with objective guides, a labeled qualifying region, and separate plan markers. Do not connect offers with a curve implying availability of intermediate terms.

Provide a complete equivalent table. Scenario allocations are signed and labeled as model residuals. Highlight the analyst selection separately from the declared minimax result. Show the all-scenario model-pricing envelope as a deeper diagnostic with its own interpretation.

Every control has a visible label and units. All paths work by keyboard, preserve focus, and announce concise settled changes. Validate320/390/768/1440 CSS widths and200% zoom; honor reduced motion. Invalid drafts clear dependent results and disable misleading export/verification actions. No silent fallback to presets.

The portfolio gateway and Frontier case study lead with this integrated decision story. Preserve other projects, public publication guards and new engineering evidence from portfolio commitfcd42314de1fb7dc0cad50f08c072e3385772e91. Update the case generator's hard-coded hero as well as its data. Use an actual app capture and deterministic example data for public claims.

## Source basis

- RAND, Robust Decision Making tool: https://www.rand.org/pubs/tools/TL320/tool/robust-decision-making.html — decision levers, explicit futures, tradeoff analysis, and avoiding probability interpretations of case counts. This demo is a finite comparison inspired by that framing, not a complete RDM implementation.
- Aswath Damodaran, Probabilistic Approaches: https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/probabilistic.pdf — scenario-dependent values and economically coherent assumptions; expected values require an appropriate probability basis.
- HM Treasury, Green Book2026: https://www.gov.uk/government/publications/the-green-book--2/the-green-book-2026 — clear objectives, alternatives, sensitivity and documented judgment. Public-sector appraisal conventions are not imported as private financing valuation rules.
- Existing project financing and ownership methodology retain their Y Combinator and Carta source basis.

## Acceptance

Independent financial arithmetic, exact hand crossover/envelope fixtures, meaningful input rejection and invariant tests; complete API parity; fresh-context share/import/reload; Unicode/inert text; no eligible plan and unavailable states; keyboard/mobile/zoom; standalone brief and every PDF page inspected; current source-bound GitHub CI, production asset/API/browser checks; seven-or-more release assets downloaded and checked; original workbook and prior desktop files preserved. A public method document, honest role statement, API example and reproducible local run path complete the portfolio demonstration.

## Implementation correction: portable record capacity

The original96KiB import bound was raised to256KiB after a concrete valid maximum-size decision produced approximately159KiB of pretty JSON. This preserves the complete inspectable record and its JSON fallback for decisions too large to share by link. A bounded maximum-size Unicode round-trip test verifies the corrected contract. Share-token and API-request limits are unchanged.

## 20 October refinement: preview objectives before applying

An optional native disclosure after the main decision chart presents four illustrative capital/retention pairs. `previewCapitalObjectives` validates and detaches the current complete record, changes only the two objectives, and calls the existing record and financial methods. It contains no separate eligibility arithmetic. Preview state is local to the controller and separate from the import preview; it is excluded from records, URLs and exports.

Each preview compares the current and proposed eligibility of the current submitted plans. Applying a different pair changes both objectives in one recalculation, preserves every other input and decision field, and invalidates earlier verification. Any intervening edit discards the preview. An invalid draft cannot be previewed or applied. The current pair is a disabled no-op, and an empty eligible set is an explicit valid result. A missing equity bridge still permits objective screening while modeled allocations remain unavailable. Returning to the original pair always requires an explicit action.

The `#capital-explore` entry opens this panel. Navigating to that anchor within an existing decision preserves its draft. Native disclosure semantics, visible keyboard focus after Apply, polite status updates and responsive comparison rows keep the additional interaction optional. The shared desktop navigation wraps when enlarged text needs more width; the phone navigation retains its scrollable rail.

## 20 October refinement: distinguish exact and qualified API agreement

A captured finite-continuation case showed small Node/Chromium differences originating in the implementation-approximated `Math.expm1` primitive. The financial engines and API response remain unchanged. The browser now has three explicit comparison outcomes: exact, qualified rounding agreement, or mismatch. Exact agreement alone retains the verified checkmark.

The separate comparison helper permits a relative difference of at most `32 * Number.EPSILON` only on documented FCFF-dependent output paths. Both numbers must be finite, nonzero and have the same sign; there is no absolute floor. Inputs, financial terms, ownership calculations, statuses, rankings, ties, crossovers, versions and structure remain exact. The complete [comparison policy](CAPITAL_STRATEGY.md#10-browser-and-api-comparison) explains the captured fixture and the limits of this policy. It is not a formal propagated-error bound, a financial-materiality threshold or proof of the cause of a later difference.

Both completed states are invalidated by an edit. Pending requests use a neutral label, failed retries remove earlier completion labels, and revision/controller guards prevent late responses from approving a changed draft. No comparison rewrites the browser record or server response.
