#!/usr/bin/env python3
"""Independently challenge Capital Strategy with Decimal cash flows and Fraction shares.

No application calculation module is imported into the reference. A separate
Node process evaluates production outputs only. Amounts are USD billions.
"""
from __future__ import annotations

import argparse
import copy
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BAND = 32 * math.ulp(1.0)
REL_TOL = 3e-12
MONEY_ULPS = 128
CAP = 1e12
ASOF = date(2026, 10, 18)


def exact(value):
    """Preserve the binary64 input actually submitted, not a decimal fiction."""
    return Decimal.from_float(float(value))


def rational(value):
    return Fraction.from_float(float(value))


def dec_fraction(value):
    return Decimal(value.numerator) / Decimal(value.denominator)


def representable(value):
    """Nearest binary64, or unavailable for nonzero underflow/overflow."""
    try:
        result = float(value)
    except (OverflowError, ValueError):
        return None
    return result if math.isfinite(result) and (result != 0 or value == 0) else None


def band_compare(left, right):
    """The declared numerical policy, evaluated at high precision."""
    a = left if isinstance(left, Decimal) else exact(left)
    b = right if isinstance(right, Decimal) else exact(right)
    distance = a - b
    if abs(distance) <= exact(BAND) * max(abs(a), abs(b)):
        return 0
    return 1 if distance > 0 else -1


def operating_reference(assumptions, years):
    """100-digit DCF; finite continuation uses direct annual summation."""
    p = {key: exact(value) for key, value in assumptions.items()}
    discount = lambda year: (Decimal(1) + p['wacc']) ** (
        -Decimal((date(year, 12, 31) - ASOF).days) / Decimal('365.25'))
    previous = p['rev2026']
    explicit_terms = [p['stub'] * discount(2026)]
    for year in range(2027, 2037):
        stage = 'g1' if year <= 2030 else 'g2' if year <= 2033 else 'g3'
        revenue = previous * (1 + p[stage])
        if year <= 2030:
            margin = p['m27'] + (p['m30'] - p['m27']) * Decimal(year - 2027) / 3
        else:
            margin = p['m30'] + (p['m36'] - p['m30']) * Decimal(year - 2030) / 6
        ebit = revenue * margin
        tax_paid = max(Decimal(0), ebit) * p['tax']
        new_invested_capital = (revenue - previous) / p['turns']
        explicit_terms.append((ebit - tax_paid - new_invested_capital) * discount(year))
        previous = revenue
    explicit = sum(explicit_terms)
    terminal_cash = previous * (1 + p['tg']) * p['m36'] * (1 - p['tax']) * (1 - p['tg'] / p['roic'])
    terminal = terminal_cash / (p['wacc'] - p['tg']) * discount(2036)
    perpetual = explicit + terminal
    selected = perpetual
    if years is not None:
        selected = explicit
        annual_pv = terminal_cash * discount(2036) / (1 + p['wacc'])
        for _ in range(years):
            selected += annual_pv
            annual_pv *= (1 + p['tg']) / (1 + p['wacc'])
    return {'selected': selected, 'perpetual': perpetual,
            'scale': sum(abs(term) for term in explicit_terms) + abs(terminal)}


def share_reference(plan, holder):
    """Issue new shares against 100 existing shares using exact entered terms."""
    existing = Fraction(100)
    quote, capital = rational(plan['quote']), rational(plan['primaryCapital'])
    if plan['basis'] == 'pre':
        issue_price = quote / existing
    else:
        # Post quote buys all shares; cash buys only newly issued shares.
        issue_price = (quote - capital) / existing
    new_shares = capital / issue_price
    total_shares = existing + new_shares
    retained, newly_issued = existing / total_shares, new_shares / total_shares
    pre, post = existing * issue_price, total_shares * issue_price
    h = rational(holder)
    pricing = dict(preMoney=pre, postMoney=post, primaryCapital=capital,
                   existingOwnership=retained, newOwnership=newly_issued,
                   holderBefore=h, holderAfter=h * retained,
                   otherExistingAfter=(1 - h) * retained,
                   holderDilution=h * newly_issued, relativeDilution=newly_issued,
                   holderValueBefore=h * pre, holderValueAfter=h * pre)
    return {'pre': pre, 'post': post, 'capital': capital, 'retained': retained,
            'intercept': retained * capital, 'pricing': pricing}


def rounded_ledger(plan):
    """Binary64 boundary policy for compatibility with frozen financing output."""
    quote, capital = float(plan['quote']), float(plan['primaryCapital'])
    pre = quote if plan['basis'] == 'pre' else quote - capital
    post = quote if plan['basis'] == 'post' else quote + capital
    return pre / post


def crossing(a, b, ledger_a, ledger_b, eligible, residual_range):
    result = dict(planA=a['id'], planB=b['id'], eligiblePair=eligible,
                  status='unavailable', equityResidual=None, allocation=None,
                  inSelectedRange=None, higherResidualPreferred=None,
                  lowerResidualPreferred=None)
    ra, rb = rounded_ledger(a), rounded_ledger(b)
    ba, bb = ra * a['primaryCapital'], rb * b['primaryCapital']
    if ((ba == 0 and a['primaryCapital'] != 0) or
            (bb == 0 and b['primaryCapital'] != 0)):
        return result
    slope = ledger_a['retained'] - ledger_b['retained']
    if slope == 0:
        result['status'] = 'identical' if ledger_a['capital'] == ledger_b['capital'] else 'parallel'
        if result['status'] == 'parallel':
            difference = band_compare(ba, bb)
            preferred = a['id'] if difference > 0 else b['id'] if difference < 0 else None
            result.update(higherResidualPreferred=preferred, lowerResidualPreferred=preferred)
        return result
    if band_compare(ra, rb) == 0:
        return result
    root = (ledger_b['intercept'] - ledger_a['intercept']) / slope
    common = ledger_a['retained'] * (root + ledger_a['capital'])
    rounded_root, rounded_common = representable(root), representable(common)
    if rounded_root is None or rounded_common is None:
        return result
    left = ra * (rounded_root + a['primaryCapital'])
    right = rb * (rounded_root + b['primaryCapital'])
    if not all(math.isfinite(v) for v in [left, right]):
        return result
    scale = max(abs(left), abs(right), abs(ra * rounded_root), abs(rb * rounded_root), abs(ba), abs(bb))
    if scale and max(abs(left / scale - right / scale),
                     abs(left / scale - rounded_common / scale),
                     abs(right / scale - rounded_common / scale)) > BAND:
        return result
    inside = None if residual_range['minEquity'] is None else (
        band_compare(rounded_root, residual_range['minEquity']) >= 0 and
        band_compare(rounded_root, residual_range['maxEquity']) <= 0)
    result.update(status='finite', equityResidual=rounded_root, allocation=rounded_common,
                  inSelectedRange=inside, higherResidualPreferred=a['id'] if slope > 0 else b['id'],
                  lowerResidualPreferred=b['id'] if slope > 0 else a['id'])
    return result


def decision_reference(snapshot):
    policy, bridge = snapshot['policy'], snapshot['bridge']
    rho, coverage, holder = (exact(policy[key]) for key in ['retentionFloor', 'modelCoverageFloor', 'holderStake'])
    forecasts = [operating_reference(s['assumptions'], s['continuationYears']) for s in snapshot['scenarios']]
    residuals = [None if bridge is None else f['selected'] + exact(bridge['cash']) - exact(bridge['debt']) - exact(bridge['otherClaims']) for f in forecasts]
    ledgers = [share_reference(p, policy['holderStake']) for p in snapshot['plans']]
    retained = [dec_fraction(ledger['retained']) for ledger in ledgers]
    retention_ok = [p['primaryCapital'] == 0 if rho == 1 else band_compare(r, rho) >= 0
                    for p, r in zip(snapshot['plans'], retained)]
    capital_ok = [band_compare(p['primaryCapital'], policy['capitalTarget']) >= 0 for p in snapshot['plans']]
    eligibility = [a and b for a, b in zip(retention_ok, capital_ok)]
    eligible_ids = [p['id'] for p, eligible in zip(snapshot['plans'], eligibility) if eligible]
    eligible_columns = [index for index, eligible in enumerate(eligibility) if eligible]
    scenario_ids = [s['id'] for s in snapshot['scenarios']]
    result = dict(version='1.0.0', modelVersion='3.0.0', valuationDate='2026-10-18', snapshot=snapshot)
    result['scenarios'] = [dict(id=s['id'], label=s['label'], assumptions=s['assumptions'],
                                continuationYears=s['continuationYears'], operatingEv=f['selected'],
                                perpetualEv=f['perpetual'], modelPreMoneyEquity=m)
                           for s, f, m in zip(snapshot['scenarios'], forecasts, residuals)]
    result['plans'] = [dict(id=p['id'], label=p['label'], round={key: p[key] for key in ['basis', 'quote', 'primaryCapital']} | {'holderStake': policy['holderStake']},
                            pricing=l['pricing'], capitalGap=exact(p['primaryCapital']) - exact(policy['capitalTarget']),
                            meetsCapital=cap_ok, retainedFraction=r, meetsRetention=ret_ok, eligible=eligible)
                       for p, l, r, cap_ok, ret_ok, eligible in zip(snapshot['plans'], ledgers, retained, capital_ok, retention_ok, eligibility)]
    matrix = []
    for scenario, residual in zip(snapshot['scenarios'], residuals):
        for plan, ledger, retention in zip(snapshot['plans'], ledgers, retained):
            post = None if residual is None else residual + exact(plan['primaryCapital'])
            allocation = None if post is None else representable(retention * post)
            holder_allocation = None if allocation is None else representable(exact(allocation) * holder)
            quoted = dec_fraction(ledger['pre'])
            ratio = None if residual is None else representable(residual / quoted)
            meets = None if residual is None else residual > 0 and band_compare(residual, quoted * coverage) >= 0
            matrix.append(dict(scenarioId=scenario['id'], planId=plan['id'], modelPreMoneyEquity=residual,
                               modelPostMoneyEquity=post, existingCohortAllocation=allocation,
                               trackedHolderAllocation=holder_allocation, modelToQuote=ratio,
                               meetsModelCoverage=meets, regret=None))
    rows = [matrix[index:index + len(ledgers)] for index in range(0, len(matrix), len(ledgers))]
    per_scenario = []
    for sid, row in zip(scenario_ids, rows):
        available = bool(eligible_columns) and all(row[i]['existingCohortAllocation'] is not None for i in eligible_columns)
        best = max(row[i]['existingCohortAllocation'] for i in eligible_columns) if available else None
        tied = []
        if available:
            for index in eligible_columns:
                allocation = row[index]['existingCohortAllocation']
                tied_here = band_compare(allocation, best) == 0
                row[index]['regret'] = 0 if tied_here else best - allocation
                if tied_here:
                    tied.append(row[index]['planId'])
        per_scenario.append(dict(scenarioId=sid, bestAllocation=best, bestPlanIds=tied))
    metrics = []
    for index, plan in enumerate(snapshot['plans']):
        allocations = [row[index]['existingCohortAllocation'] for row in rows]
        regrets = [row[index]['regret'] for row in rows]
        coverage_checks = [row[index]['meetsModelCoverage'] for row in rows]
        worst = max(regrets) if eligibility[index] and all(r is not None for r in regrets) else None
        metrics.append(dict(planId=plan['id'], eligible=eligibility[index], worstRegret=worst,
                            worstScenarioIds=[] if worst is None else [sid for sid, value in zip(scenario_ids, regrets) if band_compare(value, worst) == 0],
                            minAllocation=min(allocations) if all(v is not None for v in allocations) else None,
                            maxAllocation=max(allocations) if all(v is not None for v in allocations) else None,
                            meetsModelCoverageIn=sum(coverage_checks) if all(v is not None for v in coverage_checks) else None,
                            totalScenarios=len(rows)))
    resolved = bool(eligible_columns) and all(metrics[i]['worstRegret'] is not None for i in eligible_columns)
    status = 'available' if resolved else 'no-eligible-plans' if not eligible_columns else 'unavailable'
    minimum_regret = min(metrics[i]['worstRegret'] for i in eligible_columns) if resolved else None
    minimax = dict(status=status, planIds=[] if not resolved else [metrics[i]['planId'] for i in eligible_columns if band_compare(metrics[i]['worstRegret'], minimum_regret) == 0], worstRegret=minimum_regret)
    dominance = []
    if resolved:
        for a in eligible_columns:
            for b in eligible_columns:
                if a == b:
                    continue
                signs = [band_compare(row[a]['existingCohortAllocation'], row[b]['existingCohortAllocation']) for row in rows]
                if min(signs) >= 0 and max(signs) > 0:
                    dominance.append(dict(dominatingPlanId=metrics[a]['planId'], dominatedPlanId=metrics[b]['planId']))
    residual_range = dict(minEquity=None, maxEquity=None) if any(m is None for m in residuals) else dict(minEquity=min(residuals), maxEquity=max(residuals))
    crossovers = [crossing(snapshot['plans'][a], snapshot['plans'][b], ledgers[a], ledgers[b], eligibility[a] and eligibility[b], residual_range)
                  for a in range(len(ledgers)) for b in range(a + 1, len(ledgers))]
    result['matrix'] = matrix
    result['comparison'] = dict(eligiblePlanIds=eligible_ids, scenarioIds=scenario_ids,
                                metric='existing-cohort-signed-residual', range=residual_range,
                                perScenario=per_scenario, planMetrics=metrics, minimax=minimax,
                                dominance=dominance, dominanceStatus=status, crossovers=crossovers)
    limiting = [] if bridge is None else [sid for sid, residual in zip(scenario_ids, residuals) if band_compare(residual, min(residuals)) == 0]
    upper = None if bridge is None else representable(min(residuals) / coverage)
    # Inverse ownership from allowable NEW SHARE COUNT; independent of the
    # production scalar inverse formula. Shares are priced at the model ceiling.
    allowable_new = Decimal(100) / rho - Decimal(100)
    maximum = None if upper is None or upper <= 0 else representable(allowable_new * exact(upper) / 100)
    envelope_status = 'unavailable' if upper is None or (upper > 0 and maximum is None) else 'no-positive-price' if upper <= 0 else 'available'
    intervals = []
    for index, plan in enumerate(snapshot['plans']):
        capital = exact(plan['primaryCapital'])
        impossible = rho == 1 and capital > 0
        lower = 0 if capital == 0 else None if impossible else representable(100 * capital / allowable_new)
        state = 'unavailable' if upper is None else 'no-finite-quote' if impossible else 'no-positive-price' if upper <= 0 else 'unavailable' if lower is None else 'compatible' if band_compare(lower, upper) <= 0 else 'empty'
        supported = CAP if plan['basis'] == 'pre' else CAP - plan['primaryCapital']
        within = None if state == 'unavailable' else state == 'compatible' and supported > 0 and lower <= supported and band_compare(lower, min(upper, supported)) <= 0
        current = None if bridge is None else retention_ok[index] and all(row[index]['meetsModelCoverage'] for row in rows)
        intervals.append(dict(planId=plan['id'], lowerPreMoney=lower, upperPreMoney=upper, status=state,
                              includesLower=lower is not None and lower > 0, withinInputRange=within, currentQuoteMeets=current))
    if envelope_status == 'available' and any(p['status'] == 'unavailable' for p in intervals):
        envelope_status = 'unavailable'
    result['envelope'] = dict(status=envelope_status, modelQuoteCeiling=upper, limitingScenarioIds=limiting,
                              maximumPrimaryCapital=maximum, plans=intervals)
    scale = max([f['scale'] for f in forecasts] + [exact(p['primaryCapital']) for p in snapshot['plans']] +
                ([exact(v) for v in bridge.values()] if bridge is not None else [Decimal(0)]))
    return result, float(scale)


def fixtures(presets):
    def base(company='Anthropic', states=('Bear', 'Base', 'Bull')):
        return dict(company=company, scenarios=[dict(id=state.lower(), label=state, assumptions=copy.deepcopy(presets[company][state]), continuationYears=None) for state in states],
                    plans=[dict(id='a', label='Smaller round', basis='pre', quote=250, primaryCapital=25),
                           dict(id='b', label='More capital', basis='pre', quote=300, primaryCapital=35),
                           dict(id='c', label='Higher retention', basis='pre', quote=300, primaryCapital=20)],
                    policy=dict(capitalTarget=25, retentionFloor=.88, modelCoverageFloor=1, holderStake=.1),
                    bridge=dict(cash=20, debt=5, otherClaims=0))
    valid = []
    add = lambda name, value: valid.append(dict(name=name, snapshot=value))
    for company in ['Anthropic', 'OpenAI']:
        add(f'{company} worked decision', base(company))
        for state in ['Bear', 'Base', 'Bull']:
            add(f'{company} {state} alone', base(company, (state,)))
        for years in [0, 1, 5, 17, 100]:
            value = base(company)
            for scenario in value['scenarios']:
                scenario['continuationYears'] = years
            add(f'{company} finite {years}', value)
    for name, policy in [('one eligible at90pct', dict(retentionFloor=.9)), ('no eligible plans', dict(retentionFloor=.9, capitalTarget=30)), ('larger only', dict(capitalTarget=30)), ('coverage independent', dict(modelCoverageFloor=10)), ('zero tracked holder', dict(holderStake=0)), ('whole cohort tracked', dict(holderStake=1)), ('minimum policy floors', dict(capitalTarget=0, retentionFloor=.01, modelCoverageFloor=.1))]:
        value = base(); value['policy'].update(policy); add(name, value)
    value = base(); value['bridge'] = None; add('bridge missing', value)
    value = base(); value['bridge'] = dict(cash=0, debt=1000, otherClaims=1000); add('negative residuals preserved', value)
    value = base(); value['plans'][1] = dict(value['plans'][0], id='duplicate', label='Same economic offer'); add('tied offers', value)
    value = base(); value['plans'][1].update(quote=500, primaryCapital=50); add('parallel more cash', value)
    for name, qa, qb in [('unresolved nearby slopes', 250, 250.000000000001), ('resolved nearly parallel', 250, 350.0000000001), ('entered-term addition rounding', 250.00000000000003, 350.0000000001)]:
        value = base(); value['plans'] = value['plans'][:2]; value['policy']['capitalTarget'] = 0
        value['plans'][0]['quote'] = qa; value['plans'][1]['quote'] = qb
        if name == 'unresolved nearby slopes': value['plans'][1]['primaryCapital'] = 25
        add(name, value)
    value = base(); value['plans'] = value['plans'][:2]
    value['plans'][0].update(quote=.3, primaryCapital=.1); value['plans'][1].update(quote=.5, primaryCapital=.2)
    value['policy'].update(capitalTarget=0, retentionFloor=.5); add('fractional entered terms', value)
    for name, post in [('binary quarters pre', False), ('binary quarters post', True)]:
        value = base(); value['plans'] = value['plans'][:2]
        value['plans'][0].update(quote=250.5, primaryCapital=25.25); value['plans'][1].update(quote=300.75, primaryCapital=35.5)
        if post:
            for plan in value['plans']: plan.update(basis='post', quote=plan['quote'] + plan['primaryCapital'])
        add(name, value)
    for name, qa, ra, qb, rb in [('zero crossover residual', 100, 100, 75, 150), ('zero common allocation', 50, 75, 150, 75), ('subnormal half tie', 2 * math.ulp(0.0), 2 * math.ulp(0.0), 3 * math.ulp(0.0), math.ulp(0.0))]:
        value = base(); value['plans'] = value['plans'][:2]; value['policy'].update(capitalTarget=0, retentionFloor=.01)
        value['plans'][0].update(quote=qa, primaryCapital=ra); value['plans'][1].update(quote=qb, primaryCapital=rb)
        add(name, value)
    for name, capital in [('hand envelope compatible', 10), ('hand envelope conflicting', 12)]:
        value = base(states=('Base',)); ev = operating_reference(value['scenarios'][0]['assumptions'], None)['selected']
        value['bridge'] = dict(cash=0, debt=float(ev - 100), otherClaims=0)
        value['plans'] = [dict(id='a', label='Envelope hand case', basis='pre', quote=95, primaryCapital=capital)]
        value['policy'].update(capitalTarget=10, retentionFloor=.9); add(name, value)
    for capital in [0, 1e-10]:
        value = base(); value['plans'] = value['plans'][:1]; value['plans'][0].update(quote=1e12, primaryCapital=capital)
        value['policy'].update(capitalTarget=0, retentionFloor=1); add(f'100pct retention capital{capital}', value)
    for basis in ['pre', 'post']:
        value = base(states=('Base',)); value['scenarios'][0]['assumptions']['wacc'] = math.nextafter(.03, 1)
        value['policy']['retentionFloor'] = .99; value['plans'] = value['plans'][:1]
        value['plans'][0].update(basis=basis, quote=1e12, primaryCapital=1e11)
        add(f'analytical interval beyond {basis} input cap', value)
    value = base(states=('Base',)); value['plans'] = value['plans'][:1]
    value['plans'][0].update(quote=math.ulp(0.0), primaryCapital=0); value['policy'].update(capitalTarget=0, retentionFloor=.01)
    add('subnormal quote coverage ratio overflow', value)
    value = copy.deepcopy(value); value['plans'][0]['primaryCapital'] = math.ulp(0.0); add('positive inverse below resolution', value)
    value = base(states=('Base',)); value['bridge'] = dict(cash=0, debt=0, otherClaims=0)
    value['scenarios'][0]['assumptions'].update(rev2026=1e-12, stub=0)
    value['plans'] = value['plans'][:1]; value['plans'][0]['primaryCapital'] = 0
    value['policy'].update(capitalTarget=0, holderStake=math.ulp(0.0)); add('holder below resolution retains cohort', value)
    value = base(); value['scenarios'] = [dict(copy.deepcopy(s), id=f'case-{i}', continuationYears=[None, 0, 17][i % 3]) for i, s in enumerate(value['scenarios'] * 3)]
    value['plans'] += [dict(copy.deepcopy(p), id=f'extra-{i}', basis='post', quote=p['quote'] + p['primaryCapital']) for i, p in enumerate(value['plans'])]
    add('maximum nine by six mixed continuation', value)
    value = base(); value['scenarios'][0]['label'] = '量化研究 📈'; value['plans'][0]['label'] = '📈' * 60
    add('well-formed Unicode labels', value)
    value = base(); value['scenarios'][0]['label'] = '\u00a0\u2003'; value['plans'][0]['label'] = '   '
    add('documented whitespace label behavior', value)
    # A bounded deterministic lattice, not random draws or probability weights.
    for index in range(24):
        value = base('Anthropic' if index % 2 == 0 else 'OpenAI')
        value['policy'].update(capitalTarget=(index % 5) * 8, retentionFloor=[.5, .75, .88, .9, .99, 1][index % 6], modelCoverageFloor=[.1, .5, 1, 2][index % 4])
        value['plans'] = [dict(id=f'p-{j}', label=f'Explicit plan {j}', basis='pre', quote=100 + 17 * index + 31.25 * j, primaryCapital=(j + 1) * (2.5 + index)) for j in range(4)]
        if index % 3 == 0:
            for plan in value['plans']: plan.update(basis='post', quote=plan['quote'] + plan['primaryCapital'])
        value['bridge'] = dict(cash=10 * (index % 3), debt=25 * (index % 7), otherClaims=5)
        add(f'deterministic lattice {index:02}', value)
    invalid = []
    def bad(name, mutate):
        value = base(); mutate(value); invalid.append(dict(name=name, snapshot=value))
    for field, values in dict(capitalTarget=[-1, 1e12 + 1, None, '25', True], retentionFloor=[0, .009, 1.01], modelCoverageFloor=[.09, 10.1], holderStake=[-.1, 1.1]).items():
        for wrong in values:
            bad(f'{field} invalid {wrong}', lambda value, field=field, wrong=wrong: value['policy'].__setitem__(field, wrong))
    for field in ['company', 'scenarios', 'plans', 'policy', 'bridge']:
        bad(f'missing {field}', lambda value, field=field: value.pop(field))
    for years in [-1, .5, 101, '10']:
        bad(f'invalid continuation {years}', lambda value, years=years: value['scenarios'][0].__setitem__('continuationYears', years))
    bad('invalid middle case never dropped', lambda value: value['scenarios'][1]['assumptions'].__setitem__('g3', 0))
    bad('zero post pre-money', lambda value: value['plans'][0].update(basis='post', quote=25))
    bad('unsupported post residual precision', lambda value: value['plans'][0].update(basis='post', quote=math.nextafter(25, 30)))
    bad('extra snapshot field', lambda value: value.__setitem__('weights', [1, 0, 0]))
    bad('extra bridge field', lambda value: value['bridge'].__setitem__('netCash', 15))
    bad('bad company', lambda value: value.__setitem__('company', 'Other'))
    bad('duplicate plan', lambda value: value['plans'][1].__setitem__('id', 'a'))
    bad('duplicate scenario', lambda value: value['scenarios'][1].__setitem__('id', 'bear'))
    bad('control label', lambda value: value['plans'][0].__setitem__('label', 'x\n'))
    bad('too many unicode points', lambda value: value['plans'][0].__setitem__('label', '📈' * 61))
    for collection in ['scenarios', 'plans']:
        for code in [0xD800, 0xDC00]:
            bad(f'{collection} lone surrogate U+{code:04X}',
                lambda value, collection=collection, code=code: value[collection][0].__setitem__('label', 'Label-' + chr(code) + '-end'))
    bad('unsupported bridge amount', lambda value: value['bridge'].__setitem__('cash', 10001))
    bad('empty scenarios', lambda value: value.__setitem__('scenarios', []))
    bad('empty plans', lambda value: value.__setitem__('plans', []))
    return valid, invalid


PROGRAM = r"""import {readFileSync} from 'node:fs';
import {CAPITAL_VERSION,capitalStrategy,validateCapitalSnapshot} from './public/lib/capital-strategy.js';
const requests=JSON.parse(readFileSync(0,'utf8'));
const results=requests.map(({snapshot})=>{const before=JSON.stringify(snapshot);try{
 const result=capitalStrategy(snapshot),canonical=validateCapitalSnapshot(snapshot);
 return {ok:true,result,inputsUnchanged:before===JSON.stringify(snapshot),canonicalExact:JSON.stringify(canonical)===JSON.stringify(result.snapshot)};
}catch(error){return {ok:false,message:String(error.message)};}});
const fresh=()=>structuredClone(requests[0].snapshot),probes=[];let getterReads=0;
const reject=(name,mutate)=>{const value=fresh();mutate(value);try{validateCapitalSnapshot(value);probes.push({name,rejected:false});}catch(error){probes.push({name,rejected:true,message:String(error.message)});}};
reject('NaN policy',v=>v.policy.capitalTarget=NaN);
reject('Infinity quote',v=>v.plans[0].quote=Infinity);
reject('negative Infinity bridge',v=>v.bridge.cash=-Infinity);
reject('policy getter',v=>Object.defineProperty(v.policy,'capitalTarget',{enumerable:true,get(){getterReads++;return 25;}}));
reject('scenario array getter',v=>Object.defineProperty(v.scenarios,'0',{enumerable:true,get(){getterReads++;return requests[0].snapshot.scenarios[0];}}));
reject('inherited fields',v=>v.policy=Object.create(v.policy));
reject('nonenumerable field',v=>Object.defineProperty(v.policy,'capitalTarget',{value:25,enumerable:false}));
reject('symbol snapshot',v=>v[Symbol('private')]=1);
reject('array hole',v=>delete v.plans[0]);
reject('array custom string',v=>v.scenarios.extra=1);
reject('array custom symbol',v=>v.plans[Symbol('private')]=1);
const nullProto=fresh();nullProto.policy=Object.assign(Object.create(null),nullProto.policy);
const acceptedNullPrototype=JSON.stringify(validateCapitalSnapshot(nullProto))===JSON.stringify(validateCapitalSnapshot(fresh()));
process.stdout.write(JSON.stringify({version:CAPITAL_VERSION,results,probes,getterReads,acceptedNullPrototype}));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'qa-local/v4-0/quant/capital-reference.json')
    args = parser.parse_args()
    node = os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
    if not node:
        raise SystemExit('Node.js is required to evaluate the production target.')
    with localcontext() as context:
        context.prec = 100
        presets = json.loads((ROOT / 'data/presets.json').read_text())
        valid, invalid = fixtures(presets)
        process = subprocess.run([node, '--input-type=module', '-e', PROGRAM], input=json.dumps(valid + invalid, allow_nan=False), text=True, capture_output=True, cwd=ROOT, timeout=45)
        if process.returncode:
            raise SystemExit(process.stderr or 'Production target failed to run.')
        payload = json.loads(process.stdout)
        failures, evidence = [], []
        counters = dict(numericComparisons=0, structuralComparisons=0, exactCrossoverComparisons=0)
        errors = dict(maxAbsoluteError=0, maxAbsoluteErrorField=None, maxRelativeError=0, maxRelativeErrorField=None)
        def require(condition, message):
            counters['structuralComparisons'] += 1
            if not condition: failures.append(message)
        def finite_tree(value, path):
            if type(value) in (int, float): require(math.isfinite(value), f'{path}: nonfinite output')
            elif isinstance(value, dict):
                for key, item in value.items(): finite_tree(item, f'{path}.{key}')
            elif isinstance(value, list):
                for index, item in enumerate(value): finite_tree(item, f'{path}[{index}]')
        def numeric(actual, expected, path, money_scale):
            counters['numericComparisons'] += 1
            if type(actual) not in (int, float) or not math.isfinite(actual):
                failures.append(f'{path}: expected finite {expected}, got {actual!r}'); return
            target = float(expected)
            error = abs(actual - target)
            relative = error / abs(target) if target else error
            if error > errors['maxAbsoluteError']:
                errors.update(maxAbsoluteError=error, maxAbsoluteErrorField=path,
                              maxAbsoluteErrorContext=dict(actual=actual, reference=target,
                                                           relativeError=relative, componentScale=money_scale,
                                                           units='USD billions or the named field unit'))
            if relative > errors['maxRelativeError']:
                errors.update(maxRelativeError=relative, maxRelativeErrorField=path,
                              maxRelativeErrorContext=dict(actual=actual, reference=target,
                                                           absoluteError=error, componentScale=money_scale,
                                                           units='USD billions or the named field unit'))
            if '.crossovers[' in path and path.rsplit('.', 1)[-1] in ['equityResidual', 'allocation']:
                counters['exactCrossoverComparisons'] += 1
                require(actual == target, f'{path}: crossover differs from the correctly rounded exact entered-term share ledger: {actual!r} versus {target!r}')
                return
            dollar_fields = ['operatingEv', 'perpetualEv', 'modelPreMoneyEquity', 'modelPostMoneyEquity', 'existingCohortAllocation', 'trackedHolderAllocation', 'regret', 'bestAllocation', 'worstRegret', 'minAllocation', 'maxAllocation', 'minEquity', 'maxEquity', 'modelQuoteCeiling', 'upperPreMoney', 'maximumPrimaryCapital']
            cancellation_allowance = MONEY_ULPS * math.ulp(1.0) * money_scale if path.rsplit('.', 1)[-1] in dollar_fields else 0
            tolerance = max(8 * math.ulp(target), REL_TOL * abs(target), cancellation_allowance)
            require(error <= tolerance, f'{path}: {actual!r} differs from independent reference {target!r} by {error!r}, tolerance {tolerance!r}')
            if target != 0: require(actual != 0, f'{path}: a representable nonzero value disappeared')
        def walk(actual, expected, path, money_scale):
            if isinstance(expected, dict):
                require(isinstance(actual, dict), f'{path}: expected object')
                if not isinstance(actual, dict): return
                for key, value in expected.items():
                    require(key in actual, f'{path}.{key}: missing required field')
                    if key in actual: walk(actual[key], value, f'{path}.{key}', money_scale)
            elif isinstance(expected, list):
                require(isinstance(actual, list) and len(actual) == len(expected), f'{path}: wrong ordered array length')
                if isinstance(actual, list):
                    for index, (a, e) in enumerate(zip(actual, expected)): walk(a, e, f'{path}[{index}]', money_scale)
            elif type(expected) in (float, int) or isinstance(expected, (Decimal, Fraction)):
                numeric(actual, expected, path, money_scale)
            else:
                require(type(actual) is type(expected) and actual == expected, f'{path}: {actual!r} differs from {expected!r}')
        def shape(value, keys, path):
            require(isinstance(value, dict) and set(value) == set(keys.split()), f'{path}: complete contract fields differ')
        require(payload['version'] == '1.0.0', 'Capital version changed')
        require(len(payload['results']) == len(valid) + len(invalid), 'Incomplete result batch')
        for item, target in zip(valid, payload['results'][:len(valid)], strict=True):
            name, snapshot = item['name'], item['snapshot']
            require(target['ok'], f'{name}: valid fixture rejected: {target.get("message")}')
            if not target['ok']: continue
            actual = target['result']; expected, scale = decision_reference(snapshot)
            require(target['inputsUnchanged'] and target['canonicalExact'], f'{name}: input mutation or canonical mismatch')
            finite_tree(actual, name)
            shape(actual, 'version modelVersion valuationDate snapshot scenarios plans matrix comparison envelope method warnings', name)
            for index, scenario in enumerate(actual['scenarios']):
                shape(scenario, 'id label assumptions continuationYears operatingEv perpetualEv modelPreMoneyEquity warnings', f'{name}.scenarios[{index}]')
            for index, plan in enumerate(actual['plans']):
                shape(plan, 'id label round pricing capitalGap meetsCapital retainedFraction meetsRetention eligible ownership', f'{name}.plans[{index}]')
            for index, cell in enumerate(actual['matrix']):
                shape(cell, 'scenarioId planId modelPreMoneyEquity modelPostMoneyEquity existingCohortAllocation trackedHolderAllocation modelToQuote meetsModelCoverage regret warnings', f'{name}.matrix[{index}]')
                require(isinstance(cell['warnings'], list), f'{name}: missing warning array')
                if cell['existingCohortAllocation'] is None: require(bool(cell['warnings']), f'{name}: unavailable allocation has no reason')
            comparison = actual['comparison']
            shape(comparison, 'eligiblePlanIds scenarioIds metric range perScenario planMetrics minimax dominance dominanceStatus crossovers', f'{name}.comparison')
            for row in comparison['perScenario']: shape(row, 'scenarioId bestAllocation bestPlanIds', f'{name}.perScenario')
            for metric in comparison['planMetrics']: shape(metric, 'planId eligible worstRegret worstScenarioIds minAllocation maxAllocation meetsModelCoverageIn totalScenarios', f'{name}.planMetric')
            for cross in comparison['crossovers']: shape(cross, 'planA planB eligiblePair status equityResidual allocation inSelectedRange higherResidualPreferred lowerResidualPreferred', f'{name}.crossover')
            shape(actual['envelope'], 'status modelQuoteCeiling limitingScenarioIds maximumPrimaryCapital plans', f'{name}.envelope')
            for interval in actual['envelope']['plans']: shape(interval, 'planId lowerPreMoney upperPreMoney status includesLower withinInputRange currentQuoteMeets', f'{name}.interval')
            walk(actual, expected, name, scale)
            require(actual['method']['scenarioWeighting'] == 'none' and actual['method']['capitalTargetSource'] == 'analyst-input', f'{name}: weighting or funding-need meaning changed')
            evidence.append(dict(name=name, scenarios=len(snapshot['scenarios']), plans=len(snapshot['plans']), eligiblePlanIds=comparison['eligiblePlanIds'], minimax=comparison['minimax'], envelopeStatus=actual['envelope']['status'], finiteCrossovers=sum(c['status'] == 'finite' for c in comparison['crossovers'])))
        for item, target in zip(invalid, payload['results'][len(valid):], strict=True): require(not target['ok'], f'{item["name"]}: invalid snapshot was accepted')
        for probe in payload['probes']: require(probe['rejected'], f'{probe["name"]}: JavaScript-only malformed input was accepted')
        require(payload['getterReads'] == 0, 'Validation executed an input accessor')
        require(payload['acceptedNullPrototype'], 'Valid null-prototype data record rejected')
        paths = ['public/lib/capital-strategy.js', 'public/lib/model.js', 'public/lib/horizon.js', 'public/lib/financing.js', 'public/lib/ownership.js', 'data/presets.json', 'data/research.json', 'tests/capital-strategy.test.js', 'scripts/check_capital_reference.py', 'docs/CAPITAL_STRATEGY.md']
        source_hashes = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths}
        frozen = {'public/lib/model.js': '9be65ebd529ab5c19100c9ee1bdf3d017501c42fc689a3d1d0b2232f1edfa180', 'data/presets.json': '9239c933d4c19797c0fe98388ca5632a17939f6f42316814c35e54dc1db957ca', 'data/research.json': '72a704b9c4d79f0f827ab0706e68ef56f20ec4dd46a8031ff06d0e7babfdbc65'}
        for path, digest in frozen.items(): require(source_hashes[path] == digest, f'{path}: frozen financial source changed')
        receipt = dict(schema=1, status='passed' if not failures else 'failed', generatedAt=datetime.now(timezone.utc).isoformat(), capitalVersion=payload['version'],
                       method='Independent 100-digit Decimal.from_float explicit FCFF and direct annual finite-continuation sum; Fraction.from_float 100-existing-share issuance ledger; exhaustive listed-scenario comparisons; inverse price bound derived from allowable new share count.',
                       crossoverPrecision='Exact binary entered quote and raise terms, before pre+raise or post-raise rounding; Fraction roots round once to binary64. Unresolved slope/forward-reconciliation policy is checked separately.',
                       comparisonPolicy='32 binary64 epsilons relative; positive issuance always fails a 100% retention floor. Regrets within the allocation comparison band normalize to zero. Scenario counts are not probabilities.',
                       tolerance=dict(relative=REL_TOL, minimumUlps=8, moneyCancellationUlps=MONEY_ULPS, moneyScale='Maximum absolute DCF component sum, bridge component or primary capital in each snapshot.', exactRoundedCrossover=True),
                       validFixtures=len(valid), invalidFixtures=len(invalid), javascriptOnlyRejections=len(payload['probes']), **counters, **errors,
                       cases=evidence, invalidEvidence=[dict(name=item['name'], rejected=not target['ok'], message=target.get('message')) for item, target in zip(invalid, payload['results'][len(valid):], strict=True)],
                       javascriptOnlyEvidence=payload['probes'], sourceHashes=source_hashes,
                       scope='Algorithmic and arithmetic independence for this simplified conditional finite scenario comparison; not an external audit, probability calibration, company balance confirmation, financing commitment, funding requirement or investment recommendation.', failures=failures)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
        print(json.dumps({key: receipt[key] for key in ['status', 'validFixtures', 'invalidFixtures', 'javascriptOnlyRejections', 'numericComparisons', 'structuralComparisons', 'exactCrossoverComparisons', 'maxAbsoluteError', 'maxRelativeError']} | {'receipt': str(args.output), 'failures': failures}, indent=2))
        if failures: raise SystemExit(1)


if __name__ == '__main__':
    main()
