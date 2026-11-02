#!/usr/bin/env python3
"""Independently challenge the Monte Carlo layer: generator, normal functions,
copula, percentiles, hurdle shares, seed replicates and the tornado.

No application module is imported into this reference. Integer arithmetic
reproduces SplitMix64 and xoshiro128**, CPython's statistics.NormalDist gives
the normal quantile, a 60-digit Decimal series and continued fraction gives the
normal CDF, Fraction arithmetic decides positive semidefiniteness, the Python
DCF in scripts/reference_model.py values every draw, and statistics.quantiles
computes the percentiles. A separate Node process evaluates production outputs
only. Amounts are USD billions.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from fractions import Fraction
import hashlib
import importlib.util
import itertools
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reference_model', ROOT / 'scripts' / 'reference_model.py')
reference = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(reference)

M32, M64 = (1 << 32) - 1, (1 << 64) - 1
NORMAL = statistics.NormalDist()
PSD_TOLERANCE = 1e-10
TOL = dict(quantile=2e-15, cdf=6e-14, driver=1e-12, value=1e-9, percentile=1e-9, factor=1e-12, ulps=1)


def splitmix64(seed):
    state = seed
    while True:
        state = (state + 0x9E3779B97F4A7C15) & M64
        z = state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        yield z ^ (z >> 31)


def xoshiro128starstar(seed):
    """Reference algorithm from https://prng.di.unimi.it/xoshiro128starstar.c (version 1.1)."""
    fill = splitmix64(seed)
    first, second = next(fill), next(fill)
    s = [first & M32, first >> 32, second & M32, second >> 32]
    rotl = lambda x, k: ((x << k) | (x >> (32 - k))) & M32
    while True:
        result = (rotl((s[1] * 5) & M32, 7) * 9) & M32
        t = (s[1] << 9) & M32
        s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11)
        yield result


def uniform(stream):
    high, low = next(stream) >> 6, next(stream) >> 6
    return Fraction(2 * ((high << 26) + low) + 1, 2 ** 53)  # exact midpoint (k + 1/2) / 2^52


def phi_decimal(z):
    """Normal CDF to about 60 digits: Taylor series near zero, Laplace continued fraction in the tails."""
    with localcontext() as context:
        context.prec = 70
        x = Decimal(z)
        pi = Decimal('3.14159265358979323846264338327950288419716939937510582097494459230781640628')
        density = (-(x * x) / 2).exp() / (2 * pi).sqrt()
        if abs(x) <= 3:
            term = total = x
            n = 0
            while abs(term) > Decimal('1e-75'):
                n += 1
                term = term * x * x / (2 * n + 1)
                total += term
            return Decimal('0.5') + density * total
        a, fraction = abs(x), abs(x)
        for k in range(1500, 0, -1):
            fraction = a + k / fraction
        tail = density / fraction
        return tail if x < 0 else 1 - tail


def phi(z):
    return 0.5 * math.erfc(-z / math.sqrt(2))


def ulp_distance(a, b):
    to_int = lambda value: int.from_bytes(__import__('struct').pack('>d', value), 'big', signed=True)
    return abs(to_int(a) - to_int(b))


def cholesky(matrix):
    """Independent float factorization with the documented semidefinite pivot rule."""
    n = len(matrix)
    factor = [[0.0] * n for _ in range(n)]
    for j in range(n):
        pivot = matrix[j][j] - sum(factor[j][m] ** 2 for m in range(j))
        if pivot <= PSD_TOLERANCE:
            continue
        factor[j][j] = math.sqrt(pivot)
        for i in range(j + 1, n):
            factor[i][j] = (matrix[i][j] - sum(factor[i][m] * factor[j][m] for m in range(j))) / factor[j][j]
    return factor


def determinant(matrix):
    """Exact Fraction determinant by Gaussian elimination."""
    m = [row[:] for row in matrix]
    n, result = len(m), Fraction(1)
    for c in range(n):
        pivot = next((r for r in range(c, n) if m[r][c] != 0), None)
        if pivot is None:
            return Fraction(0)
        if pivot != c:
            m[c], m[pivot] = m[pivot], m[c]
            result = -result
        result *= m[c][c]
        for r in range(c + 1, n):
            ratio = m[r][c] / m[c][c]
            for k in range(c, n):
                m[r][k] -= ratio * m[c][k]
    return result


def minimum_principal_minor(matrix):
    """A symmetric matrix is PSD exactly when every principal minor is nonnegative."""
    exact = [[Fraction(value) for value in row] for row in matrix]
    n = len(exact)
    return min(determinant([[exact[i][j] for j in subset] for i in subset])
               for size in range(1, n + 1) for subset in itertools.combinations(range(n), size))


def quantile(d, u):
    if d['min'] == d['max'] or (d['type'] == 'normal' and d['sd'] == 0):
        return d['mean'] if d['type'] == 'normal' else d['mode'] if d['type'] == 'triangular' else d['min']
    if d['type'] == 'uniform':
        x = d['min'] + (d['max'] - d['min']) * u
    elif d['type'] == 'triangular':
        a, c, b = d['min'], d['mode'], d['max']
        x = a + math.sqrt(u * (b - a) * (c - a)) if u < (c - a) / (b - a) else b - math.sqrt((1 - u) * (b - a) * (b - c))
    else:
        lower, upper = phi((d['min'] - d['mean']) / d['sd']), phi((d['max'] - d['mean']) / d['sd'])
        p = min(max(lower + u * (upper - lower), 2.0 ** -53), 1 - 2.0 ** -53)
        x = d['mean'] + d['sd'] * NORMAL.inv_cdf(p)
    return min(max(x, d['min']), d['max'])


def value(case, keys, point):
    p = dict(case['assumptions'])
    for key, x in zip(keys, point):
        if key == 'growth':
            p.update(g1=p['g1'] * x, g2=p['g2'] * x, g3=p['g3'] * x)
        elif key != 'dilution':
            p[key] = x
    ev = reference.project(p)['ev']
    bridge = case['bridge']
    if bridge is None:
        return ev
    equity = ev + bridge['cash'] - bridge['debt'] - bridge['otherClaims']
    return (1 - point[keys.index('dilution')]) * equity if 'dilution' in keys else equity


def simulate(case, seed, draws):
    keys = [d['key'] for d in case['drivers']]
    k = len(keys)
    matrix = case['correlation'] or [[1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]
    factor, stream = cholesky(matrix), xoshiro128starstar(seed)
    scores, samples, outcomes = [], [], []
    for _ in range(draws):
        normals = [NORMAL.inv_cdf(float(uniform(stream))) for _ in keys]
        z = [sum(factor[j][m] * normals[m] for m in range(j + 1)) for j in range(k)]
        x = [quantile(d['distribution'], phi(zj)) for d, zj in zip(case['drivers'], z)]
        scores.append(z); samples.append(x); outcomes.append(value(case, keys, x))
    return scores, samples, outcomes


def percentiles(values, levels=(5, 25, 50, 75, 95)):
    cuts = statistics.quantiles(values, n=100, method='inclusive')
    return {f'p{level}': cuts[level - 1] for level in levels}


def pearson(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    return sxy / math.sqrt(sum((a - mx) ** 2 for a in x) * sum((b - my) ** 2 for b in y))


def ranks(values):
    order = sorted(range(len(values)), key=values.__getitem__)
    result = [0] * len(values)
    for rank, index in enumerate(order):
        result[index] = rank
    return result


def wilson(count, n, z=1.959963984540054):
    share = count / n
    denominator = 1 + z * z / n
    centre = (share + z * z / (2 * n)) / denominator
    half = z * math.sqrt(share * (1 - share) / n + z * z / (4 * n * n)) / denominator
    return [max(0.0, centre - half), min(1.0, centre + half)]


def cases(presets):
    def suggested(a, keys):
        table = dict(growth=dict(type='triangular', min=.7, mode=1, max=1.3),
                     m36=dict(type='triangular', min=max(a['m36'] - .06, a['m36'] / 2), mode=a['m36'], max=min(1, a['m36'] + .06)),
                     wacc=dict(type='normal', mean=a['wacc'], sd=.015, min=max(0, a['wacc'] - .03), max=min(.6, a['wacc'] + .03)),
                     tg=dict(type='triangular', min=max(0, a['tg'] - .01), mode=a['tg'], max=a['tg'] + .01),
                     dilution=dict(type='triangular', min=0, mode=.02, max=.08))
        return [dict(key=key, distribution=table[key]) for key in keys]
    four = ['growth', 'm36', 'wacc', 'tg']
    out = [
        dict(name='Anthropic Base, four correlated drivers', assumptions=presets['Anthropic']['Base'], bridge=None,
             drivers=suggested(presets['Anthropic']['Base'], four), correlation=[[1, .4, 0, 0], [.4, 1, 0, 0], [0, 0, 1, .3], [0, 0, .3, 1]],
             draws=3000, seed=20261018, hurdle=300),
        dict(name='OpenAI Bull, bridge and dilution, mixed signs', assumptions=presets['OpenAI']['Bull'], bridge=dict(cash=20, debt=5, otherClaims=3),
             drivers=[dict(key='growth', distribution=dict(type='uniform', min=.8, max=1.15))] + suggested(presets['OpenAI']['Bull'], ['m36', 'wacc', 'tg', 'dilution'])[0:4],
             correlation=[[1, .5, -.2, 0, .1], [.5, 1, 0, 0, 0], [-.2, 0, 1, .4, 0], [0, 0, .4, 1, 0], [.1, 0, 0, 0, 1]],
             draws=2000, seed=7, hurdle=1500),
        dict(name='Anthropic Bear, one uniform driver', assumptions=presets['Anthropic']['Bear'], bridge=None,
             drivers=[dict(key='m36', distribution=dict(type='uniform', min=.08, max=.16))], correlation=None, draws=1000, seed=0, hurdle=-10),
        dict(name='OpenAI Base, perfectly correlated growth and margin', assumptions=presets['OpenAI']['Base'], bridge=None,
             drivers=suggested(presets['OpenAI']['Base'], ['growth', 'm36', 'wacc']), correlation=[[1, 1, 0], [1, 1, 0], [0, 0, 1]],
             draws=2000, seed=4294967295, hurdle=None),
    ]
    for company, scenarios in presets.items():
        for scenario, a in scenarios.items():
            point = lambda key: 1 if key == 'growth' else a[key]
            out.append(dict(name=f'{company} {scenario}, zero spread', assumptions=a, bridge=None,
                            drivers=[dict(key=key, distribution=dict(type='triangular', min=point(key), mode=point(key), max=point(key))) for key in four],
                            correlation=[[1, .4, 0, 0], [.4, 1, 0, 0], [0, 0, 1, .3], [0, 0, .3, 1]], draws=200, seed=3, hurdle=None, zeroSpread=True))
    return out


def matrices():
    root = 1 / math.sqrt(2)
    fixed = [[[1, 1], [1, 1]], [[1, -1], [-1, 1]], [[1, 0, root], [0, 1, root], [root, root, 1]],
             [[1, .9, -.9], [.9, 1, .9], [-.9, .9, 1]],
             [[1.0 if i == j else -.3 for j in range(5)] for i in range(5)],
             [[1.0 if i == j else .6 for j in range(5)] for i in range(5)],
             [[1, .4, 0, 0], [.4, 1, 0, 0], [0, 0, 1, .3], [0, 0, .3, 1]]]
    stream, randoms = xoshiro128starstar(99), []
    for trial in range(400):
        k = 2 + trial % 4
        m = [[1.0] * k for _ in range(k)]
        for i in range(k):
            for j in range(i + 1, k):
                m[i][j] = m[j][i] = round((float(uniform(stream)) * 2 - 1) * 100) / 100
        randoms.append(m)
    return fixed + randoms


PROGRAM = r"""import {readFileSync} from 'node:fs';
import {createRandom,normalCdf,normalQuantile} from './public/lib/random.js';
import {detExp,detLog} from './public/lib/deterministic-math.js';
import {simulateValuation,sampleDrivers,correlationFactor,UNCERTAINTY_VERSION} from './public/lib/uncertainty.js';
const input=JSON.parse(readFileSync(0,'utf8'));
const streams=input.seeds.map(seed=>{const r=createRandom(seed);return Array.from({length:input.streamLength},()=>r.nextUint32());});
const uniforms=input.seeds.map(seed=>{const r=createRandom(seed);return Array.from({length:input.streamLength},()=>r.nextUniform());});
const correlations=input.matrices.map(m=>{try{const r=correlationFactor(m,m.length);return {ok:true,factor:r.factor,minEigenvalue:r.minEigenvalue};}catch(error){return {ok:false,message:error.message};}});
const simulations=input.cases.map(({name,zeroSpread,...spec})=>({sample:sampleDrivers(spec),result:simulateValuation(spec)}));
process.stdout.write(JSON.stringify({version:UNCERTAINTY_VERSION,streams,uniforms,quantiles:input.probabilities.map(normalQuantile),cdfs:input.zs.map(normalCdf),exps:input.expInputs.map(detExp),logs:input.logInputs.map(detLog),correlations,simulations}));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'qa-local/uncertainty/uncertainty-reference.json')
    args = parser.parse_args()
    node = os.environ.get('NODE') or shutil.which('node')
    if not node:
        raise SystemExit('Node.js is required to evaluate the production target.')
    presets = json.loads((ROOT / 'data/presets.json').read_text())
    seeds = [0, 1, 7, 20261018, 4294967295]
    stream = xoshiro128starstar(31)
    probabilities = sorted({10.0 ** -e for e in range(1, 300, 7)} | {float(uniform(stream)) for _ in range(400)} | {.5, .975, .9, .1})
    zs = [x / 8 for x in range(-296, 65)]
    exp_inputs = [(float(uniform(stream)) - .5) * 1400 for _ in range(4000)]
    log_inputs = [math.ldexp(float(uniform(stream)) + .5, e) for e in range(-1070, 1020, 3)]
    simulation_cases = cases(presets)
    matrix_list = matrices()
    payload = dict(seeds=seeds, streamLength=2000, probabilities=probabilities, zs=zs, expInputs=exp_inputs,
                   logInputs=log_inputs, matrices=matrix_list, cases=simulation_cases)
    process = subprocess.run([node, '--input-type=module', '-e', PROGRAM], input=json.dumps(payload, allow_nan=False),
                             text=True, capture_output=True, cwd=ROOT, timeout=300)
    if process.returncode:
        raise SystemExit(process.stderr or 'Production target failed to run.')
    js = json.loads(process.stdout)
    failures, counters = [], dict(exactStreamOutputs=0, numericComparisons=0, structuralComparisons=0)
    errors = dict(quantile=0.0, cdf=0.0, expUlps=0, logUlps=0, factor=0.0, driver=0.0, value=0.0, percentile=0.0)

    def require(condition, message):
        counters['structuralComparisons'] += 1
        if not condition:
            failures.append(message)

    def close(actual, expected, tolerance, label, kind):
        # Scores and driver values are O(1): a correlated score can cancel to
        # nearly zero, so they use an absolute floor of 1. Dollar values also
        # allow 1e-8 USD billions, the tolerance of tests/reference_parity.py.
        counters['numericComparisons'] += 1
        scale = max(abs(expected), 1.0 if kind == 'driver' else 0.0)
        slack = 1e-8 if kind in ('value', 'percentile') else 0.0
        error = abs(actual - expected) / scale if scale else abs(actual - expected)
        errors[kind] = max(errors[kind], error)
        if not (math.isfinite(actual) and abs(actual - expected) <= tolerance * scale + slack):
            failures.append(f'{label}: {actual!r} differs from {expected!r}')

    require(js['version'] == '1.0.0', 'Uncertainty version changed')
    # 1. Bit-exact generator and uniform mapping.
    for seed, outputs, uniforms in zip(seeds, js['streams'], js['uniforms']):
        expected = list(itertools.islice(xoshiro128starstar(seed), 2000))
        require(outputs == expected, f'seed {seed}: xoshiro128** stream differs')
        counters['exactStreamOutputs'] += len(outputs)
        check = xoshiro128starstar(seed)
        require(all(Fraction(u) == uniform(check) for u in uniforms), f'seed {seed}: uniform mapping differs')
        counters['exactStreamOutputs'] += len(uniforms)
    # 2. Normal quantile against CPython's AS 241, normal CDF against 60 digits.
    for p, actual in zip(probabilities, js['quantiles']):
        close(actual, NORMAL.inv_cdf(p), TOL['quantile'], f'quantile({p})', 'quantile')
    for z, actual in zip(zs, js['cdfs']):
        close(actual, float(phi_decimal(z)), TOL['cdf'], f'cdf({z})', 'cdf')
    # 3. fdlibm exp and log against the platform C library, in units in the last place.
    for x, actual in zip(exp_inputs, js['exps']):
        distance = ulp_distance(actual, math.exp(x)); errors['expUlps'] = max(errors['expUlps'], distance)
        require(distance <= TOL['ulps'], f'exp({x}) is {distance} ulps from the C library')
    for x, actual in zip(log_inputs, js['logs']):
        distance = ulp_distance(actual, math.log(x)); errors['logUlps'] = max(errors['logUlps'], distance)
        require(distance <= TOL['ulps'], f'log({x}) is {distance} ulps from the C library')
    # 4. Positive semidefinite decisions against exact principal minors; factors against an independent Cholesky.
    decided = dict(accepted=0, rejected=0, boundarySkipped=0)
    for index, (matrix, outcome) in enumerate(zip(matrix_list, js['correlations'])):
        minor = minimum_principal_minor(matrix)
        if abs(minor) < Fraction(1, 10 ** 6) and minor != 0:
            decided['boundarySkipped'] += 1
            continue
        require(outcome['ok'] == (minor >= 0), f'matrix {index}: PSD decision {outcome["ok"]} but minimum principal minor {float(minor)}')
        if outcome['ok']:
            decided['accepted'] += 1
            for row_js, row_py in zip(outcome['factor'], cholesky(matrix)):
                for a, b in zip(row_js, row_py):
                    errors['factor'] = max(errors['factor'], abs(a - b)); counters['numericComparisons'] += 1
                    require(abs(a - b) <= TOL['factor'], f'matrix {index}: Cholesky factor differs')
        else:
            decided['rejected'] += 1
            require('smallest eigenvalue' in outcome['message'], f'matrix {index}: rejection does not report the eigenvalue')
    require(decided['accepted'] > 50 and decided['rejected'] > 50, f'PSD decisions too one-sided: {decided}')
    # 5. Complete pipelines.
    evidence = []
    for case, target in zip(simulation_cases, js['simulations']):
        name, result, sample = case['name'], target['result'], target['sample']
        scores, samples, outcomes = simulate(case, case['seed'], case['draws'])
        for i in range(case['draws']):
            for a, b in zip(sample['scores'][i], scores[i]):
                close(a, b, TOL['driver'], f'{name} draw {i} score', 'driver')
            for a, b in zip(sample['values'][i], samples[i]):
                close(a, b, TOL['driver'], f'{name} draw {i} driver', 'driver')
            close(sample['outcomes'][i], outcomes[i], TOL['value'], f'{name} draw {i} value', 'value')
        for key, expected in percentiles(outcomes).items():
            close(result['summary']['percentiles'][key], expected, TOL['percentile'], f'{name} {key}', 'percentile')
        close(result['summary']['mean'], statistics.fmean(outcomes), TOL['percentile'], f'{name} mean', 'percentile')
        if case['hurdle'] is not None:
            near = [v for v in outcomes if abs(v - case['hurdle']) <= 1e-9 * max(1, abs(case['hurdle']))]
            count = sum(v > case['hurdle'] for v in outcomes)
            require(near or result['hurdle']['count'] == count, f'{name}: hurdle count {result["hurdle"]["count"]} versus {count}')
            for a, b in zip(result['hurdle']['interval95'], wilson(result['hurdle']['count'], case['draws'])):
                close(a, b, 1e-12, f'{name} Wilson interval', 'percentile')
        replicate_medians = [statistics.median(simulate(case, s, case['draws'])[2]) for s in result['convergence']['stability']['seeds'][1:]]
        require(result['convergence']['stability']['seeds'][1:] == [(case['seed'] + r) % 2 ** 32 for r in range(1, 5)], f'{name}: replicate seeds differ')
        for a, b in zip(result['convergence']['stability']['p50'][1:], replicate_medians):
            close(a, b, TOL['percentile'], f'{name} replicate median', 'percentile')
        for prefix in result['convergence']['prefixes']:
            expected = percentiles(outcomes[:prefix['draws']], (5, 50, 95))
            for key in ['p5', 'p50', 'p95']:
                close(prefix[key], expected[key], TOL['percentile'], f'{name} prefix {prefix["draws"]} {key}', 'percentile')
        histogram = result['histogram']
        if not any(abs(v - edge) <= 1e-9 * max(1, abs(edge)) for v in outcomes for edge in [b['lower'] for b in histogram['bins']] + [histogram['upper']]):
            counts = [sum(b['lower'] <= v and (v <= b['upper'] if i == len(histogram['bins']) - 1 else v < b['upper']) for v in outcomes) for i, b in enumerate(histogram['bins'])]
            require(counts == [b['count'] for b in histogram['bins']], f'{name}: histogram counts differ')
        require(sum(b['count'] for b in histogram['bins']) + histogram['below'] + histogram['above'] == case['draws'], f'{name}: histogram loses draws')
        keys = [d['key'] for d in case['drivers']]
        base_point = [1 if key == 'growth' else 0 if key == 'dilution' else case['assumptions'][key] for key in keys]
        bars = []
        for j, driver in enumerate(case['drivers']):
            ends = []
            for p in (.1, .9):
                point = list(base_point); point[j] = quantile(driver['distribution'], p); ends.append(value(case, keys, point))
            bars.append((abs(ends[1] - ends[0]), j, driver['key'], ends))
        bars.sort(key=lambda bar: (-bar[0], bar[1]))
        swings = [bar[0] for bar in bars]
        if all(swings[i] - swings[i + 1] > 1e-9 * max(1, swings[i]) for i in range(len(swings) - 1)):
            require([bar[2] for bar in bars] == [bar['key'] for bar in result['tornado']['bars']], f'{name}: tornado order differs')
        for js_bar in result['tornado']['bars']:
            ends = next(bar[3] for bar in bars if bar[2] == js_bar['key'])
            close(js_bar['valueAtP10'], ends[0], TOL['value'], f'{name} {js_bar["key"]} P10 value', 'value')
            close(js_bar['valueAtP90'], ends[1], TOL['value'], f'{name} {js_bar["key"]} P90 value', 'value')
        n = case['draws']
        matrix = case['correlation']
        if matrix and not case.get('zeroSpread'):
            for a, b in itertools.combinations(range(len(keys)), 2):
                rho = matrix[a][b]
                sample_rho = pearson([row[a] for row in scores], [row[b] for row in scores])
                require(abs(sample_rho - rho) <= 4 * (1 - rho * rho) / math.sqrt(n) + 1e-9, f'{name}: score correlation {sample_rho} for {rho}')
                spearman = pearson(ranks([row[a] for row in samples]), ranks([row[b] for row in samples]))
                require(abs(spearman - 6 / math.pi * math.asin(rho / 2)) <= 4 / math.sqrt(n), f'{name}: rank correlation {spearman} for {rho}')
        if case.get('zeroSpread'):
            ev = reference.project(case['assumptions'])['ev']
            for key, actual in result['summary']['percentiles'].items():
                close(actual, ev, 1e-10, f'{name} {key} equals the deterministic case', 'value')
            require(result['summary']['standardDeviation'] == 0, f'{name}: nonzero spread')
        evidence.append(dict(name=name, draws=n, drivers=keys, seed=case['seed'], percentiles=result['summary']['percentiles'],
                             tornado=[bar['key'] for bar in result['tornado']['bars']], stability=result['convergence']['stability']['status']))
    paths = ['public/lib/uncertainty.js', 'public/lib/random.js', 'public/lib/deterministic-math.js', 'public/lib/model.js',
             'data/presets.json', 'scripts/reference_model.py', 'scripts/check_uncertainty_reference.py', 'tests/uncertainty.test.js']
    source_hashes = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths}
    require(source_hashes['public/lib/model.js'] == '9be65ebd529ab5c19100c9ee1bdf3d017501c42fc689a3d1d0b2232f1edfa180', 'public/lib/model.js: frozen financial engine changed')
    require(source_hashes['data/presets.json'] == '9239c933d4c19797c0fe98388ca5632a17939f6f42316814c35e54dc1db957ca', 'data/presets.json: frozen presets changed')
    receipt = dict(schema=1, status='passed' if not failures else 'failed', generatedAt=datetime.now(timezone.utc).isoformat(),
                   uncertaintyVersion=js['version'],
                   method='Integer SplitMix64 and xoshiro128** 1.1; exact Fraction uniforms; CPython statistics.NormalDist (AS 241) quantiles; 60-digit Decimal normal CDF; Fraction principal minors for semidefiniteness; independent float Cholesky; reference_model.py DCF per draw; statistics.quantiles inclusive percentiles; Wilson score interval.',
                   tolerances=TOL, generatorOutputsCompared=counters['exactStreamOutputs'], psdDecisions=decided,
                   pipelines=len(simulation_cases), drawsValued=sum(c['draws'] * 5 for c in simulation_cases),
                   numericComparisons=counters['numericComparisons'], structuralComparisons=counters['structuralComparisons'],
                   maxRelativeErrors=errors, cases=evidence, sourceHashes=source_hashes,
                   scope='Arithmetic and algorithmic independence for the Monte Carlo layer. Statistical checks use fixed seeds. Not a calibration of the input distributions, a forecast or an external audit.',
                   failures=failures[:50], failureCount=len(failures))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
    print(json.dumps({key: receipt[key] for key in ['status', 'generatorOutputsCompared', 'psdDecisions', 'pipelines', 'drawsValued', 'numericComparisons', 'structuralComparisons', 'maxRelativeErrors', 'failureCount']} | {'receipt': str(args.output), 'failures': failures[:10]}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
