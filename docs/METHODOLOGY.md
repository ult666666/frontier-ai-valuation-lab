# Valuation methodology

**Model 3.0.0. Valuation date: 18 October 2026. All amounts: USD billions.**

## 1. Separate the measured quantities

Financing benchmarks are dated equity transaction references. The model values operating cash flows. Converting operating EV into an equity indication requires current unrestricted cash, consistently classified debt and other uncovered claims. A funding announcement is not a cash balance. A pre-money ask does not become a post-money price until a transaction closes with defined terms.

Revenue also needs a period and an accounting basis. Quarterly revenue is an actual-period measure; annualized revenue extrapolates a recent pace; FY estimates are forecasts. Gross/net partner presentations can change reported sales and margin percentages without changing dollar profit. The source register retains those distinctions.

## 2. Baseline assumptions

The six operating scenarios are retained from the recovered October 16 model. The valuation calendar date advances to October 18. This isolates implementation improvements from an unsupported re-underwriting of every operating forecast. The remaining-2026 FCFF inputs remain illustrative amounts at the new date, not observed cash flows for the intervening two days.

Anthropic Base FY2026 revenue is $53.26B: reported Q1–Q3 revenue of $4.7B, $11.6B and $16.8B plus assumed Q4 revenue of $20.16B. Bear assumes Q4 equals Q3; Bull assumes Q4 grows 40% sequentially. [Quarterly source](https://www.reuters.com/business/finance/anthropics-q3-revenue-surges-45-nearly-17-billion-2026-10-14/).

OpenAI Base FY2026 revenue is an explicit $35B analyst assumption retained from V2, with $32B/$38B alternatives. It is not presented as a verified company forecast. The September annualized revenue report does not, by itself, determine full-year revenue.

## 3. Explicit forecast

The complete remaining-2026 economic FCFF is an input. It is discounted to 31 December 2026. Forecast years run from 2027 through 2036, with cash flows at each year end.

For each forecast year:

```text
Revenue = prior-year revenue × (1 + selected growth rate)
Economic EBIT = revenue × economic operating margin
Modeled tax = max(0, EBIT) × tax rate
NOPAT = EBIT − modeled tax
Net reinvestment = change in revenue / sales-to-invested-capital
Economic FCFF = NOPAT − net reinvestment
PV = FCFF / (1 + discount rate)^(actual days from valuation date / 365.25)
```

Growth has three stages: 2027–2030, 2031–2033 and 2034–2036. Margins interpolate from the 2027 input to 2030, then to 2036. Editing the 2036 margin also changes the interpolated 2031–2035 path.

The sales-to-capital proxy represents aggregate net capital expenditure, capitalized investment and working capital. Adding another capex or NWC deduction without replacing the proxy would double count investment. Economic EBIT includes a cash-equivalent allowance for stock compensation, so the cumulative economic deficit is an operating stress indicator rather than a treasury cash forecast.

The tax policy gives no immediate refund for losses and does not use modeled or historical loss carryforwards. This is a disclosed simplification. Reported net losses do not establish taxable losses or recoverable tax assets.

## 4. Stable growth

```text
Terminal revenue = 2036 revenue × (1 + terminal growth)
Terminal NOPAT = terminal revenue × stable margin × (1 − tax rate)
Reinvestment rate = terminal growth / terminal ROIC
Terminal FCFF = terminal NOPAT × (1 − reinvestment rate)
Terminal value = terminal FCFF / (discount rate − terminal growth)
PV terminal = terminal value discounted from 31 December 2036
EV = PV remaining-2026 FCFF + sum(PV 2027–2036 FCFF) + PV terminal
```

The growth/return relationship follows [Damodaran's stable-growth treatment](https://pages.stern.nyu.edu/adamodar/New_Home_Page/valquestions/a11.htm). It prevents funding perpetual growth through continuing asset depletion. The equation does not establish the appropriate company-specific ROIC, growth or discount rate.

The explicit forecast and terminal state use separate capital-return assumptions. The diagnostic `stable margin × (1 − tax) × capital turns` shows the incremental after-tax return implied by explicit capital efficiency. Because explicit investment is recognized with same-period sales growth, exact next-year reinvestment equivalence includes an additional `(1 + terminal growth)` factor. The interface flags material differences rather than automatically replacing the chosen terminal policy.

## 5. Reverse DCF

With `x = 1 + g1`, EV is a quartic polynomial. Each of the first four annual revenues has degree 1–4; later revenues and terminal value scale with `x^4`. Margin sign and the no-loss-benefit tax policy do not depend on growth.

The solver finds derivative critical points, partitions the permitted interval, checks boundaries and tangent roots, and bisects intervals with a sign change. Every result is verified through the forward engine. A target can have no solution, one solution or multiple solutions. A future NOL schedule or growth-dependent margins would change this structure and require a new solver treatment.

## 6. Validation contract

| Input | Code key | Permitted domain |
| --- | --- | --- |
| FY2026 revenue | `rev2026` | Greater than 0, at most 10,000 |
| Growth in three stages | `g1`, `g2`, `g3` | 0–200%; final stage at least terminal growth |
| Economic margin endpoints | `m27`, `m30`, `m36` | −100% to 100%; stable margin greater than 0 |
| Sales / invested capital | `turns` | 0.05–100 |
| Discount rate | `wacc` | Above terminal growth, at most 60% |
| Terminal growth | `tg` | At least 0, below both discount rate and ROIC |
| Terminal ROIC | `roic` | Above terminal growth, at most 100% |
| Remaining-2026 economic FCFF | `stub` | −10,000 to 10,000 |
| Modeled tax rate | `tax` | At least 0, below 100% |

These are application guardrails, not forecasts. Bounds prevent accidental input corruption; they do not make extreme assumptions economically plausible. Terminal spreads approaching zero remain mathematically sensitive and must be interpreted as such.

## 7. Accounting invariance and equity

A pure constant-factor revenue reclassification must preserve dollar cash flows. Scale revenue and capital turns by the same factor and divide margin percentages by that factor; keep growth, tax, terminal ROIC and the stub unchanged. The model's invariance regression confirms unchanged operating cash and EV. This is an accounting illustration, not an estimate of either company's partner take rate.

The optional bridge is `EV + hypothetical cash − hypothetical debt − hypothetical other claims`. Every component is explicit. No preference waterfall, future financing dilution or verified per-share value is modeled. The projected cumulative deficit is already represented in discounted operating cash flows and must not be deducted again.

## 8. Interpretation limits

Scenario labels do not imply assigned probabilities. A negative continuation EV is not a negative share price or proof that restructuring or abandonment options have no value. High terminal concentration exposes dependence on distant economics. Compute contracts require a payment schedule and accounting classification: services may already be reflected in operating margins, investment in the capital proxy, and funded obligations in a reconciled equity bridge. A headline commitment cannot be subtracted indiscriminately.
