#!/usr/bin/env python3
"""Verify the published Financing Lens assets and complete API responses.

Run with --base-url https://example.vercel.app --output receipt.json, or use an
HTTP loopback origin for the local application. System curl always verifies
HTTPS certificates; redirects and curl configuration files are disabled.

This is a deployment-consistency check. Independent mathematical validation is
provided separately by scripts/check_financing_reference.py.
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
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MAX_ASSETS = 128
MAX_RESPONSE_BYTES = 16 * 1024 * 1024
MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024
MIME = {
    ".html": {"text/html"}, ".js": {"text/javascript", "application/javascript"},
    ".css": {"text/css"}, ".json": {"application/json"},
    ".svg": {"image/svg+xml"}, ".png": {"image/png"},
    ".pdf": {"application/pdf"}, ".zip": {"application/zip", "application/x-zip-compressed"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".csv": {"text/csv"}, ".txt": {"text/plain"},
}
REQUIRED = (
    "index.html", "app.js", "financing.js", "financing.css", "portable.css",
    "lib/financing.js", "lib/financing-share.js", "lib/financing-brief.js",
    "lib/financing-format.js", "lib/ownership.js", "lib/ownership-chart.js", "lib/model.js", "lib/release.js",
    "data/presets.json", "data/research.json",
    "downloads/Frontier_AI_Financing_Lens.html",
    "downloads/Frontier_AI_Financing_Lens.json",
    "downloads/Frontier_AI_Financing_Lens.pdf",
    "downloads/Frontier_AI_Financing_Lens_Package.zip",
    "downloads/Frontier_AI_Ownership_Frontier_Package.zip",
)
NODE = r"""
import {readFileSync} from 'node:fs';
import {handleRequest} from './lib/http.js';
import {APP_VERSION} from './public/lib/release.js';
import {MODEL_VERSION,VALUATION_DATE} from './public/lib/model.js';
import {FINANCING_VERSION} from './public/lib/financing.js';
import {OWNERSHIP_VERSION} from './public/lib/ownership.js';
if(process.versions.node.split('.')[0]!=='24')throw new Error('Node 24 is required.');
const cases=JSON.parse(readFileSync(0,'utf8')),responses=[];
for(const item of cases){
  const method=item.method||'POST',init={method};
  if(method==='POST'){
    init.headers={'Content-Type':item.contentType||'application/json'};
    init.body=Object.hasOwn(item,'rawBody')?item.rawBody:JSON.stringify(item.body);
  }
  const response=await handleRequest(new Request('http://localhost'+item.path,init));
  responses.push({status:response.status,body:await response.json()});
}
process.stdout.write(JSON.stringify({node:process.version,meta:{appVersion:APP_VERSION,
  modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,financingVersion:FINANCING_VERSION,ownershipVersion:OWNERSHIP_VERSION},responses}));
"""


def digest(content):
    return hashlib.sha256(content).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def public_assets(required=REQUIRED):
    public = ROOT / "public"
    paths = []
    for path in public.rglob("*"):
        relative = path.relative_to(public)
        if any(part.startswith(".") for part in relative.parts):
            continue
        if path.is_symlink():
            raise RuntimeError("Public assets cannot contain symlinks: " + str(relative))
        if path.is_file():
            if path.suffix not in MIME:
                raise RuntimeError("Unsupported public asset type: " + str(relative))
            paths.append(relative.as_posix())
    paths.sort()
    missing = sorted(set(required) - set(paths))
    if missing:
        subject = "financing" if tuple(required) == REQUIRED else "release"
        raise RuntimeError(f"Required {subject} assets are not ready: " + ", ".join(missing))
    sizes = [(public / path).stat().st_size for path in paths]
    if len(paths) > MAX_ASSETS or sum(sizes) > MAX_TOTAL_ASSET_BYTES or max(sizes) > MAX_RESPONSE_BYTES:
        raise RuntimeError("The asset inventory exceeds this bounded verifier's limits.")
    return paths


def api_cases():
    presets = json.loads((ROOT / "data/presets.json").read_text())
    assumptions = presets["Anthropic"]["Base"]
    standard = dict(action="financing", assumptions=assumptions,
                    bridge=dict(cash=20, debt=5, otherClaims=0),
                    round=dict(basis="pre", quote=250, primaryCapital=25, holderStake=.1))

    def item(name, body, status=200, **extra):
        return dict(name=name, path="/api/valuation", method="POST",
                    body=body, expectedStatus=status, **extra)

    valid = [
        item("Worked pre-money round", copy.deepcopy(standard)),
        item("Same quote interpreted as post-money", {**standard, "round": {**standard["round"], "basis": "post"}}),
        item("No supplied balance-sheet bridge", {**standard, "bridge": None}),
        item("Signed nonpositive modeled equity", {**standard, "bridge": dict(cash=0, debt=10000, otherClaims=10000)}),
        item("Valid round with precision-limited modeled-price copy", {
            **standard, "bridge": dict(cash=0, debt=367.77029479956013, otherClaims=0),
            "round": dict(basis="post", quote=1e12, primaryCapital=999999999000, holderStake=.1)}),
    ]
    ownership = {**standard, "ownership": {"retentionFloor": .9}}
    valid += [
        item("Ownership frontier at fixed pre-money quote", ownership),
        item("Ownership frontier at fixed post-money quote", {**ownership, "round": {**standard["round"], "basis": "post"}}),
        item("Valid round below selected retention floor", {**ownership, "ownership": {"retentionFloor": .95}}),
        item("A100% floor with zero capital", {**ownership, "ownership": {"retentionFloor": 1}, "round": {**standard["round"], "primaryCapital": 0}}),
        item("A100% floor with a positive sub-display raise", {**ownership, "ownership": {"retentionFloor": 1}, "round": {**standard["round"], "primaryCapital": 1e-18}}),
        item("Analytical ceiling beyond supported input cap", {**ownership, "ownership": {"retentionFloor": .01}, "round": {**standard["round"], "quote": 1e12, "primaryCapital": 1e12}}),
        item("Positive ceiling below numerical resolution", {**ownership, "round": {**standard["round"], "quote": 5e-324, "primaryCapital": 0}}),
    ]
    no_bridge = copy.deepcopy(standard)
    del no_bridge["bridge"]
    invalid = [
        item("Post-money equals primary capital", {**standard, "round": {**standard["round"], "basis": "post", "quote": 25}}, 400),
        item("Negative primary capital", {**standard, "round": {**standard["round"], "primaryCapital": -1}}, 400),
        item("Unsupported top-level field", {**standard, "secondaryCapital": 1}, 400),
        item("Missing explicit bridge field", no_bridge, 400),
        item("Incomplete balance-sheet bridge", {**standard, "bridge": {"cash": 20}}, 400),
        item("Unresolved post-money subtraction", {**standard, "round": {**standard["round"], "basis": "post", "quote": 1e12, "primaryCapital": math.nextafter(1e12, -math.inf)}}, 400),
        item("Wrong request content type", standard, 415, contentType="text/plain"),
        item("Malformed JSON request", None, 400, rawBody="{malformed"),
        item("Request above the declared 16 KiB limit", None, 413, rawBody=json.dumps({"padding": "x" * 17000})),
    ]
    invalid += [
        item("Null ownership is not omission", {**standard, "ownership": None}, 400),
        item("Below supported ownership floor", {**standard, "ownership": {"retentionFloor": 0}}, 400),
        item("Above supported ownership floor", {**standard, "ownership": {"retentionFloor": 1.01}}, 400),
        item("String ownership floor", {**standard, "ownership": {"retentionFloor": ".9"}}, 400),
        item("Missing ownership floor", {**standard, "ownership": {}}, 400),
        item("Extra ownership field", {**standard, "ownership": {"retentionFloor": .9, "guaranteed": True}}, 400),
    ]
    health = dict(name="Exact release metadata", path="/api/health", method="GET", expectedStatus=200)
    return [health] + valid + invalid


def fetch(base, path, work, deadline, request=None):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise RuntimeError("The bounded verification deadline was reached.")
    body_path, header_path = work / "response.bin", work / "headers.txt"
    max_time = min(20, remaining)
    command = ["curl", "-q", "--silent", "--show-error", "--connect-timeout", "10",
               "--max-time", str(max_time), "--max-filesize", str(MAX_RESPONSE_BYTES),
               "--proto", "=http,https", "--output", str(body_path),
               "--dump-header", str(header_path),
               "--write-out", "%{http_code} %{ssl_verify_result} %{content_type}"]
    body = None
    if request and request.get("method", "POST") == "POST":
        body = request["rawBody"].encode() if "rawBody" in request else canonical(request["body"])
        command += ["--header", "Content-Type: " + request.get("contentType", "application/json"),
                    "--data-binary", "@-"]
    result = subprocess.run(command + [base + path], input=body, capture_output=True,
                            timeout=max_time + 5)
    if result.returncode:
        raise RuntimeError(f"curl transport failed for {path}; exit {result.returncode}")
    status_text, tls_text, mime = result.stdout.decode().split(" ", 2)
    status, tls = int(status_text), int(tls_text)
    if base.startswith("https://") and tls != 0:
        raise RuntimeError("HTTPS certificate verification failed.")
    content = body_path.read_bytes()
    if len(content) > MAX_RESPONSE_BYTES:
        raise RuntimeError("A response exceeded the bounded size limit.")
    return status, mime.split(";", 1)[0].strip().lower(), content


def main(*, extra_cases=(), extra_required=(), extra_sources=(),
         purpose="financing-and-ownership-deployment-consistency"):
    """Run the shared transport; optional profiles add cases, assets and source bindings.

    A case factory is evaluated after source hashes are captured. Existing CLI
    callers retain the Financing/Ownership profile and its original defaults.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="HTTPS origin or an HTTP loopback origin.")
    parser.add_argument("--output", required=True, type=Path, help="Write the complete verification receipt.")
    parser.add_argument("--deadline-seconds", type=int, default=180,
                        help="Overall limit between 30 and 600 seconds; default 180.")
    args = parser.parse_args()
    origin = urlsplit(args.base_url)
    if (origin.scheme not in ("http", "https") or not origin.hostname or origin.username or origin.password
            or origin.path not in ("", "/") or origin.query or origin.fragment
            or (origin.scheme == "http" and origin.hostname not in ("localhost", "127.0.0.1", "::1"))):
        parser.error("Use an HTTPS origin or HTTP loopback, with no credentials, path, query, or fragment.")
    if not 30 <= args.deadline_seconds <= 600:
        parser.error("The deadline must be between 30 and 600 seconds.")
    base = args.base_url.rstrip("/")
    started = time.monotonic()
    checks = []
    report = dict(schema=1, purpose=purpose, baseUrl=base,
                  testedAtUtc=datetime.now(timezone.utc).isoformat(), checks=checks,
                  tlsVerification=True, tlsUsed=origin.scheme == "https",
                  transport="System curl with configuration files disabled; no redirects; certificate verification remains enabled.",
                  comparison="Every current public asset is compared byte-for-byte and by MIME; API responses are compared as complete canonical JSON against the current local Web-standard handler.",
                  mathematicalIndependence="This verifies deployed/local consistency. Independent Python share-ledger, FCFF and ownership constraint verification is recorded separately in this release numerical-reference receipts.",
                  bounds=dict(maxAssets=MAX_ASSETS, maxResponseBytes=MAX_RESPONSE_BYTES,
                              maxTotalAssetBytes=MAX_TOTAL_ASSET_BYTES, deadlineSeconds=args.deadline_seconds))
    try:
        required = tuple(dict.fromkeys((*REQUIRED, *extra_required)))
        assets = public_assets(required)
        sources = ["public/" + path for path in assets] + ["lib/http.js", "server.js", "package.json",
                   "data/presets.json", "data/research.json", "scripts/verify_financing_http.py"]
        sources += [path.relative_to(ROOT).as_posix() for path in sorted((ROOT / "api").glob("*.js"))]
        sources = list(dict.fromkeys((*sources, *extra_sources)))
        before = {path: digest((ROOT / path).read_bytes()) for path in sources}
        report["sourceHashes"] = before
        report["requiredAssets"] = list(required)
        report["assetInventory"] = assets
        requests = api_cases() + list(extra_cases() if callable(extra_cases) else extra_cases)
        node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
        if not node:
            raise RuntimeError("Node 24 is required to evaluate the local handler.")
        local = subprocess.run([node, "--input-type=module", "-e", NODE], cwd=ROOT,
                               input=canonical(requests), capture_output=True, timeout=30)
        if local.returncode:
            raise RuntimeError("The local complete API reference failed; exit " + str(local.returncode))
        expected = json.loads(local.stdout)
        if len(expected["responses"]) != len(requests):
            raise RuntimeError("The local handler returned an incomplete reference batch.")
        for request, response in zip(requests, expected["responses"], strict=True):
            if response["status"] != request["expectedStatus"]:
                raise RuntimeError("Unexpected local handler status for " + request["name"])
        report["release"] = expected["meta"]
        report["runtime"] = dict(node=expected["node"], python=sys.version.split()[0])
        with tempfile.TemporaryDirectory(prefix="frontier-financing-http-") as directory:
            work = Path(directory)
            for path in assets + [""]:
                relative = path or "index.html"
                route = "/" + quote(path, safe="/")
                status, mime, content = fetch(base, route, work, started + args.deadline_seconds)
                wanted = before["public/" + relative]
                mime_ok = mime in MIME[Path(relative).suffix]
                checks.append(dict(kind="asset", name=path or "root index alias", path=route, method="GET",
                    expectedStatus=200, status=status, bytes=len(content), mime=mime, mimeAccepted=mime_ok,
                    expectedSha256=wanted, responseSha256=digest(content),
                    passed=status == 200 and mime_ok and digest(content) == wanted))
            for request, reference in zip(requests, expected["responses"], strict=True):
                status, mime, content = fetch(base, request["path"], work,
                                            started + args.deadline_seconds, request)
                value = json.loads(content)
                matches = canonical(value) == canonical(reference["body"])
                kind = "health" if request["method"] == "GET" else "api" if request["expectedStatus"] == 200 else "rejection"
                record = dict(kind=kind, name=request["name"], path=request["path"], method=request["method"],
                              expectedStatus=request["expectedStatus"], status=status, bytes=len(content), mime=mime,
                              expectedJsonSha256=digest(canonical(reference["body"])),
                              responseJsonSha256=digest(canonical(value)), fullJsonMatch=matches,
                              passed=status == request["expectedStatus"] and mime == "application/json" and matches)
                if request["method"] == "POST":
                    request_bytes = request["rawBody"].encode() if "rawBody" in request else canonical(request["body"])
                    record["requestSha256"] = digest(request_bytes)
                    if "rawBody" not in request:
                        record["request"] = request["body"]
                checks.append(record)
        after = {path: digest((ROOT / path).read_bytes()) for path in sources}
        report["sourceBinding"] = dict(unchangedDuringRun=before == after,
                                       assetInventoryUnchanged=assets == public_assets(required))
    except Exception as error:
        report["error"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    report["counts"] = {kind: sum(check["kind"] == kind for check in checks)
                        for kind in ("asset", "health", "api", "rejection")}
    report["counts"].update(httpRequests=len(checks), passed=sum(check["passed"] for check in checks))
    binding = report.get("sourceBinding", {})
    passed = (not report.get("error") and binding.get("unchangedDuringRun")
              and binding.get("assetInventoryUnchanged") and bool(checks) and all(check["passed"] for check in checks))
    report.update(status="pass" if passed else "fail", elapsedSeconds=time.monotonic() - started)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({key: report.get(key) for key in ("status", "counts", "elapsedSeconds", "error")}))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
