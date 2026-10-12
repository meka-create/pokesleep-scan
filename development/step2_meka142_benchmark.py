#!/usr/bin/env python3
"""Private meka142 OCR benchmark. Never commit corpus, Golden, or diagnostics.

Run locally:
  python development/step2_meka142_benchmark.py \
    --golden /private/正解表_meka142.csv \
    --images /private/meka142 \
    --diagnostics /private/pokesleep_ocr_v12_diagnostics.json \
    --output /private/step2_report.json

Only untouched, pre-manual OCR should be treated as automatic. Review/manual values
do not count as auto-correct. All 16 non-nickname observed fields are evaluated.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import io
import zipfile
from collections import Counter
from pathlib import Path

EXPECTED_COUNT = 142
FIELD_NAMES = (
    "ポケモン名", "レベル", "SP", "おてつだい時間_秒", "最大所持数",
    "メインスキルLv", "メインスキル", "せいかく",
    "食材1", "食材2", "食材3",
    "サブスキル1", "サブスキル2", "サブスキル3", "サブスキル4", "サブスキル5",
)
MYTHICAL_EMPTY = frozenset(("ミュウ", "ダークライ"))
LEVELS = (10, 25, 50, 70, 80)
NUMBERS = frozenset(("レベル", "SP", "おてつだい時間_秒", "最大所持数", "メインスキルLv"))


def _value(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, int):
        return str(v)
    return str(v).strip()


def read_golden(path):
    """Read exactly meka142; never score nano30 even when Golden ZIP holds 172."""
    path = Path(path)
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            filename = "GOLDEN_CORRECTED/正解表_全172.csv"
            if filename not in archive.namelist():
                raise ValueError("Golden ZIP missing corrected authoritative CSV")
            text = archive.read(filename).decode("utf-8-sig")
    else:
        text = path.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    required = {"corpus", "assetId", "画像ファイル", "画像SHA256", *FIELD_NAMES}
    missing = required - set(reader.fieldnames or [])
    if missing:
        raise ValueError("Golden columns missing: " + ", ".join(sorted(missing)))
    rows = list(reader)
    if any(row.get("corpus") not in ("meka142", "nano30") for row in rows):
        raise ValueError("Unknown Golden corpus")
    golden = [row for row in rows if row["corpus"] == "meka142"]
    if len(golden) != EXPECTED_COUNT:
        raise ValueError(f"meka142 only: expected {EXPECTED_COUNT} rows, got {len(golden)}")
    names, hashes = set(), set()
    for i, row in enumerate(golden):
        if row["assetId"] != f"MEKA142-{i + 1:03d}":
            raise ValueError(f"Golden assetId/order invalid at row {i + 1}")
        if "index" in row and row["index"] != str(i):
            raise ValueError(f"Golden index invalid at row {i + 1}")
        name = row["画像ファイル"]
        if not name or "/" in name or "\\" in name or name in names:
            raise ValueError(f"Unsafe/duplicate Golden filename: {name}")
        names.add(name)
        digest = row["画像SHA256"].lower()
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or digest in hashes:
            raise ValueError(f"Golden SHA-256 invalid or duplicated for {name}")
        hashes.add(digest)
        for field in FIELD_NAMES:
            if row.get(field) is None:
                raise ValueError(f"Missing Golden cell for {name}: {field}")
    return golden


def verify_images(root, golden_rows):
    """Verify original bytes; return SHA-verified image size/name correspondence.

    Android can rename picked images. Match by byte size ONLY when all 142
    source sizes are unique. A collision fails closed instead of guessing.
    """
    root = Path(root)
    files = []
    if zipfile.is_zipfile(root):
        with zipfile.ZipFile(root) as archive:
            for f in archive.infolist():
                if f.is_dir() or Path(f.filename).suffix.lower() not in (".png", ".jpg", ".jpeg"):
                    continue
                name = Path(f.filename).name
                if any(x in (".", "..") for x in Path(f.filename).parts):
                    raise ValueError("Unsafe path in images ZIP")
                files.append((name, f.file_size, hashlib.sha256(archive.read(f)).hexdigest()))
    elif root.is_dir():
        for f in root.rglob("*"):
            if f.is_file() and f.suffix.lower() in (".png", ".jpg", ".jpeg"):
                files.append((f.name, f.stat().st_size, hashlib.sha256(f.read_bytes()).hexdigest()))
    else:
        raise ValueError("Images must be a directory or ZIP")
    if len(files) != EXPECTED_COUNT or len({x[0] for x in files}) != EXPECTED_COUNT:
        raise ValueError("Exactly 142 unique original images are required")
    golden_by_name = {row["画像ファイル"]: row for row in golden_rows}
    if set(x[0] for x in files) != set(golden_by_name):
        raise ValueError("Image filenames do not match meka142 Golden")
    by_size = {}
    for name, size, sha in files:
        if sha.lower() != golden_by_name[name]["画像SHA256"].lower():
            raise ValueError("Image original SHA-256 mismatch: " + name)
        # Duplicate file sizes are allowed only for direct name matching.
        if size in by_size:
            by_size[size] = None
        else:
            by_size[size] = golden_by_name[name]
    return by_size


def verify_raw_csv(path, diagnostics):
    """Verify external before-review CSV against the embedded immutable snapshot."""
    if not path:
        return
    with Path(path).open("r", encoding="utf-8-sig", newline="") as fd:
        rows = list(csv.reader(fd))
    snapshot = diagnostics.get("preManualCsvSnapshot") or {}
    embedded = [snapshot.get("header", []), *snapshot.get("rows", [])]
    expected = [[_value(c) for c in row] for row in embedded]
    if len(rows) != EXPECTED_COUNT + 1 or rows != expected:
        raise ValueError("External raw CSV does not equal embedded pre-manual snapshot")


def _observation(record):
    parsed = record.get("parsed") or {}
    status = record.get("reviewState") or {}
    classification = record.get("classification") or {}
    food = record.get("foods") or []
    subs = parsed.get("subskills") or []
    ev = parsed.get("subskillEvidence") or []
    slots = set(parsed.get("subskillReviewSlots") or [])
    manual = bool(record.get("manualCompletion"))
    species_man = bool(classification.get("speciesManualOverride"))
    candidates = classification.get("candidates") or []
    values = [
        candidates[0] if len(candidates) == 1 else "",
        parsed.get("level"), parsed.get("sp"), parsed.get("helpSeconds"),
        parsed.get("carry"), parsed.get("skillLevel"), parsed.get("mainSkill"),
        parsed.get("nature"),
    ]
    values += [food[i].get("name") if i < len(food) and isinstance(food[i], dict) else "" for i in range(3)]
    values += [subs[i] if i < len(subs) else "" for i in range(5)]
    valid_status = bool(record.get("reviewState")) and not record.get("processingError")
    core_flags = [
        classification.get("status") == "UNIQUE" and len(candidates) == 1 and not species_man and status.get("species") is False,
        status.get("level") is False,
        status.get("sp") is False,
        status.get("helpSeconds") is False,
        not parsed.get("carryOcrUnresolved") and not parsed.get("carryNeedsReview") and
            _value(parsed.get("carry")) != "",
        status.get("skillLevel") is False,
        status.get("mainSkill") is False,
        status.get("nature") is False,
    ]
    for i in range(3):
        item = food[i] if i < len(food) else None
        core_flags.append(
            isinstance(item, dict) and bool(item.get("name")) and
            item.get("needsReview") is False and not item.get("manualOverride")
        )
    for i in range(5):
        evidence = ev[i] if i < len(ev) else None
        val = _value(values[11 + i])
        empty_legal = _value(values[0]) in MYTHICAL_EMPTY
        core_flags.append(
            isinstance(evidence, dict) and evidence.get("needsReview") is False and
            LEVELS[i] not in slots and not str(evidence.get("reviewReason") or "").startswith("manual") and
            bool(val or empty_legal)
        )
    assert len(values) == len(core_flags) == len(FIELD_NAMES)
    auto = [valid_status and not manual and bool(x) for x in core_flags]
    return [_value(x) for x in values], auto


def evaluate(golden_rows, diagnostics, verified_image_sizes=None):
    if len(golden_rows) != EXPECTED_COUNT:
        raise ValueError("Expected only meka142 Golden142")
    if not isinstance(diagnostics, dict) or not str(diagnostics.get("version", "")).startswith("v12-"):
        raise ValueError("Requires a v12 OCR diagnostics JSON (record buildId separately)")
    results = diagnostics.get("results")
    selected = diagnostics.get("selectedFiles")
    snap = diagnostics.get("preManualCsvSnapshot") or {}
    if not isinstance(results, list) or not isinstance(selected, list) or len(results) != EXPECTED_COUNT or len(selected) != EXPECTED_COUNT:
        raise ValueError("Diagnostics do not contain exactly 142 selected and analyzed images")
    if snap.get("schema") != 2 or snap.get("rowCount") != EXPECTED_COUNT or snap.get("successfulRowCount") != EXPECTED_COUNT or snap.get("skipped") or snap.get("derivedRows"):
        raise ValueError("Pre-manual snapshot missing, incomplete, or derived from old checkpoint data")
    if len(snap.get("rows", [])) != EXPECTED_COUNT:
        raise ValueError("Pre-manual snapshot rows are missing")
    indexed = {}
    for result in results:
        i = result.get("sourceIndex")
        if not isinstance(i, int) or isinstance(i, bool) or i in indexed or not 0 <= i < EXPECTED_COUNT:
            raise ValueError("Missing/duplicate/out-of-range diagnostics sourceIndex")
        indexed[i] = result
    if len(indexed) != EXPECTED_COUNT:
        raise ValueError("Diagnostics source coverage incomplete")
    golden_by_name = {row["画像ファイル"]: row for row in golden_rows}
    stats = {name: {"auto_correct": 0, "auto_wrong": 0, "review_or_manual": 0} for name in FIELD_NAMES}
    deviations, mapping = [], []
    fully_auto_correct = 0
    seen = set()
    for i in range(EXPECTED_COUNT):
        file = selected[i].get("name")
        row = indexed[i]
        if file != row.get("file"):
            raise ValueError(f"File correspondence mismatch at source index {i}")
        if verified_image_sizes is None:
            # Unit tests with synthetic canonical file names.
            golden = golden_by_name.get(file)
        else:
            size = selected[i].get("size")
            if not isinstance(size, int) or isinstance(size, bool):
                raise ValueError(f"Missing source image size at index {i}")
            golden = verified_image_sizes.get(size)
        if not golden:
            raise ValueError(f"Cannot uniquely map diagnostics image to SHA-verified Golden at {i}")
        if golden["assetId"] in seen:
            raise ValueError("Duplicate diagnostics mapping to same original image")
        seen.add(golden["assetId"])
        snap_row = snap["rows"][i]
        if len(snap_row) != 19 or snap_row[0] != i + 1 or snap_row[1] != file or snap_row[2] != "解析成功":
            raise ValueError(f"Missing/misaligned immutable raw row {i}")
        mapping.append({"sourceIndex": i, "assetId": golden["assetId"], "originalFile": golden["画像ファイル"], "selectedAlias": file})
        observed, flags = _observation(row)
        complete = True
        for j, field in enumerate(FIELD_NAMES):
            expected = _value(golden[field])
            value = observed[j]
            # For mythical blank subskills, the Golden display sentinel ―
            # corresponds to a literal blank in the pokesleep-tool CSV.
            if field.startswith("サブスキル") and expected == "―" and golden["ポケモン名"] in MYTHICAL_EMPTY:
                expected = ""
            good = value == expected
            typ = "review_or_manual" if not flags[j] else ("auto_correct" if good else "auto_wrong")
            stats[field][typ] += 1
            if typ != "auto_correct":
                complete = False
                deviations.append({
                    "assetId": golden["assetId"], "file": golden["画像ファイル"],
                    "field": field, "expected": expected, "observed": value, "classification": typ
                })
        if complete:
            fully_auto_correct += 1
    if len(seen) != EXPECTED_COUNT:
        raise ValueError("Diagnostics do not cover all meka142 images")
    totals = {k: sum(v[k] for v in stats.values()) for k in ("auto_correct", "auto_wrong", "review_or_manual")}
    assert sum(totals.values()) == EXPECTED_COUNT * len(FIELD_NAMES)
    return {
        "schema": "meka142-step2-non-nickname-v2",
        "corpus": "meka142",
        "images": EXPECTED_COUNT,
        "verifiedImageCount": EXPECTED_COUNT if verified_image_sizes is not None else None,
        "diagnosticVersion": diagnostics.get("version"),
        "diagnosticBuildId": diagnostics.get("buildId"),
        "fieldsPerImage": len(FIELD_NAMES),
        "totalFields": EXPECTED_COUNT * len(FIELD_NAMES),
        "nicknameExcluded": True,
        "fullAutoCorrectImages": fully_auto_correct,
        "totals": totals,
        "zeroWrongAutomaticConfirmation": totals["auto_wrong"] == 0,
        "allFieldsAutomaticallyCorrect": totals["auto_correct"] == EXPECTED_COUNT * len(FIELD_NAMES),
        "perField": stats,
        "imageMapping": mapping,
        "nonAutoOrWrongDetails": deviations,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", required=True, help="Private meka142 Golden CSV or latest corrected Golden172 ZIP")
    parser.add_argument("--images", required=True, help="Private meka142 original-image folder or ZIP")
    parser.add_argument("--diagnostics", required=True, help="Fresh v12 unedited diagnostics JSON")
    parser.add_argument("--rawcsv", help="Optional external raw-before-review CSV")
    parser.add_argument("--output", required=True, help="Private local JSON report path")
    args = parser.parse_args()
    golden = read_golden(args.golden)
    sizes = verify_images(args.images, golden)
    diag = json.loads(Path(args.diagnostics).read_text(encoding="utf-8-sig"))
    verify_raw_csv(args.rawcsv, diag)
    report = evaluate(golden, diag, sizes)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("meka142", report["images"], "images; non-nickname cells", report["totalFields"])
    print("auto correct:", report["totals"]["auto_correct"], "auto wrong:", report["totals"]["auto_wrong"],
          "review/manual:", report["totals"]["review_or_manual"])
    print("zero-wrong gate:", "PASS" if report["zeroWrongAutomaticConfirmation"] else "FAIL")
    print("100%-auto target:", "PASS" if report["allFieldsAutomaticallyCorrect"] else "NOT YET")
    return 1 if not report["zeroWrongAutomaticConfirmation"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
