# Financing Lens

## The question

**What changes when a company raises equity, and what stays fixed?**

The Financing Lens connects an operating valuation to an explicitly hypothetical equity bridge and a single primary financing round. It keeps the model's operating value separate from the price entered for the round. New capital increases retained cash and post-money equity together; it does not automatically increase operating enterprise value when the operating forecast is unchanged.

The lens uses financial engine **3.0.0**, the complete perpetual FCFF result, and the **18 October 2026** valuation date. The six operating presets, company evidence and research cutoff are unchanged. Method sources below were reviewed on **19 October 2026**; this is a methodological addition, not a refresh of company financial disclosures.

All dollar amounts are **USD billions**. Ownership and percentage comparisons are stored as **decimal fractions**, so `0.1` means 10%. Inputs are hypothetical, including any zero values. Neither company's current capitalization table or unrestricted cash balance is reconstructed.

## Inputs and boundaries

| Input | Meaning | Accepted range |
| --- | --- | --- |
| `assumptions` | All thirteen existing FCFF assumptions | Existing engine validation, with exact own fields |
| `bridge.cash` | Pre-close unrestricted cash excluded from operating FCFF | $0B–$10,000B |
| `bridge.debt` | Current debt value, classified consistently with the operating valuation | $0B–$10,000B |
| `bridge.otherClaims` | Other uncovered claims outside the participating equity pool | $0B–$10,000B |
| `round.basis` | Whether the entered equity quote is before or after the new capital | `pre` or `post` |
| `round.quote` | Hypothetical equity price for the selected basis | Positive and at most $1,000,000,000,000B |
| `round.primaryCapital` | New cash paid to the company in this round | $0B–$1,000,000,000,000B |
| `round.holderStake` | A tracked holder's ownership before the round | 0–1 |

A missing bridge is not a zero bridge. The pure function accepts omitted `bridge` or explicit `null`; both leave the model-equity comparison unavailable. An explicit `{cash:0,debt:0,otherClaims:0}` is a hypothetical zero-adjustment bridge and enables that comparison. The HTTP request always includes the `bridge` field, using `null` when absent.

Assumptions, options, bridge and round must be plain records with own enumerable data properties. Unknown fields, missing required fields, symbols, inherited fields, accessors, numeric strings, booleans and nonfinite numeric values are rejected. Null-prototype records are accepted. Inputs are copied without mutation; returned assumptions, bridge and round do not alias caller records. Numeric negative zero inputs normalize to zero.

## Model equity and round pricing

Let `V` be the unchanged modeled operating EV, `C` cash, `D` current debt, and `S` other uncovered claims. The signed pre-round equity residual is:

```text
model pre-money equity = V + C − D − S
```

Only current uncovered claims belong in this bridge. Cash already included in the entered pre-close balance must not include the proposed new capital. A financing announcement is not a current cash balance. Claims deducted here must be outside the participating equity pool: deducting a preferred claim and also counting its holders among participating owners would mix incompatible definitions.

The user independently enters the hypothetical financing price. Let `Q` be pre-money price and `R` new primary cash:

```text
pre basis:  Q = quote;       post-money = quote + R
post basis: Q = quote − R;   post-money = quote
```

Post-money entry requires `quote > R`. The lens does not assume the negotiated quote equals modeled equity, and a positive quoted round can be explored even when the modeled equity residual is nonpositive.

## Ownership and the paper mark

The round issues new equity at one price to participants with equal economic rights. Existing holders do not subscribe for new shares in this scenario.

```text
new investors' ownership       = R / (Q + R)
all existing owners' ownership = Q / (Q + R)
tracked holder after round     = u × Q / (Q + R)
other existing owners after    = (1 − u) × Q / (Q + R)
tracked holder dilution        = u × R / (Q + R)
relative dilution of old stakes = R / (Q + R)
```

Here `u` is the tracked holder's pre-round stake. `holderDilution` is an absolute ownership-fraction decrease; multiply by 100 to display percentage points. `relativeDilution` is the proportional dilution of existing stakes, and is the same for every participating old holder. It is a cohort measure even if the tracked holder's input is zero.

At an unchanged issue price, the old shares have the same quoted paper value immediately before and after issuance:

```text
holder value before = u × Q
holder value after  = (u × Q / (Q + R)) × (Q + R) = u × Q
```

Both output fields use the simplified `u × Q` expression. These are values at the hypothetical financing quote, not investment returns, realized proceeds, market-clearing resale prices or model-derived shareholder values.

## Why new cash cancels out of operating EV

The round retains all primary proceeds as cash. With unchanged operations and zero fees:

```text
cash after                   = C + R
modeled equity after         = modeled equity before + R
modeled operating EV after   = V
round-implied operating EV   = Q − C + D + S
                             = (Q + R) − (C + R) + D + S
```

`roundImpliedOperatingEv` uses the pre-money expression as its canonical calculation. The post-close expression is the same economic identity; separate floating-point evaluation can differ slightly. The dollar price gap is `Q − modeled equity before`. `priceGapPercent` divides that gap by modeled pre-money equity only when that denominator is positive and the quotient is finite. A zero, negative or numerically unbounded ratio is `null`, with an explanatory warning. Signed dollar values are preserved.

A nonpositive model residual does not establish a negative share price or value abandonment, restructuring or limited-liability options. The simple equal-rights round is conditional arithmetic, not a valuation of those options.

## Hand-calculated example

To isolate the financing arithmetic, suppose operating EV is **$100B**, pre-close cash **$20B**, debt **$5B**, and other excluded claims **$3B**. This is a mathematical fixture, not either company's preset. Model equity before financing is **$112B**.

A hypothetical **$150B pre-money** quote with **$30B primary capital** gives:

| Output | Result |
| --- | --- |
| Quoted post-money equity | $180B |
| New ownership | 16⅔% |
| Existing ownership | 83⅓% |
| A tracked 10% holder after the round | 8⅓% |
| The holder's quoted paper value, both sides | $15B |
| Post-close cash | $50B |
| Modeled equity after the raise | $142B |
| Modeled operating EV, both sides | $100B |
| Round-implied operating EV, both sides | $138B |
| Pre-money quote minus model equity | +$38B |

One independent ownership check begins with 100 old shares at $1.5B per share. New investors buy 20 shares for $30B. A holder with ten old shares has ten of 120 shares after issuance.

## Numeric policy

The lens retains the engine's IEEE-754 double-precision inputs and does not round numbers to their display precision. Each ownership fraction is divided directly rather than calculated as `1 − other fraction`; the tracked dilution is `u × new ownership`. These expressions preserve small positive interests that subtractive cancellation could otherwise erase.

For post-money entry with positive capital, a positive pre-money remainder at or below `32 × Number.EPSILON × max(quote, primaryCapital)` is rejected with a precision explanation. This is a conservative supported-resolution policy: nearby binary subtraction can be exact, but a tiny economic remainder magnifies rounding in the two entered amounts. It is not an interval-arithmetic guarantee or a probability statement. Zero capital does not trigger this subtraction guard.

If a positive pre-money amount or positive capital underflows its ownership fraction to zero, the calculation is rejected. The independent round-input caps apply before addition, so a valid pre-money quote plus capital can produce post-money equity up to $2,000,000,000,000B. These technical caps do not imply economically plausible valuations.

## Pure function and API

`public/lib/financing.js` exports `FINANCING_VERSION = '1.0.0'`, `FINANCING_MAX_AMOUNT = 1e12`, and:

```js
financingLens(assumptions, {
  bridge: {cash:20, debt:5, otherClaims:3}, // or null
  round: {basis:'pre', quote:150, primaryCapital:30, holderStake:0.1}
});
```

The stable result contains:

| Field | Content |
| --- | --- |
| `version`, `assumptions`, `baseline` | Lens version, detached exact FCFF inputs, and the full unchanged `project()` result |
| `round` | The four validated input fields, retaining the selected quote basis |
| `pricing` | `preMoney`, `postMoney`, `primaryCapital`, `existingOwnership`, `newOwnership`, `holderBefore`, `holderAfter`, `otherExistingAfter`, `holderDilution`, `relativeDilution`, `holderValueBefore`, `holderValueAfter` |
| `bridge` | Complete existing `bridgeEquity()` result, or `null` |
| `comparison` | `modelPreMoneyEquity`, `modelPostMoneyEquity`, `cashBefore`, `cashAfter`, `operatingEvBefore`, `operatingEvAfter`, `roundImpliedOperatingEv`, `priceGap`, `priceGapPercent`; or `null` |
| `method` | Fixed method flags for a simple primary round, perpetual FCFF, retained cash, zero fees and equal participating rights; explicit bridge status |
| `warnings` | Conditional explanations for nonpositive model equity or a percentage outside the numeric range |

`POST /api/valuation` accepts exactly `action`, `assumptions`, `bridge`, and `round`:

```json
{
  "action":"financing",
  "assumptions":{"rev2026":100,"g1":0.04,"g2":0.04,"g3":0.04,"m27":0.2,"m30":0.2,"m36":0.2,"turns":2.5,"wacc":0.1,"tg":0.03,"roic":0.2,"stub":-3,"tax":0.25},
  "bridge":{"cash":20,"debt":5,"otherClaims":3},
  "round":{"basis":"pre","quote":150,"primaryCapital":30,"holderStake":0.1}
}
```

The response retains the existing `appVersion`, `modelVersion`, `valuationDate`, and `result` envelope. Domain and precision errors return HTTP 400 without a stale result. The existing JSON media, UTF-8, 16 KiB body, no-store and content-type protections apply. The browser and server use the same production function; agreement checks deployment consistency, while the separate Python reference and hand calculations provide independent arithmetic evidence.

## Deliberate exclusions

This version models one primary cash round with retained proceeds and equal participating economic rights. It excludes transaction fees, option-pool changes, SAFE or convertible-note conversion, liquidation preferences, anti-dilution provisions, secondary sales, immediate debt repayment, taxes on transactions, pro-rata subscriptions, future rounds, realized investment returns and contractual funding conditions.

The existing cumulative economic deficit is already represented in discounted FCFF and must not be deducted again. It also includes an economic allowance for stock compensation and is not a treasury cash forecast. The lens does not use that measure to recommend a raise. Compute commitments, future financing and historical funding headlines must not be entered indiscriminately as current debt or cash.

## Primary method sources

Reviewed **19 October 2026**:

1. Aswath Damodaran, NYU Stern, [Financial measures and ratios](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/definitions.html). Distinguishes operating enterprise value from total firm/equity value and explains the non-operating cash adjustment and consistent debt/minority-interest treatment.
2. Aswath Damodaran, NYU Stern, [What should you subtract out to get to equity value?](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/debttosubtract.htm). Addresses current debt and other uncovered claims, consistency with the cost of capital, and why future debt issuance is not deducted from current equity value.
3. Geoff Ralston, Y Combinator, [A Guide to Seed Fundraising](https://www.ycombinator.com/blog/how-to-raise-a-seed-round), 7 January 2016, Equity section. Derives ownership from a priced primary round and identifies option pools, preferences and other contractual terms that the simple example omits. This source supports stable financing arithmetic; its historical fundraising benchmarks are not used as current market data.

The identities and restrictions above are this project's explicit implementation contract. They do not establish either company's real financing terms, balance sheet, shareholder rights or investment merit.

## Ownership Frontier in application 3.6

The same financing case can include an optional retained-stake constraint. See [Ownership Frontier](OWNERSHIP_FRONTIER.md) for the fixed-pre-money and fixed-post-money derivations, supported floor range, graph domain, numerical boundary policy, and backward-compatible API/link formats. The financing engine described above remains version 1.0.0. The current complete worked example includes a 90% retained-starting-stake floor.
