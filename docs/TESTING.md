# Testing

Every check below runs from the repository root with Node.js 24 and Python 3.11 or newer. None needs network access, an account or an API key. Dated results for each release are in the [verification record](VERIFICATION.md).

## Node tests

```sh
npm test
```

`npm test` runs the 404 tests in `tests/*.test.js` with the Node test runner. They cover the FCFF engine, every API action over real HTTP, share links and records, the briefs, the Monte Carlo layer, and the page conventions in [`tests/presentation.test.js`](../tests/presentation.test.js). [`tests/release.test.js`](../tests/release.test.js) rebuilds the committed capital, financing and Value Horizon downloads in `public/downloads/` and fails if they differ from the files.

`npm run build` then copies the public site to `dist/` and checks that the six presets still project.

## Python reference checks

Each script recomputes one part of the application with separate arithmetic (Python `Decimal` and `Fraction`, share ledgers, annual summation) and compares the result with the JavaScript output. CI runs all seven.

```sh
python3 -B tests/reference_parity.py
python3 -B scripts/check_thesis_reference.py --output /tmp/thesis-reference.json
python3 -B scripts/check_horizon_reference.py --output /tmp/horizon-reference.json
python3 -B scripts/check_ownership_reference.py --output /tmp/ownership-reference.json
python3 -B scripts/check_financing_reference.py --output /tmp/financing-reference.json
python3 -B scripts/check_capital_reference.py --output /tmp/capital-reference.json
python3 -B scripts/check_uncertainty_reference.py --output /tmp/uncertainty-reference.json
```

| Script | What it checks |
| --- | --- |
| `tests/reference_parity.py` | The FCFF engine and API against a separate Python DCF |
| `check_thesis_reference.py` | Grouped Shapley attribution and the target margin frontier |
| `check_horizon_reference.py` | Finite continuation by annual summation and linear search |
| `check_ownership_reference.py` | The ownership limit with a share ledger |
| `check_financing_reference.py` | One primary round with an 80-digit share-count ledger |
| `check_capital_reference.py` | Capital Strategy Studio with `Decimal` cash flows and `Fraction` shares |
| `check_uncertainty_reference.py` | The generator, normal functions, copula, percentiles and tornado |

The Python checks call the `node` on the path, or `FRONTIER_NODE` when it is set.

## Browser suites

Thirteen Playwright scripts drive the real pages against a running server. Playwright is a test tool only; the app has no runtime dependencies.

```sh
PORT=4321 npm start &
FRONTIER_BASE_URL=http://127.0.0.1:4321/ node tests/capital-browser.mjs
```

They load the standard `playwright` package and its Chromium unless `FRONTIER_PLAYWRIGHT_MODULE` or `FRONTIER_CHROMIUM_EXECUTABLE` point elsewhere. Screenshots and JSON reports go to the ignored `qa-local/` folder, except that `tests/browser-smoke.mjs` also refreshes [`docs/demo-desktop.png`](demo-desktop.png).

| Suite | Covers |
| --- | --- |
| `browser-smoke.mjs` | The Model: edits, exports, reverse DCF, the equity bridge, sources and a phone layout |
| `experience-browser.mjs` | The Overview comparison, stress test, keyboard tabs and layouts from 360 to 1440 px |
| `capital-browser.mjs` | The worked decision, objective previews, sharing, import, server checks and layouts |
| `financing-browser.mjs` | The equity bridge and funding round against the real API |
| `ownership-browser.mjs` | The ownership limit, its chart and exact state transport |
| `uncertainty-browser.mjs` | The Monte Carlo panel, its table equivalents, and byte-identical browser and API results |
| `horizon-browser.mjs` | Value Horizon results, which must equal the API's bit for bit |
| `thesis-browser.mjs` | Thesis Lab attribution, the value grid, presentation mode and sharing |
| `thesis-entry-browser.mjs` | Opening Thesis Lab from the Model and returning |
| `journey-browser.mjs` | Navigation and state carried between all workspaces |
| `casebook-browser.mjs` | Saving, notes, import and export in the Casebook |
| `save-race-browser.mjs` | Saves that are still pending when a page closes |
| `portability-browser.mjs` | Scenario links and the script-free brief, including a PDF print |

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push and pull request:

- `verify`: `npm test`, the seven Python reference checks and `npm run build`.
- `browser-parity`: `uncertainty-browser.mjs` and `horizon-browser.mjs` in Chromium against the real API.

The other browser suites run locally before a release, as recorded in the [verification record](VERIFICATION.md).
