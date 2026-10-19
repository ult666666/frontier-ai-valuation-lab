#!/usr/bin/env python3
"""Create or verify a separate, versioned desktop handoff without altering legacy files."""
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import plistlib
import re
import shutil
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
APP_VERSION = "3.6.0"
FINANCING_VERSION = "1.0.0"
OWNERSHIP_VERSION = "1.0.0"
MODEL_VERSION = "3.0.0"
VALUATION_DATE = "2026-10-18"
APP = "https://frontier-ai-valuation-lab.vercel.app/"
FINANCING = APP + "index.html#financing-example"
OWNERSHIP = APP + "index.html#ownership-example"
HORIZON = APP + "horizon.html"
THESIS = APP + "thesis.html"
CASEBOOK = APP + "casebook.html"
REPO = "https://github.com/ult666666/frontier-ai-valuation-lab"
PORTFOLIO = "https://ult666666.github.io/fintech.html"
DEFAULT_DESTINATION = Path.home() / "Desktop/Anthropic-vs-OpenAI-Valuation/Ownership_Frontier_V3_6_2026-10-19"
MANIFEST_NAME = "SHA256_manifest.json"
SHORTCUTS = {
    "Open_Live_Demo.webloc": OWNERSHIP,
    "Open_Ownership_Frontier.webloc": OWNERSHIP,
    "Open_Financing_Lens.webloc": FINANCING,
    "Open_Value_Horizon.webloc": HORIZON,
    "Open_Valuation_Model.webloc": APP,
    "Open_Thesis_Lab.webloc": THESIS,
    "Open_Research_Casebook.webloc": CASEBOOK,
    "Open_Fintech_Portfolio.webloc": PORTFOLIO,
    "Open_Project_Source.webloc": REPO,
}


def source_files():
    return {
        "report.html": ROOT / "public/report.html",
        "downloads/Frontier_AI_Valuation_Model.xlsx": ROOT / "public/downloads/Frontier_AI_Valuation_Model.xlsx",
        "downloads/Frontier_AI_Valuation_Review.pdf": ROOT / "public/downloads/Frontier_AI_Valuation_Review.pdf",
        "downloads/Frontier_AI_Thesis_Comparison.html": ROOT / "public/downloads/Frontier_AI_Thesis_Comparison.html",
        "downloads/Frontier_AI_Thesis_Comparison.pdf": ROOT / "public/downloads/Frontier_AI_Thesis_Comparison.pdf",
        "downloads/Frontier_AI_Research_Brief.html": ROOT / "public/downloads/Frontier_AI_Research_Brief.html",
        "downloads/Frontier_AI_Research_Brief.pdf": ROOT / "public/downloads/Frontier_AI_Research_Brief.pdf",
        "downloads/Frontier_AI_Research_Casebook.json": ROOT / "public/downloads/Frontier_AI_Research_Casebook.json",
        "downloads/Frontier_AI_Value_Horizon.html": ROOT / "public/downloads/Frontier_AI_Value_Horizon.html",
        "downloads/Frontier_AI_Value_Horizon.pdf": ROOT / "public/downloads/Frontier_AI_Value_Horizon.pdf",
        "downloads/Frontier_AI_Value_Horizon.json": ROOT / "public/downloads/Frontier_AI_Value_Horizon.json",
        "downloads/Frontier_AI_Financing_Lens.html": ROOT / "public/downloads/Frontier_AI_Financing_Lens.html",
        "downloads/Frontier_AI_Financing_Lens.pdf": ROOT / "public/downloads/Frontier_AI_Financing_Lens.pdf",
        "downloads/Frontier_AI_Financing_Lens.json": ROOT / "public/downloads/Frontier_AI_Financing_Lens.json",
        "Ownership_Frontier_Methodology.md": ROOT / "docs/OWNERSHIP_FRONTIER.md",
        "Ownership_Frontier_Preview.png": ROOT / "docs/demo-ownership.png",
        "Financing_Lens_Methodology.md": ROOT / "docs/FINANCING_LENS.md",
        "Financing_Lens_Preview.png": ROOT / "docs/demo-financing.png",
        "Value_Horizon_Methodology.md": ROOT / "docs/VALUE_HORIZON.md",
        "Value_Horizon_Preview.png": ROOT / "public/assets/horizon-preview.png",
        "evidence_context.json": ROOT / "public/data/evidence.json",
        "Research_Casebook_Preview.png": ROOT / "public/assets/casebook-preview.png",
        "model_assumptions.json": ROOT / "data/presets.json",
        "model_results.json": ROOT / "public/data/current-results.json",
        "source_register.json": ROOT / "data/research.json",
        "README.txt": ROOT / "docs/DESKTOP_GUIDE.md",
        "Thesis_Lab_Preview.png": ROOT / "public/assets/thesis-preview.png",
    }


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def finite_number(value):
    """JSON booleans and integers outside the model's numeric range are not numbers."""
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def exact_record(value, keys, label):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError(f"Financing analysis has incomplete or unsupported {label}.")


def strict_json(text):
    """Reject duplicate fields, non-JSON constants and numeric overflow anywhere."""
    def reject_constant(value):
        raise ValueError(f"Financing analysis contains non-JSON numeric constant {value}.")

    def unique_record(pairs):
        record = {}
        for key, value in pairs:
            if key in record:
                raise ValueError(f"Financing analysis contains duplicate field {key}.")
            record[key] = value
        return record

    def inspect(value):
        if type(value) in (int, float) and not finite_number(value):
            raise ValueError("Financing analysis contains a number outside the finite model range.")
        if type(value) is dict:
            for field in value.values():
                inspect(field)
        elif type(value) is list:
            for field in value:
                inspect(field)

    value = json.loads(text, parse_constant=reject_constant, object_pairs_hook=unique_record)
    inspect(value)
    return value


def ownership_constraint(value):
    exact_record(value, ("retentionFloor",), "ownership constraint")
    if not finite_number(value["retentionFloor"]) or not .01 <= value["retentionFloor"] <= 1:
        raise ValueError("Financing analysis has an ownership floor outside the supported 1–100% range.")


def check_ownership_metadata(ownership, constraint, terms, pricing):
    """Validate the complete declared domain and structure, without replacing the independent reference."""
    exact_record(ownership, ("version", "constraint", "current", "ceiling", "graph", "method", "warnings"), "ownership result")
    ownership_constraint(ownership["constraint"])
    if ownership["version"] != OWNERSHIP_VERSION or ownership["constraint"] != constraint:
        raise ValueError("Ownership result and the exact snapshot disagree.")
    warnings = ownership["warnings"]
    if type(warnings) is not list or any(type(warning) is not str for warning in warnings):
        raise ValueError("Ownership warnings must be an array of text explanations.")

    current = ownership["current"]
    exact_record(current, ("primaryCapital", "retainedFraction", "holderAfter", "holderFloor", "status", "capitalHeadroom", "capitalExcess"), "current ownership result")
    if (not finite_number(current["primaryCapital"]) or not 0 <= current["primaryCapital"] <= 1e12
            or not finite_number(current["retainedFraction"]) or not 0 < current["retainedFraction"] <= 1
            or not finite_number(current["holderAfter"]) or not 0 <= current["holderAfter"] <= 1
            or current["primaryCapital"] != terms["primaryCapital"]
            or current["retainedFraction"] != pricing["existingOwnership"]
            or current["holderAfter"] != pricing["holderAfter"]
            or current["status"] not in ("above-floor", "at-floor", "below-floor")):
        raise ValueError("Ownership current point has invalid fields or disagrees with the financing result.")
    floor = current["holderFloor"]
    if floor is None:
        if terms["holderStake"] <= 0 or not warnings:
            raise ValueError("An unavailable positive holder floor needs its numerical-range explanation.")
    elif not finite_number(floor) or not 0 <= floor <= terms["holderStake"]:
        raise ValueError("Ownership holder floor is outside the starting stake.")
    for key in ("capitalHeadroom", "capitalExcess"):
        if current[key] is not None and (not finite_number(current[key]) or current[key] < 0):
            raise ValueError(f"Ownership {key} must be finite and nonnegative, or explicitly unavailable.")

    ceiling = ownership["ceiling"]
    exact_record(ceiling, ("analyticalCapital", "supportedCapital", "status"), "ownership ceiling")
    ceiling_status = ceiling["status"]
    analytical, supported = ceiling["analyticalCapital"], ceiling["supportedCapital"]
    if ceiling_status in ("resolved", "input-cap-limited"):
        if (not finite_number(analytical) or not 0 <= analytical <= 1e14
                or not finite_number(supported) or not 0 <= supported <= 1e12
                or current["capitalHeadroom"] is None or current["capitalExcess"] is None):
            raise ValueError("Ownership ceiling has incomplete or out-of-range capital amounts.")
        if ((ceiling_status == "resolved" and (analytical > 1e12 or supported != analytical))
                or (ceiling_status == "input-cap-limited" and (analytical <= 1e12 or supported != 1e12 or not warnings))):
            raise ValueError("Ownership ceiling does not distinguish the analytical and supported amounts.")
        if constraint["retentionFloor"] == 1:
            if analytical != 0 or supported != 0 or ceiling_status != "resolved":
                raise ValueError("Full retention must retain the zero-capital boundary.")
        elif analytical <= 0:
            raise ValueError("An unresolved positive ownership ceiling cannot be reported as zero.")
    elif ceiling_status in ("below-resolution", "unresolved"):
        if (analytical is not None or supported is not None or not warnings
                or current["capitalHeadroom"] is not None or current["capitalExcess"] is not None):
            raise ValueError("An unresolved ownership ceiling must remain explicitly unavailable.")
    else:
        raise ValueError("Ownership ceiling has an unsupported status.")

    graph = ownership["graph"]
    exact_record(graph, ("status", "capitalMax", "points", "ceilingInDomain", "currentInDomain"), "ownership graph")
    if type(graph["points"]) is not list or any(type(graph[key]) is not bool for key in ("ceilingInDomain", "currentInDomain")):
        raise ValueError("Ownership graph has invalid points or domain flags.")
    if graph["status"] == "unavailable":
        if (graph["capitalMax"] is not None or graph["points"] or graph["ceilingInDomain"]
                or graph["currentInDomain"] or not warnings):
            raise ValueError("An unavailable ownership graph must not retain old points or domain claims.")
    elif graph["status"] == "ready":
        maximum, points = graph["capitalMax"], graph["points"]
        if (not finite_number(maximum) or not 0 < maximum <= 1e12 or not 49 <= len(points) <= 51
                or (terms["basis"] == "post" and maximum >= terms["quote"])):
            raise ValueError("Ownership graph has an invalid bounded sample domain.")
        for point in points:
            exact_record(point, ("primaryCapital", "retainedFraction", "holderAfter"), "ownership graph point")
            if (not all(finite_number(value) for value in point.values()) or not 0 <= point["primaryCapital"] <= maximum
                    or not 0 < point["retainedFraction"] <= 1 or not 0 <= point["holderAfter"] <= 1):
                raise ValueError("Ownership graph has an invalid numeric point.")
        if (points[0]["primaryCapital"] != 0 or points[-1]["primaryCapital"] != maximum
                or any(a["primaryCapital"] >= b["primaryCapital"] or a["retainedFraction"] < b["retainedFraction"]
                       for a, b in zip(points, points[1:]))):
            raise ValueError("Ownership graph must contain a complete ordered capital axis.")
        if (graph["currentInDomain"] != (current["primaryCapital"] <= maximum)
                or graph["ceilingInDomain"] != (analytical is not None and analytical <= maximum)):
            raise ValueError("Ownership graph domain flags disagree with the declared points.")
        expected_axis = {maximum * (index / 48) for index in range(49)}
        if graph["currentInDomain"]:
            expected_axis.add(current["primaryCapital"])
        if graph["ceilingInDomain"]:
            expected_axis.add(analytical)
        if {point["primaryCapital"] for point in points} != expected_axis:
            raise ValueError("Ownership graph omits or changes its declared 48-interval sample axis.")
        current_point = {key: current[key] for key in ("primaryCapital", "retainedFraction", "holderAfter")}
        if graph["currentInDomain"] and current_point not in points:
            raise ValueError("Ownership graph omits the exact current round.")
        if graph["ceilingInDomain"] and not any(point["primaryCapital"] == analytical for point in points):
            raise ValueError("Ownership graph omits the exact declared ceiling.")
    else:
        raise ValueError("Ownership graph has an unsupported status.")

    expected_method = {"basis": "fixed-quote-primary-round", "fixedQuoteBasis": terms["basis"],
                       "retentionScope": "fraction-of-starting-stakes", "existingHoldersSubscribe": False,
                       "retentionFloorMin": .01, "retentionFloorMax": 1, "comparisonBand": 32 * 2.220446049250313e-16,
                       "capitalInputLimit": 1e12, "sampleIntervals": 48}
    exact_record(ownership["method"], expected_method, "ownership method")
    if (ownership["method"] != expected_method or type(ownership["method"]["existingHoldersSubscribe"]) is not bool
            or any(not finite_number(ownership["method"][key]) for key in ("retentionFloorMin", "retentionFloorMax", "comparisonBand", "capitalInputLimit", "sampleIntervals"))
            or type(ownership["method"]["sampleIntervals"]) is not int):
        raise ValueError("Ownership analysis has incompatible method metadata.")


def check_financing_metadata(path, *, require_ownership=False):
    """Verify complete inputs, result structure and exact link; arithmetic is checked separately."""
    exact, numeric = exact_record, finite_number

    def token_payload(token, limit):
        if not isinstance(token, str) or not 0 < len(token) <= limit or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
            raise ValueError("Financing analysis has a malformed share token.")
        decoded = base64.b64decode(token + "=" * (-len(token) % 4), altchars=b"-_", validate=True)
        return strict_json(decoded.decode("utf-8"))

    analysis = strict_json(path.read_text(encoding="utf-8"))
    if type(analysis) is not dict or type(analysis.get("schema")) is not int or analysis["schema"] not in (1, 2):
        raise ValueError("Financing analysis has an unsupported export schema.")
    has_ownership = analysis["schema"] == 2
    if require_ownership and not has_ownership:
        raise ValueError("The Ownership Frontier handoff requires its complete ownership constraint and result.")
    export_keys = ("kind", "schema", "appVersion", "financingVersion", "modelVersion", "valuationDate", "units", "snapshot", "result", "shareUrl", "methodSources", "limits")
    exact(analysis, export_keys + (("ownershipVersion",) if has_ownership else ()), "export metadata")
    expected = {"kind": "frontier-financing-lens", "appVersion": APP_VERSION,
                "financingVersion": FINANCING_VERSION, "modelVersion": MODEL_VERSION,
                "valuationDate": VALUATION_DATE,
                "units": "USD billions; ownership, retention floors and percentage gaps are decimal fractions"}
    if has_ownership:
        expected["ownershipVersion"] = OWNERSHIP_VERSION
    for key, value in expected.items():
        if analysis.get(key) != value:
            raise ValueError(f"Financing analysis has incompatible {key}.")
    snapshot, result = analysis["snapshot"], analysis["result"]
    exact(snapshot, ("case", "round") + (("ownership",) if has_ownership else ()), "snapshot")
    if has_ownership:
        ownership_constraint(snapshot["ownership"])
    case, terms = snapshot["case"], snapshot["round"]
    exact(case, ("company", "scenario", "assumptions", "bridge"), "model case")
    if case["company"] not in ("Anthropic", "OpenAI") or case["scenario"] not in ("Bear", "Base", "Bull"):
        raise ValueError("Financing analysis has unknown case identifiers.")
    keys = ("rev2026", "g1", "g2", "g3", "m27", "m30", "m36", "turns", "wacc", "tg", "roic", "stub", "tax")
    exact(case["assumptions"], keys, "operating assumptions")
    if not all(numeric(value) for value in case["assumptions"].values()):
        raise ValueError("Financing analysis must retain thirteen finite numeric assumptions.")
    p = case["assumptions"]
    if (not 0 < p["rev2026"] <= 10000 or not .05 <= p["turns"] <= 100
            or not 0 <= p["tg"] < p["wacc"] <= .60 or not p["tg"] < p["roic"] <= 1
            or not 0 <= p["tax"] < 1 or any(not 0 <= p[key] <= 2 for key in ("g1", "g2", "g3"))
            or any(not -1 <= p[key] <= 1 for key in ("m27", "m30", "m36"))
            or p["m36"] <= 0 or p["g3"] < p["tg"] or abs(p["stub"]) > 10000):
        raise ValueError("Financing analysis has operating assumptions outside the frozen model's supported bounds.")
    if case["bridge"] is not None:
        exact(case["bridge"], ("cash", "debt", "otherClaims"), "bridge")
        if not all(numeric(value) and 0 <= value <= 10000 for value in case["bridge"].values()):
            raise ValueError("Financing analysis has invalid bridge inputs.")
    exact(terms, ("basis", "quote", "primaryCapital", "holderStake"), "round terms")
    if (terms["basis"] not in ("pre", "post") or not all(numeric(terms[key]) for key in ("quote", "primaryCapital", "holderStake"))
            or not 0 < terms["quote"] <= 1e12 or not 0 <= terms["primaryCapital"] <= 1e12
            or not 0 <= terms["holderStake"] <= 1
            or (terms["basis"] == "post" and terms["quote"] <= terms["primaryCapital"])):
        raise ValueError("Financing analysis has invalid round terms.")
    pre_money = terms["quote"] if terms["basis"] == "pre" else terms["quote"] - terms["primaryCapital"]
    post_money = terms["quote"] if terms["basis"] == "post" else terms["quote"] + terms["primaryCapital"]
    if ((terms["basis"] == "post" and terms["primaryCapital"] > 0
         and pre_money <= 32 * 2.220446049250313e-16 * max(terms["quote"], terms["primaryCapital"]))
            or pre_money / post_money == 0 or (terms["primaryCapital"] > 0 and terms["primaryCapital"] / post_money == 0)):
        raise ValueError("Financing round cannot be reopened within the supported numeric precision.")
    result_keys = ("version", "assumptions", "baseline", "round", "pricing", "bridge", "comparison", "method", "warnings")
    exact(result, result_keys + (("ownership",) if has_ownership else ()), "result")
    exact(result["assumptions"], keys, "result assumptions")
    exact(result["round"], ("basis", "quote", "primaryCapital", "holderStake"), "result round")
    if (result["version"] != FINANCING_VERSION or result["assumptions"] != case["assumptions"]
            or result["round"] != terms or not all(numeric(value) for value in result["assumptions"].values())
            or not all(numeric(result["round"][key]) for key in ("quote", "primaryCapital", "holderStake"))):
        raise ValueError("Financing analysis snapshot and result disagree.")
    pricing_keys = ("preMoney", "postMoney", "primaryCapital", "existingOwnership", "newOwnership", "holderBefore",
                    "holderAfter", "otherExistingAfter", "holderDilution", "relativeDilution", "holderValueBefore", "holderValueAfter")
    exact(result["pricing"], pricing_keys, "pricing result")
    if not all(numeric(value) for value in result["pricing"].values()):
        raise ValueError("Financing analysis has a nonfinite pricing result.")
    fraction_keys = ("existingOwnership", "newOwnership", "holderBefore", "holderAfter", "otherExistingAfter", "holderDilution", "relativeDilution")
    if (any(not 0 <= result["pricing"][key] <= 1 for key in fraction_keys)
            or result["pricing"]["existingOwnership"] <= 0 or result["pricing"]["preMoney"] <= 0
            or result["pricing"]["postMoney"] <= 0 or result["pricing"]["primaryCapital"] != terms["primaryCapital"]
            or result["pricing"]["holderBefore"] != terms["holderStake"]):
        raise ValueError("Financing analysis has out-of-range pricing or ownership fields.")
    baseline_keys = ("rows", "stub_t", "pv_stub", "pv_explicit", "terminal_revenue", "terminal_nopat", "terminal_reinvestment_rate",
                     "terminal_fcf", "tv", "pvtv", "ev", "tv_share", "peak_funding_need", "terminal_t", "cagr",
                     "terminal_fcf_change", "implied_incremental_roic", "warnings")
    exact(result["baseline"], baseline_keys, "operating baseline")
    for key, value in result["baseline"].items():
        if key not in ("rows", "warnings") and not numeric(value) and not (key in ("tv_share", "terminal_fcf_change") and value is None):
            raise ValueError("Financing analysis has an incomplete numeric operating baseline.")
    if type(result["baseline"]["warnings"]) is not list or any(type(value) is not str for value in result["baseline"]["warnings"]):
        raise ValueError("Operating baseline warnings must be text explanations.")
    rows = result["baseline"]["rows"]
    if type(rows) is not list or len(rows) != 10 or not numeric(result["baseline"]["ev"]):
        raise ValueError("Financing analysis is missing its complete operating baseline.")
    row_keys = ("year", "revenue", "growth", "margin", "ebit", "tax", "nopat", "reinvestment", "fcf", "t", "df", "pv", "cumulative")
    for n, row in enumerate(rows, start=2027):
        exact(row, row_keys, "forecast row")
        if type(row["year"]) is not int or row["year"] != n or not all(numeric(value) for value in row.values()):
            raise ValueError("Financing analysis has an incomplete annual forecast.")
    if case["bridge"] is None:
        if result["bridge"] is not None or result["comparison"] is not None:
            raise ValueError("Financing analysis invents an equity comparison without a bridge.")
    else:
        exact(result["bridge"], ("ev", "cash", "debt", "otherClaims", "adjustment", "equityValue", "status"), "equity bridge result")
        if (any(result["bridge"][key] != value for key, value in case["bridge"].items())
                or any(not numeric(value) for key, value in result["bridge"].items() if key != "status")
                or result["bridge"]["status"] != "hypothetical"):
            raise ValueError("Financing analysis changes its explicit bridge inputs.")
        comparison_keys = ("modelPreMoneyEquity", "modelPostMoneyEquity", "cashBefore", "cashAfter", "operatingEvBefore",
                           "operatingEvAfter", "roundImpliedOperatingEv", "priceGap", "priceGapPercent")
        exact(result["comparison"], comparison_keys, "model comparison")
        if any(not numeric(value) and not (key == "priceGapPercent" and value is None)
               for key, value in result["comparison"].items()):
            raise ValueError("Financing analysis has a nonfinite model comparison.")
    expected_method = {"basis": "simple-primary-equity-round", "operatingValue": "perpetual-fcff", "proceeds": "retained-as-cash",
                       "fees": 0, "rights": "equal-participating", "bridgeStatus": "not-supplied" if case["bridge"] is None else "hypothetical"}
    exact(result["method"], expected_method, "financing method")
    if (result["method"] != expected_method or not numeric(result["method"]["fees"])
            or type(result["warnings"]) is not list or any(type(value) is not str for value in result["warnings"])):
        raise ValueError("Financing analysis has incompatible method metadata.")
    if has_ownership:
        check_ownership_metadata(result["ownership"], snapshot["ownership"], terms, result["pricing"])
    if type(analysis["limits"]) is not str or not analysis["limits"].strip():
        raise ValueError("Financing analysis is missing its scope statement.")
    if type(analysis["methodSources"]) is not list or not analysis["methodSources"]:
        raise ValueError("Financing analysis is missing its method references.")
    for source in analysis["methodSources"]:
        exact(source, ("publisher", "title", "url", "use", "reviewedOn"), "method reference")
        if any(type(value) is not str or not value.strip() for value in source.values()):
            raise ValueError("Financing analysis has incomplete method reference fields.")
        url = urlsplit(source["url"])
        if url.scheme != "https" or not url.netloc or url.username or url.password or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", source["reviewedOn"]):
            raise ValueError("Financing analysis has invalid method reference metadata.")
    share_url = analysis.get("shareUrl")
    prefix = APP + "index.html#financing="
    if not isinstance(share_url, str) or not share_url.startswith(prefix):
        raise ValueError("Financing analysis has an inconsistent reopening URL.")
    payload = token_payload(share_url[len(prefix):], 8192)
    payload_keys = ("schema", "financing", "model", "date", "case", "round")
    exact(payload, payload_keys + (("ownership", "ownershipVersion") if has_ownership else ()), "financing link payload")
    exact(payload["round"], terms, "financing link round")
    if (type(payload["schema"]) is not int or payload["schema"] != analysis["schema"]
            or payload["financing"] != FINANCING_VERSION or payload["model"] != MODEL_VERSION
            or not all(numeric(payload["round"][key]) for key in ("quote", "primaryCapital", "holderStake"))
            or payload["date"] != VALUATION_DATE or payload["round"] != terms):
        raise ValueError("Financing link does not reproduce the packaged round.")
    if has_ownership:
        ownership_constraint(payload["ownership"])
        if payload["ownershipVersion"] != OWNERSHIP_VERSION or payload["ownership"] != snapshot["ownership"]:
            raise ValueError("Financing link does not reproduce the packaged ownership floor.")
    model_payload = token_payload(payload["case"], 4096)
    expected_case = {"schema": 1, "model": MODEL_VERSION, "date": VALUATION_DATE, "company": case["company"],
                     "scenario": case["scenario"], "inputs": [case["assumptions"][key] for key in keys], "bridge": case["bridge"]}
    exact(model_payload, expected_case, "linked operating case")
    if (type(model_payload["schema"]) is not int or type(model_payload["inputs"]) is not list
            or not all(numeric(value) for value in model_payload["inputs"]) or model_payload != expected_case):
        raise ValueError("Financing link does not reproduce all assumptions and the explicit bridge.")
    if model_payload["bridge"] is not None:
        exact(model_payload["bridge"], ("cash", "debt", "otherClaims"), "linked bridge")
        if not all(numeric(value) for value in model_payload["bridge"].values()):
            raise ValueError("Financing link has nonnumeric hypothetical bridge inputs.")


def check_horizon_metadata(path):
    """Check the packaged analysis contract; arithmetic verification is separate."""
    analysis = json.loads(path.read_text(encoding="utf-8"))
    expected = {"schema": 1, "kind": "frontier-value-horizon", "appVersion": APP_VERSION,
                "modelVersion": MODEL_VERSION, "valuationDate": VALUATION_DATE}
    for key, value in expected.items():
        if analysis.get(key) != value:
            raise ValueError(f"Horizon analysis has incompatible {key}.")
    snapshot, result = analysis["snapshot"], analysis["result"]
    years = snapshot["years"]
    if type(years) is not int or not 0 <= years <= 100:
        raise ValueError("Horizon analysis has invalid continuation years.")
    curve = result["curve"]
    if (len(curve) != 101 or any(point["years"] != n or point["throughYear"] != 2036 + n
                                 for n, point in enumerate(curve))):
        raise ValueError("Horizon analysis does not include its complete annual curve.")
    if (result["years"] != years or result["target"] != snapshot["target"]
            or result["assumptions"] != snapshot["case"]["assumptions"]
            or result["selected"] != curve[years]):
        raise ValueError("Horizon analysis snapshot and selected result disagree.")
    if analysis.get("reopenUrl") != HORIZON + "#horizon=" + analysis["token"]:
        raise ValueError("Horizon analysis has an inconsistent reopening link.")


class OpeningLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        self.urls.extend(value for key, value in attrs if key in {"href", "src"} and value)


def check_opening_links(destination):
    for name in ("START_HERE.html", "index.html"):
        parser = OpeningLinks()
        parser.feed((destination / name).read_text(encoding="utf-8"))
        if any(url not in parser.urls for url in (OWNERSHIP, FINANCING, HORIZON, CASEBOOK, PORTFOLIO)):
            raise ValueError(f"{name} is missing a workspace or portfolio destination.")
        for value in parser.urls:
            url = urlsplit(value)
            if url.scheme in {"http", "https"}:
                if not url.netloc or url.username or url.password:
                    raise ValueError(f"Invalid external opening link in {name}.")
                continue  # File verification does not assert network availability.
            if url.scheme or url.netloc:
                raise ValueError(f"Unsupported opening link in {name}: {value}")
            if not url.path:
                continue
            target = (destination / unquote(url.path)).resolve()
            if not target.is_relative_to(destination) or not target.is_file():
                raise ValueError(f"Broken local opening link in {name}: {value}")


def verify_delivery(destination, expected_sources=None):
    """Read-only manifest, local navigation and analysis-contract verification."""
    manifest = json.loads((destination / MANIFEST_NAME).read_text(encoding="utf-8"))
    expected_metadata = {"appVersion": APP_VERSION, "modelVersion": MODEL_VERSION,
                         "financingVersion": FINANCING_VERSION, "ownershipVersion": OWNERSHIP_VERSION,
                         "valuationDate": VALUATION_DATE, "demo": OWNERSHIP, "ownership": OWNERSHIP, "financing": FINANCING,
                         "horizon": HORIZON, "casebook": CASEBOOK, "thesis": THESIS,
                         "workbench": APP, "repository": REPO, "portfolio": PORTFOLIO}
    for key, value in expected_metadata.items():
        if manifest.get(key) != value:
            raise ValueError(f"Desktop manifest has incompatible {key}.")
    members = [p for p in destination.rglob("*") if p.is_file()]
    if any(p.is_symlink() for p in destination.rglob("*")):
        raise ValueError("Desktop package must contain regular files, not symbolic links.")
    actual = {p.relative_to(destination).as_posix(): digest(p)
              for p in members if p.relative_to(destination).as_posix() != MANIFEST_NAME}
    expected = manifest.get("files")
    if not isinstance(expected, dict) or actual != expected:
        raise ValueError("Desktop file membership or bytes do not match SHA256_manifest.json.")
    required = set(source_files()) | set(SHORTCUTS) | {"START_HERE.html", "index.html"}
    if set(actual) != required:
        raise ValueError("Desktop package does not contain the complete release handoff.")
    if expected_sources is not None:
        for relative, source in expected_sources.items():
            if actual[relative] != digest(source):
                raise ValueError(f"Copied file differs from its source: {relative}")
    for name, url in SHORTCUTS.items():
        if plistlib.loads((destination / name).read_bytes()) != {"URL": url}:
            raise ValueError(f"Incorrect desktop shortcut: {name}")
    if (destination / "START_HERE.html").read_bytes() != (destination / "index.html").read_bytes():
        raise ValueError("The two desktop opening pages disagree.")
    check_opening_links(destination)
    check_financing_metadata(destination / "downloads/Frontier_AI_Financing_Lens.json", require_ownership=True)
    check_horizon_metadata(destination / "downloads/Frontier_AI_Value_Horizon.json")
    return {"destination": str(destination), "files": len(actual),
            "appVersion": APP_VERSION, "status": "verified"}


def opening_page():
    navigation = [("Overview", APP + "index.html#research-story"),
                  ("Model", APP + "index.html#workspace"), ("Thesis Lab", THESIS),
                  ("Value Horizon", HORIZON), ("Casebook", CASEBOOK),
                  ("Evidence", APP + "index.html#sources")]
    nav = "".join(f'<a href="{url}">{label}</a>' for label, url in navigation)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ownership Frontier · Frontier AI Valuation Lab</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f4f3eb;color:#20382f;font:16px/1.7 system-ui,sans-serif}}main{{max-width:900px;margin:4vh auto;padding:32px}}h1{{font:clamp(38px,7vw,66px)/1.06 Georgia,serif;letter-spacing:-2px;margin:28px 0 22px;max-width:720px}}h2{{font:28px/1.2 Georgia,serif;margin-top:34px}}a{{color:#21654c;text-underline-offset:4px}}a:focus-visible{{outline:3px solid #b26842;outline-offset:5px}}.tag{{font:11px/1.7 monospace;letter-spacing:1.5px;color:#68755e}}nav{{display:flex;gap:12px 20px;flex-wrap:wrap;border-bottom:1px solid #c6cfbc;padding:18px 0;font-size:12px}}.lead{{max-width:710px;color:#4f6457}}.card{{border:1px solid #b9cab3;background:#e9ede0;padding:22px 26px;margin:26px 0}}.card>a{{font-size:19px;font-weight:650}}.card p{{font-size:14px;margin-bottom:0}}img{{display:block;width:100%;height:auto;border:1px solid #cad2c3;margin:24px 0}}ul{{padding-left:22px}}li{{margin:9px 0}}.downloads{{display:grid;grid-template-columns:1fr 1fr;gap:16px 35px}}.downloads h2{{font-size:25px}}.downloads ul{{font-size:14px}}small{{color:#5e715f}}footer{{border-top:1px solid #c6cfbc;margin-top:32px;padding-top:18px}}@media(max-width:600px){{main{{padding:22px}}.downloads{{grid-template-columns:1fr;gap:0}}h1{{letter-spacing:-1.3px}}.card{{padding:20px}}}}
</style></head><body><main>
<div class="tag">CHARLES DAI / FINTECH / APPLICATION {APP_VERSION}</div>
<nav aria-label="Open the research workspace">{nav}</nav>
<h1>How much capital fits your ownership floor?</h1>
<p class="lead">Explore a fixed-quote primary round in Financing Lens. Set the fraction of starting ownership to retain, trace the capital-versus-ownership curve and compare your current round with the analytical boundary.</p>
<div class="card"><a href="{OWNERSHIP}">Open Ownership Frontier ↗</a><p>The hypothetical example uses a $250B pre-money quote, $25B primary capital, a 10% starting holder and a 90% retention floor. The floor means keeping 90% of starting stakes; the tracked holder's corresponding floor is 9% of the company.</p></div>
<img src="Ownership_Frontier_Preview.png" alt="Ownership Frontier in Financing Lens: retained ownership curve, current round, chosen retention floor and capital boundary." width="1440">
<div class="downloads"><section><h2>The ownership example</h2><ul>
<li><a href="downloads/Frontier_AI_Financing_Lens.pdf">Financing and Ownership Frontier brief · PDF</a></li>
<li><a href="downloads/Frontier_AI_Financing_Lens.html">Script-free brief, ownership curve and exact reopening link</a></li>
<li><a href="downloads/Frontier_AI_Financing_Lens.json" download>Complete financing and ownership snapshot · JSON</a></li>
<li><a href="Ownership_Frontier_Methodology.md">Ownership constraint, curve and numerical boundaries</a></li>
<li><a href="Financing_Lens_Methodology.md">Financing formulas, sources and boundaries</a></li>
<li><a href="{FINANCING}">Open the ordinary Financing Lens example</a></li>
</ul><p><small>The new exact link adds the selected retention floor to all thirteen operating assumptions, the explicit bridge and the four round fields. One primary round, equal participating rights, no existing-holder subscriptions, zero fees and retained cash are assumed. The capital boundary is conditional on the entered quote and floor; it does not estimate financing need or availability.</small></p>
<h2>The Horizon example</h2><ul>
<li><a href="{HORIZON}">Open Value Horizon · inspect a finite continuation</a></li>
<li><a href="downloads/Frontier_AI_Value_Horizon.pdf">Worked Value Horizon brief · PDF</a></li>
<li><a href="downloads/Frontier_AI_Value_Horizon.html">Script-free HTML brief with exact reopening link</a></li>
<li><a href="downloads/Frontier_AI_Value_Horizon.json" download>Complete Horizon analysis · JSON</a></li>
<li><a href="Value_Horizon_Methodology.md">Formula, timing and verification method</a></li>
</ul><p><small>Anthropic Base, ten continuation years and an illustrative $250B target. Horizon JSON is a separate analysis format; use its reopening link to restore the chosen years and target.</small></p>
<h2>Continue the research</h2><ul>
<li><a href="{THESIS}">Thesis Lab · explain changes and solve margin requirements</a></li>
<li><a href="{CASEBOOK}">Research Casebook · preserve the argument and evidence</a></li>
<li><a href="downloads/Frontier_AI_Research_Brief.pdf">Worked research argument · PDF</a></li>
<li><a href="downloads/Frontier_AI_Research_Brief.html">Standalone research argument with exact reopening link</a></li>
<li><a href="downloads/Frontier_AI_Research_Casebook.json" download>Illustrative analyses · importable Casebook JSON</a></li>
</ul></section><section><h2>The existing model and evidence</h2><ul>
<li><a href="{APP}">Company comparison, stress tests and complete Model</a></li>
<li><a href="downloads/Frontier_AI_Thesis_Comparison.pdf">Anthropic Base-to-Bull comparison · PDF</a></li>
<li><a href="downloads/Frontier_AI_Thesis_Comparison.html">Standalone comparison with exact reopening link</a></li>
<li><a href="downloads/Frontier_AI_Valuation_Model.xlsx">Editable Excel model · reviewed version 3.0</a></li>
<li><a href="downloads/Frontier_AI_Valuation_Review.pdf">Research and financial review · PDF</a></li>
<li><a href="report.html">Offline-readable research report</a></li>
<li><a href="README.txt">Desktop guide and local run instructions</a></li>
</ul><h2>Project and portfolio</h2><ul>
<li><a href="{PORTFOLIO}">Charles Dai · fintech portfolio</a></li>
<li><a href="https://ult666666.github.io/projects/frontier-ai-valuation-lab.html">Full project case study</a></li>
<li><a href="{REPO}">GitHub project source</a></li>
<li><a href="{REPO}/blob/main/docs/VERIFICATION.md">Verification record and scope</a></li>
<li><a href="{REPO}/releases">Release history and artifacts</a></li>
</ul></section></div>
<footer><small>Application {APP_VERSION}; financial engine {MODEL_VERSION}; financing method {FINANCING_VERSION}; ownership method {OWNERSHIP_VERSION}. Valuation date: 18 October 2026. Amounts are USD billions. Research and implementation developed with AI assistance. Financing terms, balances and retention floors are hypothetical; a quoted stake value is not an investment return. Retained primary cash raises modeled equity and cash equally while operating EV stays fixed. A continuation cutoff is a conditional assumption, not a company lifespan. The reviewed workbook and company-research snapshot remain dated. Casebook storage belongs to the current browser; export JSON to move saved reasoning across devices. Original desktop files and earlier handoffs are preserved.</small></footer>
</main></body></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument("--verify", action="store_true", help="Verify an existing package without writing files or using the network.")
    args = parser.parse_args()
    destination = args.destination.expanduser().resolve()
    if args.verify:
        print(json.dumps(verify_delivery(destination)))
        return
    files = source_files()
    for source in files.values():
        if not source.is_file() or source.stat().st_size == 0:
            raise FileNotFoundError(f"Required source file is missing or empty: {source}")
    check_horizon_metadata(files["downloads/Frontier_AI_Value_Horizon.json"])
    check_financing_metadata(files["downloads/Frontier_AI_Financing_Lens.json"], require_ownership=True)
    destination.mkdir(parents=True, exist_ok=False)
    for relative, source in files.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    # The offline report's workstation link also opens this explicit live guide.
    landing = opening_page()
    for name in ("START_HERE.html", "index.html"):
        (destination / name).write_text(landing, encoding="utf-8")
    for name, url in SHORTCUTS.items():
        (destination / name).write_bytes(plistlib.dumps({"URL": url}))
    manifest = {
        "appVersion": APP_VERSION, "modelVersion": MODEL_VERSION, "valuationDate": VALUATION_DATE,
        "financingVersion": FINANCING_VERSION, "ownershipVersion": OWNERSHIP_VERSION,
        "demo": OWNERSHIP, "ownership": OWNERSHIP, "financing": FINANCING, "horizon": HORIZON, "casebook": CASEBOOK, "thesis": THESIS,
        "workbench": APP, "repository": REPO, "portfolio": PORTFOLIO,
        "files": {p.relative_to(destination).as_posix(): digest(p)
                  for p in sorted(destination.rglob("*")) if p.is_file()},
    }
    (destination / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    report = verify_delivery(destination, expected_sources=files)
    report.update(status="created", verified=True)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
