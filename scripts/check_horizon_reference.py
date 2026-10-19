#!/usr/bin/env python3
"""Independently check Value Horizon with annual summation and linear search.

Uses Python's separate FCFF reference for the retained explicit forecast and
first terminal cash flow. Continuation cash flows are discounted individually;
requirements are found by walking whole years, independently of the production
closed-form annuity and binary search. Separate 100-digit Decimal fixtures
check exact binary input boundaries and the conservative precision policy.
No third-party packages are required.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import shutil
import subprocess
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from pathlib import Path

from reference_model import project

ROOT = Path(__file__).resolve().parents[1]
ABS_TOL = 1e-8
REL_TOL = 1e-10
MAX_YEARS = 10000
FIXTURE = dict(rev2026=100, g1=.04, g2=.04, g3=.04, m27=.2, m30=.2,
               m36=.2, turns=2.5, wacc=.1, tg=.03, roic=.2, stub=-3, tax=.25)


def scenarios():
    presets = json.loads((ROOT / "data/presets.json").read_text())
    cases = [(f"{company} {name}", inputs) for company, values in presets.items()
             for name, inputs in values.items()]
    cases += [
        ("Hand fixture", FIXTURE),
        ("Zero growth", {**FIXTURE, "g1": 0, "g2": 0, "g3": 0, "tg": 0}),
        ("Untaxed positive stub", {**FIXTURE, "tax": 0, "stub": 20}),
        ("Negative explicit and total EV", {**FIXTURE, "stub": -1000}),
        ("Fast discount decay", {**FIXTURE, "wacc": .6, "tg": 0}),
        ("Requirement outside chart", {**FIXTURE, "wacc": .031}),
        ("Requirement beyond solver", {**FIXTURE, "wacc": .030001}),
        ("Adjacent WACC and growth", {**FIXTURE, "wacc": math.nextafter(.03, math.inf)}),
        ("Numerically zero terminal PV", {**FIXTURE, "rev2026": 5e-324,
          "g1": 0, "g2": 0, "g3": 0, "tg": 0, "m27": 5e-324,
          "m30": 5e-324, "m36": 5e-324, "stub": 0}),
    ]
    rng = random.Random(340019)
    for n in range(24):
        g = rng.uniform(0, .05)
        cases.append((f"Seeded valid case {n + 1:02}", dict(
            rev2026=rng.uniform(.1, 150), g1=rng.uniform(0, 1),
            g2=rng.uniform(0, .45), g3=rng.uniform(g, .25),
            m27=rng.uniform(-.5, .3), m30=rng.uniform(-.1, .4),
            m36=rng.uniform(.03, .5), turns=rng.uniform(.5, 10),
            wacc=rng.uniform(max(g + .01, .07), .35), tg=g,
            roic=rng.uniform(max(g + .01, .08), .4),
            stub=rng.uniform(-80, 20), tax=rng.uniform(0, .35))))
    return cases


def annual_reference(inputs):
    baseline = project(inputs)
    ratio = (1 + inputs["tg"]) / (1 + inputs["wacc"])
    flow = (baseline["terminal_fcf"] / (1 + inputs["wacc"])
            * baseline["rows"][-1]["df"])
    total = correction = 0.0
    points = []
    remaining_fraction = 1.0
    # Compensated summation accumulates each discounted annual contribution.
    for n in range(MAX_YEARS + 1):
        tail = flow * (1 + inputs["wacc"]) / (inputs["wacc"] - inputs["tg"])
        points.append(dict(years=n, throughYear=2036 + n,
                           retainedTerminalPv=total, excludedTerminalPv=tail,
                           ev=baseline["pv_explicit"] + total,
                           remainingTerminalFraction=remaining_fraction))
        addend = flow - correction
        next_total = total + addend
        correction = (next_total - total) - addend
        total = next_total
        flow *= ratio
        remaining_fraction *= ratio
    return baseline, points


def target_reference(baseline, points, target):
    if target is None:
        return None
    if target <= baseline["pv_explicit"]:
        return "explicit", 0
    if baseline["pvtv"] <= 0 or target > baseline["ev"]:
        return "unreachable", None
    if target == baseline["ev"]:
        return "asymptotic", None
    for point in points:
        if point["ev"] >= target:
            return "finite", point["years"]
    return "beyond_range", None


def precision_cases():
    """Regression inputs are independent of the production guard calculation."""
    presets = json.loads((ROOT / "data/presets.json").read_text())
    return [
        dict(label="Near-perpetuity Anthropic target", assumptions=presets["Anthropic"]["Base"],
             years=10, target=367.77129479956005,
             checks=[dict(kind="target", expectedYear=414)]),
        dict(label="Near-perpetuity visible-chart target", assumptions={**FIXTURE, "wacc": .6, "tg": 0},
             years=10, target=19.999341593234046,
             checks=[dict(kind="target", expectedYear=69)]),
        dict(label="Rounded 75-percent capture", assumptions={**FIXTURE, "wacc": .5874010519681995, "tg": 0},
             years=10, target=None,
             checks=[dict(kind="capture", fraction=.75, expectedYear=4)]),
        dict(label="Just beyond the search cap", assumptions={**FIXTURE, "wacc": .00006931712037656917, "tg": 0},
             years=100, target=None, targetMode="half_terminal",
             checks=[dict(kind="target"), dict(kind="capture", fraction=.5, expectedYear=10001)]),
        dict(label="Just within the search cap", assumptions={**FIXTURE, "wacc": .0000693171203765692, "tg": 0},
             years=100, target=None, targetMode="half_terminal",
             checks=[dict(kind="target"), dict(kind="capture", fraction=.5, expectedYear=10000)]),
        dict(label="Target copied from a rounded curve point", assumptions=FIXTURE,
             years=10, target=None, targetMode="selected_ev",
             checks=[dict(kind="target")]),
    ]


def decimal_boundary(inputs, baseline, target=None, fraction=None):
    """Isolate horizon arithmetic using the returned, frozen E/T components.

    Decimal.from_float retains the exact binary values; Decimal(str(...))
    would silently change the question at these very small boundaries.
    Each year's remaining fraction is obtained by another multiplication,
    without the production logarithm, exponential or binary-search path.
    """
    with localcontext() as context:
        context.prec = 100
        exact = lambda value: Decimal.from_float(float(value))
        one = Decimal(1)
        ratio = (one + exact(inputs["tg"])) / (one + exact(inputs["wacc"]))
        explicit, terminal = exact(baseline["pv_explicit"]), exact(baseline["pvtv"])
        threshold = exact(fraction if fraction is not None else target)
        remaining, previous = one, None
        for n in range(MAX_YEARS + 2):
            retained = one - remaining
            value = retained if fraction is not None else explicit + terminal * retained
            residual = value - threshold
            if residual >= 0:
                return dict(firstWholeYear=n,
                            previousResidual=None if previous is None else format(previous, ".30E"),
                            firstResidual=format(residual, ".30E"))
            previous = residual
            remaining *= ratio
    return dict(firstWholeYear=None, previousResidual=format(previous, ".30E"), firstResidual=None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        help="Write the complete verification receipt here.")
    args = parser.parse_args()
    cases = scenarios()
    reference = {}
    requests = []
    for label, inputs in cases:
        baseline, points = annual_reference(inputs)
        reference[label] = (baseline, points)
        targets = [None, 250]
        if baseline["pv_explicit"] > 0:
            targets.append(min(1e12, baseline["pv_explicit"] * .5))
        if baseline["ev"] > max(0, baseline["pv_explicit"]):
            targets.append(min(1e12, (max(0, baseline["pv_explicit"]) + baseline["ev"]) / 2))
        midpoint = (points[10]["ev"] + points[11]["ev"]) / 2
        if 0 < midpoint < baseline["ev"] and midpoint <= 1e12:
            targets.append(midpoint)
        for index, target in enumerate(dict.fromkeys(targets)):
            requests.append(dict(label=label, assumptions=inputs,
                                 years=[0, 1, 10, 100][index % 4], target=target))
    boundaries = precision_cases()
    all_requests = requests + boundaries
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node:
        raise SystemExit("Node.js 24 is required to compare production outputs.")
    program = """import {readFileSync} from 'node:fs';
import {valueHorizon} from './public/lib/horizon.js';
const requests=JSON.parse(readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(requests.map(item=>{
  const first=valueHorizon(item.assumptions,{years:item.years,target:item.target});
  if(!item.targetMode)return first;
  const target=item.targetMode==='half_terminal'?first.baseline.pv_explicit+first.baseline.pvtv*.5:first.selected.ev;
  return valueHorizon(item.assumptions,{years:item.years,target});
})));
"""
    process = subprocess.run([node, "--input-type=module", "-e", program],
                             input=json.dumps(all_requests, allow_nan=False),
                             text=True, capture_output=True, cwd=ROOT,
                             check=True, timeout=60)
    all_results = json.loads(process.stdout)
    results, boundary_results = all_results[:len(requests)], all_results[len(requests):]
    failures = []
    numeric_checks = 0
    max_relative_error = 0.0
    max_absolute_error = 0.0
    max_absolute_error_case = None
    curve_points = capture_checks = target_checks = 0

    def same_number(actual, expected, label):
        nonlocal numeric_checks, max_relative_error, max_absolute_error, max_absolute_error_case
        numeric_checks += 1
        if not isinstance(actual, (int, float)) or not math.isfinite(actual):
            failures.append(f"{label}: nonfinite or nonnumeric production value")
            return
        difference = abs(actual - expected)
        if difference > max_absolute_error:
            max_absolute_error = difference
            max_absolute_error_case = dict(label=label, actual=actual, expected=expected)
        max_relative_error = max(max_relative_error, difference / max(abs(expected), 1))
        if difference > ABS_TOL + REL_TOL * abs(expected):
            failures.append(f"{label}: {actual!r} differs from {expected!r}")

    seen_curves = set()
    for request, result in zip(requests, results, strict=True):
        label = request["label"]
        baseline, points = reference[label]
        if label not in seen_curves:
            seen_curves.add(label)
            for key in ("pv_explicit", "pvtv", "terminal_fcf", "ev"):
                same_number(result["baseline"][key], baseline[key], f"{label}.baseline.{key}")
            if len(result["curve"]) != 101:
                failures.append(f"{label}: expected 101 chart points")
            for n, point in enumerate(result["curve"]):
                curve_points += 1
                if point["years"] != n or point["throughYear"] != 2036 + n:
                    failures.append(f"{label}: incorrect period {n}")
                for key in ("retainedTerminalPv", "excludedTerminalPv", "ev"):
                    same_number(point[key], points[n][key], f"{label}.curve[{n}].{key}")
                if baseline["pvtv"] > 0:
                    same_number(point["remainingTerminalFraction"], points[n]["remainingTerminalFraction"], f"{label}.curve[{n}].remainingTerminalFraction")
                    same_number(point["terminalPvFraction"], points[n]["retainedTerminalPv"] / baseline["pvtv"], f"{label}.curve[{n}].terminalPvFraction")
                elif point["terminalPvFraction"] is not None or point["remainingTerminalFraction"] is not None:
                    failures.append(f"{label}: undefined zero-PV fractions were not null")
            for capture in result["capture"]:
                capture_checks += 1
                if baseline["pvtv"] <= 0:
                    expected_status, expected_year = "unavailable", None
                else:
                    expected_year = next((p["years"] for p in points if p["remainingTerminalFraction"] <= 1 - capture["fraction"]), None)
                    expected_status = "finite" if expected_year is not None else "beyond_range"
                if (capture["status"], capture["years"]) != (expected_status, expected_year):
                    failures.append(f"{label}: capture requirement {capture['fraction']} differs")
        same_number(result["selected"]["ev"], points[request["years"]]["ev"], f"{label}.selected.ev")
        expected = target_reference(baseline, points, request["target"])
        actual = result["targetRequirement"]
        target_checks += 1
        if expected is None:
            if actual is not None:
                failures.append(f"{label}: absent target acquired a requirement")
        elif actual is None or (actual["status"], actual["years"]) != expected:
            failures.append(f"{label}: target {request['target']} requirement differs: {actual} vs {expected}")
        elif expected[1] is not None:
            n = expected[1]
            same_number(actual["ev"], points[n]["ev"], f"{label}.target.ev")
            if n > 0:
                same_number(actual["previousEv"], points[n - 1]["ev"], f"{label}.target.previousEv")
                if not actual["previousEv"] < request["target"] <= actual["ev"]:
                    failures.append(f"{label}: production target boundary does not bracket target")
    boundary_evidence = []
    for request, result in zip(boundaries, boundary_results, strict=True):
        for check in request["checks"]:
            is_capture = check["kind"] == "capture"
            actual = (next(c for c in result["capture"] if c["fraction"] == check["fraction"])
                      if is_capture else result["targetRequirement"])
            oracle = decimal_boundary(request["assumptions"], result["baseline"],
                                      target=result["target"], fraction=check.get("fraction"))
            if actual["status"] != "precision_limit" or actual["years"] is not None or actual["throughYear"] is not None:
                failures.append(f"{request['label']}.{check['kind']}: a precision-limited boundary asserted a year or another classification")
            if not is_capture and any(actual[k] is not None for k in ("ev", "previousEv", "withinChart")):
                failures.append(f"{request['label']}: unavailable target fields must be null")
            if "expectedYear" in check and oracle["firstWholeYear"] != check["expectedYear"]:
                failures.append(f"{request['label']}: the independent Decimal regression changed: {oracle}")
            if oracle["firstWholeYear"] is None:
                failures.append(f"{request['label']}: no independent boundary found by year 10,001")
            boundary_evidence.append(dict(label=request["label"], kind=check["kind"],
                                          target=None if is_capture else result["target"],
                                          fraction=check.get("fraction"),
                                          reportedStatus=actual["status"], **oracle))
    paths = ["public/lib/model.js", "public/lib/horizon.js", "data/presets.json",
             "scripts/reference_model.py", "scripts/check_horizon_reference.py"]
    receipt = dict(schema=1, status="passed" if not failures else "failed",
                   generatedAt=datetime.now(timezone.utc).isoformat(),
                   method="Separate Python FCFF calculation; compensated term-by-term continuation sum; linear whole-year search; 100-digit Decimal.from_float precision-boundary recurrence.",
                   scenarioCount=len(cases), requestCount=len(all_requests), ordinaryRequestCount=len(requests),
                   curvePointCount=curve_points, numericComparisons=numeric_checks,
                   captureRequirements=capture_checks, targetRequirements=target_checks,
                   absoluteTolerance=ABS_TOL, relativeTolerance=REL_TOL,
                   maxAbsoluteError=max_absolute_error,
                   maxAbsoluteErrorCase=max_absolute_error_case,
                   maxRelativeErrorNormalizedByAtLeastOne=max_relative_error,
                   precisionBoundaryScenarios=len(boundaries), precisionBoundaryChecks=len(boundary_evidence),
                   precisionBoundaryMethod="100-digit arithmetic on exact binary input rates and the returned frozen explicit/terminal PV components; repeated annual multiplication. This isolates the horizon boundary from financial-engine rounding and independently verifies regression years. precision_limit is a conservative output policy, not an assertion that no exact-real-number solution exists.",
                   precisionBoundaryEvidence=boundary_evidence,
                   scope="All six presets, nine named arithmetic/boundary cases, 24 seeded valid cases and six additional Decimal precision fixtures. No source data, financial forecasts or probabilities are independently validated by this check.",
                   sourceHashes={path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths},
                   failures=failures)
    serialized = json.dumps(receipt, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized)
    print(serialized, end="")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
