# Release verification

This record distinguishes calculation checks, application interaction and deployment checks. A passing test establishes its stated behavior, not the completeness of private-company information.

## Financial model and HTTP API

`npm test` passed **22 tests** across the financial regression suite, real HTTP API tests and release-asset checks. It covers actual-date discounting, reinvestment, tax losses, negative continuation EV, accounting invariance, hypothetical equity bridges, invalid inputs, multiple reverse solutions and tangent roots. API tests exercise actual local HTTP requests, malformed payloads, the body-size limit, method/path boundaries and server valuation, inverse and sensitivity actions.

The independent constant-growth fixture returns **$200.31471864537804B EV**. It is derived separately from the company presets.

`python3 -B tests/reference_parity.py` passed **36 valid and 73 invalid cases**. Every annual forecast field and terminal output is compared with the separate Python implementation, at relative tolerance `1e-10` and absolute tolerance `1e-8` USD billions. The recorded result is in [reference-parity.json](verification/reference-parity.json).

An optional numerical exercise, `node scripts/check_reverse_stress.mjs`, recovered **11,203 supported positive forward targets** from 20,000 deterministic sampled scenarios. It found no missed known roots within `1e-6` early growth. See [reverse-stress.json](verification/reverse-stress.json). The core solver regression fixtures run in ordinary CI; the large exercise is supplementary evidence.

## Browser interaction and layout

**57 checks passed** in Chromium, with no browser runtime exceptions. The recorded checklist is [browser-checks.json](verification/browser-checks.json). The checks include:

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

The nine-page PDF was rendered and every page visually inspected for clipping, overlap, missing glyphs and table readability. The HTML and PDF share one content builder and consume the same dated model result snapshot. The report exposes source links, assumptions, cash-flow reconciliation, terminal diagnostics and review findings.

The five-sheet workbook passed **2,058 numerical comparisons** across six presets and six independently calculated edited cases, plus **169 invalid-input and scenario-selector cases**. Its **435 formulas** were exported and reimported with matching Base EVs. Evidence is in [workbook-checks.json](verification/workbook-checks.json). Formula consistency and invalid-input rejection are different checks; neither is replaced by a PASS label driven only by an arithmetic identity. Recalculation used the artifact authoring runtime; a native Microsoft Excel calculation was not performed. Sensitivity and reverse DCF remain in the application, rather than an approximate worksheet solver.

## Deployment policy

GitHub Actions runs financial/API/release checks, independent Python parity and the static staging build. Vercel runs the model/API/release test suite before building its public output. The runtime needs no secrets or paid data services. Production verification additionally requests the public page, health route, submitted valuation, errors and downloads; the deployed commit and outcome are recorded in the release notes.
