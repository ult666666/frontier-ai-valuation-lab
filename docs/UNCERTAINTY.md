# Valuation under uncertainty

Uncertainty method **1.0.0** adds a seeded Monte Carlo simulation and a tornado chart to the Model workspace and the API. It keeps financial engine **3.0.0**, the **18 October 2026** valuation date and application **4.0.0**. The three Bear, Base and Bull cases stay as they are. The simulation shows the spread of values between and around them when the main drivers are uncertain at the same time.

Every number it produces describes the distributions an analyst enters. It is not a forecast, a calibrated probability, a valuation of Anthropic or OpenAI, or investment advice, and the project is not affiliated with either company.

## What it answers

| Output | Question |
| --- | --- |
| P5, P25, P50, P75, P95 | What range of modeled value do the entered ranges imply? |
| Share above a hurdle | In what share of draws does value exceed a chosen hurdle, for example a financing price? |
| Tornado | Which single driver moves value most between its own 10th and 90th percentiles? |
| Convergence diagnostics | Are there enough draws for the reported mean and median to be stable? |

[Aswath Damodaran's *Probabilistic Approaches*](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/probabilistic.pdf) describes simulation in valuation and its main risk: output that looks precise while resting on guessed distributions. This method keeps the distributions visible and labels the output as conditional on them.

## Drivers

Each draw changes up to five drivers. The other eight model inputs (2026 revenue, the 2027 and 2030 margins, capital turns, terminal ROIC, the stub cash flow and tax) stay at the case values.

| Key | Driver | Unit | Base value | How it enters the engine |
| --- | --- | --- | --- | --- |
| `growth` | Revenue growth path | multiple | 1 | Multiplies `g1`, `g2` and `g3`, so the shape of the growth path is kept |
| `m36` | Terminal operating margin | fraction | case `m36` | Sets the 2036 margin, which also drives the 2031 to 2035 interpolation and the terminal year |
| `wacc` | Discount rate | fraction | case `wacc` | Discounts every cash flow |
| `tg` | Terminal growth | fraction | case `tg` | Growth of the growing-perpetuity terminal value |
| `dilution` | Uncompensated dilution | fraction | 0 | Existing holders keep `(1 − d)` of modeled equity. Needs a hypothetical bridge |

The engine values its terminal year with a growing perpetuity (Gordon growth), so terminal growth is the terminal driver. An exit multiple would be a second terminal method that the engine does not have; adding one would duplicate the valuation formulas.

Without a bridge the measure is operating enterprise value. With a hypothetical cash, debt and other-claims bridge it is modeled equity (`EV + cash − debt − other claims`, computed by the engine's `bridgeEquity`). With a dilution driver it is equity after dilution. Dilution here means shares issued without cash in this model, such as option grants. A priced round that brings in cash is the Financing Lens's job. Negative equity stays signed, as everywhere else in the project.

## Distributions

Every distribution is bounded, so the whole range can be checked before any draw:

| Type | Fields | Inverse CDF |
| --- | --- | --- |
| `uniform` | `min`, `max` | `min + (max − min) u` |
| `triangular` | `min`, `mode`, `max` | The two closed-form square-root branches either side of the mode |
| `normal` | `mean`, `sd`, `min`, `max` | Truncated normal: `mean + sd Φ⁻¹(Φ(α) + u (Φ(β) − Φ(α)))` |

A distribution with zero spread (`min = max`, or `sd = 0`) returns its single value exactly. When every included driver has zero spread at its base value, every percentile, the mean, the minimum and the maximum equal the deterministic case bit for bit.

**No draw is clipped or discarded.** With the other inputs fixed, every model constraint (for example `tg < wacc` or `tg ≤ g3`) is linear in the five driver values, so the set of valid inputs is convex. A box is inside a convex set when its corners are. Validation therefore runs the engine's own `validate` on all 2^k corners of the box spanned by each driver's range and base value. If any corner is invalid, the request is rejected and the error names that corner. This also covers every tornado point.

## Correlation: Gaussian copula with a Cholesky factor

The analyst enters a correlation matrix `C` for the drivers' latent normal scores (`null` means independent drivers). Each draw:

1. turns `k` uniforms into independent standard normals `e` with the inverse normal CDF;
2. forms correlated scores `z = L e`, where `L Lᵀ = C` is the Cholesky factor;
3. maps each score to a uniform `Φ(z_j)` and then to the driver through its own inverse CDF.

This is the Gaussian copula ([McNeil, Frey and Embrechts, *Quantitative Risk Management*, 2015, chapter 7](https://press.princeton.edu/books/hardcover/9780691166278/quantitative-risk-management); [Glasserman, *Monte Carlo Methods in Financial Engineering*, 2003, section 2.3](https://link.springer.com/book/10.1007/978-0-387-21617-1)). Each driver keeps exactly its entered distribution, while the dependence follows `C`. Because the marginal maps are increasing, rank correlations are preserved: the Spearman correlation of two drivers is `(6/π) arcsin(ρ/2)` for score correlation `ρ`.

`C` must be square with the same order as `drivers`, exactly symmetric, with a unit diagonal and entries in [−1, 1]. It must also be **positive semidefinite**: no set of drivers can have pairwise correlations whose matrix has a negative eigenvalue. A cyclic Jacobi eigenvalue routine ([Golub and Van Loan, *Matrix Computations*, section 8.5](https://jhupbooks.press.jhu.edu/title/matrix-computations)) finds the smallest eigenvalue. Below `−1e-10` the request is rejected and the message reports that eigenvalue. Singular matrices are accepted: a Cholesky pivot at or below `1e-10` is treated as an exact linear dependence, so a correlation of 1 makes two scores identical. The result reports the factor, the eigenvalues, the reconstruction error `max |L Lᵀ − C|` and the correlation achieved in the draws.

The engine does not repair an invalid matrix (for example with Higham's nearest-correlation-matrix method). It explains the problem and lets the analyst change the entries.

## Seeded random numbers that match across runtimes

- **Generator.** xoshiro128** 1.1 ([Blackman and Vigna, 2021](https://doi.org/10.1145/3460772); [reference code](https://prng.di.unimi.it/)). Its 128-bit state is the low and high halves of the first two SplitMix64 outputs of the seed ([Steele, Lea and Flood, 2014](https://doi.org/10.1145/2714064.2660195)), as the xoshiro authors recommend. The seed is a whole number from 0 to 4,294,967,295 and is echoed in every result.
- **Uniforms.** Two 32-bit outputs give 26 high bits each. The 52-bit integer `k` maps to `(k + 0.5) / 2^52`, which is exact and never 0 or 1.
- **Stream layout.** Draw `i` uses uniforms `k·i` to `k·i + k − 1`, one per driver in request order. The stability replicates use seeds `s + 1` to `s + 4`, modulo 2^32.
- **Normal quantile.** [Wichura (1988), Algorithm AS 241](https://doi.org/10.2307/2347330), the same algorithm as CPython's `statistics.NormalDist.inv_cdf`. A test checks the coefficients against the significand sums printed in the paper.
- **Normal CDF.** A Taylor series for `|z| < 2.5` ([Marsaglia, 2004](https://doi.org/10.18637/jss.v011.i04)) and Laplace's continued fraction for the tail, evaluated at a fixed depth of 100. The density splits `z` on a 1/16 grid so the large exponent argument stays exact ([Cody, 1969](https://doi.org/10.1090/S0025-5718-1969-0247736-4)).

ECMAScript does not fix the last bit of `Math.exp` or `Math.log`. On the test machine, 1,967 of 40,000 `Math.exp` and `Math.log` results differ between Node 24.22.1 and Chromium 153 (`node tests/uncertainty-browser.mjs`). So the simulation layer uses ports of the fdlibm 5.3 `exp` and `log` algorithms ([netlib fdlibm](https://www.netlib.org/fdlibm/)), written with additions, multiplications, divisions and exponent-bit edits. IEEE 754 rounds those the same way in every conforming engine. The same harness found 0 differences for the ports and 0 for the `**` operator that the unchanged engine uses. The browser and the API therefore return byte-identical JSON for the same request.

## Statistics

- **Percentiles** use [Hyndman and Fan (1996)](https://doi.org/10.1080/00031305.1996.10473566) definition 7 (linear interpolation between order statistics, the default in R and NumPy). Positions are computed in exact integer arithmetic.
- **Share above the hurdle** counts draws strictly above it. Its Monte Carlo uncertainty is a [Wilson (1927)](https://doi.org/10.1080/01621459.1927.10502953) 95% score interval. That interval reflects sampling error only, not doubt about the entered distributions.
- **Mean and standard error.** The mean is summed as deviations from the deterministic case, so a zero-spread run returns the case exactly. The standard error of the mean is `s / √n`.
- **Median stability.** The same number of draws is rerun with four more seeds. The status is `stable` when the five medians span at most 2% of the primary median, `unstable` above that, and `unavailable` when the median is zero. The result also lists P5, P50 and P95 for the first 1/8, 1/4, 1/2 and all of the primary draws.
- **Histogram.** 24 equal-width bins between P1 and P99, with counts below and above that range, so every draw is counted. A value on an edge belongs to the bin that starts there.

## Tornado

For each driver the engine evaluates the case with that driver at its own P10 and then its P90, all other drivers at their base values. Bars are sorted by swing `|V(P90) − V(P10)|`, largest first, with ties in request order. The P10 and P90 are exact quantiles of the entered distribution, not sample quantiles, so the tornado does not depend on the seed.

Quantiles are equivariant under monotone maps: the P10 of `T(X)` is `T(P10 of X)` for an increasing `T`. So rescaling or reparameterizing a driver, for example entering a margin in percent or a discount rate as a log, cannot reorder the tornado. A tornado built from the mean plus or minus 1.28 standard deviations lacks this property. `tests/uncertainty.test.js` checks the invariance over 240 random driver sets and six monotone transforms, including decreasing ones. A version that uses the mean plus or minus 1.28 standard deviations fails that test.

The tornado is one-way: it ignores interactions and correlation. The simulation is where joint movement shows.

## Limits

- Draws are equally weighted. The method says nothing about which distributions are right; those are analyst inputs.
- At most five drivers, 200 to 20,000 draws and a 16 KiB request. The largest permitted request (five drivers, 20,000 draws, five seeds) took 979 ms in `node --test tests/uncertainty-api.test.js` on the development machine; the test fails above 6 s.
- The copula is Gaussian. It has no tail dependence, so joint extremes may be rarer than in a fat-tailed copula.
- Only the Model workspace and the API run the simulation. Capital Studio, Thesis Lab and Value Horizon keep their finite cases.
- Value Horizon still uses `Math.exp`, so its existing browser harness reports last-bit differences between Chromium 153 and Node 24. That predates this method and is unchanged.

## Verification

| Check | Command |
| --- | --- |
| Generator vectors, AS 241 sums, fdlibm accuracy, correlation recovery, convergence, zero-spread identity, monotone-transform tornado property, validation | `npm test` (`tests/uncertainty.test.js`, `tests/uncertainty-api.test.js`, `tests/uncertainty-chart.test.js`) |
| Independent Python reference for the generator, normal functions, positive semidefiniteness, copula, percentiles, replicates and tornado | `python3 -B scripts/check_uncertainty_reference.py --output /tmp/uncertainty-reference.json` |
| Real browser: accessibility, keyboard, stale results, mobile layout and byte-identical browser/API results | `PORT=4341 npm start`, then `node tests/uncertainty-browser.mjs` (see [VERIFICATION.md](VERIFICATION.md)) |
