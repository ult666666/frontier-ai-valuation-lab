# Documentation

The [project README](../README.md) says what the app computes and how to run it. These notes go deeper. File names are kept stable because other pages link to them.

## Current versions

| Component | Version |
| --- | --- |
| Application | 4.0.0 |
| Financial engine (FCFF model) | 3.0.0 |
| Capital method | 1.0.0 |
| Uncertainty (Monte Carlo) method | 1.0.0 |
| Financing Lens, Ownership Frontier, Value Horizon and Thesis analytics | 1.0.0 each |
| Valuation date and research snapshot | 18 October 2026 |

The [changelog](../CHANGELOG.md) and the [GitHub releases](https://github.com/ult666666/frontier-ai-valuation-lab/releases) list what changed in each version.

## Using the app

- [Demo walkthrough](DEMO_WALKTHROUGH.md): the worked capital decision, step by step, with the arithmetic.
- [Desktop guide](DESKTOP_GUIDE.md): the portable ZIP package and how to open it offline.
- [Research workspace](RESEARCH_WORKSPACE.md): how the Model, Value Horizon, Thesis Lab and Casebook pass cases to each other.

## Method

- [Valuation methodology](METHODOLOGY.md): the FCFF model, its assumptions, discounting and terminal value.
- [Capital strategy](CAPITAL_STRATEGY.md): plan eligibility, the value to existing shareholders, minimax regret, break-even values, the valuation range and the server comparison policy.
- [Financing Lens](FINANCING_LENS.md) and [Ownership Frontier](OWNERSHIP_FRONTIER.md): the equity bridge, one primary round and the ownership limit.
- [Valuation under uncertainty](UNCERTAINTY.md): the Monte Carlo simulation, its references and limits.
- [Thesis Lab](THESIS_LAB.md): grouped Shapley attribution and the target margin frontier.
- [Value Horizon](VALUE_HORIZON.md): finite continuation after 2036.
- [Evidence context](EVIDENCE_CONTEXT.md) and [provenance](PROVENANCE.md): how sources are labelled, dated and linked to inputs.

## Engineering

- [Architecture](ARCHITECTURE.md): one engine for the browser and the API, validation, exports and deployment.
- [API contract](API.md): every endpoint and action, with request limits and examples.
- [Testing](TESTING.md): the Node tests, the Python reference checks, the browser suites and CI.

## Where each part lives

| Part | Definitions | Code and checks |
| --- | --- | --- |
| Finance | Operating EV, equity value, round valuation, capital raised and ownership are defined separately in [capital strategy](CAPITAL_STRATEGY.md) and the [Financing Lens](FINANCING_LENS.md) | [`public/lib/model.js`](../public/lib/model.js), [`public/lib/financing.js`](../public/lib/financing.js) |
| Quantitative comparison | Finite-scenario regret, dominance, break-even values and the valuation range, with no scenario probabilities | [`public/lib/capital-strategy.js`](../public/lib/capital-strategy.js), [`scripts/check_capital_reference.py`](../scripts/check_capital_reference.py), [`tests/capital-strategy.test.js`](../tests/capital-strategy.test.js) |
| Software | State, the bounded stateless API, share links, imports and standalone briefs; late server responses cannot verify newer inputs | [Architecture](ARCHITECTURE.md), [API](API.md), [`tests/capital-api.test.js`](../tests/capital-api.test.js), [`tests/capital-browser.mjs`](../tests/capital-browser.mjs) |
| Decision record | An objective, alternative plans, a declared metric, the analyst's choice, trade-off, open questions and review trigger | [Worked decision brief](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Capital_Decision.html), [walkthrough](DEMO_WALKTHROUGH.md) |

## Records

- [Verification record](VERIFICATION.md): dated test, reference, browser and review runs for each release, with the JSON records in [`verification/`](verification/).
- [Model review](AUDIT.md): the AI-assisted review of the 3.0 model and workbook.

### Design history

These notes describe earlier versions. Their screenshots and interface labels predate the current pages.

- [Product and model design](DESIGN.md) and [implementation plan](IMPLEMENTATION_PLAN.md) for the 3.0 foundation.
- [Experience update](EXPERIENCE_UPDATE.md) for application 3.1.
- [Capital Strategy Studio design](CAPITAL_STRATEGY_DESIGN.md) for application 4.0.
