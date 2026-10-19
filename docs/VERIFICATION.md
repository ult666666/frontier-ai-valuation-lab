# Release verification

This record distinguishes calculation checks, application interaction and deployment checks. Application 3.1.0 uses the unchanged financial engine 3.0.0 and 18 October 2026 research snapshot. A passing test establishes its stated behavior, not the completeness of private-company information.

## Financial model and HTTP API

`npm test` passed **63 tests** across financial regressions, shared analytics, real HTTP API actions, share encoding, standalone brief fidelity and release-asset checks. The original financial checks cover actual-date discounting, reinvestment, tax losses, negative continuation EV, accounting invariance, hypothetical equity bridges, invalid inputs, multiple reverse solutions and tangent roots. API tests exercise actual local HTTP requests, malformed payloads, the body-size limit, method/path boundaries and all six server actions.

The new analytics tests distinguish first positive annual FCFF, sustained positive annual FCFF and cumulative recovery. They check signed composition, immutable paired transforms, explicit shock units and bounds, input rejection without clipping, independent fixture constants, invalid numeric ranges and undefined relative changes for nonpositive base EV. Share tests preserve all 13 full-precision inputs and the hypothetical bridge, reject incompatible model dates/versions and validate the full projection before restoration. Brief tests check current calculations, signed values, source escaping, safe URLs and script-free standalone output.

The independent constant-growth fixture returns **$200.31471864537804B EV**. It is derived separately from the company presets.

`python3 -B tests/reference_parity.py` passed **36 valid and 73 invalid cases**. Every annual forecast field and terminal output is compared with the separate Python implementation, at relative tolerance `1e-10` and absolute tolerance `1e-8` USD billions. The recorded result is in [reference-parity.json](verification/reference-parity.json).

An optional numerical exercise, `node scripts/check_reverse_stress.mjs`, recovered **11,203 supported positive forward targets** from 20,000 deterministic sampled scenarios. It found no missed known roots within `1e-6` early growth. See [reverse-stress.json](verification/reverse-stress.json). The core solver regression fixtures run in ordinary CI; the large exercise is supplementary evidence.

## Browser interaction and layout

The application 3.1 guided comparison and stress experience passed **75 Chromium checks**, with no runtime errors and no horizontal page overflow at **360, 390, 768 and 1440 pixels**. The [experience checklist](verification/experience-browser.json) covers exact model points, signed FCFF geometry, value-component reconciliation, terminal shares above 100%, nonpositive EV, native year keyboard input, chapter keyboard navigation, all four shocks, server agreement, complete-result mismatch detection, stale-response cancellation, unavailable API fallback and exact stressed-case handoff. Reduced-motion behavior was tested. Actual desktop/tablet/mobile screenshots were inspected; a separate reviewer found and prompted a contrast improvement in the nonterminal bars.

Run the optional new experience harness against the started app with `node tests/experience-browser.mjs`. It accepts the same Playwright/browser environment options as the original harness.

The separate sharing and briefing harness passed **75 checks** with no runtime errors. The [portability checklist](verification/portability-browser.json) records exact 13-input restoration in a fresh context, bridge preservation, high-precision and near-singular but finite values, invalid-projection rejection before mutation, newer URL fragments during asynchronous loading, stale clipboard feedback cancellation, manual-copy fallback and responsive layouts. Its standalone custom OpenAI brief printed to three A4 pages; all three rendered pages were inspected without clipping. Run `node tests/portability-browser.mjs` with the same optional browser configuration. These browser checks are separate from the 63 ordinary Node/HTTP tests.

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

## Report and workbook

The application 3.1 release preserves the exact reviewed workbook and PDF bytes. Their earlier authoring verification remains applicable; they were not regenerated for this presentation update.

The nine-page PDF was rendered and every page visually inspected for clipping, overlap, missing glyphs and table readability. The HTML and PDF share one content builder and consume the same dated model result snapshot. The report exposes source links, assumptions, cash-flow reconciliation, terminal diagnostics and review findings.

The five-sheet workbook passed **2,058 numerical comparisons** across six presets and six independently calculated edited cases, plus **169 invalid-input and scenario-selector cases**. Its **435 formulas** were exported and reimported with matching Base EVs. Evidence is in [workbook-checks.json](verification/workbook-checks.json). Formula consistency and invalid-input rejection are different checks; neither is replaced by a PASS label driven only by an arithmetic identity. Recalculation used the artifact authoring runtime; a native Microsoft Excel calculation was not performed. Sensitivity and reverse DCF remain in the application, rather than an approximate worksheet solver.

Read-only inspection confirms every saved formula cache, 19 source URLs and native chart bindings. The exporter omits separate chart point caches; the chart's worksheet references and rendered values were checked, but its display in native Excel was not. The [XML record](verification/workbook-xml.json) states this limit explicitly. Source URLs are readable text, avoiding unsupported hyperlink-formula caches.

## Deployment policy

GitHub Actions runs financial/API/release checks, independent Python parity and the static staging build. Vercel runs the model/API/release test suite before building its public output. The runtime needs no secrets or paid data services. Production verification additionally requests the public page, health route, submitted valuation, errors and downloads; the deployed commit and outcome are recorded in the release notes.

## Version 3.0 published deployment record

The initial production deployment of application commit `22249b2481474c8823778cc7b35d7b834858761a` reached **READY** at [frontier-ai-valuation-lab.vercel.app](https://frontier-ai-valuation-lab.vercel.app/). Its [GitHub check run](https://github.com/ult666666/frontier-ai-valuation-lab/actions/runs/39148130450) completed successfully.

Anonymous HTTP checks passed for the page, model metadata, health route, HTML report and both downloads. The production API returned the independent fixture's expected EV and rejected negative capital turns with HTTP 400. Downloaded XLSX and PDF bytes matched the reviewed files; deployed JavaScript, presets and research JSON matched their source hashes. See [production-http.json](verification/production-http.json).

The production browser smoke passed edited-scenario/server agreement, JSON provenance, workbook download, source navigation, the report and both desktop/mobile layouts, with no functional console or CSP errors. The temporary browser required an execution-proxy certificate override; the ordinary system TLS client independently validated the connection. This bounded test condition is preserved in [production-browser.json](verification/production-browser.json).

The existing portfolio's [deployment check](https://github.com/ult666666/ult666666.github.io/actions/runs/39152343444) also completed successfully, and the public homepage and new fintech case study returned HTTP 200. Closing documentation updates do not alter the reviewed application or workbook bytes.
