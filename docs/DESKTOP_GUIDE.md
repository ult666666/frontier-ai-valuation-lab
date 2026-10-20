# Open Capital Strategy Studio

**Frontier AI Valuation Lab · Application 4.0.0 · Capital method 1.0.0 · Financial engine 3.0.0 · Model date 18 October 2026.**

Download the [portable Capital Strategy package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Capital_Strategy_Package.zip), extract it and open `START_HERE.html`. Its standalone briefs and reviewed workbook open as local files. The interactive Studio opens the live application, or you can run the source locally with Node 24.

The versioned desktop folder is `Anthropic-vs-OpenAI-Valuation/Capital_Strategy_V4_0_2026-10-19`. Creation refuses to overwrite an existing destination. Original files and earlier handoffs remain separate.

## Start with one complete decision

1. Choose **Open Capital Strategy Studio**. The worked illustration contains three hypothetical financing plans, a $25B capital objective, an 88% retained-stake floor and Anthropic Bear/Base/Bull operating scenarios. Cash20, debt5 and other claims0 form an explicit hypothetical bridge.
2. Change the retention floor to 90%: only the smaller 25B round remains eligible. Raise the capital objective to 30B: none qualifies. Return the floor to 88%: the 35B round qualifies. Restore 25/88 before comparing the default scenarios.
3. Inspect the scenario allocations, declared minimax comparison, pairwise switching values and the separate model-conditioned pricing intervals. Counts are submitted cases, not probabilities. An unavailable bridge, signed negative residual, empty eligible set and conflicting price interval have different meanings.
4. Review the analyst's selected plan, rationale, tradeoff, review trigger and information needed. Financial edits mark existing reasoning for review without replacing it. Choose **Verify through the API** to compare the complete current numeric result, excluding analyst prose.
5. Export the decision JSON or HTML, or copy an exact link. Imports preview the candidate before applying it and recompute the analysis. Very long valid decisions retain a JSON export path when link sharing is unavailable. The Studio does not silently save to the server or the separate Research Casebook.

The plan comparison allocates a signed modeled residual under equal rights, unchanged operations, retained primary cash and zero fees. It does not establish a limited-liability common-share value, investment return, company funding need or an obtainable financing offer. The capital objective is never calculated from economic FCFF deficits.

## What the package contains

| Artifact | Purpose |
| --- | --- |
| `Frontier_AI_Capital_Decision.pdf` | The complete worked business decision and its calculations |
| `Frontier_AI_Capital_Decision.html` | Script-free brief with exact inputs and a reopening link |
| `Frontier_AI_Capital_Decision.json` | Importable versioned decision, inputs, reasoning and recomputed analysis |
| `Capital_Strategy_Preview.png` | Actual capture of the working Studio |
| `Capital_Strategy_Methodology.md` | Eligibility, allocations, regret, switching values, intervals and numerical conventions |
| `Capital_Strategy_Walkthrough.md` | The complete business, finance, quant and engineering demonstration |
| `Architecture.md` | State transport, API boundaries, portable records and deployment |
| Financing, Horizon, Thesis and Research briefs | Supporting worked analyses and their standalone outputs |
| Original Excel model and financial-review PDF | The preserved reviewed financial baseline |
| Presets, results, source register and evidence context | Exact dated model and evidence snapshots |
| `START_HERE.html`, `index.html` and `.webloc` shortcuts | Opening pages and explicit live destinations |
| `SHA256_manifest.json` | Complete file membership, exact file hashes and release/method metadata |

Links in the Markdown method documents may refer to source files in the GitHub repository. The standalone HTML briefs, local opening pages, PDFs and workbook are the offline-readable deliverables. The full interactive app uses JavaScript modules and a server; opening its source HTML directly as a file is not the supported runtime.

## Supporting workspaces

- [Capital Strategy Studio](https://frontier-ai-valuation-lab.vercel.app/capital.html#worked-decision)
- [Company comparison and complete Model](https://frontier-ai-valuation-lab.vercel.app/)
- [Ownership Frontier](https://frontier-ai-valuation-lab.vercel.app/index.html#ownership-example)
- [Financing Lens](https://frontier-ai-valuation-lab.vercel.app/index.html#financing-example)
- [Value Horizon](https://frontier-ai-valuation-lab.vercel.app/horizon.html)
- [Thesis Lab](https://frontier-ai-valuation-lab.vercel.app/thesis.html)
- [Research Casebook](https://frontier-ai-valuation-lab.vercel.app/casebook.html)
- [Evidence](https://frontier-ai-valuation-lab.vercel.app/index.html#sources)
- [Fintech portfolio](https://ult666666.github.io/fintech.html)
- [Engineering case study](https://ult666666.github.io/projects/frontier-ai-valuation-lab.html)
- [GitHub source and verification](https://github.com/ult666666/frontier-ai-valuation-lab)

## Run and reproduce

Use Node.js 24 to run the application. The complete `npm test` suite also requires Python 3.11+ because it verifies the desktop record through the Python delivery tool.

```sh
git clone https://github.com/ult666666/frontier-ai-valuation-lab.git
cd frontier-ai-valuation-lab
npm test
npm start
```

Open `http://127.0.0.1:4321/capital.html#worked-decision`. No API key, paid data service or database setup is required. Python 3.11+ and Node 24 reproduce the independent capital reference:

```sh
python3 -B scripts/check_capital_reference.py --output /tmp/capital-reference.json
```

The README contains the other independent references and a complete capital API example. `node scripts/build_release_briefs.mjs` regenerates the five current worked HTML/JSON artifacts. Add `--pdf` when an optional Playwright/Chromium authoring environment is installed; PDF rendering is separate from the application's zero-dependency runtime. Inspect rendered pages after changing a brief.

## Create or verify a new package

The source checkout includes a separate, versioned delivery script. A destination must not already exist:

```sh
python3 -B scripts/deliver_desktop.py --destination /tmp/frontier-capital-demo
python3 -B scripts/deliver_desktop.py --destination /tmp/frontier-capital-demo --verify
```

Creation preflights all source artifacts, recomputes the capital record, validates the financing/ownership and Horizon outputs, creates the new directory, and checks copied bytes and navigation. Verification is read-only and performs no network requests. It requires Node 24 to recompute the complete capital analysis and rejects incompatible inputs, forged stored output, duplicate JSON fields, missing files, changed bytes, unexpected members, symlinks or incorrect shortcuts.

The manifest's file hashes exclude the manifest itself. Hash agreement detects changes; it is not an independent signature. The record import bound is 256 KiB, while exact share links and numeric API requests retain their smaller documented limits.

`scripts/build_desktop_archive.py` creates a deterministic ZIP from a fresh verified delivery, validates membership, CRCs and bytes, and checks that the three earlier package ZIPs remain unchanged. It refuses to overwrite an existing Capital Strategy ZIP. Earlier [Ownership Frontier](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Ownership_Frontier_Package.zip), [Financing Lens](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Financing_Lens_Package.zip) and [Value Horizon](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Value_Horizon_Package.zip) handoffs remain available.

## Financial and research boundaries

The company research cutoff remains 18 October 2026 at 09:22 America/Los_Angeles. Model discounting uses the calendar date 18 October 2026. Application 4.0.0 adds a decision workflow; it does not silently refresh the company disclosures, rewrite the six published presets or modify the reviewed workbook and original nine-page financial-review PDF.

The workbook's Assumptions sheet has one scenario selector for both company forecasts. Blue inputs are editable. Changing the workbook does not automatically change the app, a downloaded brief or a saved record. Excel, browser and PDF remain separate artifacts.

Operating EV, a hypothetical modeled equity residual and an independently entered financing quote are different quantities. Pre-close cash excludes the new proceeds. Other claims belong outside the participating equity pool. The simple primary round excludes fees, debt repayment, preference waterfalls, options, conversions, secondary sales and later rounds. A price interval does not establish market demand or capital availability. Neither finite continuation, grouped attribution nor capital regret supplies scenario probabilities or investment returns.

Charles Dai's independent portfolio project was developed with AI-assisted research, implementation and review. It demonstrates inspectable financial reasoning and software; it does not claim an engagement for either company, an investment recommendation or a performance track record.
