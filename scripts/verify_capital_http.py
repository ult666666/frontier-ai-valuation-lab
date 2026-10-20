#!/usr/bin/env python3
"""Capital Strategy deployment-consistency profile for the shared HTTP verifier.

python3 -B scripts/verify_capital_http.py --base-url http://127.0.0.1:4340 \
    --output qa-local/v4-0/capital-http-local.json

The existing verifier supplies bounded curl transport, asset byte/MIME checks,
complete local-handler response comparisons and unchanged-source bindings.
This profile does not provide independent mathematical validation.
"""

from __future__ import annotations

import copy
import json

from verify_financing_http import ROOT, main as verify_http

REQUIRED = (
    "capital.html", "capital.js", "capital.css",
    "lib/capital-strategy.js", "lib/capital-chart.js", "lib/capital-record.js",
    "lib/capital-share.js", "lib/capital-brief.js", "lib/capital-example.js", "lib/capital-objectives.js", "lib/capital-verification.js",
    "downloads/Frontier_AI_Capital_Decision.json",
    "downloads/Frontier_AI_Capital_Decision.html",
    "downloads/Frontier_AI_Capital_Decision.pdf",
    "downloads/Frontier_AI_Capital_Strategy_Package.zip",
)


def capital_cases():
    """A fixed, bounded set of complete numeric snapshots and targeted rejections."""
    presets = json.loads((ROOT / "data/presets.json").read_text())

    def snapshot(company="Anthropic"):
        return {
            "company": company,
            "scenarios": [{"id": name.lower(), "label": name,
                           "assumptions": copy.deepcopy(presets[company][name]),
                           "continuationYears": None} for name in ("Bear", "Base", "Bull")],
            "plans": [
                {"id": "a", "label": "Smaller round", "basis": "pre", "quote": 250, "primaryCapital": 25},
                {"id": "b", "label": "More capital", "basis": "pre", "quote": 300, "primaryCapital": 35},
                {"id": "c", "label": "Higher retention", "basis": "pre", "quote": 300, "primaryCapital": 20},
            ],
            "policy": {"capitalTarget": 25, "retentionFloor": .88, "modelCoverageFloor": 1, "holderStake": .1},
            "bridge": {"cash": 20, "debt": 5, "otherClaims": 0},
        }

    def item(name, value, status=200):
        return {"name": name, "path": "/api/valuation", "method": "POST",
                "body": {"action": "capital", "snapshot": value}, "expectedStatus": status}

    def rejected(name, edit):
        value = snapshot()
        edit(value)
        return item(name, value, 400)

    cases = [item("Capital worked Anthropic decision", snapshot())]
    for years in (0, 10, 100):
        value = snapshot()
        for scenario in value["scenarios"]:
            scenario["continuationYears"] = years
        cases.append(item(f"Capital finite continuation {years} years", value))
    cases.append(item("Capital proper OpenAI scenario set", snapshot("OpenAI")))

    value = snapshot()
    value["bridge"] = None
    cases.append(item("Capital missing explicit bridge", value))
    value = snapshot()
    value["bridge"] = {"cash": 0, "debt": 10000, "otherClaims": 10000}
    cases.append(item("Capital signed negative modeled equity", value))
    value = snapshot()
    value["policy"].update(capitalTarget=30, retentionFloor=.9)
    cases.append(item("Capital no eligible submitted plan", value))

    value = snapshot()
    for plan in value["plans"]:
        plan["quote"] += plan["primaryCapital"]
        plan["basis"] = "post"
    cases.append(item("Capital equivalent post-money offers", value))
    for capital, label in ((0, "zero issuance"), (1e-18, "tiny positive issuance")):
        value = snapshot()
        value["policy"].update(capitalTarget=0, retentionFloor=1)
        for plan in value["plans"]:
            plan["primaryCapital"] = capital
        cases.append(item("Capital strict 100% floor with " + label, value))

    maximum = snapshot()
    original_scenarios = maximum["scenarios"]
    maximum["scenarios"] = []
    for index in range(9):
        scenario = copy.deepcopy(original_scenarios[index % 3])
        scenario.update(id=f"case-{index + 1}", label=f"Scenario {index + 1}",
                        continuationYears=(None, 0, 100)[index // 3])
        maximum["scenarios"].append(scenario)
    maximum["plans"] += [
        {"id": "d", "label": "Larger primary raise", "basis": "pre", "quote": 500, "primaryCapital": 70},
        {"id": "e", "label": "Post-money offer", "basis": "post", "quote": 600, "primaryCapital": 65},
        {"id": "f", "label": "No new primary capital", "basis": "pre", "quote": 200, "primaryCapital": 0},
    ]
    cases.append(item("Capital maximum nine scenarios and six plans", maximum))

    missing = item("Capital missing top-level snapshot", snapshot(), 400)
    del missing["body"]["snapshot"]
    extra = item("Capital unsupported top-level field", snapshot(), 400)
    extra["body"]["verified"] = True
    cases += [missing, extra,
        rejected("Capital unsupported snapshot field", lambda value: value.update(probabilities=[.2, .6, .2])),
        rejected("Capital omitted bridge field", lambda value: value.pop("bridge")),
        rejected("Capital missing policy field", lambda value: value["policy"].pop("holderStake")),
        rejected("Capital unsupported policy field", lambda value: value["policy"].update(fundingNeed=25)),
        rejected("Capital unsupported scenario field", lambda value: value["scenarios"][0].update(weight=.2)),
        rejected("Capital unsupported operating assumption", lambda value: value["scenarios"][0]["assumptions"].update(reportedRevenue=15)),
        rejected("Capital invalid scenario remains a rejection", lambda value: value["scenarios"][1]["assumptions"].update(g3=0)),
        rejected("Capital unsupported plan field", lambda value: value["plans"][0].update(liquidationPreference=1)),
        rejected("Capital duplicate scenario identifier", lambda value: value["scenarios"][1].update(id="bear")),
        rejected("Capital duplicate plan identifier", lambda value: value["plans"][1].update(id="a")),
        rejected("Capital malformed plan identifier", lambda value: value["plans"][0].update(id="Plan A")),
        rejected("Capital continuation exceeds public cap at 10000 years", lambda value: value["scenarios"][0].update(continuationYears=10000)),
        rejected("Capital fractional continuation period", lambda value: value["scenarios"][0].update(continuationYears=.5)),
        rejected("Capital quote string is not a number", lambda value: value["plans"][0].update(quote="250")),
        rejected("Capital lone high surrogate in scenario label", lambda value: value["scenarios"][0].update(label="Invalid-\ud800-label")),
        rejected("Capital lone low surrogate in plan label", lambda value: value["plans"][0].update(label="Invalid-\udc00-label")),
        rejected("Capital negative bridge component", lambda value: value["bridge"].update(cash=-1)),
    ]
    over_scenarios = copy.deepcopy(maximum)
    over_scenarios["scenarios"].append({**copy.deepcopy(over_scenarios["scenarios"][0]), "id": "case-ten"})
    cases.append(item("Capital scenario count above nine", over_scenarios, 400))
    over_plans = copy.deepcopy(maximum)
    over_plans["plans"].append({**over_plans["plans"][0], "id": "g"})
    cases.append(item("Capital plan count above six", over_plans, 400))
    return cases


def main():
    return verify_http(extra_cases=capital_cases, extra_required=REQUIRED,
                       extra_sources=("scripts/verify_capital_http.py",),
                       purpose="capital-strategy-deployment-consistency")


if __name__ == "__main__":
    raise SystemExit(main())
