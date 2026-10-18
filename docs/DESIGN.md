# Frontier AI Valuation Lab: product and model design

## Purpose

Charles Dai requested a final review of his Anthropic/OpenAI valuation model, a more professional presentation, and a completed public GitHub project that strengthens the fintech section of his portfolio. The primary audience is a recruiter or technical/finance reviewer who wants to inspect the analysis, try the model, and run the code. The user expressly authorized autonomous execution and publication without questions.

## Selected approach

A focused full stack research application with a dependency-free JavaScript valuation engine, a responsive browser interface, a Node.js JSON API, an independent Python reference, a formula workbook and research documentation. GitHub owns source and history. Vercel will serve the public application and API, subject to the connected account's deployment capabilities. A GitHub Pages compatible static build provides an independently usable browser demo. No financial account integration or paid data feed is needed.

A document-only upload would obscure the engineering. A large framework and database would add maintenance without improving a deterministic public model. The selected architecture makes the analytical and technical decisions inspectable and reproducible.

## Content and financial contract

- All model dollar amounts are USD billions. The valuation date is 2026-10-18.
- Preserve the October 8 desktop originals and the recovered October 16 V2 package. Public documentation records their hashes and the remediation history.
- FCFF uses explicit remaining-2026 cash flow, followed by 2027–2036 year-end flows. Discount actual elapsed days divided by 365.25.
- Forecast revenue grows in three periods; operating margins interpolate through 2027, 2030 and 2036. Net reinvestment is incremental revenue divided by sales-to-invested-capital. It includes net capex and working capital; do not add either again.
- Tax positive EBIT only. No NOL tax assets or carryforwards are modeled; disclose this simplification.
- Terminal FCFF equals next-year NOPAT multiplied by (1 - perpetual growth / terminal ROIC). Require finite inputs, WACC greater than perpetual growth and terminal ROIC greater than perpetual growth.
- Enterprise value is the primary output. Equity adjustments are optional user assumptions, with a separate cash/debt/other-claims bridge. Funding-round prices and pre-money asks retain distinct labels and are never silently used as EV.
- Peak cumulative FCFF deficit is a simplified operating funding indicator, not a financing plan or proof of external capital needed. Opening liquidity, intrayear timing and contractual schedules are unknown.
- Sources show date, publisher, URL, evidence category and limitations. FY revenue, quarterly revenue, annualized run-rate, reported forecasts, completed financings, capital commitments and valuation expectations stay distinct.
- Show terminal-value concentration and the explicit-to-terminal cash-flow change. A solved reverse DCF describes required growth under fixed assumptions, not a probability or recommendation.

## Implementation interfaces

`public/lib/model.js` exports `project(p)`, `validate(p)`, `reverseGrowth(p, target)`, `sensitivity(p, rates, growthRates)`, `bridgeEquity(ev, bridge)` and `scaleAccountingBasis(p, factor)`. Inputs use the V2 keys: `rev2026`, `g1`, `g2`, `g3`, `m27`, `m30`, `m36`, `turns`, `wacc`, `tg`, `roic`, `stub`, `tax`. Rates are decimals.

`project` returns V2-compatible fields: `rows` with `year,revenue,growth,margin,ebit,tax,nopat,reinvestment,fcf,t,df,pv,cumulative`; and `stub_t,pv_stub,pv_explicit,terminal_revenue,terminal_nopat,terminal_reinvestment_rate,terminal_fcf,tv,pvtv,ev,tv_share,peak_funding_need,terminal_t,cagr`. Additional diagnostics may be added without removing these fields.

`reverseGrowth` returns `{status, growth, revenue2030, revenue2036, ev, residual}` when solved, or a non-solved status plus reason. Search within 0–200% early growth, check the shape and handle unreachable/non-monotonic inputs explicitly.

`public/data/presets.json` contains `{Anthropic:{Bear,Base,Bull},OpenAI:{Bear,Base,Bull}}`. `public/data/research.json` contains `{asOf,modelVersion,companies,sources}`. Company entries contain `name,tickerLabel,description,financing,operatingEvidence,limitations`. Source entries contain `id,publisher,date,title,url,type,use,limit`.

`POST /api/valuation` accepts `{action:'value',assumptions:p}`, `{action:'reverse',assumptions:p,target:number}`, or `{action:'sensitivity',assumptions:p,rates:number[],growthRates:number[]}`. Successful value responses are `{modelVersion,valuationDate,result}`. Invalid requests return HTTP 400 with `{error}`. `GET /api/valuation` returns model metadata/presets/source references; `GET /api/health` returns service health and model version.

## Browser experience

An editorial research workstation: warm off-white background, dark ink text, teal for OpenAI, terracotta for Anthropic, restrained tabular numerical styling, generous whitespace. Start with comparative EV and completed financing context. Provide company and scenario selection, editable assumptions, responsive charts, sensitivity, reverse DCF, sources and a concise methodology/audit explanation. Export current assumptions and forecast data, save a local scenario, reset reliably, and independently verify current results through the API. The browser remains useful on static hosting and clearly reports API unavailability.

Every input has a persistent label. Blank/invalid edits suppress stale results. Keyboard focus and reduced-motion preferences work. Tables have units and usable mobile overflow. No fabricated investment track record, proprietary data access, users, employers or third-party endorsement.

## Verification and completion

Model tests use hand-derived fixtures and independent Python results, including terminal reinvestment, dates, negative EV, input validation and accounting-basis invariance. API tests use a real local server for JSON errors, body limits, valid outputs and unsupported actions. The workbook is reconciled to the engine and rendered for visual review. UI checks exercise scenario selection, invalid inputs, export/reset and responsive layout. GitHub CI repeats the meaningful model/API checks. Completion requires the public repository, verified deployed UI/API where access permits, and links in the existing portfolio/profile.
