#!/usr/bin/env python3
"""Create or verify a separate, versioned desktop handoff without altering legacy files."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import plistlib
import shutil
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
APP_VERSION = "3.4.0"
MODEL_VERSION = "3.0.0"
VALUATION_DATE = "2026-10-18"
APP = "https://frontier-ai-valuation-lab.vercel.app/"
HORIZON = APP + "horizon.html"
THESIS = APP + "thesis.html"
CASEBOOK = APP + "casebook.html"
REPO = "https://github.com/ult666666/frontier-ai-valuation-lab"
PORTFOLIO = "https://ult666666.github.io/fintech.html"
DEFAULT_DESTINATION = Path.home() / "Desktop/Anthropic-vs-OpenAI-Valuation/Value_Horizon_V3_4_2026-10-19"
MANIFEST_NAME = "SHA256_manifest.json"
SHORTCUTS = {
    "Open_Live_Demo.webloc": HORIZON,
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
        if HORIZON not in parser.urls or CASEBOOK not in parser.urls or PORTFOLIO not in parser.urls:
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
                         "valuationDate": VALUATION_DATE, "demo": HORIZON,
                         "horizon": HORIZON, "casebook": CASEBOOK, "thesis": THESIS,
                         "workbench": APP, "repository": REPO, "portfolio": PORTFOLIO}
    for key, value in expected_metadata.items():
        if manifest.get(key) != value:
            raise ValueError(f"Desktop manifest has incompatible {key}.")
    members = [p for p in destination.rglob("*") if p.is_file()]
    if any(p.is_symlink() for p in destination.rglob("*")):
        raise ValueError("Desktop package must contain regular files, not symbolic links.")
    actual = {p.relative_to(destination).as_posix(): digest(p)
              for p in members if p.name != MANIFEST_NAME}
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
<title>Value Horizon · Frontier AI Valuation Lab</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f4f3eb;color:#20382f;font:16px/1.7 system-ui,sans-serif}}main{{max-width:900px;margin:4vh auto;padding:32px}}h1{{font:clamp(38px,7vw,66px)/1.06 Georgia,serif;letter-spacing:-2px;margin:28px 0 22px;max-width:720px}}h2{{font:28px/1.2 Georgia,serif;margin-top:34px}}a{{color:#21654c;text-underline-offset:4px}}a:focus-visible{{outline:3px solid #b26842;outline-offset:5px}}.tag{{font:11px/1.7 monospace;letter-spacing:1.5px;color:#68755e}}nav{{display:flex;gap:12px 20px;flex-wrap:wrap;border-bottom:1px solid #c6cfbc;padding:18px 0;font-size:12px}}.lead{{max-width:710px;color:#4f6457}}.card{{border:1px solid #b9cab3;background:#e9ede0;padding:22px 26px;margin:26px 0}}.card>a{{font-size:19px;font-weight:650}}.card p{{font-size:14px;margin-bottom:0}}img{{display:block;width:100%;height:auto;border:1px solid #cad2c3;margin:24px 0}}ul{{padding-left:22px}}li{{margin:9px 0}}.downloads{{display:grid;grid-template-columns:1fr 1fr;gap:16px 35px}}.downloads h2{{font-size:25px}}.downloads ul{{font-size:14px}}small{{color:#5e715f}}footer{{border-top:1px solid #c6cfbc;margin-top:32px;padding-top:18px}}@media(max-width:600px){{main{{padding:22px}}.downloads{{grid-template-columns:1fr;gap:0}}h1{{letter-spacing:-1.3px}}.card{{padding:20px}}}}
</style></head><body><main>
<div class="tag">CHARLES DAI / FINTECH / APPLICATION {APP_VERSION}</div>
<nav aria-label="Open the research workspace">{nav}</nav>
<h1>How much future is in the value?</h1>
<p class="lead">Keep the operating forecast fixed. Choose how many later cash-flow years to retain and inspect the value remaining with zero residual after the cutoff.</p>
<div class="card"><a href="{HORIZON}">Open Value Horizon ↗</a><p>Compare the finite value with the perpetual reference, inspect the forecast and continuation separately, and test the whole-year requirement for an illustrative operating-EV target.</p></div>
<img src="Value_Horizon_Preview.png" alt="Value Horizon preview: the selected finite value, perpetual reference and later present value excluded." width="1200" height="630">
<div class="downloads"><section><h2>The Horizon example</h2><ul>
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
<footer><small>Application {APP_VERSION}; financial engine {MODEL_VERSION}. Valuation date: 18 October 2026. Amounts are USD billions. Independent research and implementation developed with AI assistance. A selected continuation cutoff is a conditional assumption, not a company lifespan or survival probability. The original perpetual baseline, reviewed workbook and company-research snapshot remain dated. Casebook storage belongs to the current browser; export JSON to move saved reasoning across devices. Original desktop files and earlier handoffs are preserved.</small></footer>
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
        "demo": HORIZON, "horizon": HORIZON, "casebook": CASEBOOK, "thesis": THESIS,
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
