# Changelog

Notable changes to Frontier AI Valuation Lab. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases up to 4.0.0 are described in the [GitHub releases](https://github.com/ult666666/frontier-ai-valuation-lab/releases) and the [verification record](docs/VERIFICATION.md).

## Unreleased

### Added

- Valuation under uncertainty (uncertainty method 1.0.0): a seeded Monte Carlo panel in the Model workspace and a matching `simulate` API action. Up to five drivers (revenue growth path, terminal margin, discount rate, terminal growth and, with a hypothetical bridge, dilution) take bounded uniform, triangular or truncated normal distributions, joined by a Gaussian copula with a Cholesky factor. Results include P5 to P95, the share of draws above a hurdle with a Wilson interval, a histogram, the standard error of the mean, a median check across five seeds and a one-way P10 to P90 tornado. See [docs/UNCERTAINTY.md](docs/UNCERTAINTY.md).
- Seeded xoshiro128** random numbers and fdlibm-based `exp` and `log`, so the same request gives byte-identical JSON in the browser and the API.
- `scripts/check_uncertainty_reference.py`, an independent Python check of the generator, normal functions, positive semidefiniteness, copula, percentiles, seed replicates and tornado, run in CI.
- `tests/uncertainty-browser.mjs` and a `browser-parity` CI job that runs it in Chromium against the real API.

### Fixed

- The Horizon workspace now produces bit-for-bit the same results in Chromium and in the Node API. It used `Math.exp`, `Math.expm1` and `Math.log1p`, whose last bit differs between engines, so `tests/horizon-browser.mjs` failed when it compared the exported JSON with a Node recalculation (the in-app API check, which allows a 1e-10 relative tolerance, was unaffected). Horizon now uses fdlibm ports of `expm1` and `log1p` next to the existing `exp`. They return the same bits as Node 24 on 2.8 million test inputs, so no Node result changes. A test keeps engine-dependent functions out of the Horizon module, and the `browser-parity` CI job now runs the Horizon suite too.
- The browser harnesses and build scripts no longer default to paths from the environment this project was first built in. They load the standard `playwright` package and its Chromium unless `FRONTIER_PLAYWRIGHT_MODULE` or `FRONTIER_CHROMIUM_EXECUTABLE` says otherwise, and the Python reference checks take `FRONTIER_NODE` or the `node` on the PATH.

### Unchanged

- Financial engine 3.0.0, the 18 October 2026 valuation date, application version 4.0.0, the presets, research data, downloads and every existing API action.
