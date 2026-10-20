#!/usr/bin/env python3
"""Build a deterministic, verified portable desktop package from current release files."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = "Capital_Strategy_V4_0_2026-10-19"
OUTPUT = ROOT / "public/downloads/Frontier_AI_Capital_Strategy_Package.zip"
PREVIOUS_PACKAGES = (
    ROOT / "public/downloads/Frontier_AI_Ownership_Frontier_Package.zip",
    ROOT / "public/downloads/Frontier_AI_Financing_Lens_Package.zip",
    ROOT / "public/downloads/Frontier_AI_Value_Horizon_Package.zip",
)


def main():
    if OUTPUT.exists():
        raise FileExistsError(f"Refusing to overwrite an existing package: {OUTPUT}")
    previous_hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in PREVIOUS_PACKAGES}
    with tempfile.TemporaryDirectory(prefix="frontier-capital-package-") as temporary:
        destination = Path(temporary) / FOLDER
        created = subprocess.run(
            [sys.executable, str(ROOT / "scripts/deliver_desktop.py"),
             "--destination", str(destination)], check=True, capture_output=True, text=True)
        receipt = json.loads(created.stdout)
        members = sorted(path for path in destination.rglob("*") if path.is_file())
        expected = {FOLDER + "/" + path.relative_to(destination).as_posix(): path.read_bytes()
                    for path in members}
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(OUTPUT, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, content in expected.items():
                info = zipfile.ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, content, compresslevel=9)
        with zipfile.ZipFile(OUTPUT) as archive:
            if archive.testzip() is not None:
                raise ValueError("Archive CRC verification failed.")
            if archive.namelist() != list(expected):
                raise ValueError("Archive membership or deterministic order differs.")
            if any(archive.read(name) != content for name, content in expected.items()):
                raise ValueError("Archive bytes differ from the verified desktop handoff.")
        for relative, expected_hash in previous_hashes.items():
            if hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() != expected_hash:
                raise ValueError(f"An earlier dated package changed during creation: {relative}")
        print(json.dumps({"status": "verified", "file": str(OUTPUT.relative_to(ROOT)),
                          "members": len(members), "manifestListedFiles": receipt["files"],
                          "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
                          "bytes": OUTPUT.stat().st_size,
                          "preservedPackages": previous_hashes,
                          "nativeDesktopDelivery": False}))


if __name__ == "__main__":
    main()
