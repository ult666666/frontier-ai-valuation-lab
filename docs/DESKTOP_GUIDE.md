# Open the research workspace

A [portable ZIP package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Financing_Lens_Package.zip) includes the new Financing Lens example, earlier worked briefs, workbook, evidence and opening guide. Extract the folder and open `START_HERE.html`. This download is independent of whether a desktop device is connected. The [earlier Value Horizon package](https://frontier-ai-valuation-lab.vercel.app/downloads/Frontier_AI_Value_Horizon_Package.zip) remains available as a dated handoff.

**Frontier AI Valuation Lab · Application 3.5.0 · Financial engine 3.0.0 · Financing method 1.0.0**

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

The new desktop folder is `Anthropic-vs-OpenAI-Valuation/Financing_Lens_V3_5_2026-10-19`. The delivery script creates a new folder and refuses to overwrite an existing destination. Original files and all earlier versioned handoffs remain separate.

## Start with Financing Lens

1. Open `START_HERE.html` and choose **Open Financing Lens**. The example opens within the Model using Anthropic Base operating assumptions, a hypothetical $250B pre-money quote, $25B primary capital and a holder who starts with 10%. Its hypothetical pre-close bridge is $20B cash, $5B debt and zero other claims. These are illustration inputs, not disclosed company balances or financing terms.
2. Inspect the $275B post-money round price. New investors own 9.09% after the round, and the tracked holder retains 9.09%. The holder's percentage falls by about 0.91 percentage points. The immediate quoted stake value remains $25B at the assumed issue price; it is not an investment return.
3. Switch the quote between **Pre-money** and **Post-money**. The number you entered stays fixed while its interpretation changes. Under a post-money quote, primary capital must leave a positive, numerically resolvable pre-money price. Invalid inputs clear the previous output and disable sharing and verification until corrected.
4. Inspect the separate operating-EV-to-equity bridge. With the forecast fixed and all primary proceeds retained, modeled equity and cash each rise by $25B; operating enterprise value does not change. The independent round price remains editable. **Use modeled equity** is available only when the explicit bridge produces a positive price and the complete proposed round is valid.
5. **Verify through the API** compares the complete server result with the browser. **Copy exact link**, the HTML brief and the Financing Lens JSON preserve all thirteen operating assumptions, the bridge and the round. The JSON's `shareUrl` reopens the exact analysis.

An ordinary Model visit starts with no company balance sheet supplied. An explicit hypothetical bridge enables the modeled equity comparison; round pricing and ownership remain available without it. A nonpositive modeled equity residual stays signed, has no relative price-gap percentage and cannot be copied into a positive financing quote.

Financing is part of the Model. Navigation still presents the same six destinations: Overview, Model, Thesis Lab, Value Horizon, Casebook and Evidence. Ordinary scenario links and Casebook records preserve their operating case and optional bridge; they do not save the separate round terms. Use a Financing Lens link or export when the round needs to travel with the case.

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

Open `START_HERE.html`, `Open_Live_Demo.webloc` or `Open_Financing_Lens.webloc` for the Financing Lens example. `Open_Value_Horizon.webloc` retains the Horizon workflow. `Open_Valuation_Model.webloc` opens the Overview and Model; `Open_Thesis_Lab.webloc` opens comparisons; `Open_Research_Casebook.webloc` opens saved research. Separate shortcuts open the fintech portfolio and project source. Preview PNGs introduce Financing Lens, Value Horizon, Thesis Lab and the Casebook.

The downloads folder contains:

- **Financing Lens brief, PDF and HTML:** the hypothetical Anthropic Base round, its pre/post-money interpretation, ownership after issuance, signed equity bridge, complete operating inputs, source boundaries and exact reopening link. The HTML contains no scripts.
- **Financing Lens analysis JSON:** the complete numerical snapshot, recalculated full forecast, round, pricing and optional modeled equity comparison. Its own versioned format and `shareUrl` preserve every round input. It is not an importable Casebook record.
- **Value Horizon brief, PDF and HTML:** the worked Anthropic Base example, with the selected continuation, a separate perpetual reference, complete inputs, explicit forecast, capture/target readouts and exact reopening links. The HTML contains no scripts.
- **Value Horizon analysis JSON:** the exact operating case, ten-year continuation, illustrative $250B target, complete recalculated curve and methodology. Use its `reopenUrl` to open the analysis. This is a separate Horizon format, not an importable Casebook record.
- **Research brief, PDF and HTML:** a complete illustrative Anthropic target-requirement argument, including exact inputs, forecasts, attribution, evidence and a reopening link.
- **Example Casebook JSON:** three clearly labeled illustrative analyses. Choose Import JSON in the Casebook to review and merge them explicitly. The two OpenAI scenarios can be selected together to compare a two-percentage-point WACC change.
- **Comparison brief, PDF and HTML:** the reviewed three-page Anthropic Base-to-Bull example, with its own exact window and target.
- **Editable Excel model:** the original five-sheet reviewed financial workbook.
- **Financial review PDF:** the original nine-page research and model-review snapshot.

`report.html` is an offline-readable financial review. `Financing_Lens_Methodology.md` explains the equity bridge, primary issuance, precision boundaries and method sources. `Value_Horizon_Methodology.md` explains the finite-continuation formula, timing, limits and independent reference. The remaining JSON files preserve the six presets, complete modeled result snapshot, source register and contextual evidence mapping. `SHA256_manifest.json` lists the exact bytes of every delivered file other than the manifest itself.

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

For Financing Lens, open `http://127.0.0.1:4321/index.html#financing-example`. The independent financing reference uses a separate share-issuance ledger and the Python forward model:

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
python3 scripts/deliver_desktop.py --destination /tmp/frontier-financing-desktop-demo
python3 scripts/deliver_desktop.py --destination /tmp/frontier-financing-desktop-demo --verify
```

Omitting `--destination` uses the new versioned desktop folder named above. Creation preflights the source files, copies the prior downloads and new financing artifacts, writes the opening pages/shortcuts and manifest, then verifies the delivered bytes. The read-only `--verify` command checks complete file membership, the manifest, local opening links, shortcut destinations, current Horizon metadata and the Financing Lens snapshot/result structure. It decodes the financing link to verify that all thirteen assumptions, the explicit bridge and the four round fields reproduce the packaged snapshot. Financial arithmetic is checked separately by the documented references. Package verification does not make a network request or assert that an external deployment is available.

`scripts/build_desktop_archive.py` packages a fresh delivery under `Financing_Lens_V3_5_2026-10-19` and verifies the ZIP's membership, CRCs and exact bytes. It refuses to overwrite an existing Financing Lens ZIP. Earlier versioned packages are preserved.

## Workbook and research snapshot

Use the single scenario selector on the workbook's Assumptions sheet. Blue inputs are editable; invalid active inputs suppress the affected valuation. The forecast horizon ends in 2036. Excel, browser and PDF are separate artifacts; changing one does not silently refresh another.

Application 3.5 adds Financing Lens inside the Model and carries its exact round through dedicated links, server verification and portable outputs. Value Horizon, Thesis Lab, Casebook and contextual evidence remain connected. Financial engine 3.0.0, the six published presets and research cutoff remain 18 October 2026 at 09:22 PDT. The workbook and nine-page financial review retain their reviewed bytes. Horizon and financing methodology references were reviewed separately from this frozen company-research snapshot.

## Read the result correctly

Amounts are USD billions. The DCF produces illustrative operating enterprise values. A supplied hypothetical bridge produces a separate equity residual; a financing quote is a distinct entered price. Private financing references have their own dates and equity definitions. Current cash, debt and investor preferences are not supplied as verified facts. A hypothetical equity bridge remains separate from operating attribution.

Financing Lens assumes one primary cash round with equal participating economic rights and no fees. It excludes secondary sales, option-pool changes, SAFEs and notes, preference waterfalls, debt repayment and later rounds. Pre-close cash excludes the new proceeds. Other claims must sit outside the participating ownership pool; the same security cannot be subtracted as a senior claim and also included as participating equity. Future deficits already included in FCFF are not deducted again, and a cumulative FCFF deficit is not a recommended raise amount.

Attribution is conditional on the selected cases and declared groups. The landscape is deterministic sensitivity analysis and assigns no probabilities or investment returns. Contextual evidence keeps the selected input's assumption status visible. Attaching a source to a saved argument does not certify its forecast.

Value Horizon retains the selected annual continuation cash flows and assigns zero cash flow and zero residual after the cutoff. It does not estimate liquidation proceeds, financing needs or investor returns. The finite value and the perpetual baseline are both operating enterprise values; neither is a quoted security price. The Horizon JSON/link preserves the continuation settings separately from Casebook notes and saved scenario/comparison records.
