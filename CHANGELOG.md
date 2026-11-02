# Changelog

Notable changes to Frontier AI Valuation Lab. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases up to 4.0.0 are described in the [GitHub releases](https://github.com/ult666666/frontier-ai-valuation-lab/releases) and the [verification record](docs/VERIFICATION.md).

## Unreleased

### Changed

- Every workspace page now opens with its name and one plain sentence. Numbered eyebrows ("F / 05", "01 / Define the decision"), slogan headings with italic second lines, step pills and decorative badges are gone; section titles are short sentence-case labels.
- All pages share one light palette with a single green accent, one sans-serif type scale with tabular figures, and a plain footer with the source link and license. The dark decision, horizon, landscape and overview panels are now light, and their charts were recolored for a light background.
- Labels use the terms a finance reader expects: capital raised, ownership retained, pre-money valuation, value to existing shareholders, shortfall against the best plan and break-even equity value.
- Caveats that were repeated under controls and charts are collected into one "Method and limits" note per page.
- The capital plan chart takes a `theme` option. The workspace draws the new light version; the default stays the original dark chart, so the saved decision brief is unchanged.
- The README now leads with what the app computes, one screenshot and how to run it. Test commands moved to [docs/TESTING.md](docs/TESTING.md), a capital API example moved to [docs/API.md](docs/API.md), and [docs/README.md](docs/README.md) indexes the documentation, with older design notes marked as history.
- The social preview card is redrawn without the slogan, from the same Base-case figures.

### Added

- `tests/presentation.test.js` checks each workspace page for a single plain title, unnumbered section titles, prose without em dashes, one method and limits note and the shared footer.
- `tests/capital-chart.test.js` checks that the dark chart stays the default, that the light chart plots the same geometry and text, and that its text and marks meet WCAG contrast on the plot and the qualifying zone.
- Valuation under uncertainty (uncertainty method 1.0.0): a seeded Monte Carlo panel in the Model workspace and a matching `simulate` API action. Up to five drivers (revenue growth path, terminal margin, discount rate, terminal growth and, with a hypothetical bridge, dilution) take bounded uniform, triangular or truncated normal distributions, joined by a Gaussian copula with a Cholesky factor. Results include P5 to P95, the share of draws above a hurdle with a Wilson interval, a histogram, the standard error of the mean, a median check across five seeds and a one-way P10 to P90 tornado. See [docs/UNCERTAINTY.md](docs/UNCERTAINTY.md).
- Seeded xoshiro128** random numbers and fdlibm-based `exp` and `log`, so the same request gives byte-identical JSON in the browser and the API.
- `scripts/check_uncertainty_reference.py`, an independent Python check of the generator, normal functions, positive semidefiniteness, copula, percentiles, seed replicates and tornado, run in CI.
- `tests/uncertainty-browser.mjs` and a `browser-parity` CI job that runs it in Chromium against the real API.

### Fixed

- The Overview's two Base case cards now shrink to fit a phone. Their grid columns could not shrink below their content, so at 360 px the OpenAI card ran past the right edge of the page and `tests/experience-browser.mjs` failed on `main`. The columns now use `minmax(0, 1fr)` and long labels wrap.
- The Horizon workspace now produces bit-for-bit the same results in Chromium and in the Node API. It used `Math.exp`, `Math.expm1` and `Math.log1p`, whose last bit differs between engines, so `tests/horizon-browser.mjs` failed when it compared the exported JSON with a Node recalculation (the in-app API check, which allows a 1e-10 relative tolerance, was unaffected). Horizon now uses fdlibm ports of `expm1` and `log1p` next to the existing `exp`. They return the same bits as Node 24 on 2.8 million test inputs, so no Node result changes. A test keeps engine-dependent functions out of the Horizon module, and the `browser-parity` CI job now runs the Horizon suite too.
- The uncertainty, architecture and Value Horizon documents no longer say that Value Horizon uses `Math.exp` or that its browser suite fails, and the verification record notes that all 13 browser suites now pass.
- The browser harnesses and build scripts no longer default to paths from the environment this project was first built in. They load the standard `playwright` package and its Chromium unless `FRONTIER_PLAYWRIGHT_MODULE` or `FRONTIER_CHROMIUM_EXECUTABLE` says otherwise, and the Python reference checks take `FRONTIER_NODE` or the `node` on the PATH.

### Unchanged

- Financial engine 3.0.0, the 18 October 2026 valuation date, application version 4.0.0, the presets, research data, downloads and every existing API action.
- The presentation update changes no calculation. Every committed download, every generated brief and record, the chart drawn in saved briefs and every API action's response hash identically before and after it. Only the in-app chart's legend wording and colors changed.
