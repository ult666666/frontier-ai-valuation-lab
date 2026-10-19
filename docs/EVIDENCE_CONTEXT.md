# Evidence beside the current assumption

## Purpose

The contextual evidence panel connects a selected model input to the dated observations, source limitations and modeling judgments relevant to it. It can show one current case from the model or both cases from Thesis Lab. Opening the panel does not change assumptions, recalculate a different scenario, or navigate away from the surrounding analysis.

All thirteen numerical inputs remain **analyst or user assumptions**. A related company disclosure, reported observation or academic relationship does not establish the particular forecast value chosen by the reader.

The evidence catalog uses financial engine **3.0.0** and the research snapshot of **18 October 2026, 09:22:26 America/Los_Angeles (16:22:26 UTC)**. It introduces no financial-data refresh. The existing fact ledger, research register, presets and financial model remain the source materials for this release.

## Three inputs, one reproducible catalog

`data/fact-ledger.json` supplies 21 recorded facts. The adapter preserves each fact's ID, company, metric, original value, units, observation label, reporting status, source reference and model implication. Structured values retain their original keys and numerical values. Observation labels remain text because some describe quarters, approximate dates, historical balance dates or multi-year periods.

`data/research.json` supplies the complete nineteen-source presentation register, including original publisher, publication label, title, URL, evidence class, intended use and limitation. This includes two references without dedicated fact-ledger rows:

- **S18** supplies the reported quarterly components used in the illustrative Anthropic full-year revenue construction.
- **S19** supplies the terminal reinvestment relationship. It does not establish a company-specific growth rate, discount rate or return on capital.

`data/assumption-context.json` supplies a small, explicit interpretation layer: each source's company scope and the relationship between groups of evidence and model inputs. It adds explanation rather than new reported financial observations. The original ledger's qualitative confidence descriptions are not converted into ratings, numeric scores, probabilities or completion badges.

Run `node scripts/build_evidence.js` to validate these inputs and produce `public/data/evidence.json`. The script can also be imported from the main build before public assets are staged. It writes deterministic JSON with no generation-time timestamp. The public catalog includes all 21 facts and all nineteen sources, even when a selected input only needs a subset.

## Relationship classes

| Class | Meaning | Example and boundary |
| --- | --- | --- |
| `context` | An observation helps frame the economic question behind an assumption. | Historical operating costs inform questions about future margins; they do not disclose the selected 2036 margin. |
| `arithmetic_component` | A reported component participates in a stated analyst calculation. | S18 supplies Anthropic's reported quarterly components. The illustrative fourth quarter and full-year total remain assumptions and derived arithmetic. |
| `method` | A source explains a relationship used by the valuation method. | Terminal reinvestment equals perpetual growth divided by terminal ROIC. This supports the formula, not its selected numerical inputs. |
| `boundary` | The record explains why available evidence does not directly establish an input. | Financing equity references do not establish WACC. Historical losses and multi-year commitments do not establish remaining-2026 FCFF. |

These are descriptions of use, not a ranking of evidentiary strength. Each context includes a visible summary and a visible limitation. A boundary may have no source when the snapshot does not contain direct company support for the numerical input, as with the simplified tax assumption.

## Coverage of the thirteen inputs

| Inputs | Context presented |
| --- | --- |
| `rev2026` | Reported revenue periods and annualized pace, plus a clearly labeled account of the published Base construction or retained illustrative input. The current case value appears separately. |
| `g1`, `g2`, `g3` | Revenue observations and, where applicable, attributed management forecasts. Future growth remains conditional; the final explicit stage also connects to continuation economics. |
| `m27`, `m30`, `m36` | Historical operating costs, partner accounting and commercial terms. Adjusted profitability retains its distinction from GAAP EBIT and FCFF. |
| `turns` | Capacity agreements, infrastructure obligations and reported funding needs. Service commitments, leases, financing and reinvestment retain separate meanings. |
| `wacc` | The limits of financing and governance evidence, alongside the continuation-value method. Equity financing references are not operating enterprise value or disclosed discount rates. |
| `tg`, `roic` | The terminal reinvestment relationship and relevant capital context. Neither company-specific long-run input is established by the methodology reference. |
| `stub` | The absence of a verified cash-flow schedule for the remaining part of 2026. Annual losses, current cash and nominal multi-year obligations are not interchangeable with this FCFF input. |
| `tax` | The explicit policy of applying the selected rate to positive EBIT, without a loss benefit or tax-loss carryforward. The default and any edited rate remain assumptions. |

## Validation and catalog shape

`public/lib/evidence.js` exports the pure `buildEvidenceCatalog({research, ledger, mapping})` function. It returns a detached, recursively frozen object:

```js
{
  schemaVersion: 1,
  modelVersion,
  valuationDate,
  researchCutoff,
  currency,
  companies: {
    Anthropic: { inputs: { rev2026: { /* field definition and contextIds */ } } },
    OpenAI: { inputs: { rev2026: { /* field definition and contextIds */ } } }
  },
  sources: [ /* all nineteen source records, with declared companies */ ],
  facts: [ /* all 21 original observations, with public field names */ ],
  contexts: [ /* validated relationships, factIds and resolved sourceIds */ ]
}
```

The adapter rejects unsupported snapshot versions, inconsistent cutoffs, unknown or duplicate source/fact/context IDs, absent source scopes, cross-company references, unknown model inputs, missing field coverage, unsupported relationship classes, nonfinite datum values, unsafe source URLs and unbounded context text. Fact-ledger source URLs must match their entries in the presentation register. Source references inherited from facts are deduplicated in the resolved context while preserving register order.

The module also exports:

- `EVIDENCE_INPUT_KEYS`: the frozen list of thirteen supported keys.
- `EVIDENCE_FIELDS`: frozen labels, units, definitions and model limits.
- `evidenceButtonLabel(key)`: an accessible contextual trigger label.
- `formatEvidenceValue(key, value)`: a display of the full round-trippable input digits in the field's units. Percentage formatting shifts decimal digits without introducing multiplication artifacts or rounding a precise shared input.

No evidence value is automatically applied to a forecast field. The adapter does not estimate forecast probabilities, calculate a source score or infer a missing balance sheet.

## Browser integration

Load `public/evidence-context.css` and import the widget:

```js
import {createEvidenceContext} from './evidence-context.js';
import {evidenceButtonLabel} from './lib/evidence.js';

const evidence = createEvidenceContext({research, catalog});

// Read the current validated case at the moment the reader opens the panel.
evidence.open({
  company: 'Anthropic',
  key: 'm36',
  cases: [
    {label: 'Reference · Base', assumptions: currentReference},
    {label: 'Alternative · edited', assumptions: currentAlternative}
  ]
});
```

The returned interface is `{open, close, destroy}`. `open` accepts a supported company/key and zero, one or two cases. A case contains a nonempty label of at most 100 characters and a complete assumption object that passes `project()`. Both current values retain their exact digits and are visibly labeled as assumptions.

When a draft is invalid, call `open` with `cases: []`. The panel shows **Current input unavailable**, removes any previously shown values and leaves the dated evidence accessible. Do not pass an earlier valid case as though it represented the invalid draft.

Host buttons can use `.evidence-context-trigger`, `data-evidence-key`, `aria-haspopup="dialog"` and the label from `evidenceButtonLabel(key)`. Keep them disabled until the catalog is available. If evidence cannot load, provide a clear unavailable message in the host; the model itself does not depend on the panel.

The native dialog focuses its heading on entry. Its Tab boundary preserves keyboard focus within the dialog, Escape and the Close button dismiss it, and dismissal returns focus to the invoking control. The body scrolls within a bounded viewport while the title and close control remain available. Model definitions, input limits, evidence limitations, observation periods and source limitations are visible without opening a disclosure. Optional source-use notes use native `<details>`.

All dynamic text is inserted as text. Source links allow HTTP or HTTPS, open in a separate tab, include `noopener noreferrer`, and announce that behavior through their accessible labels. They preserve the current analysis in its existing tab. The widget writes no browser storage, financial token, server record or model input.

## Verification

`tests/evidence.test.js` covers original-value and period preservation, complete source and field coverage, deterministic generation, nonmutation, duplicate and cross-company references, unsupported mappings, snapshot mismatches, unsafe URLs, nonfinite data, precise input display and equivalence of the generated public catalog to a fresh build.

Browser verification exercises keyboard entry, focus containment, Escape and focus return, both exact current values, invalid-draft states, hostile text as literal content, source-link behavior, viewport containment and horizontal overflow. These checks assess the implemented interactions; they do not certify financial assumptions or establish the completeness of the underlying company disclosures.

## Primary design and analytical references

- [GOV.UK Design System — Navigate a service](https://design-system.service.gov.uk/patterns/navigate-a-service/): consistent orientation and a restrained set of useful top-level sections for repeated, multi-task services.
- [GOV.UK Design System — Details](https://design-system.service.gov.uk/components/details/): reveal secondary information progressively while keeping information most readers need visible.
- [GOV.UK Design System — Summary list](https://design-system.service.gov.uk/components/summary-list/): key/value records for metadata; tables remain appropriate for tabular comparisons.
- [W3C — PROV Model Primer](https://www.w3.org/TR/prov-primer/): conceptual distinctions between entities, activities, derivation, revision and time. This application uses an explicit JSON relationship layer; it does not claim PROV conformance.
- [UK Government — The AQuA Book](https://www.gov.uk/guidance/the-aqua-book): assumption rationale, traceable analytical records, model documentation and conditions under which analysis remains valid. The institutional governance process described in the book is not represented as a certification of this independent project.
- [Government Office for Science — The Futures Toolkit](https://www.gov.uk/government/publications/futures-toolkit-for-policy-makers-and-analysts/the-futures-toolkit-html): possible futures, coherent scenario logic and the distinction between scenarios and predictions. The application's parameterized DCF cases are narrower than the toolkit's full futures process.
