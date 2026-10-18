#!/usr/bin/env python3
"""Independent standard-library reference for the public FCFF model.

The calculation is deliberately separate from the JavaScript engine. Dates use
datetime.date subtraction and every cash flow is evaluated from the published
financial contract. All monetary amounts are USD billions.

Run from the repository root:
    python scripts/reference_model.py --output /tmp/expected-results.json
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import date
from pathlib import Path

VALUATION_DATE = date(2026, 10, 18)
MODEL_VERSION = "3.0.0"
KEYS = (
    "rev2026", "g1", "g2", "g3", "m27", "m30", "m36", "turns",
    "wacc", "tg", "roic", "stub", "tax",
)


def validate(assumptions: dict) -> bool:
    """Reject missing, nonnumeric, nonfinite and out-of-domain assumptions."""
    if not isinstance(assumptions, dict):
        raise ValueError("Assumptions must be an object.")
    if set(assumptions) != set(KEYS):
        missing = sorted(set(KEYS) - set(assumptions))
        extra = sorted(set(assumptions) - set(KEYS))
        raise ValueError(f"Assumption keys differ: missing={missing}, unknown={extra}.")
    for key in KEYS:
        value = assumptions[key]
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError(f"{key} must be a finite number.")
    a = assumptions
    conditions = (
        (0 < a["rev2026"] <= 10000, "Revenue must be in (0, 10000]."),
        (0.05 <= a["turns"] <= 100, "Capital turns must be in [0.05, 100]."),
        (0 <= a["tg"] < a["wacc"] <= 0.60, "Require 0 <= g < WACC <= 0.60."),
        (a["tg"] < a["roic"] <= 1, "Require g < terminal ROIC <= 1."),
        (0 <= a["tax"] < 1, "Tax must be in [0, 1)."),
        (all(0 <= a[k] <= 2 for k in ("g1", "g2", "g3")), "Growth must be in [0, 2]."),
        (all(-1 <= a[k] <= 1 for k in ("m27", "m30", "m36")) and a["m36"] > 0,
         "Margins must be in [-1, 1], with a positive final margin."),
        (a["g3"] >= a["tg"], "Late explicit growth must be at least terminal growth."),
        (abs(a["stub"]) <= 10000, "Stub FCFF must be within +/-10000."),
    )
    for permitted, message in conditions:
        if not permitted:
            raise ValueError(message)
    return True


def project(assumptions: dict) -> dict:
    """Value remaining-2026 and 2027-2036 FCFF, plus a reinvesting perpetuity."""
    validate(assumptions)
    a = assumptions
    elapsed = lambda year: (date(year, 12, 31) - VALUATION_DATE).days / 365.25
    stub_t = elapsed(2026)
    pv_stub = a["stub"] * math.pow(1 + a["wacc"], -stub_t)
    previous_revenue = a["rev2026"]
    cumulative = a["stub"]
    minimum_cumulative = min(0.0, cumulative)
    rows = []
    for year in range(2027, 2037):
        growth = a["g1"] if year < 2031 else a["g2"] if year < 2034 else a["g3"]
        revenue = previous_revenue * (1 + growth)
        if year <= 2030:
            weight = (year - 2027) / 3
            margin = (1 - weight) * a["m27"] + weight * a["m30"]
        else:
            weight = (year - 2030) / 6
            margin = (1 - weight) * a["m30"] + weight * a["m36"]
        ebit = revenue * margin
        tax = max(ebit, 0) * a["tax"]
        nopat = ebit - tax
        reinvestment = (revenue - previous_revenue) / a["turns"]
        fcf = nopat - reinvestment
        time = elapsed(year)
        discount = math.pow(1 + a["wacc"], -time)
        cumulative += fcf
        minimum_cumulative = min(minimum_cumulative, cumulative)
        rows.append({
            "year": year, "revenue": revenue, "growth": growth, "margin": margin,
            "ebit": ebit, "tax": tax, "nopat": nopat, "reinvestment": reinvestment,
            "fcf": fcf, "t": time, "df": discount, "pv": fcf * discount,
            "cumulative": cumulative,
        })
        previous_revenue = revenue

    final = rows[-1]
    terminal_revenue = final["revenue"] * (1 + a["tg"])
    terminal_nopat = terminal_revenue * a["m36"] * (1 - a["tax"])
    reinvestment_rate = a["tg"] / a["roic"]
    terminal_fcf = terminal_nopat * (1 - reinvestment_rate)
    terminal_value = terminal_fcf / (a["wacc"] - a["tg"])
    present_terminal = terminal_value * final["df"]
    present_explicit = pv_stub + sum(row["pv"] for row in rows)
    enterprise_value = present_explicit + present_terminal
    terminal_share = present_terminal / enterprise_value if enterprise_value > 0 else None
    terminal_change = terminal_fcf / final["fcf"] - 1 if final["fcf"] > 0 else None
    implied_roic = a["m36"] * (1 - a["tax"]) * a["turns"]
    warnings = []
    if terminal_share is not None and terminal_share > 0.75:
        warnings.append("More than 75% of enterprise value comes from the terminal value.")
    if terminal_change is not None and abs(terminal_change) > 0.25:
        warnings.append("Terminal FCFF changes by more than 25% from 2036; review the growth and capital-return transition.")
    if abs(implied_roic - a["roic"]) > 0.05:
        warnings.append("Terminal ROIC differs from the incremental return implied by the final explicit margin and capital turns.")
    if a["g1"] < a["g2"] or a["g2"] < a["g3"]:
        warnings.append("This scenario assumes growth accelerates in a later forecast stage.")
    if a["roic"] < a["wacc"]:
        warnings.append("Terminal ROIC is below WACC; perpetual growth can reduce value.")
    if enterprise_value <= 0:
        warnings.append("This scenario has nonpositive operating enterprise value; no valuation floor is imposed.")
    result = {
        "rows": rows, "stub_t": stub_t, "pv_stub": pv_stub,
        "pv_explicit": present_explicit, "terminal_revenue": terminal_revenue,
        "terminal_nopat": terminal_nopat, "terminal_reinvestment_rate": reinvestment_rate,
        "terminal_fcf": terminal_fcf, "tv": terminal_value, "pvtv": present_terminal,
        "ev": enterprise_value, "tv_share": terminal_share,
        "peak_funding_need": -minimum_cumulative, "terminal_t": final["t"],
        "cagr": math.pow(final["revenue"] / a["rev2026"], 1 / 10) - 1,
        "terminal_fcf_change": terminal_change, "implied_incremental_roic": implied_roic,
        "warnings": warnings,
    }
    _check_finite(result)
    return result


def _check_finite(value):
    if isinstance(value, dict):
        for item in value.values():
            _check_finite(item)
    elif isinstance(value, list):
        for item in value:
            _check_finite(item)
    elif type(value) in (float, int) and not math.isfinite(value):
        raise ValueError("Inputs exceed the model's numeric range.")


def evaluate_presets(presets: dict) -> dict:
    return {company: {case: project(a) for case, a in cases.items()}
            for company, cases in presets.items()}


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--presets", type=Path, default=root / "data" / "presets.json")
    parser.add_argument("--output", type=Path, help="Write JSON here; otherwise print it.")
    args = parser.parse_args()
    payload = {
        "modelVersion": MODEL_VERSION,
        "valuationDate": VALUATION_DATE.isoformat(),
        "currency": "USD billions",
        "results": evaluate_presets(json.loads(args.presets.read_text())),
    }
    content = json.dumps(payload, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content)
    else:
        print(content, end="")


if __name__ == "__main__":
    main()
