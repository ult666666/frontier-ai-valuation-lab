#!/usr/bin/env python3
"""Compare the independent Python reference with the JavaScript public engine.

Uses standard libraries and an installed Node executable. No workbook runtime is
needed in CI. Workbook recalculation parity is separately exercised by the XLSX
authoring verifier.
"""

from __future__ import annotations

import importlib.util
import json
import math
import os
from pathlib import Path
import random
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("reference_model", ROOT / "scripts" / "reference_model.py")
reference = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(reference)


def compare(actual, expected, path="result"):
    if isinstance(expected, dict):
        assert set(actual) == set(expected), f"{path}: keys differ"
        for key in expected:
            compare(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert len(actual) == len(expected), f"{path}: lengths differ"
        for index, value in enumerate(expected):
            compare(actual[index], value, f"{path}[{index}]")
    elif type(expected) in (int, float):
        assert type(actual) in (int, float) and math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-8), \
            f"{path}: {actual!r} != {expected!r}"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def run():
    presets = json.loads((ROOT / "data" / "presets.json").read_text())
    valid = [(f"{company}/{case}", values) for company, cases in presets.items() for case, values in cases.items()]
    fixture = dict(rev2026=100, g1=.04, g2=.04, g3=.04, m27=.2, m30=.2, m36=.2,
                   turns=2.5, wacc=.1, tg=.03, roic=.2, stub=-3, tax=.25)
    fixture_result = reference.project(fixture)
    assert math.isclose(fixture_result["ev"], 200.31471864537804, abs_tol=1e-9)
    assert math.isclose(fixture_result["terminal_fcf"], 19.439308071690157, abs_tol=1e-10)
    assert fixture_result["stub_t"] == 74 / 365.25
    valid += [("independent constant-growth fixture", fixture)]
    base = presets["Anthropic"]["Base"]
    valid += [
        ("zero terminal growth", {**base, "tg": 0}),
        ("zero tax and positive stub", {**base, "tax": 0, "stub": 2}),
        ("negative EV without floor", {**base, "turns": .05, "roic": .04}),
        ("late growth equality", {**base, "g3": base["tg"]}),
        ("margins at bounds", {**base, "m27": -1, "m30": 1, "m36": 1}),
    ]
    rng = random.Random(20261018)
    for index in range(24):
        tg = rng.uniform(0, .05)
        values = dict(rev2026=rng.uniform(10, 150), g1=rng.uniform(0, 1), g2=rng.uniform(0, .7),
                      g3=rng.uniform(tg, .4), m27=rng.uniform(-.7, .3), m30=rng.uniform(-.3, .5),
                      m36=rng.uniform(.02, .6), turns=rng.uniform(.5, 5), wacc=rng.uniform(.07, .4),
                      tg=tg, roic=rng.uniform(tg + .01, .6), stub=rng.uniform(-50, 10), tax=rng.uniform(0, .5))
        valid.append((f"varied economics {index + 1}", values))

    invalid = []
    for key in reference.KEYS:
        for label, bad in [("blank", None), ("text", "invalid"), ("boolean", True)]:
            invalid.append((f"{key}/{label}", {**base, key: bad}))
        missing = dict(base)
        del missing[key]
        invalid.append((f"{key}/missing", missing))
    for key, value in [("rev2026", 0), ("rev2026", 10001), ("turns", -2.5), ("turns", 101),
                       ("g1", -.01), ("g2", 2.01), ("g3", 0), ("m27", -1.01),
                       ("m30", 1.01), ("m36", 0), ("wacc", .61), ("wacc", .03),
                       ("tg", -.01), ("roic", .03), ("roic", 1.01), ("tax", -.01),
                       ("tax", 1), ("stub", -10001), ("stub", 10001)]:
        invalid.append((f"{key}/range {value}", {**base, key: value}))
    invalid += [("unknown key", {**base, "terminalYear": 2037}), ("array", [])]
    cases = [{"label": label, "assumptions": a} for label, a in valid + invalid]
    script = """
import { readFileSync } from 'node:fs';
import { project } from './public/lib/model.js';
const cases=JSON.parse(readFileSync(0,'utf8'));
const results=cases.map(({label,assumptions})=>{
  try{return {label,ok:true,result:project(assumptions)}}
  catch(error){return {label,ok:false,error:error.message}}
});
process.stdout.write(JSON.stringify(results));
"""
    completed = subprocess.run([os.environ.get("NODE", "node"), "--input-type=module", "-e", script],
                               cwd=ROOT, input=json.dumps(cases), capture_output=True, text=True, check=True)
    js = json.loads(completed.stdout)
    for result, (label, assumptions) in zip(js[:len(valid)], valid):
        assert result["ok"], f"JavaScript rejected {label}: {result}"
        compare(result["result"], reference.project(assumptions), label)
    for result, (label, assumptions) in zip(js[len(valid):], invalid):
        assert not result["ok"], f"JavaScript accepted invalid case {label}"
        try:
            reference.project(assumptions)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Python accepted invalid case {label}")
    for bad in (float("nan"), float("inf"), float("-inf")):
        try:
            reference.project({**base, "wacc": bad})
        except ValueError:
            pass
        else:
            raise AssertionError("Python accepted nonfinite input")
    print(json.dumps({"status": "passed", "valid_cases": len(valid), "invalid_cases": len(invalid),
                      "valuation_date": reference.VALUATION_DATE.isoformat(),
                      "fixture_ev": fixture_result["ev"], "relative_tolerance": 1e-10,
                      "absolute_tolerance_usd_b": 1e-8}, indent=2))


if __name__ == "__main__":
    run()
