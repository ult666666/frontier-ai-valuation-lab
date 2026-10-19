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
APP_VERSION = "3.5.0"
FINANCING_VERSION = "1.0.0"
MODEL_VERSION = "3.0.0"
VALUATION_DATE = "2026-10-18"
APP = "https://frontier-ai-valuation-lab.vercel.app/"
FINANCING = APP + "index.html#financing-example"
HORIZON = APP + "horizon.html"
THESIS = APP + "thesis.html"
CASEBOOK = APP + "casebook.html"
REPO = "https://github.com/ult666666/frontier-ai-valuation-lab"
PORTFOLIO = "https://ult666666.github.io/fintech.html"
DEFAULT_DESTINATION = Path.home() / "Desktop/Anthropic-vs-OpenAI-Valuation/Financing_Lens_V3_5_2026-10-19"
MANIFEST_NAME = "SHA256_manifest.json"
SHORTCUTS = {
    "Open_Live_Demo.webloc": FINANCING,
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


def check_financing_metadata(path):
    """Verify complete inputs, result structure and exact link; arithmetic is checked separately."""
    def reject_constant(value):
        raise ValueError(f"Financing analysis contains non-JSON numeric constant {value}.")

    def exact(value, keys, label):
        if type(value) is not dict or set(value) != set(keys):
            raise ValueError(f"Financing analysis has incomplete or unsupported {label}.")

    def numeric(value):
        return type(value) in (int, float) and math.isfinite(value)

    def token_payload(token, limit):
        if not isinstance(token, str) or not 0 < len(token) <= limit or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
            raise ValueError("Financing analysis has a malformed share token.")
        decoded = base64.b64decode(token + "=" * (-len(token) % 4), altchars=b"-_", validate=True)
        return json.loads(decoded.decode("utf-8"), parse_constant=reject_constant)

    analysis = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    expected = {"schema": 1, "kind": "frontier-financing-lens", "appVersion": APP_VERSION,
                "financingVersion": FINANCING_VERSION, "modelVersion": MODEL_VERSION,
                "valuationDate": VALUATION_DATE}
    for key, value in expected.items():
        if analysis.get(key) != value:
            raise ValueError(f"Financing analysis has incompatible {key}.")
    snapshot, result = analysis["snapshot"], analysis["result"]
    exact(snapshot, ("case", "round"), "snapshot")
    case, terms = snapshot["case"], snapshot["round"]
    exact(case, ("company", "scenario", "assumptions", "bridge"), "model case")
    if case["company"] not in ("Anthropic", "OpenAI") or case["scenario"] not in ("Bear", "Base", "Bull"):
        raise ValueError("Financing analysis has unknown case identifiers.")
    keys = ("rev2026", "g1", "g2", "g3", "m27", "m30", "m36", "turns", "wacc", "tg", "roic", "stub", "tax")
    exact(case["assumptions"], keys, "operating assumptions")
    if not all(numeric(value) for value in case["assumptions"].values()):
        raise ValueError("Financing analysis must retain thirteen finite numeric assumptions.")
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
    exact(result, ("version", "assumptions", "baseline", "round", "pricing", "bridge", "comparison", "method", "warnings"), "result")
    if (result["version"] != FINANCING_VERSION or result["assumptions"] != case["assumptions"]
            or result["round"] != terms):
        raise ValueError("Financing analysis snapshot and result disagree.")
    pricing_keys = ("preMoney", "postMoney", "primaryCapital", "existingOwnership", "newOwnership", "holderBefore",
                    "holderAfter", "otherExistingAfter", "holderDilution", "relativeDilution", "holderValueBefore", "holderValueAfter")
    exact(result["pricing"], pricing_keys, "pricing result")
    if not all(numeric(value) for value in result["pricing"].values()):
        raise ValueError("Financing analysis has a nonfinite pricing result.")
    baseline_keys = ("rows", "stub_t", "pv_stub", "pv_explicit", "terminal_revenue", "terminal_nopat", "terminal_reinvestment_rate",
                     "terminal_fcf", "tv", "pvtv", "ev", "tv_share", "peak_funding_need", "terminal_t", "cagr",
                     "terminal_fcf_change", "implied_incremental_roic", "warnings")
    exact(result["baseline"], baseline_keys, "operating baseline")
    rows = result["baseline"]["rows"]
    if type(rows) is not list or len(rows) != 10 or not numeric(result["baseline"]["ev"]):
        raise ValueError("Financing analysis is missing its complete operating baseline.")
    row_keys = ("year", "revenue", "growth", "margin", "ebit", "tax", "nopat", "reinvestment", "fcf", "t", "df", "pv", "cumulative")
    for n, row in enumerate(rows, start=2027):
        exact(row, row_keys, "forecast row")
        if row["year"] != n or not all(numeric(value) for value in row.values()):
            raise ValueError("Financing analysis has an incomplete annual forecast.")
    if case["bridge"] is None:
        if result["bridge"] is not None or result["comparison"] is not None:
            raise ValueError("Financing analysis invents an equity comparison without a bridge.")
    else:
        exact(result["bridge"], ("ev", "cash", "debt", "otherClaims", "adjustment", "equityValue", "status"), "equity bridge result")
        if any(result["bridge"][key] != value for key, value in case["bridge"].items()):
            raise ValueError("Financing analysis changes its explicit bridge inputs.")
        comparison_keys = ("modelPreMoneyEquity", "modelPostMoneyEquity", "cashBefore", "cashAfter", "operatingEvBefore",
                           "operatingEvAfter", "roundImpliedOperatingEv", "priceGap", "priceGapPercent")
        exact(result["comparison"], comparison_keys, "model comparison")
        if any(not numeric(value) and not (key == "priceGapPercent" and value is None)
               for key, value in result["comparison"].items()):
            raise ValueError("Financing analysis has a nonfinite model comparison.")
    expected_method = {"basis": "simple-primary-equity-round", "operatingValue": "perpetual-fcff", "proceeds": "retained-as-cash",
                       "fees": 0, "rights": "equal-participating", "bridgeStatus": "not-supplied" if case["bridge"] is None else "hypothetical"}
    if result["method"] != expected_method or type(result["warnings"]) is not list:
        raise ValueError("Financing analysis has incompatible method metadata.")
    share_url = analysis.get("shareUrl")
    prefix = APP + "index.html#financing="
    if not isinstance(share_url, str) or not share_url.startswith(prefix):
        raise ValueError("Financing analysis has an inconsistent reopening URL.")
    payload = token_payload(share_url[len(prefix):], 8192)
    exact(payload, ("schema", "financing", "model", "date", "case", "round"), "financing link payload")
    if (payload["schema"] != 1 or payload["financing"] != FINANCING_VERSION or payload["model"] != MODEL_VERSION
            or payload["date"] != VALUATION_DATE or payload["round"] != terms):
        raise ValueError("Financing link does not reproduce the packaged round.")
    model_payload = token_payload(payload["case"], 4096)
    expected_case = {"schema": 1, "model": MODEL_VERSION, "date": VALUATION_DATE, "company": case["company"],
                     "scenario": case["scenario"], "inputs": [case["assumptions"][key] for key in keys], "bridge": case["bridge"]}
    if model_payload != expected_case:
        raise ValueError("Financing link does not reproduce all assumptions and the explicit bridge.")


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
        if any(url not in parser.urls for url in (FINANCING, HORIZON, CASEBOOK, PORTFOLIO)):
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
                         "valuationDate": VALUATION_DATE, "demo": FINANCING, "financing": FINANCING,
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
    check_financing_metadata(destination / "downloads/Frontier_AI_Financing_Lens.json")
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
<title>Financing Lens · Frontier AI Valuation Lab</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f4f3eb;color:#20382f;font:16px/1.7 system-ui,sans-serif}}main{{max-width:900px;margin:4vh auto;padding:32px}}h1{{font:clamp(38px,7vw,66px)/1.06 Georgia,serif;letter-spacing:-2px;margin:28px 0 22px;max-width:720px}}h2{{font:28px/1.2 Georgia,serif;margin-top:34px}}a{{color:#21654c;text-underline-offset:4px}}a:focus-visible{{outline:3px solid #b26842;outline-offset:5px}}.tag{{font:11px/1.7 monospace;letter-spacing:1.5px;color:#68755e}}nav{{display:flex;gap:12px 20px;flex-wrap:wrap;border-bottom:1px solid #c6cfbc;padding:18px 0;font-size:12px}}.lead{{max-width:710px;color:#4f6457}}.card{{border:1px solid #b9cab3;background:#e9ede0;padding:22px 26px;margin:26px 0}}.card>a{{font-size:19px;font-weight:650}}.card p{{font-size:14px;margin-bottom:0}}img{{display:block;width:100%;height:auto;border:1px solid #cad2c3;margin:24px 0}}ul{{padding-left:22px}}li{{margin:9px 0}}.downloads{{display:grid;grid-template-columns:1fr 1fr;gap:16px 35px}}.downloads h2{{font-size:25px}}.downloads ul{{font-size:14px}}small{{color:#5e715f}}footer{{border-top:1px solid #c6cfbc;margin-top:32px;padding-top:18px}}@media(max-width:600px){{main{{padding:22px}}.downloads{{grid-template-columns:1fr;gap:0}}h1{{letter-spacing:-1.3px}}.card{{padding:20px}}}}
</style></head><body><main>
<div class="tag">CHARLES DAI / FINTECH / APPLICATION {APP_VERSION}</div>
<nav aria-label="Open the research workspace">{nav}</nav>
<h1>From value to ownership.</h1>
<p class="lead">Trace a hypothetical financing round from its quoted price to the ownership it creates. Keep the operating forecast, assumed cash bridge and new primary capital visible at every step.</p>
<div class="card"><a href="{FINANCING}">Open Financing Lens ↗</a><p>Explore the worked example inside the Model: a $250B pre-money quote, $25B primary capital and a 10% existing holder. Cash, debt and round terms are explicitly hypothetical.</p></div>
<img src="Financing_Lens_Preview.png" alt="Financing Lens preview: pre-money price, retained primary capital, post-money price and ownership reconciliation." width="1440">
<div class="downloads"><section><h2>The financing example</h2><ul>
<li><a href="downloads/Frontier_AI_Financing_Lens.pdf">Worked Financing Lens brief · PDF</a></li>
<li><a href="downloads/Frontier_AI_Financing_Lens.html">Script-free financing brief with exact reopening link</a></li>
<li><a href="downloads/Frontier_AI_Financing_Lens.json" download>Complete financing snapshot and result · JSON</a></li>
<li><a href="Financing_Lens_Methodology.md">Financing formulas, sources and boundaries</a></li>
</ul><p><small>One primary round, equal participating rights, zero fees and retained proceeds. The independent round price is separate from modeled equity. The financing link preserves all thirteen operating assumptions, the explicit bridge and exact round; ordinary scenario and Casebook formats carry the operating case only.</small></p>
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
<footer><small>Application {APP_VERSION}; financial engine {MODEL_VERSION}. Valuation date: 18 October 2026. Amounts are USD billions. Research and implementation developed with AI assistance. Financing terms and balances are hypothetical; a quoted stake value is not an investment return. Retained primary cash raises modeled equity and cash equally while operating EV stays fixed. A continuation cutoff is a conditional assumption, not a company lifespan. The reviewed workbook and company-research snapshot remain dated. Casebook storage belongs to the current browser; export JSON to move saved reasoning across devices. Original desktop files and earlier handoffs are preserved.</small></footer>
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
    check_financing_metadata(files["downloads/Frontier_AI_Financing_Lens.json"])
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
        "demo": FINANCING, "financing": FINANCING, "horizon": HORIZON, "casebook": CASEBOOK, "thesis": THESIS,
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
