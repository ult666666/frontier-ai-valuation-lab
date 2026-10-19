#!/usr/bin/env python3
"""Independently check a fixed-quote ownership frontier using a share ledger.

The reference starts with 100 existing shares. It derives the largest number of
new shares consistent with the requested retention floor, then prices those
shares under a fixed pre-money or post-money quotation. Python's Decimal
arithmetic is independent of the production JavaScript ownership calculation.
Dollar amounts are USD billions and ownership inputs are fractions.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import shutil
import subprocess
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REL_TOL = 3e-12
FRACTION_ABS_TOL = 5e-16


def cases():
    presets = json.loads((ROOT / "data/presets.json").read_text())
    base = presets["Anthropic"]["Base"]
    ordinary = dict(basis="pre", quote=250, primaryCapital=25, holderStake=.1)
    bridge = dict(cash=20, debt=5, otherClaims=0)

    def case(label, assumptions=None, supplied_bridge=bridge, floor=.9, **changes):
        return dict(label=label, assumptions=copy.deepcopy(assumptions or base),
                    bridge=copy.deepcopy(supplied_bridge), round={**ordinary, **changes},
                    ownership=dict(retentionFloor=floor))

    valid = [case(f"{company} {scenario}", assumptions, basis="pre" if company == "Anthropic" else "post")
             for company, scenarios in presets.items() for scenario, assumptions in scenarios.items()]
    valid += [
        case("Fixed post-money hand case", basis="post"),
        case("Fixed pre-money 80 percent hand case", floor=.8, primaryCapital=62.5),
        case("Fixed post-money 80 percent hand case", basis="post", floor=.8, primaryCapital=50),
        case("No bridge is needed for retention", supplied_bridge=None),
        case("A different model bridge leaves the frontier unchanged", supplied_bridge=dict(cash=0, debt=10000, otherClaims=10000)),
        case("No tracked holder", holderStake=0),
        case("All existing equity is tracked", holderStake=1),
        case("Zero issuance at 100 percent floor", floor=1, primaryCapital=0),
        case("Positive issuance breaches 100 percent floor", floor=1, primaryCapital=1e-10),
        case("Rounded retention of one cannot hide dilution", floor=1, quote=1e12, primaryCapital=.000001),
        case("Minimum supported floor", floor=.01),
        case("Economic ceiling exceeds capital input limit", quote=1e12, floor=.01, primaryCapital=1e12),
        case("Post-money quotation at input limit", basis="post", quote=1e12, floor=.01, primaryCapital=9e11),
        case("An entered round exceeds the selected floor", primaryCapital=100, floor=.9),
        case("Fractional quote, capital, holder and floor", quote=123.45678912345, primaryCapital=17.987654321,
             holderStake=.1234567891234567, floor=.8123456789123456),
        case("Small representable positive financing", quote=1e-200, primaryCapital=1e-202),
        case("Economic ceiling below number resolution", quote=5e-324, primaryCapital=0),
        case("Positive ceiling cannot resolve the chosen floor", quote=5e-324, primaryCapital=0, floor=.6),
        case("Tracked floor below number resolution", holderStake=5e-324, primaryCapital=0, floor=.01),
    ]
    invalid = []

    def bad(label, value, group="ownership", key="retentionFloor"):
        item = case(label)
        if group is None:
            item[key] = value
        else:
            item[group][key] = value
        invalid.append(item)

    for label, value in [
        ("Floor below zero", -.01), ("Zero retention floor", 0),
        ("Floor below the supported minimum", math.nextafter(.01, -math.inf)),
        ("Floor above one", math.nextafter(1, math.inf)),
        ("Percent supplied instead of a fraction", 90),
        ("Text retention floor", "0.9"), ("Boolean retention floor", True),
        ("Null retention floor", None), ("Array retention floor", [.9]),
    ]:
        bad(label, value)
    for label, value in [("Null ownership options", None), ("Array ownership options", []),
                         ("Text ownership options", "0.9"), ("Empty ownership options", {})]:
        bad(label, value, group=None, key="ownership")
    bad("Unsupported ownership field", True, key="secondarySale")
    for label, key, value in [
        ("Negative primary capital", "primaryCapital", -1),
        ("Primary capital exceeds support cap", "primaryCapital", 1e12 + 1),
        ("Zero quotation", "quote", 0),
        ("Quotation exceeds support cap", "quote", 1e12 + 1),
        ("Unsupported quotation basis", "basis", "enterprise"),
        ("Holder fraction exceeds one", "holderStake", 1.01),
    ]:
        bad(label, value, group="round", key=key)
    invalid += [case("Post-money quote equals proceeds", basis="post", quote=25),
                case("Post-money subtraction exceeds supported precision", basis="post", quote=1e12,
                     primaryCapital=math.nextafter(1e12, -math.inf)),
                case("Positive incoming fraction underflows", primaryCapital=5e-324)]
    return valid, invalid


def exact(value):
    """Preserve the actual IEEE-754 inputs received by the JavaScript module."""
    return Decimal.from_float(float(value))


def share_ledger(terms, primary_capital):
    """Return ownership after issuing shares at the declared fixed quotation."""
    with localcontext() as context:
        context.prec = 100
        quote, capital = exact(terms["quote"]), exact(primary_capital)
        existing = Decimal(100)
        pre_value = quote if terms["basis"] == "pre" else quote - capital
        issue_price = pre_value / existing
        issued = capital / issue_price
        total = existing + issued
        holder = existing * exact(terms["holderStake"])
        return dict(retainedOwnership=existing / total, newOwnership=issued / total,
                    holderAfter=holder / total)


def economic_ceiling(terms, retention_floor):
    """Price the maximum new-share count; do not import the production inverse."""
    with localcontext() as context:
        context.prec = 100
        existing = Decimal(100)
        total_at_floor = existing / exact(retention_floor)
        new_at_floor = total_at_floor - existing
        quote = exact(terms["quote"])
        issue_price = quote / (existing if terms["basis"] == "pre" else total_at_floor)
        return new_at_floor * issue_price


def current_status(terms, retention_floor):
    if retention_floor == 1:
        return "at-floor" if terms["primaryCapital"] == 0 else "below-floor"
    retained = float(share_ledger(terms, terms["primaryCapital"])["retainedOwnership"])
    # This comparison band is the declared application boundary convention. It
    # does not turn the 100-percent limit into a tolerance on positive issuance.
    comparison_band = 32 * math.ulp(1.0) * max(retained, retention_floor)
    if abs(retained - retention_floor) <= comparison_band:
        return "at-floor"
    return "above-floor" if retained > retention_floor else "below-floor"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write a source-bound verification receipt.")
    args = parser.parse_args()
    valid, invalid = cases()
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node:
        raise SystemExit("Node.js 24 is required to evaluate the production module.")
    program = """import {readFileSync} from 'node:fs';
import {financingLens} from './public/lib/financing.js';
import * as module from './public/lib/ownership.js';
const requests=JSON.parse(readFileSync(0,'utf8'));
const results=requests.map(({assumptions,bridge,round,ownership})=>{
  const before=JSON.stringify({assumptions,bridge,round,ownership});
  try {
    const result=module.financingAnalysis(assumptions,{bridge,round,ownership});
    const old=module.financingAnalysis(assumptions,{bridge,round});
    const oldCore=financingLens(assumptions,{bridge,round});
    const {ownership:added,...withoutOwnership}=result;
    return {ok:true,result,legacyExact:JSON.stringify(old)===JSON.stringify(oldCore),
      baseExact:JSON.stringify(withoutOwnership)===JSON.stringify(oldCore),
      inputsUnchanged:before===JSON.stringify({assumptions,bridge,round,ownership})};
  }catch(error){return {ok:false,error:String(error.message)};}
});
const base=requests[0];const option=()=>({bridge:base.bridge,round:base.round,ownership:{retentionFloor:.9}});
const probes=[];let getterReads=0;
const probe=(label,make)=>{try{module.financingAnalysis(base.assumptions,make());probes.push({label,rejected:false});}
catch(error){probes.push({label,rejected:true,message:String(error.message)});}};
probe('NaN floor',()=>({...option(),ownership:{retentionFloor:NaN}}));
probe('Infinite floor',()=>({...option(),ownership:{retentionFloor:Infinity}}));
probe('Negative infinite floor',()=>({...option(),ownership:{retentionFloor:-Infinity}}));
probe('Inherited ownership field',()=>({...option(),ownership:Object.create({retentionFloor:.9})}));
probe('Non-enumerable ownership field',()=>({...option(),ownership:Object.defineProperty({},'retentionFloor',{value:.9})}));
probe('Getter ownership field',()=>({...option(),ownership:{get retentionFloor(){getterReads++;return .9;}}}));
probe('Symbol ownership field',()=>({...option(),ownership:{retentionFloor:.9,[Symbol('extra')]:1}}));
probe('Unknown analysis option',()=>({...option(),futureCapital:1}));
process.stdout.write(JSON.stringify({version:module.OWNERSHIP_VERSION,results,probes,getterReads}));
"""
    process = subprocess.run([node, "--input-type=module", "-e", program],
                             input=json.dumps(valid + invalid, allow_nan=False),
                             text=True, capture_output=True, cwd=ROOT, timeout=30)
    if process.returncode:
        raise SystemExit(process.stderr or "The production module could not be evaluated.")
    payload = json.loads(process.stdout)
    failures, evidence = [], []
    numeric_checks = structural_checks = 0
    max_relative_error = max_absolute_error = 0.0
    max_absolute_error_field = None
    field_paths = set()

    def require(condition, message):
        nonlocal structural_checks
        structural_checks += 1
        if not condition:
            failures.append(message)

    def compare(actual, expected, path, fraction=False):
        nonlocal numeric_checks, max_relative_error, max_absolute_error, max_absolute_error_field
        numeric_checks += 1
        field_paths.add(path.split(".", 1)[1])
        if type(actual) not in (float, int) or not math.isfinite(actual):
            failures.append(f"{path}: expected a finite number, received {actual!r}")
            return
        expected = float(expected)
        error = abs(actual - expected)
        if error > max_absolute_error:
            max_absolute_error, max_absolute_error_field = error, path
        relative = error / abs(expected) if expected else error
        max_relative_error = max(max_relative_error, relative)
        tolerance = max(8 * math.ulp(expected), REL_TOL * abs(expected))
        if fraction:
            tolerance = max(tolerance, FRACTION_ABS_TOL)
        if expected > 0 and actual <= 0:
            failures.append(f"{path}: a positive reference value disappeared")
        if expected == 0 and actual != 0:
            failures.append(f"{path}: an exact zero became {actual!r}")
        elif error > tolerance:
            failures.append(f"{path}: {actual!r} differs from share-ledger reference {expected!r}")

    def shape(value, keys, path):
        require(isinstance(value, dict) and set(value) == set(keys),
                f"{path}: returned fields differ from the declared complete contract")
        return isinstance(value, dict) and set(value) == set(keys)

    def finite_tree(value, path):
        if type(value) in (int, float):
            require(math.isfinite(value), f"{path}: nonfinite numeric output")
        elif isinstance(value, dict):
            for key, member in value.items():
                finite_tree(member, f"{path}.{key}")
        elif isinstance(value, list):
            for index, member in enumerate(value):
                finite_tree(member, f"{path}[{index}]")

    require(payload.get("version") == "1.0.0", "Unexpected ownership calculation version")
    require(len(payload["results"]) == len(valid) + len(invalid), "Incomplete production result batch")
    by_label = {}
    for item, actual in zip(valid, payload["results"][:len(valid)], strict=True):
        label, terms, floor = item["label"], item["round"], item["ownership"]["retentionFloor"]
        require(actual["ok"], f"{label}: valid analysis rejected: {actual.get('error')}")
        if not actual["ok"]:
            continue
        require(actual["legacyExact"], f"{label}: ownership-absent legacy result changed")
        require(actual["baseExact"], f"{label}: adding ownership changed a pre-existing financing result")
        require(actual["inputsUnchanged"], f"{label}: caller inputs were mutated")
        output = actual["result"]["ownership"]
        by_label[label] = output
        if not shape(output, ["version", "constraint", "current", "ceiling", "graph", "method", "warnings"], label):
            continue
        require(output["version"] == "1.0.0", f"{label}: result version differs")
        finite_tree(output, label)
        shape(output["constraint"], ["retentionFloor"], f"{label}.constraint")
        compare(output["constraint"]["retentionFloor"], floor, f"{label}.constraint.retentionFloor", True)
        current = output["current"]
        if not shape(current, ["primaryCapital", "retainedFraction", "holderFloor", "holderAfter", "status", "capitalHeadroom", "capitalExcess"], f"{label}.current"):
            continue
        ledger = share_ledger(terms, terms["primaryCapital"])
        compare(current["primaryCapital"], terms["primaryCapital"], f"{label}.current.primaryCapital")
        compare(current["retainedFraction"], ledger["retainedOwnership"], f"{label}.current.retainedFraction", True)
        holder_floor = exact(terms["holderStake"]) * exact(floor)
        if holder_floor > 0 and float(holder_floor) == 0:
            require(current["holderFloor"] is None and bool(output["warnings"]),
                    f"{label}: an unrepresentable positive holder floor must remain unavailable and explained")
        else:
            compare(current["holderFloor"], holder_floor, f"{label}.current.holderFloor", True)
        compare(current["holderAfter"], ledger["holderAfter"], f"{label}.current.holderAfter", True)
        status = current_status(terms, floor)
        require(current["status"] == status, f"{label}: {current['status']} differs from the declared comparison-band status {status}")
        ceiling = output["ceiling"]
        if not shape(ceiling, ["analyticalCapital", "supportedCapital", "status"], f"{label}.ceiling"):
            continue
        theoretical = economic_ceiling(terms, floor)
        representable = float(theoretical) != 0 or floor == 1
        resolves_floor = representable
        if representable and floor != 1:
            if terms["basis"] == "post" and float(theoretical) >= terms["quote"]:
                resolves_floor = False
            else:
                boundary_retained = float(share_ledger(terms, float(theoretical))["retainedOwnership"])
                resolves_floor = abs(boundary_retained - floor) <= 32 * math.ulp(1.0) * max(boundary_retained, floor)
        if not representable or not resolves_floor:
            expected_status = "below-resolution" if not representable else "unresolved"
            require(ceiling["status"] == expected_status, f"{label}: an unresolved ceiling needs a {expected_status} status")
            require(ceiling["analyticalCapital"] is None and ceiling["supportedCapital"] is None,
                    f"{label}: an unresolved economic ceiling must not be represented as zero")
            require(current["capitalHeadroom"] is None and current["capitalExcess"] is None,
                    f"{label}: unresolved capital distances should not imply a number")
        else:
            expected_status = "input-cap-limited" if theoretical > Decimal("1e12") else "resolved"
            require(ceiling["status"] == expected_status,
                    f"{label}: ceiling status {ceiling['status']} differs from {expected_status}")
            compare(ceiling["analyticalCapital"], theoretical, f"{label}.ceiling.analyticalCapital")
            compare(ceiling["supportedCapital"], min(theoretical, Decimal("1e12")), f"{label}.ceiling.supportedCapital")
            gap = theoretical - exact(terms["primaryCapital"])
            expected_headroom = max(Decimal(0), gap) if status != "at-floor" else Decimal(0)
            expected_excess = max(Decimal(0), -gap) if status != "at-floor" else Decimal(0)
            compare(current["capitalHeadroom"], expected_headroom, f"{label}.current.capitalHeadroom")
            compare(current["capitalExcess"], expected_excess, f"{label}.current.capitalExcess")
        graph = output["graph"]
        if not shape(graph, ["status", "capitalMax", "points", "ceilingInDomain", "currentInDomain"], f"{label}.graph"):
            continue
        require(graph["status"] in ("ready", "unavailable"), f"{label}: unsupported graph status")
        require(isinstance(graph["points"], list), f"{label}: graph points must be a list")
        if graph["status"] == "ready":
            points = graph["points"]
            require(49 <= len(points) <= 51, f"{label}: graph sampling is incomplete or exceeds its stated bound")
            require(0 < graph["capitalMax"] <= 1e12, f"{label}: chart domain exceeds supported primary capital")
            require(points[0]["primaryCapital"] == 0, f"{label}: graph must include zero primary capital")
            require(points[-1]["primaryCapital"] == graph["capitalMax"], f"{label}: chart endpoint differs from its domain")
            previous = None
            for index, point in enumerate(points):
                path = f"{label}.graph.points[{index}]"
                if not shape(point, ["primaryCapital", "retainedFraction", "holderAfter"], path):
                    continue
                x = point["primaryCapital"]
                require(0 <= x <= graph["capitalMax"], f"{path}: capital lies outside the graph domain")
                if terms["basis"] == "post":
                    require(x < terms["quote"], f"{path}: a fixed post-money curve crossed zero pre-money equity")
                expected = share_ledger(terms, x)
                compare(point["retainedFraction"], expected["retainedOwnership"], f"{path}.retainedFraction", True)
                compare(point["holderAfter"], expected["holderAfter"], f"{path}.holderAfter", True)
                if previous is not None:
                    require(x > previous["primaryCapital"], f"{path}: duplicate or unsorted capital points")
                    require(point["retainedFraction"] <= previous["retainedFraction"], f"{path}: retained ownership increases with dilution")
                    require(point["holderAfter"] <= previous["holderAfter"], f"{path}: tracked ownership increases with dilution")
                previous = point
            in_domain = terms["primaryCapital"] <= graph["capitalMax"]
            require(graph["currentInDomain"] is in_domain, f"{label}: current-point domain flag differs")
            if in_domain:
                require(any(point["primaryCapital"] == terms["primaryCapital"] for point in points),
                        f"{label}: exact current capital is missing from the graph")
            ceiling_in_domain = ceiling["analyticalCapital"] is not None and ceiling["analyticalCapital"] <= graph["capitalMax"]
            require(graph["ceilingInDomain"] is ceiling_in_domain, f"{label}: economic-ceiling domain flag differs")
            if ceiling_in_domain:
                require(any(point["primaryCapital"] == ceiling["analyticalCapital"] for point in points),
                        f"{label}: exact economic ceiling is missing from the graph")
        else:
            require(graph["points"] == [], f"{label}: an unavailable graph retained old numerical points")
            require(graph["ceilingInDomain"] is False and graph["currentInDomain"] is False,
                    f"{label}: an unavailable graph cannot claim included points")
        expected_method = dict(basis="fixed-quote-primary-round", fixedQuoteBasis=terms["basis"],
                               retentionScope="fraction-of-starting-stakes", existingHoldersSubscribe=False,
                               retentionFloorMin=.01, retentionFloorMax=1,
                               comparisonBand=32 * math.ulp(1.0), capitalInputLimit=1e12, sampleIntervals=48)
        require(output["method"] == expected_method, f"{label}: declared numerical method metadata differs")
        require(isinstance(output["warnings"], list) and all(isinstance(message, str) for message in output["warnings"]),
                f"{label}: warning contract differs")
        evidence.append(dict(label=label, basis=terms["basis"], retentionFloor=floor,
                             referenceEconomicCeiling=str(theoretical), status=current["status"],
                             ceilingStatus=ceiling["status"], graphStatus=graph["status"],
                             graphPoints=len(graph["points"]), legacyExact=actual["legacyExact"],
                             inputsUnchanged=actual["inputsUnchanged"]))

    # These relational checks concern economics, not chart implementation.
    standard = by_label.get("Anthropic Base")
    if standard:
        for label in ["No bridge is needed for retention", "A different model bridge leaves the frontier unchanged"]:
            output = by_label.get(label)
            require(output == standard, f"{label}: financing cash/claims changed the ownership frontier")
        for label in ["No tracked holder", "All existing equity is tracked"]:
            output = by_label.get(label)
            require(output is not None and output["ceiling"] == standard["ceiling"],
                    f"{label}: a tracked holder changed the capital ceiling for all existing equity")
    rejection_evidence = []
    for item, actual in zip(invalid, payload["results"][len(valid):], strict=True):
        require(not actual["ok"], f"{item['label']}: invalid analysis was accepted")
        rejection_evidence.append(dict(label=item["label"], rejected=not actual["ok"], message=actual.get("error")))
    for probe in payload["probes"]:
        require(probe["rejected"], f"{probe['label']}: invalid JavaScript-only input was accepted")
    require(payload["getterReads"] == 0, "Validation invoked an accessor instead of rejecting it as data")
    paths = ["public/lib/model.js", "public/lib/financing.js", "public/lib/ownership.js", "data/presets.json",
             "scripts/check_ownership_reference.py"]
    receipt = dict(schema=1, status="passed" if not failures else "failed",
                   generatedAt=datetime.now(timezone.utc).isoformat(), ownershipVersion=payload.get("version"),
                   method="Independent 100-digit Decimal.from_float share issuance ledger starting with 100 existing shares; inverse ceiling derived by pricing the maximum new share count at the requested floor.",
                   comparisonPolicy="At-floor uses 32 IEEE-754 epsilon times max(retained fraction, floor); a 100% floor permits exactly zero primary capital, so any positive issuance breaches it even when retained ownership rounds to one.",
                   validScenarios=len(valid), invalidScenarios=len(invalid), javascriptOnlyRejections=len(payload["probes"]),
                   numericComparisons=numeric_checks, structuralComparisons=structural_checks,
                   numericFieldPaths=sorted(field_paths), relativeTolerance=REL_TOL,
                   ownershipAbsoluteTolerance=FRACTION_ABS_TOL,
                   maxAbsoluteError=max_absolute_error, maxAbsoluteErrorField=max_absolute_error_field,
                   maxRelativeError=max_relative_error, economicReconciliations=evidence,
                   rejectionEvidence=rejection_evidence, javascriptOnlyEvidence=payload["probes"],
                   scope="All six operating presets plus fixed pre/post quotation hand cases, ownership endpoints, an input-cap-limited ceiling, a below-resolution positive ceiling, strict invalid inputs, and all returned chart coordinates. This verifies a simplified primary priced round, not company balances, cap tables, capital requirements, optimal financing or investment merit.",
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

