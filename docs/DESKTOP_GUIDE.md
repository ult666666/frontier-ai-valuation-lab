# Open the research workspace

**Frontier AI Valuation Lab · Application 3.3.0 · Financial engine 3.0.0**

- Research Casebook: https://frontier-ai-valuation-lab.vercel.app/casebook.html
- Company comparison and complete Model: https://frontier-ai-valuation-lab.vercel.app/
- Thesis Lab: https://frontier-ai-valuation-lab.vercel.app/thesis.html
- Source and release: https://github.com/ult666666/frontier-ai-valuation-lab/releases/tag/v3.3.0
- Portfolio case study: https://ult666666.github.io/projects/frontier-ai-valuation-lab.html
- Research review: https://frontier-ai-valuation-lab.vercel.app/report.html

The new desktop folder is `Anthropic-vs-OpenAI-Valuation/Research_Workspace_V3_3_2026-10-19`. Original files and all earlier versioned handoffs remain separate.

## Try the connected workflow

1. Open the Overview and apply a paired stress. **Explain this change** takes the exact baseline and stressed case into Thesis Lab.
2. Inspect the signed attribution across six assumption groups. The method evaluates all 64 group combinations, equivalent to averaging all 720 orders of change.
3. Enter an illustrative target operating EV. **Use required margin as alternative** applies the solver's full-precision margin at the selected cost of capital. The separate grid-point action uses the selected sampled WACC and margin.
4. Inspect either case in the Model, edit the forecast, and **Return to this comparison**. The other case, separate bridges, exact axes and target remain attached to the workflow.
5. **Save to Casebook** and record the argument: why the case matters, what must hold, and what would change your mind. Attach selected sources, verify the captured calculation, and export complete research.

The Casebook is saved in the current browser and origin. Export JSON to keep a portable copy or move the analysis to another device. Calculation links carry the numerical snapshot; Casebook JSON and research briefs also carry the analyst notes and selected evidence. There is no automatic cloud synchronization.

## Desktop files

Open `START_HERE.html` or `Open_Live_Demo.webloc` for the Casebook. `Open_Valuation_Model.webloc` opens the Overview and Model; `Open_Thesis_Lab.webloc` opens comparisons. The preview PNGs show the actual interface.

The downloads folder contains:

- **Research brief, PDF and HTML:** a complete illustrative Anthropic target-requirement argument, including exact inputs, forecasts, attribution, evidence and a reopening link.
- **Example Casebook JSON:** three clearly labeled illustrative analyses. Choose Import JSON in the Casebook to review and merge them explicitly. The two OpenAI scenarios can be selected together to compare a two-percentage-point WACC change.
- **Comparison brief, PDF and HTML:** the reviewed three-page Anthropic Base-to-Bull example, with its own exact window and target.
- **Editable Excel model:** the original five-sheet reviewed financial workbook.
- **Financial review PDF:** the original nine-page research and model-review snapshot.

`report.html` is an offline-readable financial review. The JSON files preserve the six presets, complete modeled result snapshot, source register and contextual evidence mapping. `SHA256_manifest.json` binds each handed-off file to its exact bytes.

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

## Workbook and research snapshot

Use the single scenario selector on the workbook's Assumptions sheet. Blue inputs are editable; invalid active inputs suppress the affected valuation. The forecast horizon ends in 2036. Excel, browser and PDF are separate artifacts; changing one does not silently refresh another.

Application 3.3 adds the Research Casebook and contextual workflow to financial engine 3.0.0. The six published presets and research cutoff remain 18 October 2026 at 09:22 PDT. The workbook and nine-page financial review retain their reviewed bytes.

## Read the result correctly

Amounts are USD billions. Results are illustrative operating enterprise values. Private financing references have their own dates and equity definitions. Current cash, debt and investor preferences are not supplied as verified facts. A hypothetical equity bridge remains separate from operating attribution.

Attribution is conditional on the selected cases and declared groups. The landscape is deterministic sensitivity analysis and assigns no probabilities or investment returns. Contextual evidence keeps the selected input's assumption status visible. Attaching a source to a saved argument does not certify its forecast.
