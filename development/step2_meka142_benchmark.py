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
    with Path(path).open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        required = {"index", "corpus", "assetId", "画像ファイル", "画像SHA256", *FIELD_NAMES}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError("Golden columns missing: " + ", ".join(sorted(missing)))
        rows = list(reader)
    if len(rows) != EXPECTED_COUNT:
        raise ValueError(f"meka142 only: expected {EXPECTED_COUNT} rows, got {len(rows)}")
    names = set()
    for i, row in enumerate(rows):
        if row["corpus"] != "meka142" or row["index"] != str(i) or row["assetId"] != f"MEKA142-{i + 1:03d}":
            raise ValueError(f"Golden order/corpus/assetId invalid at row {i + 1}")
        filename = row["画像ファイル"]
        if not filename or "/" in filename or "\\" in filename or filename in names:
            raise ValueError(f"Unsafe or duplicate Golden filename: {filename}")
        names.add(filename)
        if not re.fullmatch(r"[a-fA-F0-9]{64}", row["画像SHA256"]):
            raise ValueError(f"Golden SHA-256 missing for {filename}")
        for field in FIELD_NAMES:
            if row.get(field) is None:
                raise ValueError(f"Missing Golden cell for {filename}: {field}")
    return rows


def verify_images(root, golden_rows):
    root = Path(root)
    if not root.is_dir():
        raise ValueError("Image directory is unavailable")
    found = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg")]
    by_name = {}
    for p in found:
        if p.name in by_name:
            raise ValueError("Repeated image basename: " + p.name)
        by_name[p.name] = p
    expected = {r["画像ファイル"] for r in golden_rows}
    if set(by_name) != expected or len(found) != EXPECTED_COUNT:
        raise ValueError(f"meka142 image mismatch: missing={sorted(expected - set(by_name))[:5]}, extra={sorted(set(by_name) - expected)[:5]}")
    for row in golden_rows:
        name = row["画像ファイル"]
        actual = hashlib.sha256(by_name[name].read_bytes()).hexdigest()
        if actual.lower() != row["画像SHA256"].lower():
            raise ValueError("Image original SHA-256 mismatch: " + name)


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


def evaluate(golden_rows, diagnostics):
    if len(golden_rows) != EXPECTED_COUNT:
        raise ValueError("Expected only meka142 Golden142")
    if not isinstance(diagnostics, dict) or not str(diagnostics.get("version", "")).startswith("v12-"):
        raise ValueError("Requires a current v12 OCR diagnostics JSON")
    results = diagnostics.get("results")
    selected = diagnostics.get("selectedFiles")
    snap = diagnostics.get("preManualCsvSnapshot") or {}
    if not isinstance(results, list) or not isinstance(selected, list) or len(results) != EXPECTED_COUNT or len(selected) != EXPECTED_COUNT:
        raise ValueError("Diagnostics do not contain exactly 142 selected and analyzed images")
    if snap.get("rowCount") != EXPECTED_COUNT or snap.get("skipped") or snap.get("derivedRows"):
        raise ValueError("Pre-manual snapshot missing, incomplete, or derived from old checkpoint data")
    indexed = {}
    for result in results:
        i = result.get("sourceIndex")
        if not isinstance(i, int) or isinstance(i, bool) or i in indexed or not 0 <= i < EXPECTED_COUNT:
            raise ValueError("Missing/duplicate/out-of-range diagnostics sourceIndex")
        indexed[i] = result
    if len(indexed) != EXPECTED_COUNT:
        raise ValueError("Diagnostics source coverage incomplete")
    stats = {name: {"auto_correct": 0, "auto_wrong": 0, "review_or_manual": 0} for name in FIELD_NAMES}
    deviations = []
    fully_auto_correct = 0
    for i, golden in enumerate(golden_rows):
        filename = golden["画像ファイル"]
        row = indexed[i]
        if selected[i].get("name") != filename or row.get("file") != filename:
            raise ValueError(f"File correspondence mismatch at source index {i}")
        observed, flags = _observation(row)
        complete = True
        for j, field in enumerate(FIELD_NAMES):
            expected = _value(golden[field])
            value = observed[j]
            # Numeric values are never fuzzy-matched.
            good = value == expected
            typ = "review_or_manual" if not flags[j] else ("auto_correct" if good else "auto_wrong")
            stats[field][typ] += 1
            if typ != "auto_correct":
                complete = False
                deviations.append({"assetId": golden["assetId"], "file": filename, "field": field,
                                   "expected": expected, "observed": value, "classification": typ})
        if complete:
            fully_auto_correct += 1
    totals = {k: sum(v[k] for v in stats.values()) for k in ("auto_correct", "auto_wrong", "review_or_manual")}
    assert sum(totals.values()) == EXPECTED_COUNT * len(FIELD_NAMES)
    return {
        "schema": "meka142-step2-non-nickname-v1",
        "corpus": "meka142",
        "images": EXPECTED_COUNT,
        "fieldsPerImage": len(FIELD_NAMES),
        "totalFields": EXPECTED_COUNT * len(FIELD_NAMES),
        "nicknameExcluded": True,
        "fullAutoCorrectImages": fully_auto_correct,
        "totals": totals,
        "zeroWrongAutomaticConfirmation": totals["auto_wrong"] == 0,
        "allFieldsAutomaticallyCorrect": totals["auto_correct"] == EXPECTED_COUNT * len(FIELD_NAMES),
        "perField": stats,
        "nonAutoOrWrongDetails": deviations,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", required=True, help="Private 27-column meka142 Golden CSV")
    parser.add_argument("--images", required=True, help="Private meka142 original-image folder")
    parser.add_argument("--diagnostics", required=True, help="Fresh v12 unedited diagnostics JSON")
    parser.add_argument("--output", required=True, help="Private local JSON report path")
    args = parser.parse_args()
    golden = read_golden(args.golden)
    verify_images(args.images, golden)
    diag = json.loads(Path(args.diagnostics).read_text(encoding="utf-8-sig"))
    report = evaluate(golden, diag)
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
