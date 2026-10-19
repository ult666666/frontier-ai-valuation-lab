#!/usr/bin/env python3
"""Create a separate, versioned desktop handoff without altering legacy files."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shutil

ROOT = Path(__file__).resolve().parents[1]
APP = "https://frontier-ai-valuation-lab.vercel.app/"
THESIS = APP + "thesis.html"
CASEBOOK = APP + "casebook.html"
REPO = "https://github.com/ult666666/frontier-ai-valuation-lab"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=Path.home() / "Desktop/Anthropic-vs-OpenAI-Valuation/Research_Workspace_V3_3_2026-10-19")
    args = parser.parse_args()
    destination = args.destination.expanduser().resolve()
    files = {
        "report.html": ROOT / "public/report.html",
        "downloads/Frontier_AI_Valuation_Model.xlsx": ROOT / "public/downloads/Frontier_AI_Valuation_Model.xlsx",
        "downloads/Frontier_AI_Valuation_Review.pdf": ROOT / "public/downloads/Frontier_AI_Valuation_Review.pdf",
        "downloads/Frontier_AI_Thesis_Comparison.html": ROOT / "public/downloads/Frontier_AI_Thesis_Comparison.html",
        "downloads/Frontier_AI_Thesis_Comparison.pdf": ROOT / "public/downloads/Frontier_AI_Thesis_Comparison.pdf",
        "downloads/Frontier_AI_Research_Brief.html": ROOT / "public/downloads/Frontier_AI_Research_Brief.html",
        "downloads/Frontier_AI_Research_Brief.pdf": ROOT / "public/downloads/Frontier_AI_Research_Brief.pdf",
        "downloads/Frontier_AI_Research_Casebook.json": ROOT / "public/downloads/Frontier_AI_Research_Casebook.json",
        "evidence_context.json": ROOT / "public/data/evidence.json",
        "Research_Casebook_Preview.png": ROOT / "public/assets/casebook-preview.png",
        "model_assumptions.json": ROOT / "data/presets.json",
        "model_results.json": ROOT / "public/data/current-results.json",
        "source_register.json": ROOT / "data/research.json",
        "README.txt": ROOT / "docs/DESKTOP_GUIDE.md",
        "Thesis_Lab_Preview.png": ROOT / "public/assets/thesis-preview.png",
    }
    for source in files.values():
        if not source.is_file():
            raise FileNotFoundError(source)
    destination.mkdir(parents=True, exist_ok=False)
    for relative, source in files.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    # The report's local workstation link resolves to this guide, which opens the
    # hosted module-based application through an ordinary explicit link.
    landing = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Frontier AI Valuation Lab</title>
<style>body{{margin:0;background:#f6f4ee;color:#20302d;font:17px/1.7 system-ui,sans-serif}}main{{max-width:760px;margin:8vh auto;padding:32px}}h1{{font:52px/1.1 Georgia,serif;letter-spacing:-2px}}a{{color:#17675d;text-underline-offset:4px}}.tag{{font-size:12px;letter-spacing:2px;color:#ab5c40}}.card{{border:1px solid #d4d9d1;padding:24px;margin:25px 0}}li{{margin:9px 0}}small{{color:#63716d}}</style>
<main><div class="tag">CHARLES DAI / FINTECH / APPLICATION 3.3.0</div><h1>Keep the reasoning.</h1><p>A complete research workspace: compare, test, inspect and preserve the argument behind an AI valuation.</p><div class="card"><strong><a href="{CASEBOOK}">Open Research Casebook ↗</a></strong><p>Capture exact cases and comparisons, record what needs to hold, attach dated sources, and export the complete argument. Download the example casebook below and import it explicitly to explore three labeled research examples.</p></div><ul><li><a href="downloads/Frontier_AI_Research_Brief.pdf">Worked research argument · PDF</a></li><li><a href="downloads/Frontier_AI_Research_Brief.html">Standalone research argument with exact reopening link</a></li><li><a href="downloads/Frontier_AI_Research_Casebook.json" download>Three illustrative analyses · importable Casebook JSON</a></li><li><a href="{THESIS}">Thesis Lab · explain changes and solve target requirements</a></li><li><a href="downloads/Frontier_AI_Thesis_Comparison.pdf">Three-page comparison example · Anthropic Base to Bull</a></li><li><a href="downloads/Frontier_AI_Thesis_Comparison.html">Standalone comparison example with exact reopening link</a></li><li><a href="{APP}">Company comparison, stress tests and complete valuation model</a></li><li><a href="downloads/Frontier_AI_Valuation_Model.xlsx">Editable Excel model · reviewed version 3.0</a></li><li><a href="downloads/Frontier_AI_Valuation_Review.pdf">Nine-page research and review snapshot</a></li><li><a href="report.html">Read the research report in your browser</a></li><li><a href="{REPO}/releases/tag/v3.3.0">GitHub release, source and verification</a></li><li><a href="https://ult666666.github.io/projects/frontier-ai-valuation-lab.html">Portfolio case study</a></li></ul><p><small>Application 3.3.0; financial engine 3.0.0. Valuation date: 18 October 2026. USD billions. Attribution describes conditional model changes; the landscape assigns no scenario probabilities. Saved research belongs to the current browser; export JSON to move notes and calculations across devices. The research snapshot and reviewed workbook remain dated. Original desktop files and earlier handoffs are preserved.</small></p></main></html>'''
    (destination / "START_HERE.html").write_text(landing, encoding="utf-8")
    (destination / "index.html").write_text(landing, encoding="utf-8")
    (destination / "Open_Live_Demo.webloc").write_bytes(plistlib.dumps({"URL": CASEBOOK}))
    (destination / "Open_Valuation_Model.webloc").write_bytes(plistlib.dumps({"URL": APP}))
    (destination / "Open_Thesis_Lab.webloc").write_bytes(plistlib.dumps({"URL": THESIS}))
    manifest = {
        "appVersion": "3.3.0", "modelVersion": "3.0.0", "valuationDate": "2026-10-18", "demo": CASEBOOK, "thesis": THESIS, "workbench": APP, "repository": REPO,
        "files": {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in sorted(destination.rglob("*")) if p.is_file()},
    }
    (destination / "SHA256_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"destination": str(destination), "files": len(manifest["files"]), "status": "created"}))


if __name__ == "__main__":
    main()
