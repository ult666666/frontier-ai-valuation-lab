# Open the research workspace

A [portable ZIP package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Ownership_Frontier_Package.zip) includes Ownership Frontier within Financing Lens, the worked financing and ownership brief, earlier research briefs, workbook, evidence and opening guide. Extract the folder and open `START_HERE.html`. This download is independent of whether a desktop device is connected. The earlier [Financing Lens package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Financing_Lens_Package.zip) and [Value Horizon package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Value_Horizon_Package.zip) remain available as dated handoffs.

**Frontier AI Valuation Lab · Application 3.6.0 · Financial engine 3.0.0 · Financing method 1.0.0 · Ownership method 1.0.0**

- Ownership Frontier worked example: https://frontier-ai-valuation-lab.vercel.app/index.html#ownership-example
- Financing Lens worked example: https://frontier-ai-valuation-lab.vercel.app/index.html#financing-example
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

The new desktop folder is `Anthropic-vs-OpenAI-Valuation/Ownership_Frontier_V3_6_2026-10-19`. The delivery script creates a new folder and refuses to overwrite an existing destination. Original files and all earlier versioned handoffs remain separate.

## Start with Ownership Frontier

1. Open `START_HERE.html` and choose **Open Ownership Frontier**. The example opens inside Financing Lens with Anthropic Base operating assumptions, a hypothetical $250B pre-money quote, $25B primary capital, a holder starting with 10% and a 90% retention floor. The explicit pre-close bridge assumes $20B cash, $5B debt and zero other claims. These are illustration inputs, not disclosed company balances or financing terms.
2. Read the floor as a fraction of starting ownership. Keeping 90% of a 10% starting stake means retaining at least 9% of the company after the round. Existing holders do not subscribe for new shares in this illustration.
3. Inspect the current-round marker and the curve. At the example's $25B raise, the existing ownership pool retains approximately 90.91% of its starting stake and the tracked holder owns approximately 9.09% of the company. The current round is within the chosen floor. At the same $250B pre-money quote, the analytical capital boundary is approximately $27.78B, leaving approximately $2.78B of additional primary capital within that constraint.
4. Change **Minimum share of starting stake retained** using the numeric field or slider. The permitted floor is 1–100%; a 100% floor permits zero new primary capital when existing holders do not subscribe. The chart, boundary, current status and capital headroom or excess update together. The floor controls this hypothetical constraint; it does not determine how much financing the company needs or could raise.
5. Change the quote basis while keeping the entered $250B quote. A fixed pre-money quote and a fixed post-money quote produce different ownership curves. With a fixed $250B post-money quote and the same 90% floor, the boundary is $25B; the example's $25B round is at the floor. The numeric quote stays fixed when its interpretation changes.
6. Choose **Verify through the API** to compare the complete browser and server financing/ownership result. **Copy financing link**, Financing JSON and the HTML brief preserve all thirteen operating assumptions, the explicit bridge, all four round fields and the exact retention floor. The portable brief includes the ownership curve and a reopening link.

The chart shows a bounded deterministic sample axis. When an analytical boundary exceeds the supported primary-capital input range, the displayed analytical value and supported range are distinguished. A boundary or curve outside numerical resolution is labeled unavailable with an explanation; it is not substituted with a zero financing limit. The current valid round remains available when only the additional boundary or graph cannot be resolved.

## Inspect the underlying Financing Lens

1. Open `START_HERE.html` and choose **Open Financing Lens**. The example opens within the Model using Anthropic Base operating assumptions, a hypothetical $250B pre-money quote, $25B primary capital and a holder who starts with 10%. Its hypothetical pre-close bridge is $20B cash, $5B debt and zero other claims. These are illustration inputs, not disclosed company balances or financing terms.
2. Inspect the $275B post-money round price. New investors own 9.09% after the round, and the tracked holder retains 9.09%. The holder's percentage falls by about 0.91 percentage points. The immediate quoted stake value remains $25B at the assumed issue price; it is not an investment return.
3. Switch the quote between **Pre-money** and **Post-money**. The number you entered stays fixed while its interpretation changes. Under a post-money quote, primary capital must leave a positive, numerically resolvable pre-money price. Invalid inputs clear the previous output and disable sharing and verification until corrected.
4. Inspect the separate operating-EV-to-equity bridge. With the forecast fixed and all primary proceeds retained, modeled equity and cash each rise by $25B; operating enterprise value does not change. The independent round price remains editable. **Use modeled equity** is available only when the explicit bridge produces a positive price and the complete proposed round is valid.
5. **Verify through the API** compares the complete server result with the browser. **Copy financing link**, the HTML brief and the Financing Lens JSON preserve all thirteen operating assumptions, the bridge, round and ownership floor. The JSON's `shareUrl` reopens the exact analysis.

An ordinary Model visit starts with no company balance sheet supplied. An explicit hypothetical bridge enables the modeled equity comparison; round pricing and ownership remain available without it. A nonpositive modeled equity residual stays signed, has no relative price-gap percentage and cannot be copied into a positive financing quote.

Financing Lens and Ownership Frontier are part of the Model. Navigation still presents the same six destinations: Overview, Model, Thesis Lab, Value Horizon, Casebook and Evidence. Ordinary scenario links and Casebook records preserve their operating case and optional bridge; they do not save separate round terms or the ownership floor. Use a Financing Lens link or export when those settings need to travel with the case. Earlier schema-1 financing links remain supported and retain their original case and round; they contain no saved ownership constraint.

## Explore Value Horizon

1. Open `START_HERE.html` and choose **Open Value Horizon**. The default is Anthropic Base, ten continuation years after 2036 and an illustrative $250B operating-EV target.
2. Change the years to inspect how much value remains when later cash flows and residual value are excluded. The explicit 2026–2036 forecast stays intact. The perpetual reference remains visible beside the selected finite value.
3. Inspect the forecast/continuation reconciliation, terminal-PV capture milestones and target requirement. A target can be reached by the explicit forecast, require a finite horizon, remain perpetuity-only, be unreachable or fall outside a numerical/search boundary. Those outcomes are labeled explicitly.
4. **Verify through the API** checks the complete server calculation against the browser. **Copy exact link**, HTML brief and analysis JSON preserve the current case, years and target.
5. Open the case in the Model to inspect or edit its operating assumptions. The hypothetical equity bridge is carried but excluded from Horizon operating EV. A new Model-to-Horizon handoff starts with ten continuation years and the illustrative $250B target; use a Horizon link to reopen its exact saved settings.

A selected continuation horizon is a conditional stress assumption; it does not predict a company lifespan or survival probability.

## Try the connected workflow

1. Open the Overview and apply a paired stress. **Explain this change** takes the exact baseline and stressed case into Thesis Lab.
2. Inspect the signed attribution across six assumption groups. The method evaluates all 64 group combinations, equivalent to averaging all 720 orders of change.
3. Enter an illustrative target operating EV. **Use required margin as alternative** applies the solver's full-precision margin at the selected cost of capital. The separate grid-point action uses the selected sampled WACC and margin.
4. Inspect either case in the Model, edit the forecast, and **Return to this comparison**. The other case, separate bridges, exact axes and target remain attached to the workflow.
5. **Save to Casebook** and record the argument: why the case matters, what must hold, and what would change your mind. Attach selected sources, verify the captured calculation, and export complete research.

The Casebook is saved in the current browser and origin. Export JSON to keep a portable copy or move the analysis to another device. Calculation links carry the numerical snapshot; Casebook JSON and research briefs also carry the analyst notes and selected evidence. There is no automatic cloud synchronization.

## Desktop files

Open `START_HERE.html`, `Open_Live_Demo.webloc` or `Open_Ownership_Frontier.webloc` for the new ownership example. `Open_Financing_Lens.webloc` retains the ordinary financing example, and `Open_Value_Horizon.webloc` retains the Horizon workflow. `Open_Valuation_Model.webloc` opens the Overview and Model; `Open_Thesis_Lab.webloc` opens comparisons; `Open_Research_Casebook.webloc` opens saved research. Separate shortcuts open the fintech portfolio and project source. Actual preview PNGs introduce Ownership Frontier, Financing Lens, Value Horizon, Thesis Lab and the Casebook.

The downloads folder contains:

- **Financing Lens brief, PDF and HTML:** the hypothetical Anthropic Base round, its pre/post-money interpretation, ownership after issuance, signed equity bridge, complete operating inputs, source boundaries and exact reopening link. The Ownership Frontier section includes the retained-ownership curve, current point, chosen floor and capital boundary. The HTML contains no scripts.
- **Financing Lens analysis JSON:** the complete numerical snapshot, recalculated full forecast, round, pricing, optional modeled equity comparison and ownership analysis. The new schema-2 export identifies ownership method 1.0.0 and preserves `snapshot.ownership.retentionFloor` as a decimal fraction. The full `result.ownership` includes the constraint, current point, analytical/supported ceiling, bounded graph, method and warnings. Its `shareUrl` preserves every input. It is not an importable Casebook record.
- **Value Horizon brief, PDF and HTML:** the worked Anthropic Base example, with the selected continuation, a separate perpetual reference, complete inputs, explicit forecast, capture/target readouts and exact reopening links. The HTML contains no scripts.
- **Value Horizon analysis JSON:** the exact operating case, ten-year continuation, illustrative $250B target, complete recalculated curve and methodology. Use its `reopenUrl` to open the analysis. This is a separate Horizon format, not an importable Casebook record.
- **Research brief, PDF and HTML:** a complete illustrative Anthropic target-requirement argument, including exact inputs, forecasts, attribution, evidence and a reopening link.
- **Example Casebook JSON:** three clearly labeled illustrative analyses. Choose Import JSON in the Casebook to review and merge them explicitly. The two OpenAI scenarios can be selected together to compare a two-percentage-point WACC change.
- **Comparison brief, PDF and HTML:** the reviewed three-page Anthropic Base-to-Bull example, with its own exact window and target.
- **Editable Excel model:** the original five-sheet reviewed financial workbook.
- **Financial review PDF:** the original nine-page research and model-review snapshot.

`report.html` is an offline-readable financial review. `Ownership_Frontier_Methodology.md` explains the fixed-quote ownership constraint, retained-stake interpretation, analytical boundaries and graph limits. `Financing_Lens_Methodology.md` explains the equity bridge, primary issuance, precision boundaries and method sources. `Value_Horizon_Methodology.md` explains the finite-continuation formula, timing, limits and independent reference. The remaining JSON files preserve the six presets, complete modeled result snapshot, source register and contextual evidence mapping. `SHA256_manifest.json` records the release/method versions, opening destinations and exact bytes of every delivered file other than the manifest itself.

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

For Ownership Frontier, open `http://127.0.0.1:4321/index.html#ownership-example`. Its independent reference is available with:

```sh
python3 -B scripts/check_ownership_reference.py --output /tmp/ownership-reference.json
```

For the ordinary Financing Lens example, open `http://127.0.0.1:4321/index.html#financing-example`. The independent financing reference uses a separate share-issuance ledger and the Python forward model:

```sh
python3 -B scripts/check_financing_reference.py --output /tmp/financing-reference.json
```

For Value Horizon, open `http://127.0.0.1:4321/horizon.html`. Its independent reference can be run with:

```sh
python3 -B scripts/check_horizon_reference.py --output /tmp/horizon-reference.json
```

## Recreate or verify the desktop package

Run the delivery script from the source checkout. The destination must not already exist:

```sh
python3 scripts/deliver_desktop.py --destination /tmp/frontier-ownership-desktop-demo
python3 scripts/deliver_desktop.py --destination /tmp/frontier-ownership-desktop-demo --verify
```

Omitting `--destination` uses the new versioned desktop folder named above. Creation preflights the source files, copies the prior downloads and new ownership artifacts, writes the opening pages/shortcuts and manifest, then verifies the delivered bytes. The read-only `--verify` command checks complete file membership, the manifest, local opening links, shortcut destinations, current Horizon metadata and the complete Financing Lens/Ownership Frontier export structure. It requires the new packaged default to contain its ownership analysis. It decodes the schema-2 financing link and the nested operating-case link to verify all thirteen assumptions, the explicit bridge, the four round fields, retention floor and method versions against the packaged snapshot.

Validation checks the exact ownership result keys, current/ceiling/graph states, numeric bounds, complete ordered sample axis and method metadata. It rejects numeric booleans, duplicate fields, nonfinite values and missing or unsupported fields. It accepts legacy schema-1 financing exports separately when no ownership analysis is required. Financial arithmetic is checked by the independent references; package verification does not make a network request or assert that an external deployment is available.

`scripts/build_desktop_archive.py` packages a fresh delivery under `Ownership_Frontier_V3_6_2026-10-19` into `Frontier_AI_Ownership_Frontier_Package.zip`. It verifies the ZIP's membership, CRCs and exact bytes and refuses to overwrite an existing Ownership Frontier ZIP. It checks the earlier Financing Lens and Value Horizon ZIP hashes before and after construction to verify that their dated bytes remain unchanged.

## Workbook and research snapshot

Use the single scenario selector on the workbook's Assumptions sheet. Blue inputs are editable; invalid active inputs suppress the affected valuation. The forecast horizon ends in 2036. Excel, browser and PDF are separate artifacts; changing one does not silently refresh another.

Application 3.6 adds Ownership Frontier inside Financing Lens. The new workflow carries the exact retention constraint alongside the operating case and round through dedicated links, server verification and portable outputs. Value Horizon, Thesis Lab, Casebook and contextual evidence remain connected. Financial engine 3.0.0, the six published presets and research cutoff remain 18 October 2026 at 09:22 PDT. The workbook and nine-page financial review retain their reviewed bytes. Ownership, financing and Horizon methodology work is separate from this frozen company-research snapshot.

## Read the result correctly

Amounts are USD billions. The DCF produces illustrative operating enterprise values. A supplied hypothetical bridge produces a separate equity residual; a financing quote is a distinct entered price. Private financing references have their own dates and equity definitions. Current cash, debt and investor preferences are not supplied as verified facts. A hypothetical equity bridge remains separate from operating attribution.

Financing Lens assumes one primary cash round with equal participating economic rights and no fees. It excludes secondary sales, option-pool changes, SAFEs and notes, preference waterfalls, debt repayment and later rounds. Pre-close cash excludes the new proceeds. Other claims must sit outside the participating ownership pool; the same security cannot be subtracted as a senior claim and also included as participating equity. Future deficits already included in FCFF are not deducted again, and a cumulative FCFF deficit is not a recommended raise amount.

Ownership Frontier keeps the entered quote and its basis fixed while varying primary capital. Existing holders do not subscribe for additional shares. A retention floor expresses a minimum fraction of their starting ownership, rather than a minimum company valuation or investment return. Its capital boundary is conditional on those assumptions and says nothing about investor demand, negotiated terms, financing availability or future capital requirements. The supported graph and input range are numerical limits and must not be interpreted as economic limits when the analytical boundary lies beyond them.

Attribution is conditional on the selected cases and declared groups. The landscape is deterministic sensitivity analysis and assigns no probabilities or investment returns. Contextual evidence keeps the selected input's assumption status visible. Attaching a source to a saved argument does not certify its forecast.

Value Horizon retains the selected annual continuation cash flows and assigns zero cash flow and zero residual after the cutoff. It does not estimate liquidation proceeds, financing needs or investor returns. The finite value and the perpetual baseline are both operating enterprise values; neither is a quoted security price. The Horizon JSON/link preserves the continuation settings separately from Casebook notes and saved scenario/comparison records.
