# Frontier AI Valuation Lab implementation plan

**Goal:** publish an inspectable fintech project that improves the existing analysis and demonstrates working full stack engineering.

**Architecture:** one pure JavaScript financial model powers both the browser and Node API. A separate Python calculation verifies the model and generated workbook. Public source records and explicit assumptions drive reproducible snapshots.

**Tech stack:** Node.js 24, browser ES modules, HTML/CSS/SVG, Python, XLSX, GitHub Actions, Vercel.

**Spec:** `docs/DESIGN.md`.

## Global constraints

USD billions; valuation date 2026-10-18; preserve source artifacts; no credentials or private financial information; all projections explicitly illustrative; no backend persistence or paid data dependency; no claims of verified equity value without a validated bridge.

## Review focus

1. Blank/nonnumeric/overflowing input must not produce apparently valid output.
2. EV, equity, pre-money asks and post-money funding references must not become interchangeable.
3. Reverse growth must handle unreachable targets and non-monotonic cases.
4. A static-hosted demo must honestly show when API verification is unavailable.
5. Current edits must flow to exports, charts, sensitivities and server requests rather than stale preset values.

## Tasks

- [x] **1. Research and audit:** reconcile recovered V2 and original sources; independently inspect engine and workbook; record material findings in `docs/AUDIT.md` and source records in `data/research.json`.
- [x] **2. Model/API:** write hand-derived and failure-focused Node tests, observe failures, implement shared model, request validation and real Node API, verify independent Python parity. Interfaces are defined in the design document.
- [x] **3. Interactive UI:** implement only browser files `public/index.html`, `public/styles.css`, `public/app.js`, and SVG assets. Consume shared engine/data; test scenario changes, invalid input, exports, reset and API behavior.
- [x] **4. Model deliverables and documentation:** generate formula workbook, reviewed report and reproducible exports, reconcile with current results, render and inspect. Document methodology, API, assumptions, limitations, local use and attribution.
- [x] **5. Publish and integrate:** run whole-project checks and an AI-assisted review, publish new public repository and tested demo, update existing portfolio/profile, verify remote commit, CI, URLs and desktop delivery.

## Decision log

- 2026-10-18: recovered the October 16 package from prior deliverables because the desktop handoff confirmed it had never been copied to either Mac. The October 8 originals on both Macs have identical hashes.
- 2026-10-18: selected a stateless Node API and browser fallback. A database does not serve this deterministic public analysis.
- 2026-10-18: a separate original XLSX/PDF was not present; the recovered V2 workbook is the audited workbook baseline.

- 2026-10-18: final app gate passed 22 Node/model/API/release tests, 36 valid + 73 invalid independent Python cases, and 57 browser checks. The rebuilt workbook passed 2,058 numerical comparisons and 169 input/selector rejection cases.

- 2026-10-18: public GitHub repository and Vercel production demo are live. Production HTTP/browser checks passed, the existing portfolio Pages deployment succeeded, GitHub profile was updated, and the final deliverables were verified with all original hashes preserved.
