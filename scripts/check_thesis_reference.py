#!/usr/bin/env python3
"""Independently verify thesis attribution and the valuation target frontier.

Requires Python 3 standard library and Node 24. Run from any directory:
    python scripts/check_thesis_reference.py

The default report is docs/verification/thesis-reference.json. Fixtures are
constructed deterministically in this script from data/presets.json. The FCFF
oracle is the separate, pre-existing scripts/reference_model.py. Attribution
uses all 720 group permutations; margin roots use affine tax-kink segments.
Source hashes bind the report to the files observed by Python and Node.
"""

from __future__ import annotations

import argparse
import importlib.util
import hashlib
import itertools
import json
import math
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATHS = (
    "public/lib/thesis.js", "public/lib/model.js", "data/presets.json",
    "scripts/reference_model.py", "scripts/check_thesis_reference.py",
)
REFERENCE_FILE = ROOT / "scripts/reference_model.py"
REFERENCE_LOADED_HASH = hashlib.sha256(REFERENCE_FILE.read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location("independent_fcff", REFERENCE_FILE)
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
project = reference.project
KEYS = reference.KEYS
GROUPS = {
    "growth": ("rev2026", "g1", "g2"),
    "margins": ("m27", "m30", "m36"),
    "capital": ("turns",),
    "continuation": ("g3", "wacc", "tg", "roic"),
    "tax": ("tax",),
    "stub": ("stub",),
}
ABS_TOL = 1e-8
REL_TOL = 2e-11
MARGIN_TOL = 2e-9
failures = []
metrics = {"maxEvAbsoluteError": 0.0, "maxContributionAbsoluteError": 0.0,
           "maxContributionScaledError": 0.0, "maxMarginAbsoluteError": 0.0,
           "maxFrontierEvResidual": 0.0, "permutations": 0, "marginalSteps": 0,
           "directGridCells": 0, "validGridCells": 0, "invalidGridCells": 0,
           "frontierEntries": 0, "numericChecks": 0, "frontierStatuses": {},
           "independentProjectionEvaluations": 0}


def check(condition, label, **details):
    if not condition:
        failures.append({"check": label, **details})


def close(actual, expected, label, kind="ev", absolute=ABS_TOL, relative=REL_TOL):
    metrics["numericChecks"] += 1
    if not isinstance(actual, (int, float)) or not math.isfinite(actual):
        check(False, label, actual=actual, expected=expected)
        return
    error = abs(actual - expected)
    scale = max(1.0, abs(actual), abs(expected))
    if kind == "ev":
        metrics["maxEvAbsoluteError"] = max(metrics["maxEvAbsoluteError"], error)
    elif kind == "contribution":
        metrics["maxContributionAbsoluteError"] = max(metrics["maxContributionAbsoluteError"], error)
        metrics["maxContributionScaledError"] = max(metrics["maxContributionScaledError"], error / scale)
    elif kind == "margin":
        metrics["maxMarginAbsoluteError"] = max(metrics["maxMarginAbsoluteError"], error)
    check(error <= absolute + relative * scale, label,
          actual=actual, expected=expected, absoluteError=error,
          allowedError=absolute + relative * scale)


def value(a):
    metrics["independentProjectionEvaluations"] += 1
    return project(a)["ev"]


def permutation_oracle(a, b):
    cache = {}
    lifts = {key: [] for key in GROUPS}

    def cached(p):
        key = tuple(p[k] for k in KEYS)
        if key not in cache:
            cache[key] = value(p)
        return cache[key]

    for order in itertools.permutations(GROUPS):
        p = dict(a)
        previous = cached(p)
        for group in order:
            for key in GROUPS[group]:
                p[key] = b[key]
            current = cached(p)
            lifts[group].append(current - previous)
            previous = current
            metrics["marginalSteps"] += 1
        metrics["permutations"] += 1
    return {group: math.fsum(changes) / 720 for group, changes in lifts.items()}


def margin_frontier(a, rate, lower, upper, target):
    """Exact segment interpolation from independently calculated FCFF endpoints."""
    p = {**a, "wacc": rate}
    try:
        lo_ev = value({**p, "m36": lower})
        hi_ev = value({**p, "m36": upper})
    except (ValueError, OverflowError, ZeroDivisionError):
        return {"status": "invalid"}
    tolerance = ABS_TOL + REL_TOL * max(1.0, abs(target), abs(lo_ev), abs(hi_ev))
    if abs(lo_ev - target) <= tolerance:
        return {"status": "solved", "margin": lower, "ev": lo_ev}
    if abs(hi_ev - target) <= tolerance:
        return {"status": "solved", "margin": upper, "ev": hi_ev}
    if target < lo_ev:
        return {"status": "below_range"}
    if target > hi_ev:
        return {"status": "above_range"}
    knots = [lower, upper]
    if a["m30"] < 0:
        for k in range(1, 6):
            crossing = -(6 - k) * a["m30"] / k
            if lower < crossing < upper:
                knots.append(crossing)
    knots = sorted(set(knots))
    left = knots[0]
    left_ev = lo_ev
    for right in knots[1:]:
        right_ev = value({**p, "m36": right})
        if target <= right_ev:
            # The function is affine between adjacent tax-status crossings.
            margin = left + (right - left) * (target - left_ev) / (right_ev - left_ev)
            return {"status": "solved", "margin": margin,
                    "ev": value({**p, "m36": margin})}
        left, left_ev = right, right_ev
    raise AssertionError("Target bracketed by endpoints but not by tax segments")


def build_fixtures():
    presets = json.loads((ROOT / "data/presets.json").read_text())
    base = presets["Anthropic"]["Base"]
    comparisons = []
    for company, cases in presets.items():
        for aname, bname in itertools.product(("Bear", "Base", "Bull"), repeat=2):
            comparisons.append({"name": f"{company}/{aname}->{bname}",
                                "reference": cases[aname], "alternative": cases[bname],
                                "expectation": "ok"})
    interaction_a = {"rev2026": 32, "g1": .3, "g2": .15, "g3": .06,
                     "m27": -.6, "m30": -.3, "m36": .05, "turns": .4,
                     "wacc": .18, "tg": .01, "roic": .12, "stub": -30, "tax": .45}
    interaction_b = {"rev2026": 75, "g1": .8, "g2": .36, "g3": .16,
                     "m27": .03, "m30": .15, "m36": .5, "turns": 5,
                     "wacc": .08, "tg": .04, "roic": .25, "stub": 7, "tax": .15}
    negative = {**base, "turns": .05}
    zero = {**base, "rev2026": math.ulp(0.0), "g1": 0, "g2": 0, "g3": 0,
            "tg": 0, "m27": .01, "m30": .01, "m36": .01, "stub": 0,
            "tax": 0, "wacc": .1}
    low_regime = {**base, "g3": .02, "tg": .01, "wacc": .03, "roic": .04}
    high_regime = {**base, "g3": .08, "tg": .06, "wacc": .1, "roic": .12}
    scaled = {**base, "rev2026": base["rev2026"] * .4, "turns": base["turns"] * .4,
              **{k: base[k] / .4 for k in ("m27", "m30", "m36")}}
    edits = [
        ("all_six_interactions", interaction_a, interaction_b),
        ("all_six_interactions_reverse", interaction_b, interaction_a),
        ("negative_reference", negative, base),
        ("negative_alternative", base, negative),
        ("stub_only", base, {**base, "stub": -.1234567890123}),
        ("tax_kink_transition", presets["OpenAI"]["Bear"],
         {**presets["OpenAI"]["Bear"], "m27": -.15, "m30": .004, "m36": .019, "tax": .72}),
        ("coupled_long_run", low_regime, high_regime),
        ("high_precision", base, {**base, "rev2026": 53.26000123456789,
          "g1": .450000123456789, "m36": .22000123456789,
          "wacc": .125000123456789, "stub": -3.0000001234}),
        ("accounting_relabel", base, scaled),
        ("zero_ev_reference", zero, base),
    ]
    for name, a, b in edits:
        comparisons.append({"name": "edits/" + name, "reference": a,
                            "alternative": b, "expectation": "ok"})
    tiny_rate = {"rev2026": 1e-300, "g1": 0, "g2": 0, "g3": 0,
                 "m27": .1, "m30": .1, "m36": .1, "turns": 1,
                 "wacc": math.ulp(0.0), "tg": 0, "roic": .2, "stub": 0, "tax": 0}
    huge_revenue = {**tiny_rate, "rev2026": 10000, "g1": 2, "g2": 2, "g3": 2,
                    "m27": 1, "m30": 1, "m36": 1, "wacc": .1}
    for name, a, b in (("overflow_hybrid", tiny_rate, huge_revenue),
                       ("overflow_hybrid_reverse", huge_revenue, tiny_rate)):
        comparisons.append({"name": "extreme/" + name, "reference": a,
                            "alternative": b, "expectation": "unavailable"})

    landscapes = []
    known_margin = .6135792468
    for company, cases in presets.items():
        for scenario, a in cases.items():
            target = value({**a, "m36": known_margin})
            assert target > 0
            rates = sorted(set([a["tg"] - .001, .06, .10, a["wacc"], .16, .24, .5]))
            landscapes.append({"name": f"grid/{company}/{scenario}", "assumptions": a,
                               "rates": rates, "margins": [.001, .12, .25, .5, .8, 1],
                               "target": target,
                               "known": {"wacc": a["wacc"], "margin": known_margin}})
    kink = {"rev2026": 100, "g1": 0, "g2": 0, "g3": 0,
            "m27": -.5, "m30": -.25, "m36": .3, "turns": 2,
            "wacc": .1, "tg": 0, "roic": .2, "stub": 1000, "tax": .4}
    for margin in (.125, .25, .5, .25 - 1e-8, .25 + 1e-8):
        landscapes.append({"name": f"frontier/tax_kink/{margin:.10f}", "assumptions": kink,
                           "rates": [.08, .1, .16], "margins": [.01, .125, .25, .5, .95],
                           "target": value({**kink, "m36": margin}),
                           "known": {"wacc": .1, "margin": margin}})
    for label, margin, offset in (("lower_exact", .01, 0), ("upper_exact", .95, 0),
                                   ("below_lower", .01, -1e-4), ("above_upper", .95, 1e-4)):
        landscapes.append({"name": "frontier/" + label, "assumptions": kink,
                           "rates": [.1, .16], "margins": [.01, .25, .95], "target": 1,
                           "targetFromPoint": {"wacc": .1, "margin": margin},
                           "targetOffset": offset,
                           "known": {"wacc": .1, "margin": margin} if offset == 0 else None})
    for label, margin in (("near_lower", .010000001), ("near_upper", .999999999)):
        landscapes.append({"name": "frontier/" + label, "assumptions": kink,
                           "rates": [.1, .15], "margins": [.01, .4, 1],
                           "target": value({**kink, "m36": margin}),
                           "known": {"wacc": .1, "margin": margin}})
    landscapes.extend([
        {"name": "domain/nonpositive_values", "assumptions": negative,
         "rates": [.1, .3, .6], "margins": [.001, .2, 1], "target": 1},
        {"name": "domain/zero_margin_and_invalid_rate", "assumptions": base,
         "rates": [.02, .125, .61], "margins": [0, .22, .5], "target": 1000},
        {"name": "domain/near_discount_pole", "assumptions": base,
         "rates": [base["tg"], math.nextafter(base["tg"], math.inf), .1],
         "margins": [.001, .22, 1], "target": 1e12},
        {"name": "domain/overflow_column", "assumptions": {**base, "tg": 0},
         "rates": [math.ulp(0.0), .1], "margins": [.1, .5, 1], "target": 1000},
        {"name": "precision/tiny_target_at_normal_scale_ev_cancellation", "assumptions": base,
         "rates": [.1, .125], "margins": [.001, .5, 1], "target": 1e-300,
         "expectPrecisionFailure": True},
    ])
    tiny_positive = {**zero, "m27": 1, "m30": 1, "m36": 1}
    check(value(zero) == 0, "fixture zero reference is exactly zero")
    check(value(tiny_positive) > 0, "fixture ratio reference is strictly positive")
    check(value(negative) < 0, "fixture negative reference is negative")
    rejects = [
        {"kind": "compare", "name": "reject/nonfinite_ratio", "reference": tiny_positive,
         "alternative": base},
        {"kind": "compare", "name": "reject/nonfinite_endpoint", "reference": base,
         "alternative": {**base, "tg": 0, "wacc": math.ulp(0.0)}},
        {"kind": "landscape", "name": "reject/descending_axis", "assumptions": base,
         "rates": [.15, .1], "margins": [.1, .3], "target": 1000},
        {"kind": "landscape", "name": "reject/duplicate_axis", "assumptions": base,
         "rates": [.1, .1], "margins": [.1, .3], "target": 1000},
        {"kind": "landscape", "name": "reject/nonpositive_target", "assumptions": base,
         "rates": [.1, .2], "margins": [.1, .3], "target": 0},
    ]
    return {"comparisons": comparisons, "landscapes": landscapes, "rejects": rejects}


NODE_DRIVER = r'''
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
if(process.versions.node.split('.')[0]!=='24') {
  throw new Error('Independent thesis verification requires Node 24.');
}
const jsPaths=['public/lib/thesis.js','public/lib/model.js'];
const sourceHashes=Object.fromEntries(jsPaths.map(path=>[path,
  createHash('sha256').update(readFileSync(process.cwd()+'/'+path)).digest('hex')]));
const {compareTheses, valuationLandscape, THESIS_GROUPS, THESIS_VERSION} =
  await import(pathToFileURL(process.cwd() + '/public/lib/thesis.js'));
const {project} = await import(pathToFileURL(process.cwd() + '/public/lib/model.js'));
const payload=JSON.parse(readFileSync(0,'utf8'));
const attempt=(c,fn)=>{try{return {name:c.name,ok:true,...fn()};}
  catch(error){return {name:c.name,ok:false,error:error.message};}};
const comparison=c=>({result:compareTheses(c.reference,c.alternative)});
const landscape=c=>{
  const target=c.targetFromPoint ? project({...c.assumptions,wacc:c.targetFromPoint.wacc,
    m36:c.targetFromPoint.margin}).ev+(c.targetOffset||0) : c.target;
  return {target,result:valuationLandscape(c.assumptions,{rates:c.rates,margins:c.margins,target})};
};
const results={version:THESIS_VERSION,groups:THESIS_GROUPS,sourceHashes,nodeVersion:process.version,
  comparisons:payload.comparisons.map(c=>attempt(c,()=>comparison(c))),
  landscapes:payload.landscapes.map(c=>attempt(c,()=>landscape(c))),
  rejects:payload.rejects.map(c=>attempt(c,()=>c.kind==='compare'?comparison(c):landscape(c)))};
results.sourceHashesAfter=Object.fromEntries(jsPaths.map(path=>[path,
  createHash('sha256').update(readFileSync(process.cwd()+'/'+path)).digest('hex')]));
process.stdout.write(JSON.stringify(results));
'''


def verify_comparisons(fixtures, actual):
    by_name = {item["name"]: item for item in actual}
    summaries = []
    for case in fixtures:
        name, a, b = case["name"], case["reference"], case["alternative"]
        observed = by_name[name]
        check(observed["ok"], name + "/success", error=observed.get("error"))
        if not observed["ok"]:
            continue
        result = observed["result"]
        a_ev, b_ev = value(a), value(b)
        close(result["reference"]["result"]["ev"], a_ev, name + "/referenceEV")
        close(result["alternative"]["result"]["ev"], b_ev, name + "/alternativeEV")
        close(result["evDelta"], b_ev - a_ev, name + "/delta")
        if a_ev <= 0:
            check(result["evChangeRatio"] is None, name + "/nonpositiveRatioNull")
        else:
            close(result["evChangeRatio"], (b_ev - a_ev) / a_ev, name + "/ratio", kind="ratio")
        check(result["reference"]["assumptions"] == a, name + "/referenceSnapshot")
        check(result["alternative"]["assumptions"] == b, name + "/alternativeSnapshot")
        attr = result["attribution"]
        check(attr["status"] == case["expectation"], name + "/attributionStatus",
              actual=attr["status"], expected=case["expectation"])
        if case["expectation"] == "unavailable":
            # Independently demonstrate a real hybrid overflow with finite endpoints.
            failed = 0
            for states in itertools.product((False, True), repeat=len(GROUPS)):
                hybrid = dict(a)
                for selected, group in zip(states, GROUPS.values()):
                    if selected:
                        for key in group:
                            hybrid[key] = b[key]
                try:
                    value(hybrid)
                except (ValueError, OverflowError, ZeroDivisionError):
                    failed += 1
            check(failed > 0, name + "/independentHybridOverflow")
            check(bool(attr["reason"]), name + "/unavailableReason")
            summaries.append({"name": name, "status": "unavailable", "overflowingHybrids": failed})
            continue
        expected = permutation_oracle(a, b)
        groups = {g["key"]: g for g in attr["groups"]}
        check(set(groups) == set(GROUPS), name + "/groupKeys")
        for group, contribution in expected.items():
            close(groups[group]["contribution"], contribution,
                  name + "/contribution/" + group, kind="contribution")
            if all(a[key] == b[key] for key in GROUPS[group]):
                check(groups[group]["contribution"] == 0, name + "/unchanged/" + group)
        close(attr["sum"], math.fsum(expected.values()), name + "/sum")
        close(attr["residual"], result["evDelta"] - attr["sum"], name + "/residualRecord")
        close(attr["sum"], b_ev - a_ev, name + "/reconciliation")
        check((attr["groupCount"], attr["coalitions"], attr["orderings"]) == (6, 64, 720),
              name + "/enumerationMetadata")
        summaries.append({"name": name, "status": "ok", "referenceEV": a_ev,
                          "alternativeEV": b_ev, "contributions": expected})
    # Reversal tested by named group, independent of the JS ordering of groups.
    for prefix, forward, backward in (("interaction", "edits/all_six_interactions", "edits/all_six_interactions_reverse"),
                                      ("negative", "edits/negative_reference", "edits/negative_alternative")):
        one, two = by_name[forward], by_name[backward]
        if one["ok"] and two["ok"]:
            back = {g["key"]: g["contribution"] for g in two["result"]["attribution"]["groups"]}
            for group in one["result"]["attribution"]["groups"]:
                close(group["contribution"], -back[group["key"]], prefix + "/reverse/" + group["key"],
                      kind="contribution")
    return summaries


def verify_landscapes(fixtures, actual):
    by_name = {item["name"]: item for item in actual}
    summaries = []
    for case in fixtures:
        name = case["name"]
        observed = by_name[name]
        check(observed["ok"], name + "/success", error=observed.get("error"))
        if not observed["ok"]:
            continue
        result, a, target = observed["result"], case["assumptions"], observed["target"]
        values = []
        for row, margin in enumerate(case["margins"]):
            for col, rate in enumerate(case["rates"]):
                metrics["directGridCells"] += 1
                actual_ev = result["values"][row][col]
                try:
                    expected_ev = value({**a, "m36": margin, "wacc": rate})
                except (ValueError, OverflowError, ZeroDivisionError):
                    metrics["invalidGridCells"] += 1
                    check(actual_ev is None, name + f"/cell/{row}/{col}/invalid")
                    check(bool(result["invalidReasons"][row][col]), name + f"/cell/{row}/{col}/reason")
                else:
                    metrics["validGridCells"] += 1
                    values.append(expected_ev)
                    close(actual_ev, expected_ev, name + f"/cell/{row}/{col}")
                    check(result["invalidReasons"][row][col] is None, name + f"/cell/{row}/{col}/validReasonNull")
        check(result["validCount"] == len(values), name + "/validCount")
        if values:
            close(result["minEv"], min(values), name + "/minimum")
            close(result["maxEv"], max(values), name + "/maximum")
        else:
            check(result["minEv"] is None and result["maxEv"] is None, name + "/emptyExtrema")
        statuses = []
        for point, rate in zip(result["frontier"], case["rates"]):
            metrics["frontierEntries"] += 1
            expected = margin_frontier(a, rate, case["margins"][0], case["margins"][-1], target)
            status = point["status"]
            if case.get("expectPrecisionFailure"):
                check(expected["status"] == "solved", name + f"/frontier/{rate}/realRootBracketed")
                check("precision" in (point["reason"] or "").lower(),
                      name + f"/frontier/{rate}/precisionFailureExplained")
                expected = {"status": "invalid"}
            metrics["frontierStatuses"][status] = metrics["frontierStatuses"].get(status, 0) + 1
            statuses.append(status)
            check(status == expected["status"], name + f"/frontier/{rate}/status",
                  actual=status, expected=expected["status"], target=target)
            close(point["wacc"], rate, name + f"/frontier/{rate}/rate", kind="rate", absolute=0, relative=0)
            if status == "solved":
                check(case["margins"][0] <= point["margin"] <= case["margins"][-1],
                      name + f"/frontier/{rate}/insideRange")
                if "margin" in expected:
                    close(point["margin"], expected["margin"], name + f"/frontier/{rate}/margin",
                          kind="margin", absolute=MARGIN_TOL, relative=0)
                independently_valued = value({**a, "m36": point["margin"], "wacc": rate})
                close(point["ev"], independently_valued, name + f"/frontier/{rate}/ev")
                residual = abs(independently_valued - target)
                metrics["maxFrontierEvResidual"] = max(metrics["maxFrontierEvResidual"], residual)
                close(independently_valued, target, name + f"/frontier/{rate}/target", absolute=1e-6, relative=2e-9)
                close(point["residual"], point["ev"] - target, name + f"/frontier/{rate}/residualRecord")
            else:
                check(all(point[key] is None for key in ("margin", "ev", "residual")),
                      name + f"/frontier/{rate}/noInventedSolution")
                check(bool(point["reason"]), name + f"/frontier/{rate}/reason")
        known = case.get("known")
        if known:
            point = next(p for p in result["frontier"] if p["wacc"] == known["wacc"])
            check(point["status"] == "solved", name + "/constructedTargetSolved")
            if point["status"] == "solved":
                close(point["margin"], known["margin"], name + "/constructedKnownMargin",
                      kind="margin", absolute=MARGIN_TOL, relative=0)
                if name.endswith(("lower_exact", "upper_exact")):
                    check(point["margin"] == known["margin"], name + "/exactEndpointIdentity",
                          actual=point["margin"], expected=known["margin"])
        summaries.append({"name": name, "target": target, "validCells": len(values),
                          "frontierStatuses": statuses})
    return summaries


def interaction_diagnostic(case):
    a, b = case["reference"], case["alternative"]
    base = value(a)
    marginal = {}
    for key, inputs in GROUPS.items():
        marginal[key] = value({**a, **{field: b[field] for field in inputs}}) - base
    strongest = {"groups": None, "mixedDifference": 0.0}
    for g1, g2 in itertools.combinations(GROUPS, 2):
        pair = {field: b[field] for field in GROUPS[g1] + GROUPS[g2]}
        mixed = value({**a, **pair}) - base - marginal[g1] - marginal[g2]
        if abs(mixed) > abs(strongest["mixedDifference"]):
            strongest = {"groups": [g1, g2], "mixedDifference": mixed}
    return {"oneAtATimeSum": math.fsum(marginal.values()), "actualDelta": value(b) - base,
            "oneAtATimeReconciliationGap": math.fsum(marginal.values()) - (value(b) - base),
            "strongestTwoGroupInteractionAtReference": strongest}


def source_hashes():
    return {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
            for path in SOURCE_PATHS}


def save_report(report, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    keys = ("status", "counts", "metrics", "sourceBinding", "failures", "elapsedSeconds")
    print(json.dumps({key: report[key] for key in keys if key in report}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/verification/thesis-reference.json",
                        help="Report path; defaults to docs/verification/thesis-reference.json.")
    args = parser.parse_args()
    started = time.perf_counter()
    before = source_hashes()
    check(REFERENCE_LOADED_HASH == before["scripts/reference_model.py"],
          "sourceBinding/pythonReferenceUnchangedSinceImport")
    fixtures = build_fixtures()
    fixture_json = json.dumps(fixtures, sort_keys=True, separators=(",", ":"), allow_nan=False)
    completed = subprocess.run(["node", "--input-type=module", "-e", NODE_DRIVER], cwd=ROOT,
                               input=fixture_json, capture_output=True, text=True, timeout=60)
    if completed.returncode != 0:
        report = {
            "status": "fail",
            "testedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sourceHashes": before,
            "failures": [{"check": "nodeBridge", "exitCode": completed.returncode,
                          "error": completed.stderr.replace(str(ROOT), "[repo]").strip()}],
            "elapsedSeconds": time.perf_counter() - started,
        }
        save_report(report, args.output)
        return 1
    actual = json.loads(completed.stdout)
    comparison_summary = verify_comparisons(fixtures["comparisons"], actual["comparisons"])
    landscape_summary = verify_landscapes(fixtures["landscapes"], actual["landscapes"])
    for outcome in actual["rejects"]:
        check(not outcome["ok"], outcome["name"] + "/rejected", actual=outcome.get("result"))
    interaction = next(c for c in fixtures["comparisons"] if c["name"] == "edits/all_six_interactions")
    interaction_result = interaction_diagnostic(interaction)
    after = source_hashes()
    expected_js_hashes = {path: before[path] for path in ("public/lib/thesis.js", "public/lib/model.js")}
    source_binding = {
        "pythonFilesUnchangedDuringVerification": before == after,
        "nodeLoadedExpectedSources": actual["sourceHashes"] == expected_js_hashes,
        "nodeFilesUnchangedDuringVerification": actual["sourceHashes"] == actual["sourceHashesAfter"],
        "pythonReferenceMatchesLoadedSource": REFERENCE_LOADED_HASH == before["scripts/reference_model.py"],
    }
    for key, matched in source_binding.items():
        check(matched, "sourceBinding/" + key)
    counts = {
        "presetOrderedPairs": sum(not c["name"].startswith(("edits/", "extreme/")) for c in fixtures["comparisons"]),
        "editedPairs": sum(c["name"].startswith("edits/") for c in fixtures["comparisons"]),
        "overflowHybridPairs": sum(c["expectation"] == "unavailable" for c in fixtures["comparisons"]),
        "landscapes": len(fixtures["landscapes"]),
        "rejectedInputs": len(fixtures["rejects"]),
    }
    expected_counts = {"presetOrderedPairs": 18, "editedPairs": 10, "overflowHybridPairs": 2,
                       "landscapes": 22, "rejectedInputs": 5}
    check(counts == expected_counts, "coverage/fixtureCounts", actual=counts, expected=expected_counts)
    for key, expected in (("permutations", 20160), ("marginalSteps", 120960),
                          ("directGridCells", 390), ("frontierEntries", 80)):
        check(metrics[key] == expected, "coverage/" + key, actual=metrics[key], expected=expected)
    report = {
        "status": "pass" if not failures else "fail", "version": actual["version"],
        "testedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runtime": {"python": sys.version.split()[0], "node": actual["nodeVersion"]},
        "command": "python scripts/check_thesis_reference.py",
        "sourceHashes": before, "sourceBinding": source_binding,
        "fixtureSha256": hashlib.sha256(fixture_json.encode("utf-8")).hexdigest(),
        "fixtureGeneration": "Deterministic build_fixtures() in scripts/check_thesis_reference.py",
        "source": "scripts/reference_model.py + full permutation enumeration + affine tax-segment roots",
        "tolerances": {"evAbsoluteUSD_B": ABS_TOL, "evRelative": REL_TOL,
                       "marginAbsolute": MARGIN_TOL, "frontierTargetAbsoluteUSD_B": 1e-6,
                       "frontierTargetRelative": 2e-9},
        "counts": counts, "metrics": metrics, "interactionFixture": interaction_result,
        "comparisonSummary": comparison_summary, "landscapeSummary": landscape_summary,
        "failures": failures, "elapsedSeconds": time.perf_counter() - started,
    }
    save_report(report, args.output)
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
