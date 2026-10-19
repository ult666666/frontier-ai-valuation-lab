#!/usr/bin/env python3
"""Check a hypothetical primary financing against a separate share-count ledger.

Python supplies the existing, independent FCFF reference. Financing is evaluated
with 80-digit Decimal arithmetic: issue new shares at the quoted price per one
of 100 existing shares, then value the resulting ownership ledger. No production
JavaScript formula is imported into the reference calculation. All monetary
amounts are USD billions; ownership amounts are fractions, not percentages.
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

from reference_model import project

ROOT = Path(__file__).resolve().parents[1]
REL_TOL = 2e-10
MODEL_ABS_TOL = 1e-8
FRACTION_ABS_TOL = 2e-16


def cases():
    presets = json.loads((ROOT / "data/presets.json").read_text())
    base = presets["Anthropic"]["Base"]
    ordinary = dict(basis="pre", quote=250, primaryCapital=25, holderStake=.1)
    bridge = dict(cash=20, debt=5, otherClaims=0)

    def case(label, assumptions=None, supplied_bridge=bridge, **changes):
        return dict(label=label, assumptions=copy.deepcopy(assumptions or base),
                    bridge=copy.deepcopy(supplied_bridge), round={**ordinary, **changes})

    valid = [case(f"{company} {scenario}", a, basis="pre" if company == "Anthropic" else "post")
             for company, scenarios in presets.items() for scenario, a in scenarios.items()]
    valid += [
        case("No balance-sheet bridge", supplied_bridge=None),
        case("Equivalent post-money quotation", basis="post", quote=275),
        case("Zero primary capital, pre-money", primaryCapital=0),
        case("Zero primary capital, post-money", basis="post", primaryCapital=0),
        case("No pre-round holding", holderStake=0),
        case("Sole pre-round holder", holderStake=1),
        case("Fractional proceeds and holding", quote=123.45678912345,
             primaryCapital=.000123456789, holderStake=.1234567891234567,
             supplied_bridge=dict(cash=12.345678901234, debt=3.25, otherClaims=1.125)),
        case("Small nonzero new ownership", primaryCapital=1e-10, holderStake=.999999999999),
        case("Small nonzero existing ownership", quote=1e-8, primaryCapital=1e6),
        case("Nonpositive model equity is retained", supplied_bridge=dict(cash=0, debt=10000, otherClaims=10000)),
        case("Negative implied operating value", quote=5, supplied_bridge=dict(cash=100, debt=0, otherClaims=0)),
        case("Maximum stated amounts", quote=1e12, primaryCapital=1e12, holderStake=1),
        case("All thirteen edited operating inputs", assumptions=dict(
            rev2026=87.123456789, g1=.4123456789, g2=.2345678912, g3=.0987654321,
            m27=-.2345678912, m30=.1234567891, m36=.2987654321, turns=3.456789123,
            wacc=.1434567891, tg=.0234567891, roic=.2234567891, stub=-4.56789123,
            tax=.1934567891), quote=333.123456789, primaryCapital=17.987654321),
    ]
    invalid = []

    def bad(label, key, value, group="round", precision=False):
        item = case(label)
        if group is None:
            item[key] = value
        else:
            item[group][key] = value
        item["expectedPrecisionError"] = precision
        invalid.append(item)

    for label, key, value in [
        ("Unknown price basis", "basis", "enterprise"),
        ("Zero quote", "quote", 0),
        ("Negative quote", "quote", -1),
        ("Quote above limit", "quote", 1e12 + 1),
        ("Text quote", "quote", "250"),
        ("Boolean quote", "quote", True),
        ("Null quote", "quote", None),
        ("Negative capital", "primaryCapital", -1),
        ("Capital above limit", "primaryCapital", 1e12 + 1),
        ("Text capital", "primaryCapital", "25"),
        ("Stake below zero", "holderStake", -.01),
        ("Stake above one", "holderStake", 1.01),
        ("Percent supplied as fraction", "holderStake", 10),
        ("Boolean stake", "holderStake", False),
        ("Unknown round field", "secondaryCapital", 1),
    ]:
        bad(label, key, value)
    for label, field, value in [
        ("Negative cash", "cash", -1),
        ("Cash above bridge domain", "cash", 10001),
        ("Text debt", "debt", "5"),
        ("Boolean claims", "otherClaims", True),
        ("Unknown balance-sheet field", "liquidationPreference", 5),
    ]:
        bad(label, field, value, "bridge")
    for label, quote, capital, precision in [
        ("Post-money equals proceeds", 25, 25, False),
        ("Post-money below proceeds", 20, 25, False),
        ("Unresolved post-money subtraction", 1e12, math.nextafter(1e12, -math.inf), True),
    ]:
        invalid.append({**case(label, basis="post", quote=quote, primaryCapital=capital),
                        "expectedPrecisionError": precision})
    invalid += [
        {**case("New ownership underflows", primaryCapital=5e-324), "expectedPrecisionError": True},
        {**case("Existing ownership underflows", quote=1e-320, primaryCapital=1e12), "expectedPrecisionError": True},
    ]
    missing = case("Missing holder fraction")
    del missing["round"]["holderStake"]
    invalid.append(missing)
    missing = case("Missing bridge claim input")
    del missing["bridge"]["otherClaims"]
    invalid.append(missing)
    invalid.append(case("Array supplied as a bridge", supplied_bridge=[]))
    bad("Missing explicit round object", "round", None, group=None)
    bad("Invalid terminal discount boundary", "wacc", base["tg"], "assumptions")
    bad("Unknown model assumption", "growthProbability", .5, "assumptions")
    return valid, invalid


def reference(item):
    """Derive investor balances from shares issued, then reconcile enterprise value."""
    baseline = project(item["assumptions"])
    terms = item["round"]
    with localcontext() as context:
        context.prec = 80
        exact = lambda value: Decimal.from_float(float(value))
        quote, proceeds = exact(terms["quote"]), exact(terms["primaryCapital"])
        pre_equity = quote if terms["basis"] == "pre" else quote - proceeds
        post_equity = pre_equity + proceeds
        existing_shares = Decimal(100)
        price_per_share = pre_equity / existing_shares
        new_shares = proceeds / price_per_share
        total_shares = existing_shares + new_shares
        holder_shares = exact(terms["holderStake"]) * existing_shares
        other_shares = existing_shares - holder_shares
        holder_before = holder_shares / existing_shares
        holder_after = holder_shares / total_shares
        pricing = dict(
            preMoney=pre_equity, postMoney=post_equity, primaryCapital=proceeds,
            existingOwnership=existing_shares / total_shares,
            newOwnership=new_shares / total_shares,
            holderBefore=holder_before, holderAfter=holder_after,
            otherExistingAfter=other_shares / total_shares,
            holderDilution=holder_before - holder_after,
            relativeDilution=new_shares / total_shares,
            holderValueBefore=holder_shares * price_per_share,
            holderValueAfter=holder_shares * (post_equity / total_shares),
        )
        pricing = {key: float(value) for key, value in pricing.items()}
        supplied = item["bridge"]
        bridge = comparison = None
        warnings = []
        if supplied is not None:
            cash, debt, claims = (exact(supplied[key]) for key in ("cash", "debt", "otherClaims"))
            operating_ev = exact(baseline["ev"])
            adjustment = cash - debt - claims
            modeled_equity = operating_ev + adjustment
            funded_equity = modeled_equity + proceeds
            cash_after = cash + proceeds
            round_implied = post_equity + debt + claims - cash_after
            gap = pre_equity - modeled_equity
            gap_percent = gap / modeled_equity if modeled_equity > 0 else None
            bridge = dict(ev=baseline["ev"], **supplied, adjustment=float(adjustment),
                          equityValue=float(modeled_equity), status="hypothetical")
            comparison = dict(modelPreMoneyEquity=float(modeled_equity),
                              modelPostMoneyEquity=float(funded_equity),
                              cashBefore=float(cash), cashAfter=float(cash_after),
                              operatingEvBefore=baseline["ev"],
                              operatingEvAfter=float(funded_equity + debt + claims - cash_after),
                              roundImpliedOperatingEv=float(round_implied),
                              priceGap=float(gap),
                              priceGapPercent=float(gap_percent) if gap_percent is not None else None)
            if modeled_equity <= 0:
                warnings.append("The modeled pre-money equity residual is nonpositive. It is not a share price or a valuation of limited-liability common equity; the price-gap percentage is unavailable.")
        return dict(version="1.0.0", assumptions=item["assumptions"], baseline=baseline,
                    round=terms, pricing=pricing, bridge=bridge, comparison=comparison,
                    method=dict(basis="simple-primary-equity-round", operatingValue="perpetual-fcff",
                                proceeds="retained-as-cash", fees=0, rights="equal-participating",
                                bridgeStatus="hypothetical" if bridge is not None else "not-supplied"),
                    warnings=warnings)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write a source-bound verification receipt.")
    args = parser.parse_args()
    valid, invalid = cases()
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node:
        raise SystemExit("Node.js 24 is required to evaluate the production module.")
    program = """import {readFileSync} from 'node:fs';
import {financingLens,FINANCING_VERSION,FINANCING_MAX_AMOUNT} from './public/lib/financing.js';
const requests=JSON.parse(readFileSync(0,'utf8'));
const results=requests.map(({assumptions,bridge,round})=>{
  try{return {ok:true,result:financingLens(assumptions,{bridge,round})};}
  catch(error){return {ok:false,error:String(error.message)};}
});
process.stdout.write(JSON.stringify({version:FINANCING_VERSION,maxAmount:FINANCING_MAX_AMOUNT,results}));
"""
    process = subprocess.run([node, "--input-type=module", "-e", program],
                             input=json.dumps(valid + invalid, allow_nan=False),
                             text=True, capture_output=True, cwd=ROOT, timeout=30)
    if process.returncode:
        raise SystemExit(process.stderr or "The production module could not be evaluated.")
    payload = json.loads(process.stdout)
    failures = []
    numeric_checks = structural_checks = 0
    max_absolute_error = max_relative_error = 0.0
    max_error_field = None
    field_paths = set()

    def compare(actual, expected, path):
        nonlocal numeric_checks, structural_checks, max_absolute_error, max_relative_error, max_error_field
        if type(expected) in (float, int):
            numeric_checks += 1
            field_paths.add(path.split(".", 1)[1])
            if type(actual) not in (float, int) or not math.isfinite(actual):
                failures.append(f"{path}: expected a finite number, received {actual!r}")
                return
            error = abs(actual - expected)
            if error > max_absolute_error:
                max_absolute_error, max_error_field = error, path
            max_relative_error = max(max_relative_error, error / max(1, abs(expected)))
            # Small ownership claims must not silently become zero. Monetary
            # cancellation is bounded separately from fractional ownership.
            if ".pricing." in path and any(path.endswith("." + key) for key in (
                    "existingOwnership", "newOwnership", "holderBefore", "holderAfter",
                    "otherExistingAfter", "holderDilution", "relativeDilution")):
                tolerance = FRACTION_ABS_TOL + REL_TOL * abs(expected)
                if expected > 0 and actual <= 0:
                    failures.append(f"{path}: a positive ownership claim disappeared")
            else:
                tolerance = MODEL_ABS_TOL + REL_TOL * abs(expected)
            if error > tolerance:
                failures.append(f"{path}: {actual!r} differs from share-ledger reference {expected!r}")
        elif isinstance(expected, dict):
            structural_checks += 1
            if not isinstance(actual, dict) or set(actual) != set(expected):
                failures.append(f"{path}: returned fields differ from the complete contract")
                return
            for key, value in expected.items():
                compare(actual[key], value, f"{path}.{key}")
        elif isinstance(expected, list):
            structural_checks += 1
            if not isinstance(actual, list) or len(actual) != len(expected):
                failures.append(f"{path}: expected {len(expected)} list members")
                return
            for index, value in enumerate(expected):
                compare(actual[index], value, f"{path}[{index}]")
        else:
            structural_checks += 1
            if type(actual) is not type(expected) or actual != expected:
                failures.append(f"{path}: {actual!r} differs from {expected!r}")

    if payload["version"] != "1.0.0" or payload["maxAmount"] != 1e12:
        failures.append("The financing version or supported input domain changed.")
    if len(payload["results"]) != len(valid) + len(invalid):
        raise SystemExit("Production returned an incomplete result batch.")
    economic_checks = []
    for item, actual in zip(valid, payload["results"][:len(valid)], strict=True):
        if not actual["ok"]:
            failures.append(f"{item['label']}: valid ledger rejected: {actual['error']}")
            continue
        expected = reference(item)
        compare(actual["result"], expected, item["label"])
        result = actual["result"]
        pricing = result["pricing"]
        ownership_sum = pricing["holderAfter"] + pricing["otherExistingAfter"] + pricing["newOwnership"]
        if not math.isclose(ownership_sum, 1, rel_tol=0, abs_tol=5e-15):
            failures.append(f"{item['label']}: issued share ownership does not reconcile to one")
        holder_mark_preserved = math.isclose(pricing["holderValueBefore"], pricing["holderValueAfter"], rel_tol=2e-14, abs_tol=1e-12)
        if not holder_mark_preserved:
            failures.append(f"{item['label']}: primary issuance created quoted wealth for the existing holder")
        if result["comparison"] is not None:
            comparison = result["comparison"]
            if comparison["operatingEvBefore"] != comparison["operatingEvAfter"]:
                failures.append(f"{item['label']}: retained primary cash changed modeled operating EV")
        economic_checks.append(dict(label=item["label"], ownershipSum=ownership_sum,
                                    holderMarkPreserved=holder_mark_preserved,
                                    operatingEvUnchanged=None if result["comparison"] is None else
                                    result["comparison"]["operatingEvBefore"] == result["comparison"]["operatingEvAfter"]))
    rejection_evidence = []
    for item, actual in zip(invalid, payload["results"][len(valid):], strict=True):
        if actual["ok"]:
            failures.append(f"{item['label']}: invalid financing request was accepted")
        elif item.get("expectedPrecisionError") and "precision" not in actual["error"].lower():
            failures.append(f"{item['label']}: numerical ambiguity was not identified as precision")
        rejection_evidence.append(dict(label=item["label"], rejected=not actual["ok"],
                                       precisionRequired=item.get("expectedPrecisionError", False),
                                       message=actual.get("error")))
    paths = ["public/lib/model.js", "public/lib/financing.js", "data/presets.json",
             "scripts/reference_model.py", "scripts/check_financing_reference.py"]
    receipt = dict(schema=1, status="passed" if not failures else "failed",
                   generatedAt=datetime.now(timezone.utc).isoformat(),
                   financingVersion=payload["version"],
                   method="Independent Python FCFF plus an 80-digit Decimal.from_float share issuance ledger with 100 pre-round shares; post-round cash/claims reconciliation and unchanged-price holder marks.",
                   validScenarios=len(valid), invalidScenarios=len(invalid),
                   numericComparisons=numeric_checks, structuralComparisons=structural_checks,
                   numericFieldPaths=sorted(field_paths),
                   relativeTolerance=REL_TOL, modelAbsoluteTolerance=MODEL_ABS_TOL,
                   ownershipAbsoluteTolerance=FRACTION_ABS_TOL,
                   maxAbsoluteError=max_absolute_error, maxAbsoluteErrorField=max_error_field,
                   maxRelativeErrorNormalizedByAtLeastOne=max_relative_error,
                   economicReconciliations=economic_checks, rejectionEvidence=rejection_evidence,
                   scope=f"All six operating presets plus {len(valid) - 6} ownership, price-basis, cash-bridge and precision cases. This checks the declared simplified primary-round calculation, not private company balances, security rights, a transaction price, financial forecasts or investment merit.",
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
