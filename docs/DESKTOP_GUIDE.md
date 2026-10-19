# Open the finished project

**Frontier AI Valuation Lab · Application 3.2.0 · Financial engine 3.0.0**

- Thesis Lab: https://frontier-ai-valuation-lab.vercel.app/thesis.html
- Complete valuation model: https://frontier-ai-valuation-lab.vercel.app/
- Source and release: https://github.com/ult666666/frontier-ai-valuation-lab/releases/tag/v3.2.0
- Portfolio case study: https://ult666666.github.io/projects/frontier-ai-valuation-lab.html
- Research review: https://frontier-ai-valuation-lab.vercel.app/report.html

The new desktop folder is `Anthropic-vs-OpenAI-Valuation/Thesis_Lab_V3_2_2026-10-18`. The original files, `Final_V3_2026-10-18`, and `Experience_V3_1_2026-10-18` remain separate.

## Try Thesis Lab

Start with Anthropic Base as the reference and Bull as the alternative. The signed waterfall allocates their modeled EV difference across six declared assumption groups. Every allocation averages all 720 replacement orders, using 64 directly calculated combinations. Change the business or either case, open the assumption editor, or swap the two cases.

Enter a target enterprise value in the landscape. The grid changes the alternative case's WACC and 2036 EBIT margin while holding its other eleven assumptions fixed. The target frontier shows the required margin where the target is reachable inside the displayed window. Select a point with the chart or native controls, inspect it, and explicitly apply it to the alternative case.

Share comparison preserves both exact cases, their originating presets, optional hypothetical equity bridges, the landscape window and target. Comparison brief downloads a standalone document with both forecasts, attribution, assumptions, frontier, dated sources and an exact reopening link. Use Present analysis for a focused view with a visible exit control.

The company comparison, paired stress tests, full workbench and original single-case sharing remain available through Valuation model. A workbench case can enter Thesis Lab directly through Compare in Thesis Lab.

## Desktop files

Open `START_HERE.html` or `Open_Live_Demo.webloc` for Thesis Lab. `Open_Valuation_Model.webloc` opens the complete model. `Thesis_Lab_Preview.png` is an actual interface capture.

The downloads folder contains a reviewed three-page Anthropic Base-to-Bull comparison example in PDF and standalone HTML, the editable five-sheet workbook and the original nine-page review PDF. The comparison example states its exact window: WACC 8.5–14.5%, 2036 margin 6–30%, target $500B. Its reopening link restores those inputs; other live comparisons can produce different results.

`report.html` is an offline-readable research review. The JSON files preserve the six presets, complete result snapshot and source register. `SHA256_manifest.json` binds each handed-off file to its exact bytes.

The interactive application uses JavaScript modules and versioned JSON data. Open the live URL or run the Node server. The standalone comparison document, PDF and workbook can be opened as local files.

## Run the source locally

Use Node.js 24:

```sh
git clone https://github.com/ult666666/frontier-ai-valuation-lab.git
cd frontier-ai-valuation-lab
npm test
npm start
```

Open `http://127.0.0.1:4321/thesis.html`. No API keys, paid data service or database setup are required. Python 3.11+ can reproduce the independent financial and attribution checks documented in the repository.

## Workbook and research snapshot

Use the single scenario selector on Assumptions. Blue inputs are editable. Invalid active inputs suppress the affected valuation. The forecast horizon ends in 2036. Excel, browser and PDF are separate files; changing one does not silently refresh another.

Application 3.2 adds comparison analysis without changing financial engine 3.0.0, the six published presets, or the financial research cutoff of 18 October 2026 at 09:22 PDT. The existing workbook and nine-page PDF retain their reviewed bytes.

## Read the result correctly

All financial amounts are USD billions. Results are illustrative operating enterprise values. Financing references retain their own dates and equity definitions. Current cash, debt and investor preferences are not supplied as verified facts. A hypothetical equity bridge stays separate from the operating attribution.

The attribution is conditional on the two selected cases and fixed groups. It is not a real-world causal estimate. The landscape is a deterministic sensitivity analysis and does not assign probabilities, investment upside or confidence levels. The source register and methodology explain the available evidence and its limits.
