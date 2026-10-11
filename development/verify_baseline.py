#!/usr/bin/env python3
"""STEP 1 read-only smoke checks for the preserved Candidate125 runtime.

Not a substitute for the missing Candidate124/125 Full Dev packages, actual
screenshot regression, browser E2E, or Android/iPhone device gates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


CSV_HEADER = [
    "ニックネーム", "ポケモン", "レベル", "スキルレベル",
    "食材1", "食材2", "食材3", "メインスキル", "せいかく",
    "Lv10", "Lv25", "Lv50", "Lv70", "Lv80",
    "一緒に眠った時間", "色違い",
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--ai-master", type=Path, help="Optional AI v27 master JSON (PINNED SHA enforced)")
    parser.add_argument("--report", type=Path, help="Optional JSON report output")
    args = parser.parse_args()
    root = args.root.resolve()
    failures = []
    warnings = []
    checked = 0

    def require(condition: bool, message: str) -> None:
        if not condition:
            failures.append(message)

    lock = json.loads((root / "development/BASELINE_LOCK.json").read_text(encoding="utf-8"))
    manifest = json.loads((root / "public_package_manifest.json").read_text(encoding="utf-8"))
    release = json.loads((root / "release.json").read_text(encoding="utf-8"))
    source = lock["developmentStartingPoint"]
    require(manifest.get("validation", {}).get("candidate") == "Candidate125", "Unexpected Candidate")
    require(manifest.get("formalBaseline") == "Candidate124", "Formal baseline changed")
    require(manifest.get("provisional") is True, "Candidate125 wrongly promoted")
    require(source["provisional"] is True, "Lock must remain provisional")
    require(release.get("id") == source["releaseId"], "Release ID changed")
    require(manifest.get("releaseId") == source["releaseId"], "Manifest release differs")
    require(manifest.get("checkpointCompatibilityId") == source["checkpointCompatibilityId"],
            "Checkpoint ID changed")
    require(manifest.get("validation", {}).get("deviceValidation") ==
            "IPHONE_ANDROID_PRIORITY_CORPUS_GATE_PENDING", "Unverified device gate altered")
    require(lock["stage"] == "STEP1_STAGING_NOT_A_FORMAL_CANDIDATE_OR_RELEASE",
            "Development branch must not masquerade as approved release")

    missing = []
    for entry in manifest.get("files", []):
        name = entry["path"]
        file_path = root / name
        if not file_path.is_file():
            missing.append(name)
            if name == ".nojekyll" and name in lock["sourceManifest"]["missingFromRepository"]:
                warnings.append("Known upstream snapshot discrepancy: .nojekyll missing from Git tree")
            else:
                failures.append("Runtime file missing: " + name)
            continue
        data = file_path.read_bytes()
        checked += 1
        require(len(data) == entry["bytes"], "Byte count mismatch: " + name)
        require(sha256(data) == entry["sha256"], "SHA-256 mismatch: " + name)
        require(entry["sha256"] == lock["sourceManifest"]["fileHashes"].get(name),
                "Manifest/lock hash mismatch: " + name)
    require(set(missing) == set(lock["sourceManifest"]["missingFromRepository"]),
            "Actual missing files differ from the recorded snapshot")

    master_text = (root / "master_data.js").read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*window\.POKESLEEP_MASTER\s*=\s*(\{.*\})\s*;\s*",
                         master_text, flags=re.S)
    master = json.loads(match.group(1)) if match else {}
    require(bool(match), "OCR master JS wrapper altered")
    require(len(master.get("pokemon", [])) == 249, "Unexpected Pokemon count")
    require(len(master.get("ingredients", {})) == 19, "Unexpected ingredient count")
    require(len(master.get("natures", [])) == 25, "Unexpected nature count")
    require(len(master.get("subskills", [])) == 17, "Unexpected subskill count")
    require(len({(p.get("name"), p.get("name_en")) for p in master.get("pokemon", [])}) ==
            len(master.get("pokemon", [])), "Duplicate Pokemon identity")

    app = (root / "app.js").read_text(encoding="utf-8")
    header_match = re.search(r"const POKESLEEP_TOOL_CSV_HEADER\s*=\s*\[(.*?)\];", app, re.S)
    extracted = re.findall(r"'([^']*)'", header_match.group(1)) if header_match else []
    require(extracted == CSV_HEADER, "CSV 16-column header changed")
    require(source["releaseId"] in app, "App's release/checkpoint ID differs")
    require("CHECKPOINT_COMPATIBILITY_ID" in app, "Checkpoint compatibility handling missing")
    require("POKESLEEP_CLASSIFIER" in app, "Classifier integration missing")

    for script in ("master_data.js", "classifier.js", "food_color_features.js",
                   "food_matcher.js", "app.js"):
        html = (root / "index.html").read_text(encoding="utf-8")
        require(script in html, "HTML script reference missing: " + script)

    ai_comparison = "NOT_RUN"
    if args.ai_master:
        raw = args.ai_master.read_bytes()
        require(sha256(raw) == lock["aiReference"]["masterRawSha256"],
                "AI source bytes do not match pinned v27 release master")
        ai = json.loads(raw)
        shared = {key: ai.get(key) for key in ("cutoff", "ingredients", "natures",
                                               "subskills", "pokemon")}
        require(master == shared, "OCR master differs from pinned AI v27")
        ai_comparison = "MATCH" if master == shared and sha256(raw) == \
            lock["aiReference"]["masterRawSha256"] else "MISMATCH"

    report = {
        "schema": "ocr-revival-step1-smoke-v1",
        "candidate": "Candidate125 (provisional; Candidate124 is formal)",
        "snapshotCommit": source["sourceCommit"],
        "runtimeHashesChecked": checked,
        "masterSpecies": len(master.get("pokemon", [])),
        "aiPinnedMasterComparison": ai_comparison,
        "missingRuntimeFiles": missing,
        "warnings": warnings,
        "failures": failures,
        "status": "PASS_WITH_WARNINGS" if not failures and warnings else
                  "PASS" if not failures else "FAIL",
        "notCovered": ["Full Dev recovery", "172-image benchmark",
                       "Android/iPhone devices", "real-browser E2E",
                       "actual pokesleep-tool CSV importer"],
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                               encoding="utf-8")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
