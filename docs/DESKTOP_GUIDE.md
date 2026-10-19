# Open the finished project

**Frontier AI Valuation Lab · Application 3.1.0 · Financial engine 3.0.0**

- Live full stack demo: https://frontier-ai-valuation-lab.vercel.app/
- Project and source: https://github.com/ult666666/frontier-ai-valuation-lab
- Portfolio: https://ult666666.github.io/
- Research review: https://frontier-ai-valuation-lab.vercel.app/report.html

The upgraded desktop folder is `Anthropic-vs-OpenAI-Valuation/Experience_V3_1_2026-10-18`. The prior `Final_V3_2026-10-18` handoff is preserved separately.

## Try the upgraded experience

Move from Revenue race to Cash-flow test to Value after 2036. Adjust the paired stress controls, verify both results on the server, then open either company in the complete model. Share this case copies a link that restores its exact assumptions and any enabled hypothetical equity bridge. Scenario brief downloads a standalone HTML document with the current forecast, reconciliation and sources; open that file and use Print to save a PDF if needed.

The financial research remains a snapshot as of 18 October 2026, with the existing research cutoff. Application 3.1 adds interaction and analytics without changing the reviewed financial engine, six presets, workbook or PDF.

## Desktop files

Open `START_HERE.html` or `Open_Live_Demo.webloc` to reach the interactive application. `Experience_Preview.png` provides the dated visual overview. The workbook and nine-page PDF work as local documents. `report.html` is an offline-readable copy of the review with source links. The JSON files preserve assumptions, research and the complete six-scenario result snapshot.

The web app uses JavaScript modules and fetches its versioned JSON data. Open the live URL or run the Node server; opening the app's `index.html` directly through a `file://` URL is not the supported interactive workflow.

## Run the source locally

Use Node.js 24:

```sh
git clone https://github.com/ult666666/frontier-ai-valuation-lab.git
cd frontier-ai-valuation-lab
npm test
npm start
```

Then open `http://127.0.0.1:4321`. No API keys, paid data service or database setup are required.

## Workbook

Use the single scenario selector on `Assumptions`. Blue inputs are editable. Both company forecasts use that selector and the same stated financial convention. Invalid active inputs suppress the corresponding valuation output. The fixed horizon ends in 2036. Excel, browser and PDF are separate files; an edit to one does not silently refresh another.

## Read the result correctly

All amounts are USD billions. The main result is illustrative operating enterprise value, not verified equity or per-share value. Financing references retain their own dates and definitions. Unknown current cash, debt and investor preferences are not invented. The final report and source register explain the remaining financial-information limits.

The original desktop files are preserved alongside the separate final folder.
