# Release verification

The current **v4.0 local verification** appears first. Earlier records retain their dates and scope. Numerical agreement, browser behavior, printable-artifact review and deployment checks are separate evidence. Consult the [v4.0 release](https://github.com/ult666666/frontier-ai-valuation-lab/releases/tag/v4.0.0) for the subsequent exact-commit production and native-desktop observations.

## Version 4.0 local verification

Application **4.0.0** introduces Capital Strategy Studio: explicit business objectives, hypothetical financing plans, a common scenario matrix and a portable record of the analyst's judgment. Capital method **1.0.0** composes the existing financial engine **3.0.0**, financing and ownership methods **1.0.0**, and the **18 October 2026** valuation snapshot. The [local release record](verification/release-4.0-local.json) binds the implementation, test harnesses, evidence and artifacts by SHA-256.

| Verification layer | Result | Evidence |
| --- | --- | --- |
| Node financial, API, transport, portable-record and release tests | **314 passed; 0 failed or skipped** | [Node gate](verification/node-tests-4.0.json) |
| All eleven local Chromium workflows | **842 assertions; 0 page errors** | [Browser workflows](verification/browser-workflows-4.0.json) |
| Capital Studio's complete browser workflow | **86 assertions**, included in the total above | [Capital browser](verification/capital-browser-4.0.json) |
| Independent Capital reference | **74 valid; 38 rejected JSON; 11 JavaScript-only rejections; 16,635 numerical and 134,357 structural comparisons; 510 exact rounded crossover checks** | [Capital reference](verification/capital-reference-4.0.json) |
| Existing financial, Thesis, Horizon, Financing and Ownership references | **All five passed freshly** | [Reference gates](verification/reference-gates-4.0.json) |
| Static application build | **82 exact public assets staged; reviewed inputs unchanged** | [Build](verification/build-4.0.json) |
| Local HTTP assets and complete API responses | **144 passed: 83 asset routes, 1 health, 24 valid API and 36 rejections** | [HTTP receipt](verification/http-local-4.0.json) |
| Bounded local API workload cost | **Four accepted workloads; 10 warmup and 40 measured calls each** | [Observations and scope](verification/capital-performance-4.0.json) |
| Worked printable artifacts | **19 pages visually reviewed across five PDFs**, including the seven-page capital decision | [Print record](verification/printed-artifacts-4.0.json) |
| Versioned desktop package | **47 ZIP members; 46 manifest-listed files; seven actual creation/verification checks** | [Archive](verification/desktop-archive-4.0.json), [package checks](verification/desktop-verification-4.0.json) |
| Scoped independent engineering review | **No unresolved material findings** | [Review record](verification/independent-review-4.0.json) |

### Business judgment and the calculation contract

The worked example compares three hypothetical offers against a **$25B capital objective and an 88% retained-starting-stake floor**. Plans A and B are eligible. Plan C retains more ownership but misses the capital objective by $5B. Raising the ownership floor to 90% leaves A; raising the capital objective to $30B at that floor leaves no eligible submitted offer. These are declared constraints, not estimates of funding need.

The same Bear, Base and Bull operating cases are applied to every offer. Capital is retained as cash, participants have equal economic rights, and operating forecasts are unchanged. Scenario counts are not probabilities. The minimax comparison uses signed modeled allocations to the existing shareholder cohort; it does not estimate returns or select an analyst preference automatically. The [capital method](CAPITAL_STRATEGY.md) and [walkthrough](DEMO_WALKTHROUGH.md) explain the metric, empty and unavailable states, switching values and more demanding model-conditioned pricing interval.

For A and B, the exact entered-term share ledgers imply a switching pre-money residual of **$635B**, where both modeled existing-cohort allocations are **$600B**. This is a conditional algebraic result, not a transaction valuation. The complete record carries all thirteen inputs for every scenario, finite-continuation choices, all offers, balances, objectives, the analyst's selection and four reasoning fields.

### Independent arithmetic and precision

The Capital reference derives cash flows separately using 100-digit Decimal arithmetic and an explicit annual finite-continuation sum. Fraction arithmetic constructs a 100-existing-share ledger from the exact binary values of the entered quote and primary raise. It imports no application calculation function. Its comparisons cover eligibility, allocation, dominance, regret, switching values and inverse pricing bounds, including missing bridges, signed residuals, subnormal inputs and the maximum nine-by-six matrix.

The production DCF and allocation outputs use floating-point arithmetic. Switching diagnostics derive coefficients from exact entered terms before the pre-plus-raise or post-minus-raise operation rounds, then round the reported root once. Both corresponding allocation expressions must reconcile. Unresolved numerical cases remain unavailable. Ordinary thresholds use the documented relative band; any positive issuance strictly breaches a 100% retained-stake floor. This numerical convention has no statistical-confidence meaning.

The reference receipt publishes its tolerances and the scale and units beside maximum errors. Passing a numerical reference checks the stated method within those conventions; it does not validate the forecast assumptions or establish transaction prices.

### Browser, API and portable-record behavior

The final eleven suites cover Capital, Model/Overview, scenario portability, Thesis, Thesis entry, Casebook, cross-workspace journeys, pending-save behavior, Horizon, Financing and Ownership. The totals are **86 + 76 + 75 + 79 + 14 + 85 + 94 + 16 + 148 + 92 + 77 = 842**. Checks include narrow viewports, 200% zoom, keyboard use, exact input handoffs, malformed drafts, delayed API responses, rejected imports and text/HTML export behavior. These are scoped Chromium observations, not a certification of every browser or assistive technology.

Capital requests use the real shared Web-standard handler. The API enforces its existing 16 KiB streamed byte limit, fatal UTF-8 decoding, supported media type and strict nested inputs. Complete results are compared; a successful HTTP status alone cannot mark a changed decision verified. Edits invalidate completed and in-flight verification. Ordinary transport checks are separate from the independent Python arithmetic.

Decision JSON allows 256 KiB of UTF-8 and recomputes supplied analysis. Share links have smaller explicit bounds, with JSON export available when an otherwise valid decision is too large to share. The maximum-size portable fixture and full nine-by-six matrix were checked. Lone surrogate code units are rejected in plan/scenario labels and prose; valid paired emoji round-trip. Standalone briefs escape authored text and contain no executing script.

The local workload observation addresses the cost of composing the maximum matrix and exact-rational diagnostics. It exercised the actual in-process HTTP handler with the canonical decision, a nine-by-six matrix at 100 finite years, and existing near-parallel and subnormal reference cases. The largest measured response was 71,442 bytes; the receipt retains every timing, separate warmup observations, process-memory snapshots and runtime details. Network latency, deployed cold starts, concurrent traffic and global worst-case behavior are outside that observation. Reproduce it from the repository root with the [saved harness](verification/capital-performance-harness-4.0.mjs) and [accepted fixtures](verification/capital-performance-inputs-4.0.json):

```sh
node docs/verification/capital-performance-harness-4.0.mjs \
  docs/verification/capital-performance-inputs-4.0.json \
  /tmp/capital-performance.json
```

The final review closed a destructive example-selector behavior: browsing another worked example now queues it while preserving all edits; a separately labeled replacement action applies the example. It also closed a near-parallel crossover precision defect and the malformed-label HTML export defect. Regression checks exercise those behaviors. The fresh release reviewer additionally checked run prerequisites, metadata and the scope of the public design and README.

### Documents, preservation and release boundaries

The actual rendered PDFs were reviewed page by page: **Capital 7, Financing 3, Horizon 2, Research 4 and Thesis 3**. The capital document contains the decision, exact offers, scenario allocations, regret and switching diagnostics, pricing interval, complete operating inputs, and reopening link. Each supplied HTML/PDF pair is hash-bound in the print receipt. Different analyst text can produce different pagination.

The new ZIP was created from an actual verified desktop handoff. CRC, deterministic entry metadata, exact membership, all copied source bytes and the recomputed complete capital record passed. Temporary execution confirmed that an existing destination is refused, verification changes no bytes or modification times, and altered output, wrong shortcuts or broken local links are rejected even when relevant manifest entries are updated. These local checks do not by themselves establish a native desktop copy.

The frozen model, Horizon, Financing and Ownership engines, presets, research register, original workbook, original nine-page financial-review PDF and all three earlier package ZIPs remain byte identical to the preceding published release. Historical workbook recalculation counts remain historical evidence; no native Microsoft Excel recalculation is added by this release.

The separate portfolio retains the concurrent public-file allowlist, staged manifest verification, navigation fallback and three other generated case studies. Its current [portfolio receipt](https://github.com/ult666666/ult666666.github.io/blob/main/docs/verification/capital-4.0-local.json) records 34 structural tests, the browser workflow and 56 navigation-resilience assertions. The new application capture is an actual 1440 × 1381 rendering.

### Reproduction

Use Node.js 24 and Python 3.11+ for the complete suite:

```sh
npm test
npm run build
python3 -B scripts/check_capital_reference.py --output /tmp/capital-reference.json
npm start
```

With the local server running, compare its complete asset inventory and API profile:

```sh
python3 -B scripts/verify_capital_http.py \
  --base-url http://127.0.0.1:4321 \
  --output /tmp/capital-http.json
```

The browser harnesses use an optional Playwright/Chromium development environment and are not application runtime dependencies. Hosted CI, production HTTPS, live browser journeys, native delivery and downloaded release hashes are observed after publication and recorded separately. Hashes bind evidence to reviewed bytes; they are not signatures or financial-audit opinions.

## Version 3.6 historical local verification

Application **3.6.0** adds Ownership Frontier within Financing Lens. Its one optional retained-starting-stake constraint is preserved by the complete financing API, schema-two links, JSON and standalone brief. The financial engine remains **3.0.0**, financing engine **1.0.0**, ownership method **1.0.0**, and valuation snapshot **18 October 2026**. The original workbook, reviewed financial PDF, operating engine, round engine, presets, research register and earlier ZIPs remain byte identical. The [local release record](verification/release-3.6-local.json) binds the current implementation and artifacts by hash.

| Verification layer | Result | Evidence |
| --- | --- | --- |
| Node financial, API, transport, presentation and release tests | **248 passed; 0 failed** | [Release gates](verification/release-3.6-local.json) |
| Ownership browser workflow | **77 assertions; 0 page errors** | [Ownership browser](verification/ownership-browser-3.6.json) |
| Existing Financing, research journey and Model workflow | **92 + 94 + 57 assertions; 0 page errors** | [Financing](verification/financing-browser-3.6.json), [Journey](verification/journey-browser-3.6.json), [Workbench](verification/workbench-browser-3.6.json) |
| Independent 100-share Decimal reference | **25 valid; 23 invalid JSON; 8 JavaScript-only rejections; 2,514 numerical and 10,418 structural comparisons** | [Numerical reference](verification/ownership-reference-3.6.json) |
| Local HTTP assets and complete responses | **98 requests passed** | [HTTP receipt](verification/http-local-3.6.json) |
| Printable outputs | **12 pages visually reviewed: Financing 3, Horizon 2, Thesis 3, Research 4** | [Independent review](verification/independent-review-3.6.json) |
| Versioned desktop archive | **39 members; 38 manifest-listed files** | [Archive](verification/desktop-archive-3.6.json), [Package verification](verification/desktop-verification-3.6.json) |

### Contract, precision and compatibility

The [ownership method](OWNERSHIP_FRONTIER.md) derives the capital limit from the maximum new share count consistent with retaining a chosen fraction of each starting stake. A fixed pre-money quote and a fixed post-money quote are distinct curves; increasing capital at fixed post-money lowers implied pre-money value. The selected 1–100% floor is a supported product input range, not a market convention or fundraising recommendation. The tracked holder can own zero without making the cohort constraint undefined.

An explicit comparison band handles a rounded threshold, with a strict exception for a 100% floor: any positive issuance breaches that floor. A positive ceiling below numerical resolution is not reported as a zero economic limit. Analytical ceilings beyond the capital input cap remain separately identified. The focused chart includes current and ceiling points when within its supported range, never samples a zero-pre-money post-money endpoint, and labels its truncated vertical axis.

The original financing calculation and schema-one payload are unchanged when the constraint is absent. The new UI defaults legacy links to a visible 90% floor while preserving every original case and round value. The schema-two payload validates its separate ownership version and exact fraction. Full-result API comparison checks the entire curve and metadata, and an edit invalidates completed or pending verification. An unmet constraint remains a valid analysis; invalid inputs clear stale results and disable exports.

### Visual, print and review scope

Native controls, keyboard range adjustment, complete text results and accessible SVG descriptions were checked at 320, 390, 768 and 1440 pixels. The real 975 × 612 landscape panel capture is used by the portfolio. The updated Financing brief has a third page for the exact ownership floor, curve, capital limit, basis interpretation, formula and reopening link. All four worked PDFs retain their dated financial assumptions and identify the current application version.

A separate agent authored the independent share-ledger reference and browser harness and reviewed all twelve rendered PDF pages. Its source-bound [review record](verification/independent-review-3.6.json) discloses that role and reports no unresolved findings within its scope. This is an AI-assisted engineering review, not an external financial or accessibility audit.

### Release gates and scope

The HTTP check compares **all 69 public files plus the root alias**, exact health metadata, **12 complete valid API responses**, and **15 exact rejection responses**. It includes legacy calls, both quote bases, unmet and 100% floors, input-cap and resolution boundaries, and malformed constraints. Source bytes and asset membership remained unchanged during the run. Local checks use loopback HTTP without a certificate override; the same verifier uses ordinary system certificate verification for subsequent HTTPS deployment checks.

`npm test`, the independent Python checks and `npm run build` remain required CI gates. The added ownership reference is included in CI. The build verified all six unchanged projections and staged all 69 public assets byte for byte. Native desktop delivery, GitHub publication and hosted browser/HTTPS observations are recorded separately after publishing; this local record does not claim those steps completed.

## Version 3.5 historical local verification

Application **3.5.0** adds Financing Lens within the existing Model: a hypothetical equity bridge, a separately entered primary-round price, ownership dilution, complete analysis transport and a shared browser/API result. It retains financial engine **3.0.0**, the **18 October 2026** valuation date and research cutoff **2026-10-18T09:22:26-07:00**. The financial engine, presets, company research register, original workbook and original financial-review PDF match the v3.4 bytes. The [local release record](verification/release-3.5-local.json) binds the implementation, checks and supplied artifacts to their SHA-256 hashes.

| Verification layer | Result | Evidence |
| --- | ---: | --- |
| Node financial, API, snapshot, presentation and release tests | **227 passed; 0 failed** | [Local gates and hashes](verification/release-3.5-local.json) |
| Financing Lens browser workflow | **92 assertions; 0 page errors** | [Financing browser](verification/financing-browser-3.5.json) |
| Connected research journey and Model regression | **94 + 57 assertions; 0 page errors** | [Journey](verification/journey-browser-3.5.json), [Workbench](verification/workbench-browser-3.5.json) |
| Independent Python financing calculation | **19 valid cases; 31 invalid/boundary cases; 3,591 numerical and 596 structural comparisons** | [Financing reference](verification/financing-reference-3.5.json) |
| Local HTTP assets and API consistency | **82 of 82 requests passed** | [HTTP receipt](verification/http-local-3.5.json) |
| Scoped second-agent presentation review | **Three findings closed** | [Review scope and reproductions](verification/independent-review-3.5.json) |
| Current printable examples | **Financing: 2 pages; Horizon: 2; Thesis: 3; Research: 4** | [Print review and PDF hashes](verification/release-3.5-local.json) |
| Versioned portable archive | **36 members; 35 manifest-listed files** | [Archive](verification/desktop-archive-3.5.json), [package checks](verification/desktop-verification-3.5.json) |

### Financial contract and independent arithmetic

The [Financing Lens method](FINANCING_LENS.md) distinguishes fixed-forecast operating EV, hypothetical modeled equity, entered round price and participating ownership. An explicit cash/debt/other-claims bridge is optional; an absent bridge stays absent. The independently entered round never replaces the operating model’s value. All primary proceeds remain cash, fees are zero, and economic rights are equal within the ownership pool. Secondary transfers, conversions, option-pool increases, preferences, debt repayment and future rounds are outside this simplified contract.

The independent reference uses **100 pre-round shares**, calculates the implied issue price and new shares, and derives ownership from that share ledger. It uses Python’s **80-digit Decimal arithmetic** and the separate Python FCFF implementation. It compares the complete output structure, retained-cash and equity identities, signed model-price gaps, all six presets, tiny-scale ratios, large permitted round amounts, zero-primary issuance and invalid boundaries. The maximum absolute difference in this bounded fixture set was approximately **1.0516 × 10⁻¹²**; the [receipt](verification/financing-reference-3.5.json) records the tolerances and source hashes. This verifies the declared calculation, not company forecasts or investment returns.

The worked example explicitly assumes a **$250B pre-money quote**, **$25B primary capital** and a **10% non-participating holder**. It gives a **$275B post-money price**, **9.09% new-investor ownership**, and **9.09% tracked ownership after issuance**. The quoted holder mark remains $25B at the assumed issue price. With assumed cash of $20B and debt of $5B, modeled equity moves from approximately $382.77B to $407.77B, while operating EV stays approximately $367.77B. The inputs are hypothetical and are not reconstructed company balances or transaction terms. [Exact worked inputs and result](../public/downloads/Frontier_AI_Financing_Lens.json).

### Browser behavior, transport and reviewed fixes

The three freshly run browser suites total **243 assertions**: 92 Financing, 94 connected-journey and 57 Model regression checks. This total excludes older releases’ browser runs. The two compatibility suites preserve contextual evidence, exact Thesis/Model return state, bridge-aware Casebook saves, existing exports and consistent navigation.

The source-bound Financing browser suite covers the worked example, pre/post quote interpretation, complete custom operating assumptions, explicit bridge on/off, signed nonpositive equity, invalid-input clearing, exact link reload, JSON and script-free HTML exports. Full-result API checks detect mismatches outside headline metrics and prevent an old response from marking a changed analysis as verified. API failure preserves a valid browser calculation. Responsive checks cover **320, 390, 768 and 1440px**, keyboard focus, and a no-JavaScript fallback. The run used local HTTP without a certificate override. [Named checks](verification/financing-browser-3.5.json).

Three presentation findings were closed: the brief now distinguishes a numerical-range percentage limit from nonpositive equity; large finite ratios format as percentages without overflowing during display scaling; and copying modeled equity into a round price first validates the complete proposed round against the same precision policy. Five focused presentation regressions and the real-browser precision-copy reproduction verify those changes. The reviewer authored the financing core and separately reviewed the root-authored presentation; the independent Python reference and browser suite were authored by a different agent. This is a scoped AI-assisted engineering review, not an external audit. [Review record](verification/independent-review-3.5.json).

The narrowest responsive check also found an existing two-column Model export-action grid wider than a 320px viewport. A narrow-breakpoint single-column layout resolves that overflow. The six navigation destinations retain their meanings. Financing-specific links and exports preserve the full operating case, bridge and round; existing scenario, Horizon, Thesis and Casebook formats retain their existing contracts.

### Printable artifacts, preserved originals and desktop package

All **eleven pages** across the four current worked PDFs were rendered to PNG and visually inspected. The supplied Financing example is two pages and contains the assumed terms, ownership, equity reconciliation, all thirteen exact operating assumptions, source links and a live reopening link. The other three examples are regenerated with application 3.5.0 metadata. Their financial inputs retain their prior values. The original reviewed five-sheet workbook and nine-page financial-review PDF retain their original bytes; no new native Excel recalculation claim is made. [Artifact hashes and print scope](verification/release-3.5-local.json).

The [new portable package](../public/downloads/Frontier_AI_Financing_Lens_Package.zip) contains **35 manifest-listed files plus the manifest**. It includes the new Financing HTML/PDF/JSON, actual interface preview and method, alongside the existing research outputs, workbook, evidence and shortcuts. The versioned destination is `Financing_Lens_V3_5_2026-10-19`. The builder refuses an existing destination; verification checks exact membership, hashes, opening links, shortcuts and the Financing/Horizon snapshot metadata. Prior release ZIPs and handoffs remain separate. [Package checks](verification/desktop-verification-3.5.json).

Local archive verification is separate from native desktop delivery. The published release receipt records any completed native copy and its preservation checks; it does not infer one from an archive or an available device. Browser/server agreement likewise verifies deployment consistency because they intentionally share the production calculation. The independent Python calculation supplies the separate arithmetic comparison.

### HTTP consistency and repeatable release gates

The bounded local HTTP probe passed **67 exact asset/root-alias checks**, **one health check**, **five complete Financing API responses** and **nine exact rejection responses**, totaling **82 requests**. It includes all 66 files in the public directory, the financing downloads and archive, pre/post-money interpretations, absent bridge, nonpositive residual, invalid precision, content type and request-size handling. Asset membership and source hashes remained unchanged during the run. This was local HTTP; the verifier keeps ordinary certificate verification enabled when used with HTTPS. It uses the local handler for full-response comparison and therefore establishes consistency, separately from independent arithmetic. [HTTP receipt](verification/http-local-3.5.json).

```sh
npm test
npm run build
python3 -B tests/reference_parity.py
python3 -B scripts/check_thesis_reference.py --output /tmp/thesis-reference.json
python3 -B scripts/check_horizon_reference.py --output /tmp/horizon-reference.json
python3 -B scripts/check_financing_reference.py --output /tmp/financing-reference.json
```

GitHub Actions runs all six gates. The local release receipt lists which checks were freshly run and their exact outputs; earlier release counts are not added to the current totals. Hosted CI, deployment identity, public HTTP and native delivery are recorded after publication and should be evaluated against the exact published commit.

## Version 3.4 historical local verification

The following section is retained from application **3.4.0**. Its use of “current” and its local publication/native-delivery status describe that historical collection point. The completed v3.4 publication evidence is available in the [v3.4 release assets](https://github.com/ult666666/frontier-ai-valuation-lab/releases/tag/v3.4.0).

Application **3.4.0** passed the local checks collected on **19 October 2026**. Value Horizon adds a finite-continuation lens, strict exact snapshots, standalone outputs and a shared browser/API calculation. Financial engine **3.0.0**, the **18 October 2026** valuation date and the frozen research cutoff **2026-10-18T09:22:26-07:00** remain unchanged. The engine, presets, research register, original workbook and original financial-review PDF match their reviewed v3.3 bytes. The [release record](verification/release-3.4-local.json) binds the current implementation and evidence to file-content SHA-256 hashes.

These are **local** results. They do not assert a production deployment, a successful native desktop copy or native Microsoft Excel recalculation. Later publication and production verification require a separately dated record.

| Verification layer | Current result | Evidence |
| --- | ---: | --- |
| Node financial, API, state, transport, brief and release tests | **198 passed; 0 failed** | [Named gates, logs and source hashes](verification/release-3.4-local.json) |
| Static staging build | **Passed; six projections checked** | [Build record](verification/release-3.4-local.json) |
| Four local Chromium suites | **384 assertions passed** | Suite reports below |
| Local HTTP consistency probe | **73 of 73 requests passed** | [HTTP report](verification/http-local-3.4.json) |
| Separate Python forward model | **36 valid and 73 invalid cases passed** | [Forward parity](verification/reference-parity-3.4.json) |
| Separate Python attribution and target calculations | **1,002 numerical comparisons passed** | [Thesis reference](verification/thesis-reference-3.4.json) |
| Separate Python Value Horizon reference | **39 ordinary scenarios; 165 total requests; 19,974 numerical comparisons; 8 Decimal boundary checks** | [Horizon reference](verification/horizon-reference-3.4.json) |
| Scoped AI-assisted engineering review | **Three findings closed; none confirmed open in scope** | [Review record](verification/independent-review-3.4.json) |
| Final printable examples | **Horizon: 2 pages; Thesis: 3 pages; Research: 4 pages** | [Print record and artifact hashes](verification/release-3.4-local.json) |
| Versioned desktop archive | **30 members; 29 manifest-listed files verified** | [Archive receipt](verification/desktop-archive-3.4.json), [package verification](verification/desktop-verification-3.4.json) |

### Value Horizon arithmetic and precision

The [Horizon method](VALUE_HORIZON.md) retains the complete explicit forecast through 2036 and the first selected annual continuation cash flows. It assigns zero later cash flow and zero residual after the cutoff. The original perpetual operating EV remains a separate reference. Explicit cash flows retain the existing actual-day discounting; continuation retains the model's equal-annual-period terminal convention.

The independent reference uses the separate Python FCFF engine, compensated term-by-term annual continuation sums and a linear whole-year search. The ordinary coverage comprises all six presets, nine named arithmetic/boundary cases and 24 seeded valid cases. The final run made **159 ordinary requests**; six additional precision fixtures bring the total to **165 requests**. It checked **3,939 curve points** and **19,974 numerical comparisons**, with absolute tolerance `1e-8` USD billions and relative tolerance `1e-10`. [Complete reference receipt](verification/horizon-reference-3.4.json).

The report records the scale of its errors instead of presenting a single small-dollar maximum. Its largest absolute difference was **$1,536B** on a deliberately extreme near-singularity excluded tail of approximately **$4.14 × 10¹⁸B**. The maximum relative error, normalized by at least one, was approximately **2.01 × 10⁻¹⁴**. This synthetic stress case passed the declared relative tolerance; it is not a company valuation or a statement of dollar accuracy at every scale. Ordinary preset values remain unchanged. [Error magnitudes and their fixture context](verification/horizon-reference-3.4.json).

Near a whole-year boundary, rounding a total EV can invent the first year reaching a target. The reviewed fixes compare retained PV with the remaining shortfall early in the curve, and the excluded tail with a compensated target gap near perpetuity. Conservative component-scaled guards return **`precision_limit`** when the year cannot be reliably reported at the implementation's floating-point precision. Capture thresholds and both sides of the 10,000-year search cap receive corresponding checks. This is a **conservative numerical policy, not a formal interval-arithmetic proof** or a claim that an exact-real-number solution does not exist.

The **eight 100-digit Decimal boundary checks** use exact binary input rates and the existing rounded explicit/terminal PV components to isolate the Horizon calculation. They independently identify the two target regression years as **414** and **69**, and the rounded 75% capture regression as **4**. Production now returns the explicit precision state for those cases. The fixtures also cover both sides of the search cap and a target copied from a rounded curve point. They supplement the ordinary reference rather than validating company forecasts. [Decimal evidence](verification/horizon-reference-3.4.json) and [separate review recheck](verification/independent-review-3.4.json).

The existing forward engine again passed **36 valid and 73 invalid cases**. The Thesis reference again passed **1,002 comparisons**, using full replacement-order enumeration and affine tax-segment roots. Browser/server agreement is a separate deployment-consistency check because production deliberately shares its engine; it is not the independent arithmetic reference. [Forward parity](verification/reference-parity-3.4.json), [Thesis reference](verification/thesis-reference-3.4.json).

### Browser behavior, exact transport and integration

The **384** current browser assertions are the sum of the four runs below. They are separate from the 198 Node tests and 73 HTTP requests. Earlier releases' larger or smaller browser totals remain historical; those assertions are not added to this total.

| Current local suite | Passed assertions | Recorded checklist |
| --- | ---: | --- |
| Value Horizon | 148 | [Horizon browser](verification/horizon-browser-3.4.json) |
| Connected research journey | 94 | [Journey](verification/journey-browser-3.4.json) |
| Research Casebook | 85 | [Casebook](verification/casebook-browser-3.4.json) |
| Workbench regression | 57 | [Workbench](verification/workbench-browser-3.4.json) |
| **Total** | **384** | |

Horizon coverage includes all company/preset choices, zero and 100-year cutoffs, target application, out-of-chart and search-bound outcomes, numerical precision states, negative and extreme valid values, invalid-input clearing, exact custom assumptions and hypothetical-bridge transport, script-free HTML and JSON exports, malformed-link preflight, contextual evidence and focus restoration. Responsive checks cover **320, 390, 768 and 1440px**. Full-result verification rejects a mismatch in an unselected curve point and prevents an old in-flight response from marking changed inputs as verified. An unavailable API leaves the current valid browser calculation available. [Horizon checklist](verification/horizon-browser-3.4.json).

The integration runs retain the exact Model/Thesis return context, saved-research behavior and the same six navigation destinations: Overview, Model, Thesis Lab, Value Horizon, Casebook and Evidence. All four current suites recorded no uncaught browser runtime errors. The journey harness reuses a legacy-named local output directory; its copied v3.4 report includes the current six-navigation assertions. These automated Chromium runs and scoped visual reviews do not certify every browser, physical device, assistive technology or simultaneous-editing pattern. [Aggregate suite scope and harness hashes](verification/release-3.4-local.json).

Horizon links preserve all thirteen operating inputs, optional bridge, years and target without writing display rounding back into the snapshot. The bridge is transported but excluded from operating EV. Horizon JSON remains a separate `frontier-value-horizon` analysis format; the Casebook continues to capture scenarios and thesis comparisons. Complete preflight validation happens before a shared snapshot replaces current work. [Method and transport contract](VALUE_HORIZON.md), [workspace guide](RESEARCH_WORKSPACE.md).

### Findings closed in the scoped review

The [independent review record](verification/independent-review-3.4.json) documents a separate AI-assisted engineering reviewer, concrete reproducers, numerical rechecks and reviewed source hashes. It is not an external financial audit or full-application certification.

| Finding | Verified resolution |
| --- | --- |
| Target/capture rounding could overstate the first whole-year result | Stable retained/tail comparisons and conservative precision states suppress unsupported year claims; ordinary presets and a large-terminal-PV ordinary target remain resolvable. |
| Hiding responsive line breaks joined adjacent words | Preserve separating whitespace; mobile headings and introductory sentences remain readable. |
| An invalid horizon followed by a case change retained a prior caption | Clear the capture, period, reconciliation and assumption captions with the numeric result, and hide the target legend while invalid. |

No additional confirmed finding remains open within that review scope. The separate Horizon print-layout correction is recorded with the printed artifacts below rather than counted as a fourth engineering-review finding.

### Printed examples, archive and preserved financial artifacts

The integration owner rendered and visually inspected every page of the final **two-page Horizon**, **three-page Thesis comparison** and **four-page Research brief**. The Horizon print layout was adjusted to remove a short overflow page while keeping the complete worked analysis. The reviewed examples have no clipping, overlap or orphan overflow pages. These counts describe the supplied examples; different user content can require more pages. [Print record and exact PDF hashes](verification/release-3.4-local.json).

The [Value Horizon package ZIP](../public/downloads/Frontier_AI_Value_Horizon_Package.zip) was built and verified locally. Its **30 members** comprise **29 manifest-listed files plus `SHA256_manifest.json`**. The new Horizon HTML/PDF/JSON, preview, methodology, opening pages and shortcuts accompany the previous workbook and research downloads. Archive CRC and all listed file hashes passed. [Archive receipt](verification/desktop-archive-3.4.json).

The desktop builder was also exercised in a temporary directory. It copied all old and new downloads exactly, refused an existing destination without changing it, retained an earlier handoff, and rejected deliberately altered bytes, a wrong shortcut with a matching hash and a broken local download link. Its `--verify` mode performs read-only package checks without a network request. **Direct delivery to the user's native desktop remains unconfirmed**: Remote Desktop Commander read-only probes did not complete. The verified archive and temporary package do not imply a native copy or launch. [Package verification](verification/desktop-verification-3.4.json), [desktop guide](DESKTOP_GUIDE.md).

The original five-sheet workbook and nine-page financial-review PDF retain their reviewed bytes. Their earlier **2,058 numerical comparisons**, **169 invalid-input/selector cases** and **435 formulas** remain historical artifact-runtime evidence; they are not new v3.4 checks. No native Microsoft Excel recalculation or chart-display result is added. The financial engine, presets and company research register also retain their frozen hashes. [Preserved snapshot](verification/release-3.4-local.json), [historical workbook checks](verification/workbook-checks.json), [workbook XML limits](verification/workbook-xml.json).

The company evidence remains the original 18 October snapshot: **21 facts**, **19 sources** and contextual mappings for **13 inputs per company**. Horizon method references were reviewed separately on 19 October. That method research does not refresh the company facts or establish the future growth, margin, WACC, returns or continuation period. Scenario labels and horizons carry no probability interpretation; operating EV remains distinct from financing equity value.

### HTTP scope, source binding and repeatable gates

The final local probe passed **57 asset requests**, **one health request**, **seven complete API-response comparisons** and **eight rejection checks**, totaling **73 requests**. It compared exact asset bytes and complete canonical JSON for attribution, landscape and five Horizon cases, including precision outcomes. All source hashes remained unchanged during the run and matched the collected working tree. The ordinary Node suite covers the other financial actions separately. This was local HTTP: the retained TLS-verification configuration flag does not establish that TLS was used. [HTTP receipt](verification/http-local-3.4.json).

The principal repeatable gates are:

```sh
npm test
npm run build
python3 -B tests/reference_parity.py
python3 -B scripts/check_thesis_reference.py --output /tmp/thesis-reference.json
python3 -B scripts/check_horizon_reference.py --output /tmp/horizon-reference.json
```

GitHub Actions is configured to run the new independent Horizon/precision-boundary verifier alongside the existing numerical checks and build. Configuration is not a claim that a hosted run has completed. Optional browser harnesses and the HTTP verifier are identified in the [release record](verification/release-3.4-local.json), with their current source hashes. Copied report paths are repository-relative. Evidence collection does not represent another suite run, and the aggregate receipt excludes itself from its receipt-hash list.

## Version 3.3 historical local verification

The following section is retained from application **3.3.0**. References to “current” within it describe that historical release. Its counts, source hashes and scope are preserved separately from the v3.4 results above.

Application **3.3.0** passed the local release checks recorded on **19 October 2026**. It retains financial engine **3.0.0**, the **18 October 2026** valuation date and the frozen research cutoff **2026-10-18T09:22:26-07:00**. The model, presets, research register, original workbook and original financial-review PDF match the reviewed v3.2 bytes. The [release record](verification/release-3.3-local.json) identifies the reviewed working-tree files and preserved artifacts with SHA-256 hashes; it is a local verification record rather than a production deployment claim.

| Verification layer | Current result | Evidence |
| --- | ---: | --- |
| Node model, analytics, API, state, evidence, brief and release tests | **172 passed; 0 failed** | [Named gates and source hashes](verification/release-3.3-local.json) |
| Static staging build | **Passed; six projections checked** | [Build record](verification/release-3.3-local.json) |
| Nine local Chromium suites | **527 assertions passed** | Suite reports below |
| Local HTTP consistency probe | **53 of 53 passed** | [HTTP report](verification/http-local-3.3.json) |
| Separate Python forward model | **36 valid and 73 invalid cases passed** | [Forward parity](verification/reference-parity-3.3.json) |
| Separate Python attribution and target calculations | **1,002 numerical comparisons passed** | [Thesis reference](verification/thesis-reference-3.3.json) |
| Scoped engineering review | **Six findings closed; none confirmed open in scope** | [Review record](verification/independent-review-3.3.json) |
| Printable examples | **Three-page Thesis PDF; four-page Research PDF** | [Thesis comparison](../public/downloads/Frontier_AI_Thesis_Comparison.pdf), [Research brief](../public/downloads/Frontier_AI_Research_Brief.pdf) |

### Research workflow and persistence

The new checks exercise the full compare → explain → inspect → record journey. Inspecting either side of a comparison carries the other case, both separate bridge settings, the target and the exact axes. Returning replaces only the inspected side after validation. An exact solved target margin is applied at full precision. Saved-scenario restoration resets an unrelated bridge, and an enabled incomplete bridge prevents saving or reopening. [Journey report](verification/journey-browser-3.3.json).

Casebook coverage includes strict schema and snapshot validation, all 13 exact inputs, both complete comparison cases, immutable calculation tokens during metadata edits, known source IDs, bounded plain-text notes, malformed and oversized imports, duplicate skipping, ID-conflict preservation, capacity handling and explicit legacy migration. Corrupt or blocked storage does not become an empty successful save. Quota failures preserve prior data; valid unsaved notes can still be exported, including when another view removed the original entry. JSON and script-free brief exports preserve those notes without submitting them to the calculation API. [Casebook report](verification/casebook-browser-3.3.json) and [review record](verification/independent-review-3.3.json).

Real held Web Locks exposed and now test delayed saves. A target or bridge-only edit made while storage is pending remains visible, while the stored token retains the earlier captured values. The completion message explicitly identifies later edits as unsaved. Copying an unchanged calculation during the same wait still receives the normal current-save message. Storage writers reread the saved book before mutation; Web Locks serialize cooperating writers where available. The fallback serializes writers within one document and makes no cross-tab transaction or version-history promise. [Pending-save report](verification/save-race-browser-3.3.json).

### Independent numerical checks

The separate Python forward engine again passed **36 valid and 73 invalid cases**, comparing every annual field and terminal output at relative tolerance `1e-10` and absolute tolerance `1e-8` USD billions. Its independent constant-growth fixture gives **$200.31471864537804B EV**. This is a current rerun of the preserved financial engine. [Forward parity report](verification/reference-parity-3.3.json).

The current Python Thesis reference checks use full replacement-order enumeration and affine margin segments across tax thresholds, independent of the production weighted-subset attribution and bisection solver. The run covers 18 ordered preset pairs, 10 edited pairs, two correctly unavailable overflowing-hybrid pairs, **20,160 replacement orders**, **120,960 marginal steps**, 390 direct grid cells and 80 target-frontier entries. All **1,002 numerical comparisons** passed. Maximum absolute differences were `1.82e-12` USD billions for EV, `4.55e-13` USD billions for a group contribution, and `6.66e-16` for recovered margin. The report records exact tolerances, deterministic fixture hashes and the loaded source hashes. These numerical checks do not establish scenario probabilities or forecast credibility. [Thesis reference report](verification/thesis-reference-3.3.json).

### Browser interaction and visual coverage

The **527** total is the sum of assertions in the following nine local Chromium runs; it is separate from the **172** Node tests and **53** HTTP probe requests.

| Suite | Passed assertions | Recorded checklist |
| --- | ---: | --- |
| Workbench regression | 57 | [Workbench](verification/workbench-browser-3.3.json) |
| Thesis Lab | 79 | [Thesis](verification/thesis-browser-3.3.json) |
| Workbench / Thesis entry and return | 14 | [Entry and return](verification/thesis-entry-browser-3.3.json) |
| Guided comparison and stress experience | 75 | [Experience](verification/experience-browser-3.3.json) |
| Scenario sharing and standalone briefing | 75 | [Portability](verification/portability-browser-3.3.json) |
| Connected research journey | 94 | [Journey](verification/journey-browser-3.3.json) |
| Research Casebook | 85 | [Casebook](verification/casebook-browser-3.3.json) |
| Contextual evidence component | 32 | [Evidence](verification/evidence-browser-3.3.json) |
| Pending-save continuity | 16 | [Save races](verification/save-race-browser-3.3.json) |
| **Total** | **527** | |

The combined coverage includes 360, 390, 768 and 1440px layouts; 200% zoom in the suites that explicitly exercise it; reduced motion; native dialog focus and Escape; actual source destinations; exact URL and JSON restoration; negative and invalid states; complete API-response mismatch detection; stale-request cancellation; and storage/import failure handling. Actual desktop and mobile captures were visually inspected. Eight suites collect browser runtime errors and recorded none. The focused 32-assertion evidence component harness records assertions without a separate `pageerror` collector; its integrated journeys have their own error collection. [Aggregate scope](verification/release-3.3-local.json).

These are automated Chromium and scoped visual checks. They do not certify every browser, physical mobile device, assistive technology or simultaneous editing pattern. Artifact paths in the copied JSON reports are repository-relative; ignored `qa-local` screenshots and intermediate downloads describe local run outputs rather than additional release downloads. The checked-in optional harnesses can target a running local app or another permitted host through `FRONTIER_BASE_URL`; optional Playwright/browser paths are development configuration, not application runtime dependencies. [Suite commands and hashes](verification/release-3.3-local.json).

### Findings closed during the v3.3 review

The [review record](verification/independent-review-3.3.json) documents scoped AI-assisted engineering peer review, read-only cross-component inspection and focused reproducers. It is not an external financial audit or a claim that every possible defect was found.

| Finding | Verified resolution |
| --- | --- |
| Source-date qualifiers disappeared or became unavailable | Preserve complete publication, update and retrieval labels; compare all 19 Casebook source labels with the frozen register. |
| Published Base arithmetic could be read as describing every selected case | Identify the published Base context explicitly and display the actual reference and alternative inputs separately. |
| Explicit evidence Close could bubble into the opener handler | Restrict delegated opening to the trigger button; verify Close, Escape and restored focus. |
| Pending save could show a current-save success after a later edit | Compare the captured calculation with the current draft after persistence and identify unsaved current edits. |
| A remapped legacy record could be duplicated after notes changed | Recognize its immutable token and creation time; repeating migration preserves both records and causes no extra write. |
| Research PDF produced two short overflow pages | Tighten print spacing with unchanged type sizes, retaining complete notes and source records on four purposeful pages. |

No confirmed finding remains open in this reviewed scope. The finding record identifies the relevant implementation, regression evidence and reviewed file hashes. [Review evidence](verification/independent-review-3.3.json).

### Printed examples, workbook and research limits

Every page of the refreshed **three-page Thesis comparison** and **four-page Research brief** was rendered and visually inspected. The reviewed examples have no clipping, overlap or orphan overflow pages. The Research brief retains the full argument, exact inputs, annual cash-flow path, complete target context, source dates and limitations, and the exact calculation reopening link. Longer user notes or more selected sources can legitimately produce additional pages. [Print record](verification/release-3.3-local.json).

The original nine-page financial-review PDF and five-sheet workbook retain their reviewed bytes. Their historical verification is still explicitly historical: **2,058 numerical comparisons**, **169 invalid-input/scenario-selector cases**, and **435 formulas** were checked in the artifact authoring runtime. No native Microsoft Excel recalculation or native Excel chart-display result was added by v3.3. Desktop package contents and launch links are separate delivery checks and do not establish native Excel behavior. [Preserved hashes](verification/release-3.3-local.json), [workbook checks](verification/workbook-checks.json) and [workbook XML limits](verification/workbook-xml.json).

The evidence adapter joins **21 frozen facts** to **19 sources** and maps context to **13 inputs per company**. Observation periods, publication dates, update/retrieval qualifiers and source limitations remain distinct. This release did not perform a live company-data refresh. Annualized pace is not a full-year actual, reported commitments are not a payment schedule, selected growth and margin inputs remain assumptions, and a financing equity value is a different basis from operating EV. [Evidence contract](EVIDENCE_CONTEXT.md) and [dated release record](verification/release-3.3-local.json).

### Local HTTP scope and repeatable gates

The current local probe passed **46 asset requests**, **one health request**, **two complete API-response comparisons** (`attribute` and `landscape`) and **four rejection checks**, totaling **53**. It compared exact asset bytes and complete canonical JSON results. All eight API actions are covered separately in the ordinary Node/HTTP suite. The source hashes matched the working-tree files when these records were collected. The local probe used HTTP, so its retained TLS configuration flag is not evidence of a TLS connection. Use separately dated production records for production results. [HTTP report](verification/http-local-3.3.json).

The main repeatable local gates are:

```sh
npm test
npm run build
python3 -B tests/reference_parity.py
python3 -B scripts/check_thesis_reference.py --output qa-local/thesis-reference-rerun.json
```

The browser harness names and SHA-256 hashes are listed per suite in the [release record](verification/release-3.3-local.json). The evidence component's focused local review harness is identified as a local review aid; the committed evidence module tests and connected-journey harness supply repeatable repository checks. Casebook notes use browser storage and portable files; they do not create a paid service or persisted server backend.

## Version 3.2 historical verification

The following retained record was prepared for application **3.2.0**. Its counts are the results of that release, and its version 3.0 deployment subsection is older deployment history. Current v3.4 verification and the historical v3.3 record appear above; historical verification files have not been overwritten.

This record distinguishes calculation checks, application interaction and deployment checks. Application 3.2.0 uses the unchanged financial engine 3.0.0 and 18 October 2026 research snapshot. A passing test establishes its stated behavior, not the completeness of private-company information.

### Financial model and HTTP API

`npm test` passed **119 tests** across financial regressions, shared analytics, real HTTP API actions, share encoding, standalone brief fidelity and release-asset checks. The original financial checks cover actual-date discounting, reinvestment, tax losses, negative continuation EV, accounting invariance, hypothetical equity bridges, invalid inputs, multiple reverse solutions and tangent roots. API tests exercise actual local HTTP requests, malformed payloads, the body-size limit, method/path boundaries and all eight server actions.

The new analytics tests distinguish first positive annual FCFF, sustained positive annual FCFF and cumulative recovery. They check signed composition, immutable paired transforms, explicit shock units and bounds, input rejection without clipping, independent fixture constants, invalid numeric ranges and undefined relative changes for nonpositive base EV. Share tests preserve all 13 full-precision inputs and the hypothetical bridge, reject incompatible model dates/versions and validate the full projection before restoration. Brief tests check current calculations, signed values, source escaping, safe URLs and script-free standalone output.

The independent constant-growth fixture returns **$200.31471864537804B EV**. It is derived separately from the company presets.

`python3 -B tests/reference_parity.py` passed **36 valid and 73 invalid cases**. Every annual forecast field and terminal output is compared with the separate Python implementation, at relative tolerance `1e-10` and absolute tolerance `1e-8` USD billions. The recorded result is in [reference-parity.json](verification/reference-parity.json).

An optional numerical exercise, `node scripts/check_reverse_stress.mjs`, recovered **11,203 supported positive forward targets** from 20,000 deterministic sampled scenarios. It found no missed known roots within `1e-6` early growth. See [reverse-stress.json](verification/reverse-stress.json). The core solver regression fixtures run in ordinary CI; the large exercise is supplementary evidence.

### Thesis Lab calculation and independent review

The new Node tests cover all 36 ordered pairs of the six presets, all 64 attribution combinations, an independent 720-order oracle, swapped and identical cases, isolated groups, equal EVs with offsetting contributions, negative EV and nonfinite endpoint/hybrid failures. Landscape checks cover direct model values, matrix orientation, invalid cells, axis bounds, tax kinks, exact endpoints, out-of-window targets and very small numerical scales. Comparison links preserve exact inputs, bridges and axes; script-free brief tests verify current forecasts, reconciliation, safe links and finite extreme percentage display.

`python3 -B scripts/check_thesis_reference.py --output /tmp/thesis-reference.json` passed independently against the separate Python FCFF engine. Python enumerates permutations instead of JavaScript's weighted subsets, and solves affine margin segments across tax thresholds instead of using the production bisection routine. The [reference report](verification/thesis-reference.json) binds the tested source files and deterministic fixtures to SHA-256 hashes.

| Independent coverage | Observed result |
| --- | ---: |
| Ordered preset comparisons / edited comparisons | 18 / 10 |
| Finite endpoints with overflowing hybrids | 2, correctly unavailable |
| Replacement orders / marginal steps | 20,160 / 120,960 |
| Direct grid cells | 390: 341 valid, 49 invalid |
| Target-frontier entries | 80: 37 solved, 25 above range, 5 below range, 13 invalid |
| Numerical comparisons | 1,002, all passed |
| Maximum EV difference | 1.82 × 10⁻¹² USD billions |
| Maximum group-contribution difference | 4.55 × 10⁻¹³ USD billions |
| Maximum recovered margin difference | 6.66 × 10⁻¹⁶ |

Monetary comparison tolerances are absolute `1e-8` USD billions plus relative `2e-11`; recovered margins use absolute `2e-9`. Independent target revaluation uses absolute `1e-6` USD billions plus relative `2e-9`. Passing these deterministic cases does not establish forecast accuracy or scenario probabilities.

The [independent review record](verification/thesis-review.json) documents four resolved defects: extreme percentage display, comparison validation before import mutation, mobile axis-label alignment, and stale screen-reader announcements after invalid input. The reviewer verified the two final UI fixes with focused Chromium reproducers. No confirmed finding remains open in that reviewed scope.

### Browser interaction and layout

Thesis Lab passed **78 Chromium checks**, recorded in [thesis-browser.json](verification/thesis-browser.json). Coverage includes complete two-case payloads, precise import and sharing, full annual-row API mismatch detection, stale requests, negative/invalid states, editable windows, target and point application, keyboard selection, presenter mode, reduced motion and 360/390/768/1440px layouts. A 200% zoom check found no horizontal page overflow. The optional harness is `node tests/thesis-browser.mjs`.

The separate [entry-and-return smoke](verification/thesis-entry-browser.json) passed **14 checks** using the actual new workbench button. A high-precision custom OpenAI case and hypothetical bridge survive the full workbench → Thesis Lab → shared comparison → downloaded brief → original workbench journey. It verifies both full analyses on the real API. Run `node tests/thesis-entry-browser.mjs`; this also accepts `FRONTIER_QA_OUTPUT` and can target a deployment. Browser certificate verification is enabled by default; any explicit testing override is recorded.

The three existing browser harnesses below were rerun for this release: **207 checks passed**. Together with the new two harnesses, the release has **299 browser checks**. These are local Chromium results, not a claim about every browser or assistive technology. Actual desktop, mobile, presenter and portfolio captures were visually inspected. The comparison example PDF prints to **three A4 pages**; every page was reviewed for clipping, overlap and readable tables. The supplied [PDF](../public/downloads/Frontier_AI_Thesis_Comparison.pdf) and [standalone HTML](../public/downloads/Frontier_AI_Thesis_Comparison.html) describe their own exact sample window and carry the current application version.

The guided comparison and stress experience was rechecked with application 3.2 and passed **75 Chromium checks**, with no runtime errors and no horizontal page overflow at **360, 390, 768 and 1440 pixels**. The [experience checklist](verification/experience-browser.json) covers exact model points, signed FCFF geometry, value-component reconciliation, terminal shares above 100%, nonpositive EV, native year keyboard input, chapter keyboard navigation, all four shocks, server agreement, complete-result mismatch detection, stale-response cancellation, unavailable API fallback and exact stressed-case handoff. Reduced-motion behavior was tested. Actual desktop/tablet/mobile screenshots were inspected; a separate reviewer found and prompted a contrast improvement in the nonterminal bars.

Run the optional new experience harness against the started app with `node tests/experience-browser.mjs`. It accepts the same Playwright/browser environment options as the original harness.

The separate sharing and briefing harness passed **75 checks** with no runtime errors. The [portability checklist](verification/portability-browser.json) records exact 13-input restoration in a fresh context, bridge preservation, high-precision and near-singular but finite values, invalid-projection rejection before mutation, newer URL fragments during asynchronous loading, stale clipboard feedback cancellation, manual-copy fallback and responsive layouts. Its standalone custom OpenAI brief printed to three A4 pages; all three rendered pages were inspected without clipping. Run `node tests/portability-browser.mjs` with the same optional browser configuration. These browser checks are separate from the 119 ordinary Node/HTTP tests.

The original calculator regression was rerun after integration: **57 checks passed** in Chromium, with no browser runtime exceptions. The recorded checklist is [browser-checks.json](verification/browser-checks.json). The checks include:

- Default and edited scenarios, percentage conversion, company/case switching and exact reset.
- Blank, singular, out-of-range and nonfinite input handling without stale results or exports.
- Negative EV and FCFF below the chart's zero axis.
- Current JSON/CSV data, full source provenance, local save/load and reload persistence.
- Reverse DCF solved, unreachable and multiple-solution outcomes.
- Hypothetical equity arithmetic and incomplete-bridge handling.
- Real API consistency, deliberately mismatched output, and an edit during an in-flight server request.
- Static hosting beneath a repository subpath with an unavailable API.
- Input labels, keyboard tab navigation, and 1440px / 390px layouts without page overflow.

The reusable harness is `tests/browser-smoke.mjs`. It is optional and separate from the dependency-free application runtime. Start `npm start`, install Playwright in a development environment, install its Chromium browser, then run:

```sh
node tests/browser-smoke.mjs
```

`FRONTIER_BASE_URL` can point to a deployment. `FRONTIER_PLAYWRIGHT_MODULE` can identify a separately installed Playwright package; `FRONTIER_CHROMIUM_EXECUTABLE` can select an available test browser. The harness writes ignored QA outputs and refreshes the README demo screenshot. It uses synthetic local scenario names and never needs account credentials.

### Report and workbook

The application 3.2 release preserves the exact reviewed workbook and nine-page PDF bytes. Their earlier authoring verification remains applicable; they were not regenerated for this presentation update.

The nine-page PDF was rendered and every page visually inspected for clipping, overlap, missing glyphs and table readability. The HTML and PDF share one content builder and consume the same dated model result snapshot. The report exposes source links, assumptions, cash-flow reconciliation, terminal diagnostics and review findings.

The five-sheet workbook passed **2,058 numerical comparisons** across six presets and six independently calculated edited cases, plus **169 invalid-input and scenario-selector cases**. Its **435 formulas** were exported and reimported with matching Base EVs. Evidence is in [workbook-checks.json](verification/workbook-checks.json). Formula consistency and invalid-input rejection are different checks; neither is replaced by a PASS label driven only by an arithmetic identity. Recalculation used the artifact authoring runtime; a native Microsoft Excel calculation was not performed. Sensitivity and reverse DCF remain in the application, rather than an approximate worksheet solver.

Read-only inspection confirms every saved formula cache, 19 source URLs and native chart bindings. The exporter omits separate chart point caches; the chart's worksheet references and rendered values were checked, but its display in native Excel was not. The [XML record](verification/workbook-xml.json) states this limit explicitly. Source URLs are readable text, avoiding unsupported hyperlink-formula caches.

### Deployment policy

GitHub Actions runs financial/API/release checks, independent Python forward-model parity, independent attribution/frontier checks, and the static staging build. Vercel runs the model/API/release test suite before building its public output. The runtime needs no secrets or paid data services. `scripts/verify_thesis_http.py` checks actual HTTP routes, complete submitted API results, errors and reviewed asset hashes with ordinary TLS verification. Production verification additionally requests the public page, health route, submitted valuation, errors and downloads; the deployed commit and outcome are recorded in the release notes.

### Version 3.0 published deployment record

The initial production deployment of application commit `22249b2481474c8823778cc7b35d7b834858761a` reached **READY** at [frontier-ai-valuation-lab.vercel.app](https://frontier-ai-valuation-lab.vercel.app/). Its [GitHub check run](https://github.com/ult666666/frontier-ai-valuation-lab/actions/runs/39148130450) completed successfully.

Anonymous HTTP checks passed for the page, model metadata, health route, HTML report and both downloads. The production API returned the independent fixture's expected EV and rejected negative capital turns with HTTP 400. Downloaded XLSX and PDF bytes matched the reviewed files; deployed JavaScript, presets and research JSON matched their source hashes. See [production-http.json](verification/production-http.json).

The production browser smoke passed edited-scenario/server agreement, JSON provenance, workbook download, source navigation, the report and both desktop/mobile layouts, with no functional console or CSP errors. The temporary browser required an execution-proxy certificate override; the ordinary system TLS client independently validated the connection. This bounded test condition is preserved in [production-browser.json](verification/production-browser.json).

The existing portfolio's [deployment check](https://github.com/ult666666/ult666666.github.io/actions/runs/39152343444) also completed successfully, and the public homepage and new fintech case study returned HTTP 200. Closing documentation updates do not alter the reviewed application or workbook bytes.
