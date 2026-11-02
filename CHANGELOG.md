# Changelog

Notable changes to Frontier AI Valuation Lab. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases up to 4.0.0 are described in the [GitHub releases](https://github.com/ult666666/frontier-ai-valuation-lab/releases) and the [verification record](docs/VERIFICATION.md).

## Unreleased

### Added

- Valuation under uncertainty (uncertainty method 1.0.0): a seeded Monte Carlo panel in the Model workspace and a matching `simulate` API action. Up to five drivers (revenue growth path, terminal margin, discount rate, terminal growth and, with a hypothetical bridge, dilution) take bounded uniform, triangular or truncated normal distributions, joined by a Gaussian copula with a Cholesky factor. Results include P5 to P95, the share of draws above a hurdle with a Wilson interval, a histogram, the standard error of the mean, a median check across five seeds and a one-way P10 to P90 tornado. See [docs/UNCERTAINTY.md](docs/UNCERTAINTY.md).
- Seeded xoshiro128** random numbers and fdlibm-based `exp` and `log`, so the same request gives byte-identical JSON in the browser and the API.
- `scripts/check_uncertainty_reference.py`, an independent Python check of the generator, normal functions, positive semidefiniteness, copula, percentiles, seed replicates and tornado, run in CI.
- `tests/uncertainty-browser.mjs` and a `browser-parity` CI job that runs it in Chromium against the real API.

### Unchanged

- Financial engine 3.0.0, the 18 October 2026 valuation date, application version 4.0.0, the presets, research data, downloads and every existing API action.
