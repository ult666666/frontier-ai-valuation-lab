# Capital Strategy Studio: method and numerical contract

Capital Strategy Studio compares explicitly entered primary equity plans across a finite set of operating scenarios. It connects a financing objective, retained ownership, modeled residual allocations and an analyst's documented judgment. Its comparison rule is conditional on the submitted plans, scenarios and metric. It does not estimate the probability of those scenarios or determine a company's funding requirement.

The capital method is **1.0.0**. It composes the unchanged **3.0.0 FCFF model**, valued as of **18 October 2026**, with the existing financing, ownership and finite-continuation modules. All amounts are **USD billions**; rates and ownership inputs are decimal fractions. The frozen presets remain illustrative analyst scenarios. Adding this module does not refresh company financial facts or modify earlier model results.

## 1. Decision inputs

The pure entry points are `validateCapitalSnapshot(snapshot)` and `capitalStrategy(snapshot)`, exported from [capital-strategy.js](../public/lib/capital-strategy.js). Validation returns a detached canonical snapshot. Calculation returns the canonical snapshot and complete derived analysis without mutating its caller.

| Input | Meaning and supported domain |
| --- | --- |
| `company` | `Anthropic` or `OpenAI`; identifies the decision context |
| `scenarios` | 1–9 complete scenarios; each has a unique ID, label, the 13 existing FCFF assumptions and an explicit continuation choice |
| `continuationYears` | `null` for the existing perpetuity, or a whole number from 0 through 100 for annual periods after 2036 |
| `plans` | 1–6 complete hypothetical rounds; each has a unique ID, label, `basis`, `quote` and `primaryCapital` |
| `basis` | `pre` or `post`, defining what the entered quote includes |
| `quote` | Positive finite entered equity quote, at most 1e12; a post-money quote must exceed new primary capital and pass the existing supported-precision check |
| `primaryCapital` | New cash subscribed in the modeled primary round; finite from 0 through 1e12 |
| `capitalTarget` | Analyst's explicit primary-capital objective; finite from 0 through 1e12 |
| `retentionFloor` | Required fraction of starting stakes retained by existing holders; 0.01 through 1 |
| `modelCoverageFloor` | Required modeled pre-money residual divided by implied pre-money quote; 0.1 through 10 |
| `holderStake` | One tracked holder's share of the starting existing cohort; 0 through 1 |
| `bridge` | `null`, or explicitly hypothetical current cash, debt and other claims, each from 0 through 10,000 |

All documented fields are required. Unknown fields, symbols, accessors, inherited records, missing assumptions and non-enumerable fields reject. Records have the ordinary object prototype or a null prototype. Arrays must be dense and have no custom properties. IDs match `^[a-z][a-z0-9-]{0,23}$`; labels contain 1–60 Unicode code points of well-formed text without C0/C1 control characters. Lone UTF-16 surrogates reject so accepted labels retain their text through UTF-8 HTML export and structured transports. Paired emoji and whitespace remain valid, and labels are preserved verbatim. Negative zero is normalized to zero.

Every scenario passes the complete existing operating-model validation. A selected finite horizon also passes the complete horizon calculation. An invalid case rejects the snapshot; the engine never drops it or replaces it with a preset. Existing FCFF domains and valuation details are documented in [METHODOLOGY.md](METHODOLOGY.md).

## 2. Operating values and the explicit equity bridge

For scenario \(s\), the existing operating model produces enterprise value \(EV_s\). A finite continuation choice uses the selected finite-horizon EV, while `perpetualEv` preserves the perpetual reference.

With a supplied hypothetical bridge:

\[
M_s=EV_s+\text{cash}-\text{debt}-\text{other claims}.
\]

\(M_s\) is the **signed modeled pre-money equity residual**. A missing bridge leaves this residual and its dependent allocations unavailable. It never means zero cash, zero debt or zero claims. A zero or negative residual remains signed; this residual calculation does not value limited-liability common equity or allocate losses through a preference waterfall.

A finite continuation of \(N\) includes \(N\) annual terminal cash flows after 2036 and assigns zero residual value after the cutoff. At \(N=0\), only the remaining-2026 stub and 2027–2036 explicit cash flows contribute. This is an assumption challenge within the current valuation framework, not a prediction of company lifespan. See [VALUE_HORIZON.md](VALUE_HORIZON.md) for the existing horizon method.

The distinction between operating value and equity claims follows ordinary enterprise-to-equity bridge reasoning. Damodaran discusses which debt and other claims should be deducted and the risk of double counting items already represented in operating cash flows. The particular hypothetical balances and signed-residual convention here are project inputs and design choices. [Source: Damodaran, “What should you subtract out to get to equity value,” undated; retrieved 20 October 2026.](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/debttosubtract.htm)

## 3. Financing arithmetic and eligible plans

Let \(Q_j>0\) denote a plan's implied pre-money quote and \(R_j\ge0\) its new primary capital. If the entered quote is post-money \(P_j\), then \(Q_j=P_j-R_j\). The existing cohort's retained ownership is:

\[
r_j=\frac{Q_j}{Q_j+R_j}.
\]

This is a single priced primary equity round. Existing holders do not subscribe; participants have equal economic rights; proceeds remain cash; fees are zero; operating forecasts are unchanged. No liquidation preference, conversion, option-pool expansion, secondary sale, warrant, debt instrument, multi-round financing or control right is modeled.

The underlying pre/post quote and issuance arithmetic is consistent with YC's explanation of an equity financing: new money increases post-money value and the newly issued shares dilute existing ownership. The detailed portfolio comparison rule and its policy constraints are derived for this application. [Source: Y Combinator, “A Guide to Seed Fundraising,” 7 January 2016; retrieved 20 October 2026.](https://www.ycombinator.com/blog/how-to-raise-a-seed-round)

A plan enters regret and dominance comparisons exactly when it meets both stated policy objectives:

\[
R_j\ge K,\qquad r_j\ge\rho,
\]

where \(K\) is `capitalTarget` and \(\rho\) is `retentionFloor`. The ordinary comparisons use the numerical band described below. A **100% floor requires exactly zero primary capital**; any positive issuance fails even when a floating-point retained fraction rounds to one.

`capitalGap` is \(R_j-K\), with a positive value meaning the submitted raise exceeds the objective. Model-value coverage is a separate diagnostic and does not silently change eligibility. This separation lets the analyst see a plan that satisfies the stated capital and ownership objectives while remaining unsupported by one or more modeled residuals.

The capital objective is not obtained from the FCFF trough, cumulative cash-flow deficits or an inferred runway. A financing requirement would need a separately specified liquidity schedule, opening cash, minimum cash reserve, debt service, facility terms, timing, financing commitments and other relevant uses and sources of cash. That cash-budget model is outside this method.

## 4. Signed allocations and finite-scenario comparisons

New primary proceeds enter the modeled post-money residual once:

\[
M_{s,j}^{post}=M_s+R_j,\qquad
A_{s,j}=r_j(M_s+R_j),\qquad
H_{s,j}=hA_{s,j}.
\]

\(A_{s,j}\) is the signed allocation to the entire existing cohort; \(H_{s,j}\) is the tracked holder's allocation when its starting stake is \(h\). These are model residual allocations under the stated equal-rights assumptions. The comparison metric is the existing cohort, so changing only the tracked holder does not change regret, dominance or the minimax result.

The output matrix preserves scenario order, then plan order. Every submitted plan remains visible. Only eligible plans belong to the comparison set \(E\). For each listed scenario:

\[
B_s=\max_{j\in E} A_{s,j},\qquad
L_{s,j}=B_s-A_{s,j},\qquad
W_j=\max_s L_{s,j}.
\]

`regret` is \(L_{s,j}\). `worstRegret` is \(W_j\). The declared minimax rule returns every eligible plan attaining the smallest worst regret, subject to numerical ties. It does not overwrite the analyst's chosen plan. For allocation ties within the comparison band, regret is normalized to zero rather than reporting a rounding artifact as an economic loss.

Plan A weakly dominates B if its allocation is no smaller in every listed scenario and strictly greater in at least one, using the same band. Economic duplicates tie and do not dominate one another. Ineligible plans keep their allocation ranges and model-coverage counts as diagnostics, but their regret is `null`.

`meetsModelCoverageIn / totalScenarios` is a count of listed cases. It is not an estimated success probability. There are no scenario weights, expected values, simulated distributions, confidence levels or probability-of-loss statements in this method. Duplicating a scenario does not add independent evidence. Worst-case comparisons also remain sensitive to which scenarios and plans the analyst includes; no robustness claim extends beyond that finite set.

RAND's RDM guidance separates uncertain futures, available actions, model relationships and decision measures, and warns against interpreting exploratory case counts as probabilities. It also explains the limitations of conclusions based on a handful of scenarios. This studio is a small finite comparison inspired by that framing, not a complete RDM study or a scenario-discovery algorithm. [Source: RAND, “Robust Decision Making,” undated; retrieved 20 October 2026.](https://www.rand.org/pubs/tools/TL320/tool/robust-decision-making.html)

Damodaran's scenario-analysis discussion supports examining values under different coherent assumptions and distinguishes this from estimating a probability-weighted value. The capital plans, regret metric and unweighted decision rule above are application-derived; those sources do not certify their suitability for a particular financing decision. [Source: Damodaran, “Probabilistic Approaches: Scenario Analysis, Decision Trees and Simulations,” undated PDF; retrieved 20 October 2026.](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/probabilistic.pdf)

## 5. Pairwise switching values

Each plan is an affine function of a common pre-money modeled residual:

\[
A_j(M)=r_jM+b_j,\qquad b_j=r_jR_j.
\]

For different slopes, the algebraic switching residual is:

\[
M^*=\frac{b_B-b_A}{r_A-r_B}.
\]

The output identifies the common allocation, the preferred plan above and below the crossing, and whether the crossing lies within the selected scenario residual range. Crossovers are calculated for all submitted pairs; `eligiblePair` identifies pairs whose two plans qualify for the regret comparison. A finite switching value remains computable without a bridge, but its location relative to selected modeled residuals is then `null`.

Equal slopes and equal intercepts are `identical`; equal slopes with different intercepts are `parallel`. A negative crossing, a zero crossing or a zero common allocation is legitimate. A crossing outside the selected range is explicitly labeled. `unavailable` denotes unresolved arithmetic, not a zero switching value or proof that a crossing does not exist.

### Exact coefficients, limited claim

Only this pairwise coefficient calculation uses exact rational arithmetic. The coefficients are derived from the **binary64 values of the entered quote and raise**, converted to rational numbers before adding or subtracting financing terms. For a pre quote, rational post-money is entered quote plus raise. For a post quote, rational pre-money is entered quote minus raise. The calculation does not take the already-rounded `pricing.preMoney` or `pricing.postMoney` as exact coefficients.

The root and common allocation are rounded once to binary64, including nearest-even subnormal rounding. Binary-representable equivalent pre/post inputs produce identical coefficients. If a user instead rounds the post quote while converting a non-representable sum, the entered terms have changed slightly; the application does not claim those distinct binary inputs are identical.

Exact coefficient algebra does not remove input uncertainty or make an ill-conditioned economic threshold reliable. If the displayed floating-point slope difference is within the declared band, the switching value remains unavailable. Every reported root must also reconcile both frozen floating-point allocation expressions and the rounded common allocation within that band, scaled by the largest absolute allocation or affine component. Overflow, nonzero underflow and failed reconciliation return unavailable.

The general DCF, pricing output, scenario matrix, envelope and decision comparisons remain floating-point calculations. None is described as exact financial value.

## 6. All-scenario price and ownership envelope

At model-coverage floor \(c>0\), every listed scenario must satisfy:

\[
\frac{M_s}{Q}\ge c.
\]

Therefore the greatest compatible pre-money quote is:

\[
Q_{max}=\min_s\frac{M_s}{c}.
\]

For a specified raise \(R>0\) and \(\rho<1\), the ownership floor requires:

\[
Q_{min}=\frac{\rho R}{1-\rho}.
\]

The interval \([Q_{min},Q_{max}]\) makes conflicting constraints visible. Its existence means the two modeled conditions can be met simultaneously at some positive quote under this simplified arithmetic; it does not establish an investor's willingness to finance that quote.

| Boundary | Reported interpretation |
| --- | --- |
| Positive upper and lower no greater than upper | `compatible`, within the numerical band |
| Positive upper below the lower | `empty` |
| Zero or negative upper | `no-positive-price`; the signed ceiling is preserved |
| Positive raise with a 100% floor | `no-finite-quote` |
| Zero raise | Lower bound zero is open; quotes remain strictly positive |
| Missing bridge or unresolved required arithmetic | `unavailable`; no zero substitution |

When \(Q_{max}>0\), the analytical primary-capital ceiling is:

\[
R_{max}=Q_{max}\frac{1-\rho}{\rho}.
\]

At \(\rho=1\), it is zero. At a nonpositive price ceiling, it is `null`; zero would incorrectly suggest a resolved feasible financing. The top-level envelope status `available` means its calculation is resolved, even if all submitted plan intervals are empty.

Analytical intervals are not silently clipped to application input limits. `withinInputRange` separately tests intersection with supported positive quotes. The maximum implied pre-money input is 1e12 for a pre-basis plan, and 1e12 minus that plan's raise for a post-basis plan because the entered post quote has the same cap. `currentQuoteMeets` asks whether the submitted quote satisfies retention and every scenario's model coverage. The capital objective remains separate.

## 7. Reproducible worked decision

The bundled example uses the frozen Anthropic Bear, Base and Bull presets, perpetual continuation and a hypothetical bridge of cash 20, debt 5 and other claims 0. The capital objective is 25, the retention floor 88%, model coverage 1.0 times and tracked starting stake 10%.

| Plan | Pre-money quote | New primary cash | Starting stake retained | Eligible |
| --- | ---: | ---: | ---: | --- |
| A — Smaller round | 250 | 25 | 90.9091% | Yes |
| B — More capital | 300 | 35 | 89.5522% | Yes |
| C — Higher retention | 300 | 20 | 93.7500% | No; 5 below the capital objective |

| Scenario | Signed pre-money residual | A cohort allocation | B cohort allocation | A regret | B regret |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bear | 1.838122 | 24.398293 | 32.989363 | 8.591070 | 0 |
| Base | 382.771295 | 370.701177 | 374.123548 | 3.422370 | 0 |
| Bull | 1,899.308778 | 1,749.371617 | 1,732.216816 | 0 | 17.154800 |

A has the lower worst regret, 8.591070 versus B's 17.154800. Neither dominates the other. Both meet model coverage in two of the three listed cases. The count does not imply a two-thirds probability of adequacy.

The independent hand crossover is **635**, with a common existing-cohort allocation of **600**. Start with 100 old shares: A issues 10 new shares, while B issues \(35/3\). At residual 635, \((100/110)(635+25)=600\) and \((100/(100+35/3))(635+35)=600\). B allocates more below the crossing; A allocates more above it.

The all-scenario price ceiling is only **1.838122**, limited by Bear. At 88% retention, the analytical primary-capital ceiling is **0.250653**. A requires a pre-money quote of at least **183.333333** for its raise; B requires **256.666667**. Their intervals are empty. This challenges the whole proposed financing configuration even though both plans qualify for the separate capital/retention comparison.

At a 90% retention floor, only A qualifies. Raising the objective to 30 at that floor leaves no qualifying plan. Keeping the 30 objective but restoring 88% retention admits only B. These changes are policy choices, not newly learned facts about either company.

A second independent hand fixture sets a hypothetical modeled residual of 100, a raise of 10, a 90% retention floor and coverage of 1. Its analytical pre-money interval is **[90, 100]**. A quote of 95 satisfies both conditions. A raise of 12 increases the lower bound to 108 and makes the interval empty.

## 8. Output and numerical availability

The result has exactly these top-level properties: `version`, `modelVersion`, `valuationDate`, `snapshot`, `scenarios`, `plans`, `matrix`, `comparison`, `envelope`, `method` and `warnings`. All results are JSON-safe and preserve input ordering. The full field contract is in [CAPITAL_STRATEGY_DESIGN.md](CAPITAL_STRATEGY_DESIGN.md).

Ordinary ties and thresholds use \(\beta=32\times\texttt{Number.EPSILON}\), approximately \(7.1054\times10^{-15}\). For a nonzero scale \(S=\max(|a|,|b|)\), the implementation compares \(a/S\) and \(b/S\); a difference within \(\beta\) is a numerical tie. The strict positive-issuance/100%-retention rule remains an exception. This band handles arithmetic resolution, not forecast accuracy or economic materiality.

Scaled comparisons preserve usable model-coverage classifications when the displayed ratio would overflow. A nonzero multiplication or ratio that underflows to zero is unavailable rather than economically zero. If an eligible plan lacks a required scenario allocation or regret, the complete minimax and dominance rules are unavailable; useful plan screening and individual component results remain visible. No eligible plan has the distinct status `no-eligible-plans`.

Warnings identify missing bridges, signed nonpositive residuals, finite cutoffs, duplicate numerical scenarios and unresolved derived arithmetic. The versioned decision record, share link, API and standalone brief consume this same pure result; imported analysis is recomputed from validated inputs.

## 9. Independent verification and local reproduction

Run the focused contract tests and independent reference from the repository root:

```sh
node --test --test-isolation=none tests/capital-strategy.test.js
python scripts/check_capital_reference.py
```

The Python reference imports no application calculation code. A separate Node process evaluates the production module as the comparison target. The reference rebuilds explicit FCFF with 100-digit `Decimal.from_float`, sums finite annual continuation cash flows directly, issues shares from a 100-existing-share `Fraction.from_float` ledger, enumerates the submitted scenario comparisons and derives inverse ownership from the allowable new share count.

Its source-bound JSON receipt records exact checked source hashes, fixture counts, rejection evidence, comparison tolerances, largest discrepancies and failures. `--output path.json` selects another receipt location. The local default is `qa-local/v4-0/quant/capital-reference.json`; these local QA files are not required by the browser runtime.

The reference covers both companies and all six operating presets, finite continuations of 0/1/5/17/100 years, maximum-size mixed snapshots, signed and missing bridges, no eligible plans, ties, separate coverage criteria, analytical versus input bounds, exact zero/positive issuance behavior, subnormal limits, nearly parallel crossovers and a deterministic lattice of financing policies. Invalid JSON snapshots and JavaScript-only accessors, symbols, holes and nonfinite values are checked separately. Deterministic fixture counts are engineering evidence, not market evidence.

DCF comparisons allow accumulated floating-point error using a disclosed component scale. Pairwise crossover numbers must match the independently and correctly rounded exact input-ledger result. The largest absolute error can occur in an intentionally near-singular test with an enormous EV; the receipt identifies that field so an absolute error cannot be advertised without its scale. The general floating-point DCF is not exact, and this reference is algorithmic and arithmetic verification rather than an external audit.

The operating model, horizon engine, financing engine, ownership engine, frozen presets and research baseline remain unchanged. This extension adds an inspectable capital decision method, with explicit limits and a reproducible route from inputs to conclusions.
