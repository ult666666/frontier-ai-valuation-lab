# Research Workspace

Application 3.3 connects the existing valuation tools with a complete research record. The Model holds one editable operating forecast. Thesis Lab compares two complete cases of the same business. The Casebook captures either analysis with its rationale and chosen evidence. Navigation presents the same five destinations throughout: Overview, Model, Thesis Lab, Casebook and Evidence.

## A complete analysis, from question to record

Start with a comparison or a paired stress in the Overview. **Explain this change** opens the selected company's exact baseline and stressed assumptions in Thesis Lab. The reference retains the selected Bear/Base/Bull preset; the alternative contains the actual transformed values.

In Thesis Lab, inspect the signed allocation of the change, then explore the target-value surface. A **grid point** and a **required margin** are different choices. The grid action uses the selected sampled WACC and margin. The required-margin action uses the solver's unrounded answer at the selected WACC, retains the other eleven inputs, and is available only for a solved requirement inside the window. The resulting alternative is recalculated before display.

Either case can open in the Model for forecast inspection. A visible context strip identifies its side of the surrounding comparison. Returning sends that side's complete current assumptions and bridge back, while retaining the other side, exact target and supplied axes. A company change ends that context; a new comparison can then be started for the new company. Existing single-case and two-case share links remain valid.

Choose **Save to Casebook** from the Model or Thesis Lab. A saved record contains the exact numerical snapshot, rather than cached valuation results. The Casebook recalculates its summary and lets you record three questions:

- **Why this case?** The belief or comparison being tested.
- **What needs to hold?** The operating or valuation assumption on which that argument depends.
- **What would change your mind?** An observable result or evidence update that would trigger review.

These are analyst-authored notes. Attaching a source supplies context; it does not turn the selected growth rate, margin, WACC or other forecast input into an established fact. The [evidence-context guide](EVIDENCE_CONTEXT.md) explains the boundary between dated claims and model assumptions.

## Work with the Casebook

The Casebook supports search, company/kind filtering, exact reopening, title and note editing, source selection, export, import preview, deletion and undo. Select two saved scenarios for the same company to open a comparison with those exact endpoints. Comparisons already saved in the Casebook retain their own landscape window and target.

Editing notes never rewrites a captured financial token. To explore a different operating case, reopen the calculation, edit it in the Model or Thesis Lab, and save the new analysis. This keeps the argument attached to the values it describes.

**Verify calculation** submits only the financial inputs to the existing valuation API. A single scenario uses `value`; a comparison uses `attribute` and `landscape`. The entire returned result must match the browser calculation, including annual rows and surface values. Changing selection cancels a stale verification. The status describes this deployment-consistency check, not independent evidence supporting the assumptions. Notes and source selections stay in the browser.

### Portable outputs

| Output | What it carries | How to use it |
| --- | --- | --- |
| Calculation link | Company, exact numerical assumptions, model/date, optional bridge; comparisons also include both cases, axes and target | Reopen the calculation without a saved account |
| Casebook JSON | Complete captured calculations, titles, timestamps, notes and selected source IDs | Export all entries or one analysis; preview and merge on another browser/device |
| Research brief HTML | Recalculated case context, complete inputs, analyst reasoning, selected source dates/limits and an exact reopening link | Read offline or print to PDF; contains no scripts |
| Worked example PDF/JSON | Three labeled illustrative analyses in JSON, with one complete research brief | Inspect the workflow or import the examples explicitly |

The worked examples are supplied as downloadable artifacts. The application does not prepopulate a visitor's saved history.

## Data contract and storage behavior

The casebook envelope is `{schema,modelVersion,valuationDate,researchCutoff,entries}`. Schema 1 pins financial engine 3.0.0, valuation date 2026-10-18 and the original research cutoff. Each entry has `{id,kind,title,createdAt,updatedAt,token,notes,sourceIds}`. `kind` is `scenario` or `thesis`; the token uses the existing precision-preserving calculation codecs.

| Bound | Limit |
| --- | ---: |
| Saved analyses | 24 |
| Title | 100 characters |
| Rationale / key assumption / review trigger | 1,200 / 600 / 1,000 characters |
| Selected sources | Up to 19 unique known IDs |
| Serialized casebook | 512 KiB of UTF-8 JSON |

Imports validate the entire envelope and every record before persistence. An exact repeated record is skipped. If an imported ID conflicts with different content, both records are retained and the imported record receives a new ID. Capacity, format, version and storage failures leave the saved bytes intact. There is no automatic eviction or silent reset of corrupt storage.

Each mutation rereads persistent state. Web Locks serialize the read/modify/write operation where available; a same-document queue is the fallback. Storage events and same-page notifications refresh other open views. Browsers without Web Locks do not provide a transaction between tabs; avoid simultaneous edits in those environments. The Casebook makes conflicts with unsaved notes visible.

The storage key is `frontier-ai-valuation-lab:casebook:v1`. Storage belongs to this origin and browser profile; private browsing, data deletion or browser policy can affect availability. Export JSON for a durable portable copy. No database, account or cloud synchronization is implied.

### Earlier saved scenarios

Migration is explicit. The Casebook detects the earlier `frontier-ai-valuation-lab:scenarios:v1` format, previews valid records and identifies invalid records. It checks the original model version and complete assumptions before importing. Earlier saves did not contain a bridge, so their imported bridge is **off**. The original key is left untouched; repeated migration does not duplicate already imported records or overwrite notes subsequently edited in the Casebook.

## Implementation and verification

The implementation adds no production dependency. Pure modules handle the bounded casebook contract, browser persistence, evidence catalog, complete handoffs and standalone brief rendering. Ordinary ES modules and native HTML controls render the interface. The same Node/Vercel API continues to provide all eight financial actions.

New tests cover exact numerical preservation, conflicting IDs, malformed/oversized imports, unavailable storage, quota failures, explicit migration, escaped hostile text, full comparison return and exact target application. Real-browser checks exercise the connected workflow, source focus, contextual dialogs, keyboard operation, responsive layouts and API verification. The [verification record](VERIFICATION.md) states measured coverage and limits.

## Design references

The workflow applies consistent navigation and progressive disclosure to a research task, keeps evidence traceable to its source, and records assumptions with a reason and review trigger. These references inform the design; they do not certify the product or its financial conclusions.

- [GOV.UK Design System: Navigate a service](https://design-system.service.gov.uk/patterns/navigate-a-service/) — stable top-level navigation and clear current location.
- [WCAG 2.2: Consistent Navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html) — recurring navigation follows the same relative order.
- [The AQuA Book](https://www.gov.uk/guidance/the-aqua-book) — proportionate analytical assurance, documentation and communication of assumptions and limitations.
- [W3C PROV Model Primer](https://www.w3.org/TR/prov-primer/) — source, transformation and derived-result relationships make provenance inspectable.

The financial model remains conditional and dated. Scenario names do not encode probabilities, Shapley contributions do not establish causal effects, and operating EV is distinct from a private financing's equity value.
