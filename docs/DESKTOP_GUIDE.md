# Open the research workspace

A [portable ZIP package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Value_Horizon_Package.zip) includes the worked briefs, workbook, evidence and opening guide. Extract the folder and open `START_HERE.html`. This download is independent of whether a desktop device is connected.

**Frontier AI Valuation Lab · Application 3.4.0 · Financial engine 3.0.0**

- Value Horizon: https://frontier-ai-valuation-lab.vercel.app/horizon.html
- Research Casebook: https://frontier-ai-valuation-lab.vercel.app/casebook.html
- Company comparison and complete Model: https://frontier-ai-valuation-lab.vercel.app/
- Thesis Lab: https://frontier-ai-valuation-lab.vercel.app/thesis.html
- Evidence: https://frontier-ai-valuation-lab.vercel.app/index.html#sources
- Project source and verification: https://github.com/ult666666/frontier-ai-valuation-lab
- Release history: https://github.com/ult666666/frontier-ai-valuation-lab/releases
- Fintech portfolio: https://ult666666.github.io/fintech.html
- Portfolio case study: https://ult666666.github.io/projects/frontier-ai-valuation-lab.html
- Research review: https://frontier-ai-valuation-lab.vercel.app/report.html

The new desktop folder is `Anthropic-vs-OpenAI-Valuation/Value_Horizon_V3_4_2026-10-19`. The delivery script creates a new folder and refuses to overwrite an existing destination. Original files and all earlier versioned handoffs remain separate.

## Start with Value Horizon

1. Open `START_HERE.html` and choose **Open Value Horizon**. The default is Anthropic Base, ten continuation years after 2036 and an illustrative $250B operating-EV target.
2. Change the years to inspect how much value remains when later cash flows and residual value are excluded. The explicit 2026–2036 forecast stays intact. The perpetual reference remains visible beside the selected finite value.
3. Inspect the forecast/continuation reconciliation, terminal-PV capture milestones and target requirement. A target can be reached by the explicit forecast, require a finite horizon, remain perpetuity-only, be unreachable or fall outside a numerical/search boundary. Those outcomes are labeled explicitly.
4. **Verify through the API** checks the complete server calculation against the browser. **Copy exact link**, HTML brief and analysis JSON preserve the current case, years and target.
5. Open the case in the Model to inspect or edit its operating assumptions. The hypothetical equity bridge is carried but excluded from Horizon operating EV. A new Model-to-Horizon handoff starts with ten continuation years and the illustrative $250B target; use a Horizon link to reopen its exact saved settings.

Navigation presents the same six destinations: Overview, Model, Thesis Lab, Value Horizon, Casebook and Evidence. A selected continuation horizon is a conditional stress assumption; it does not predict a company lifespan or survival probability.

## Try the connected workflow

1. Open the Overview and apply a paired stress. **Explain this change** takes the exact baseline and stressed case into Thesis Lab.
2. Inspect the signed attribution across six assumption groups. The method evaluates all 64 group combinations, equivalent to averaging all 720 orders of change.
3. Enter an illustrative target operating EV. **Use required margin as alternative** applies the solver's full-precision margin at the selected cost of capital. The separate grid-point action uses the selected sampled WACC and margin.
4. Inspect either case in the Model, edit the forecast, and **Return to this comparison**. The other case, separate bridges, exact axes and target remain attached to the workflow.
5. **Save to Casebook** and record the argument: why the case matters, what must hold, and what would change your mind. Attach selected sources, verify the captured calculation, and export complete research.

The Casebook is saved in the current browser and origin. Export JSON to keep a portable copy or move the analysis to another device. Calculation links carry the numerical snapshot; Casebook JSON and research briefs also carry the analyst notes and selected evidence. There is no automatic cloud synchronization.

## Desktop files

Open `START_HERE.html`, `Open_Live_Demo.webloc` or `Open_Value_Horizon.webloc` for Value Horizon. `Open_Valuation_Model.webloc` opens the Overview and Model; `Open_Thesis_Lab.webloc` opens comparisons; `Open_Research_Casebook.webloc` opens saved research. Separate shortcuts open the fintech portfolio and project source. Preview PNGs introduce Value Horizon, Thesis Lab and the Casebook.

The downloads folder contains:

- **Value Horizon brief, PDF and HTML:** the worked Anthropic Base example, with the selected continuation, a separate perpetual reference, complete inputs, explicit forecast, capture/target readouts and exact reopening links. The HTML contains no scripts.
- **Value Horizon analysis JSON:** the exact operating case, ten-year continuation, illustrative $250B target, complete recalculated curve and methodology. Use its `reopenUrl` to open the analysis. This is a separate Horizon format, not an importable Casebook record.
- **Research brief, PDF and HTML:** a complete illustrative Anthropic target-requirement argument, including exact inputs, forecasts, attribution, evidence and a reopening link.
- **Example Casebook JSON:** three clearly labeled illustrative analyses. Choose Import JSON in the Casebook to review and merge them explicitly. The two OpenAI scenarios can be selected together to compare a two-percentage-point WACC change.
- **Comparison brief, PDF and HTML:** the reviewed three-page Anthropic Base-to-Bull example, with its own exact window and target.
- **Editable Excel model:** the original five-sheet reviewed financial workbook.
- **Financial review PDF:** the original nine-page research and model-review snapshot.

`report.html` is an offline-readable financial review. `Value_Horizon_Methodology.md` explains the finite-continuation formula, timing, limits and independent reference. The remaining JSON files preserve the six presets, complete modeled result snapshot, source register and contextual evidence mapping. `SHA256_manifest.json` lists the exact bytes of every delivered file other than the manifest itself.

The interactive app uses JavaScript modules and versioned JSON. Open the live URL or run the Node server. The standalone HTML briefs, PDFs and workbook can be opened as local files.

## Run the source locally

Use Node.js 24:

```sh
git clone https://github.com/ult666666/frontier-ai-valuation-lab.git
cd frontier-ai-valuation-lab
npm test
npm start
```

Open `http://127.0.0.1:4321`. No API keys, paid data service or database setup are required. Python 3.11+ reproduces the independent financial and attribution checks documented in the repository.

For Value Horizon, open `http://127.0.0.1:4321/horizon.html`. Its independent reference can be run with:

```sh
python3 -B scripts/check_horizon_reference.py --output /tmp/horizon-reference.json
```

## Recreate or verify the desktop package

Run the delivery script from the source checkout. The destination must not already exist:

```sh
python3 scripts/deliver_desktop.py --destination /tmp/frontier-value-horizon-desktop-demo
python3 scripts/deliver_desktop.py --destination /tmp/frontier-value-horizon-desktop-demo --verify
```

Omitting `--destination` uses the new versioned desktop folder named above. Creation preflights the source files, copies the prior downloads and new Horizon artifacts, writes the opening pages/shortcuts and manifest, then verifies the delivered bytes. The read-only `--verify` command checks the complete manifest, local opening links, shortcut destinations and Horizon metadata. It does not make a network request or assert that an external deployment is available.

## Workbook and research snapshot

Use the single scenario selector on the workbook's Assumptions sheet. Blue inputs are editable; invalid active inputs suppress the affected valuation. The forecast horizon ends in 2036. Excel, browser and PDF are separate artifacts; changing one does not silently refresh another.

Application 3.4 adds Value Horizon and its portable outputs to the existing Model, Thesis Lab, Casebook and contextual evidence. Financial engine 3.0.0, the six published presets and research cutoff remain 18 October 2026 at 09:22 PDT. The workbook and nine-page financial review retain their reviewed bytes. Horizon methodology references were reviewed separately from this frozen company-research snapshot.

## Read the result correctly

Amounts are USD billions. Results are illustrative operating enterprise values. Private financing references have their own dates and equity definitions. Current cash, debt and investor preferences are not supplied as verified facts. A hypothetical equity bridge remains separate from operating attribution.

Attribution is conditional on the selected cases and declared groups. The landscape is deterministic sensitivity analysis and assigns no probabilities or investment returns. Contextual evidence keeps the selected input's assumption status visible. Attaching a source to a saved argument does not certify its forecast.

Value Horizon retains the selected annual continuation cash flows and assigns zero cash flow and zero residual after the cutoff. It does not estimate liquidation proceeds, financing needs or investor returns. The finite value and the perpetual baseline are both operating enterprise values; neither is a quoted security price. The Horizon JSON/link preserves the continuation settings separately from Casebook notes and saved scenario/comparison records.
