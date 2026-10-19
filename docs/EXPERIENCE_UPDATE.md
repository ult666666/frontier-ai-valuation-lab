# Application 3.1: a comparison that invites investigation

## Intended outcome

Charles Dai requested a further upgrade to make the published fintech project more memorable to portfolio viewers. The release gives a first-time reviewer a clear question, an immediate interaction and a path into the full financial model. Existing authorization covers implementation, GitHub publication and the portfolio update without another approval round.

The selected design uses actual modeled quantities as its visual focus: a dark comparison introduction, three guided chapters, signed value contributions and a paired stress section. It preserves ordinary scrolling, direct controls and the detailed modeling workbench. The experience introduces no probability distribution, live feed or unsupported investment-performance claim.

## The first minute

The revenue chapter lets a reader move through the forecast with both companies on a common scale. The cash-flow chapter reveals the cost of growth and the first year of positive annual FCFF. The terminal chapter separates the present values of remaining-2026 cash flow, the explicit forecast and the continuation period.

Under the frozen Base cases, the terminal shares are 78.4% for Anthropic and 99.9% for OpenAI. Raising WACC by two percentage points changes modeled EV from $367.8B to $265.3B and from $258.9B to $172.0B, respectively, with operating cash flows unchanged. These values are reproducible outputs of the published assumptions; they are not company disclosures.

The stress section changes four explicit inputs for both selected cases. Its label follows the selected Bear/Base/Bull baseline. The comparison above continues to show that unmodified baseline, while stress results show the conditional change. Opening either company transfers its exact stressed inputs into the workbench.

## Interaction and analytical contracts

- New controls use distinct selectors so existing company, case and source navigation retain their behavior.
- Revenue and annual FCFF use common axes, direct company labels and redundant line/marker styles. The year slider uses native keyboard interaction and exposes the selected values in text and a table.
- Value contributions remain signed dollar amounts. Terminal shares above 100% remain visible; shares for nonpositive EV are undefined. Annual-positive FCFF and cumulative recovery have separate definitions.
- Stress inputs are additive percentage points for early growth, final margin and WACC, and a percentage multiplier for capital turns. Invalid transformed assumptions are rejected without clipping.
- The browser and API use the same analytics. Server verification compares the complete current result, including every forecast row. Input changes cancel pending verification.
- A share link contains a bounded, versioned fragment with the selected company, scenario, 13 assumptions and optional hypothetical equity bridge. It stores no server record. The receiver validates the full projection before applying it. Exact loaded inputs are retained until the corresponding text is edited.
- The standalone HTML brief recomputes the selected assumptions, explains the operating/equity distinction, includes forecast reconciliation and source links, and can be printed to PDF. It contains no scripts.

Application 3.1.0 and analytics 1.0.0 are separate from financial engine 3.0.0. The model, six presets, research cutoff, workbook and nine-page PDF review retain their previous reviewed bytes.

## Design research

The following primary references informed the interaction decisions. Their recommendations are design inputs, not a certification of this application.

- [Mike Bostock, How To Scroll](https://bost.ocks.org/mike/scroll/): preserve ordinary, rapid and reversible scrolling, standard keyboard behavior and a visible cue that further content follows.
- [UK Government Analysis Function, Data visualisation: charts](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts/): explanatory titles, statistical subtitles, direct labels, comparable scales and accessible supporting values.
- [W3C, Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/): visible labels, meaningful values and expected arrow/Home/End interaction; custom sliders require additional care on touch assistive technology.
- [W3C, Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html): color has redundant company labels, line styles and marker shapes.
- [W3C, Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html): the story has no autoplay cycle, and reduced-motion preferences suppress decorative transitions.

## Release presentation

The README includes a one-minute walkthrough and an actual browser capture. A 1200 × 630 social preview is rendered from current Base model outputs by the optional authoring script, scripts/build_social_preview.mjs. The portfolio card and generated case page describe the implemented comparison, stress, sharing and API behavior. Other portfolio projects are unchanged.

See [the verification record](VERIFICATION.md) for the measured checks and their limits, and [the API contract](API.md) for complete request shapes.
