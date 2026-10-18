# Open the finished project

**Frontier AI Valuation Lab · Version 3.0.0 · 18 October 2026**

- Live full stack demo: https://frontier-ai-valuation-lab.vercel.app/
- Project and source: https://github.com/ult666666/frontier-ai-valuation-lab
- Portfolio: https://ult666666.github.io/
- Research review: https://frontier-ai-valuation-lab.vercel.app/report.html

The final desktop folder is `Anthropic-vs-OpenAI-Valuation/Final_V3_2026-10-18`.

## Desktop files

Open `START_HERE.html` or `Open_Live_Demo.webloc` to reach the interactive application. The workbook and nine-page PDF work as local documents. `report.html` is an offline-readable copy of the review with source links. The JSON files preserve assumptions, research and the complete six-scenario result snapshot.

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
