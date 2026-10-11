#!/usr/bin/env python3
"""STEP2 independent source-integrity gate; never promote to production."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1])
    p.add_argument("--report",type=Path)
    args=p.parse_args()
    root=args.root.resolve()
    lock=json.loads((root/"development/BASELINE_LOCK.json").read_text(encoding="utf-8"))
    manifest=json.loads((root/"public_package_manifest.json").read_text(encoding="utf-8"))
    old_hashes=lock["sourceManifest"]["fileHashes"]
    failures=[]
    audited=[]
    allowed_modified={"app.js","index.html","sw.js"}
    # The user-provided maskable set is optional until explicitly uploaded to the
    # STEP3 development branch. Never accept an unrecognized icon replacement.
    user_icons={
      "icon-maskable-512.png":"fafc1a3be39aee764127d29eeb2d8cbffdaf0f81abd7ab5eb77291c3a37ae8f7",
      "icon-maskable-192.png":"d80de0922bb8be973cce16a0cb1b8d6a2119b9848dec996a271132de65ff29d5",
      "icon-192.png":"75550a30c39818f43cd39157544bb1d64d8bd1d77e5a88067c270f127d0d37e5",
      "apple-touch-icon.png":"878b81f376b474f19e61ab86724934c00e8cb3058517b65dc0872aabd22e0688",
      "favicon-32.png":"87c006c09b99b58864777e8aa566fc4fed066c5423191c476835357ac97b1760",
      "icon-512.png":"dd0f157cf81aed9325f5208e54caa03626c29854ae69751e511667951215c418"
    }
    mask_install=(root/"icons/icon-maskable-512.png").is_file()
    if mask_install:
        allowed_modified.add("manifest.webmanifest")
        for name,expected_hash in user_icons.items():
            p=root/"icons"/name
            if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected_hash:
                failures.append("Maskable set does not match user-provided bytes: "+name)
        icon_manifest=json.loads((root/"manifest.webmanifest").read_text(encoding="utf-8"))
        mask_paths={x.get("src") for x in icon_manifest.get("icons",[]) if x.get("purpose")=="maskable"}
        if mask_paths!={"./icons/icon-maskable-192.png","./icons/icon-maskable-512.png"}:
            failures.append("Pixel maskable manifest is incomplete")

    required=["shared/MASTER_DATA.json","shared_master.js","csv_gate.js","development/step2_shared_csv.test.cjs"]
    for path in required:
        if not (root/path).is_file():failures.append("Missing STEP2 asset: "+path)
    for entry in manifest["files"]:
        name=entry["path"]
        target=root/name
        if name==".nojekyll":
            if target.exists():failures.append("Unexpected .nojekyll change")
            continue
        if not target.is_file():
            failures.append("Missing frozen runtime asset: "+name)
            continue
        data=target.read_bytes()
        hash=hashlib.sha256(data).hexdigest()
        if mask_install and name.startswith("icons/"):
            if hash!=user_icons.get(Path(name).name):
                failures.append("Unauthorized icon regression: "+name)
        elif name not in allowed_modified:
            if hash!=entry["sha256"] or hash!=old_hashes.get(name):
                failures.append("Regressed frozen runtime: "+name)
            audited.append(name)
        else:
            if hash==entry["sha256"]:
                failures.append("Expected STEP2 controlled edit absent: "+name)
    if lock.get("formalBaseline",{}).get("candidate")!="Candidate124" or not lock["developmentStartingPoint"]["provisional"]:
        failures.append("Baseline candidate illegally promoted")
    if lock["developmentStartingPoint"]["sourceCommit"]!="e64beae03a27a36e5c3de492d3b50b070e39fff8":
        failures.append("Original snapshot commit changed")
    ai=root/"shared/MASTER_DATA.json"
    match=False
    if ai.is_file():
        digest=hashlib.sha256(ai.read_bytes()).hexdigest()
        match=digest==lock["aiReference"]["masterRawSha256"]
        if not match:failures.append("Pinned AI master SHA-256 mismatch")
        if match:
            data=json.loads(ai.read_text(encoding="utf-8"))
            master_str=(root/"master_data.js").read_text(encoding="utf-8")
            m=re.fullmatch(r"\s*window\.POKESLEEP_MASTER\s*=\s*(\{.*\})\s*;\s*",master_str,re.S)
            if not m:failures.append("Legacy master wrapper altered")
            else:
                legacy=json.loads(m.group(1))
                same=legacy=={k:data[k] for k in ("cutoff","ingredients","natures","subskills","pokemon")}
                if not same:failures.append("AI/OCR master is no longer structurally identical")
    html=(root/"index.html").read_text(encoding="utf-8")
    app=(root/"app.js").read_text(encoding="utf-8")
    scripts="['master_data.js','shared_master.js','classifier.js','food_color_features.js','food_matcher.js','android_roi.js','csv_gate.js','app.js']"
    if scripts not in html:failures.append("Script load order altered")
    if "await window.POKESLEEP_SHARED_MASTER.load()" not in html:
        failures.append("Shared master verification must finish before classifier")
    if "diagnosticDownloadTimestamp(d)" not in app or "csvDownloadTimestamp" in app:
        failures.append("Diagnostic raw CSV/JSON timestamp regression")
    if "function ribbonCsvValue(_classification){return 0;}" not in app:
        failures.append("Unobserved together-sleep time is not protected by 0 default")
    if "reserveFilename(new Date(),'raw')" not in app or "reserveFilename(new Date(),'diagnostics')" not in app:
        failures.append("Diagnostic downloads must use collision-resistant names")
    sw=(root/"sw.js").read_text(encoding="utf-8")
    for pre in ("versioned('./shared_master.js')","versioned('./shared/MASTER_DATA.json')","versioned('./csv_gate.js')"):
        if pre not in sw:failures.append("Missing STEP2 PWA precache: "+pre)
    if "step2=sharedcsv-v1" not in sw or "u.searchParams.set('step2','sharedcsv-v1')" not in html:
        failures.append("STEP2 JS/SW cache versions are not aligned")
    if mask_install and ("versioned('./icons/icon-maskable-192.png')" not in sw or "versioned('./icons/icon-maskable-512.png')" not in sw or "iconsv1" not in sw):
        failures.append("Installed Pixel icon is missing from the versioned PWA cache")
    if "versioned('./android_roi.js')" not in sw or "step3=androidroi-v1" not in sw or "u.searchParams.set('step3','androidroi-v1')" not in html:
        failures.append("STEP3 Android ROI PWA version/cache is missing")
    if "window.POKESLEEP_ANDROID_ROI?.inspect(canvas)" not in app:
        failures.append("Android crop adapter was disconnected from OCR")
    if "const pendingRows=ordered.filter(x=>x.needsReview)" not in app:
        failures.append("Unresolved review-first UI is not connected")

    if "await safeExportText()" not in app or "await gate.reserveFilename(new Date())" not in app:
        failures.append("CSV gate/download hook missing")
    if re.search(r"function csvDownloadTimestamp|function csvDownloadFilename",app):
        failures.append("Old second-granularity filename generation reappeared")
    report={"schema":"ocr-step2-integrity-v1","status":"FAIL" if failures else "PASS_WITH_KNOWN_UPSTREAM_WARNING",
            "frozenRuntimeFilesHashVerified":audited,"controlledEdits":sorted(allowed_modified),
            "pinnedAiMasterShaMatch":match,"knownMissing":[".nojekyll"],"failures":failures,
            "notVerified":["172-image accuracy","Android/iPhone OCR recognition","actual importer round-trip",
                           "browser filesystem overwrite guarantees"]}
    print(json.dumps(report,indent=2,ensure_ascii=False))
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    return 1 if failures else 0


if __name__=="__main__":
    raise SystemExit(main())
