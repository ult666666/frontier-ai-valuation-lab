#!/usr/bin/env python3
"""Deployment consistency smoke; Python stdlib, Node 24 and system curl.

python scripts/verify_thesis_http.py --base-url https://example.vercel.app \
    --output qa-local/release/http-production.json

HTTPS always verifies certificates; curl configuration files are disabled.
This compares the deployed and local implementation, not independent math.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ASSETS = (
    "index.html", "thesis.html", "thesis.js", "thesis.css", "lib/thesis.js",
    "lib/thesis-share.js", "lib/thesis-brief.js", "lib/model.js", "lib/release.js",
    "data/presets.json", "data/research.json", "assets/thesis-preview.png",
    "downloads/Frontier_AI_Thesis_Comparison.pdf",
    "downloads/Frontier_AI_Thesis_Comparison.html",
    "downloads/Frontier_AI_Valuation_Model.xlsx", "downloads/Frontier_AI_Valuation_Review.pdf",
)
NODE = r"""
import {readFileSync} from 'node:fs';
import {compareTheses,valuationLandscape} from './public/lib/thesis.js';
import {MODEL_VERSION,VALUATION_DATE} from './public/lib/model.js';
import {APP_VERSION} from './public/lib/release.js';
if(process.versions.node.split('.')[0]!=='24') throw new Error('Node 24 required');
const meta={appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE};
const requests=JSON.parse(readFileSync(0,'utf8'));
const responses=requests.map(r=>({...meta,result:r.action==='attribute'
  ?compareTheses(r.reference,r.alternative)
  :valuationLandscape(r.assumptions,{rates:r.rates,margins:r.margins,target:r.target})}));
process.stdout.write(JSON.stringify({meta,responses,node:process.version}));
"""


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def fetch(url, body=None):
    command = ["curl", "-q", "--silent", "--show-error", "--connect-timeout", "10",
               "--max-time", "25", "--max-filesize", "16777216", "--proto", "=http,https",
               "--write-out", "\n%{http_code} %{ssl_verify_result}"]
    if body is not None:
        command += ["--header", "Content-Type: application/json", "--data-binary", "@-"]
    result = subprocess.run(command + [url], input=None if body is None else encoded(body),
                            capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError("curl transport failed; exit " + str(result.returncode))
    content, trailer = result.stdout.rsplit(b"\n", 1)
    status, tls_result = map(int, trailer.split())
    if url.startswith("https:") and tls_result != 0:
        raise RuntimeError("TLS certificate verification failed")
    return status, content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "qa-local/release/http.json")
    args = parser.parse_args()
    url = urlsplit(args.base_url)
    if (url.scheme not in ("http", "https") or not url.hostname or url.username or url.password
            or url.query or url.fragment or url.path not in ("", "/")
            or (url.scheme == "http" and url.hostname not in ("127.0.0.1", "localhost", "::1"))):
        parser.error("Use an HTTPS origin, or HTTP loopback; omit credentials, query and fragment.")
    base, started, checks = args.base_url.rstrip("/"), time.perf_counter(), []
    report = {"purpose": "deployment-consistency", "baseUrl": base,
              "testedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "tlsVerification": True, "tlsUsed": url.scheme == "https",
              "transport": "system curl; configuration files disabled; no redirects",
              "comparison": "exact bytes for assets; complete canonical JSON for API responses",
              "checks": checks}

    def verify(kind, name, path, expected_status=200, expected=None, body=None):
        record = {"kind": kind, "name": name, "path": path,
                  "method": "GET" if body is None else "POST", "expectedStatus": expected_status}
        checks.append(record)
        status, content = fetch(base + path, body)
        record.update(status=status, bytes=len(content), responseSha256=digest(content))
        if kind == "asset":
            matches = digest(content) == expected
            record["expectedSha256"] = expected
        else:
            value = json.loads(content)
            matches = (set(value) == {"error"} and isinstance(value["error"], str) and bool(value["error"])) if expected_status == 400 else encoded(value) == encoded(expected)
            record["responseJsonSha256"] = digest(encoded(value))
            if expected is not None:
                record["expectedJsonSha256"] = digest(encoded(expected))
        if body is not None:
            record["requestJsonSha256"] = digest(encoded(body))
        record["passed"] = status == expected_status and bool(matches)

    try:
        sources = ["public/" + p for p in ASSETS] + ["data/presets.json", "lib/http.js", "scripts/verify_thesis_http.py"]
        before = {p: digest((ROOT / p).read_bytes()) for p in sources}
        report["sourceHashes"] = before
        cases = json.loads((ROOT / "data/presets.json").read_text())["Anthropic"]
        attribute = {"action": "attribute", "reference": cases["Base"], "alternative": cases["Bull"]}
        landscape = {"action": "landscape", "assumptions": cases["Bull"], "rates": [.025, .08, .12, .18],
                     "margins": [0, .1, .3, .6], "target": 1000}
        node = subprocess.run(["node", "--input-type=module", "-e", NODE], cwd=ROOT,
                              input=encoded([attribute, landscape]), capture_output=True, timeout=30)
        if node.returncode:
            raise RuntimeError("Local Node reference failed; exit " + str(node.returncode))
        expected = json.loads(node.stdout)
        report["runtime"] = {"python": sys.version.split()[0], "node": expected["node"]}
        report["release"] = expected["meta"]
        for path in ASSETS:
            verify("asset", path, "/" if path == "index.html" else "/" + path, expected=before["public/" + path])
        verify("health", "release metadata", "/api/health", expected={"status": "ok", **expected["meta"]})
        for body, response in zip((attribute, landscape), expected["responses"]):
            verify("api", body["action"], "/api/valuation", expected=response, body=body)
        rejected = [("singular endpoint", {**attribute, "reference": {**cases["Base"], "wacc": cases["Base"]["tg"]}}),
                    ("zero target", {**landscape, "target": 0}),
                    ("attribute extra field", {**attribute, "unexpected": True}),
                    ("landscape extra field", {**landscape, "unexpected": True})]
        for name, body in rejected:
            verify("rejection", name, "/api/valuation", expected_status=400, body=body)
        report["sourceBinding"] = {"unchangedDuringRun": before == {p: digest((ROOT / p).read_bytes()) for p in sources}}
    except Exception as error:
        report["error"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    report["counts"] = {kind: sum(c["kind"] == kind for c in checks) for kind in ("asset", "health", "api", "rejection")}
    report["counts"].update(httpRequests=len(checks), passed=sum(c.get("passed", False) for c in checks))
    passed = not report.get("error") and report.get("sourceBinding", {}).get("unchangedDuringRun") and all(c.get("passed") for c in checks)
    report.update(status="pass" if passed else "fail", elapsedSeconds=time.perf_counter() - started)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({k: report[k] for k in ("status", "counts", "elapsedSeconds")}))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
