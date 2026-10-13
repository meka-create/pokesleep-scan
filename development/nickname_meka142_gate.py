#!/usr/bin/env python3
"""Private meka142 nickname acceptance audit (no images or Golden in Git).

Example:
 python development/nickname_meka142_gate.py \
   --golden /private/正解表_meka142.csv --images /private/meka142.zip \
   --baseline /private/diagnostics_before.json \
   --candidate /private/diagnostics_after.json \
   --expect-revision 20261013-nickname-caption-review-v1 \
   --output /private/nickname_gate_report.json

This is a *real-new-OCR-run* comparison, not a replay of prior saved candidates.
All 16 other fields must remain value- and auto-review-identical. Reject any
new nickname false auto-confirmation, any lost correct auto-confirmation, and
any manually edited/pre-filled data. Do not commit outputs: they contain
private image IDs and correctness information.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from step2_meka142_benchmark import (
    EXPECTED_COUNT, _observation, evaluate, read_golden, verify_images,
    verify_raw_csv,
)


def diagnostics_by_asset(golden_rows, images, diag, raw_csv=None):
    """Require original SHA-matched image identity and untouched 142-image OCR."""
    verify_raw_csv(raw_csv, diag)
    nonnick = evaluate(golden_rows, diag, images)
    if nonnick["verifiedImageCount"] != EXPECTED_COUNT:
        raise ValueError("Original image SHA-256 verification is mandatory")
    results = {r["sourceIndex"]: r for r in diag["results"]}
    mapping = {}
    for ref in nonnick["imageMapping"]:
        asset = ref["assetId"]
        result = results[ref["sourceIndex"]]
        parsed = result.get("parsed") or {}
        at_analysis = parsed.get("nicknameReviewAtAnalysis")
        if result.get("manualCompletion") or parsed.get("nicknameManualConfirmed"):
            raise ValueError("Manually edited nickname/results are not valid test data: " + asset)
        if not isinstance(at_analysis, dict):
            raise ValueError("Nickname at-analysis snapshot is missing: " + asset)
        name = parsed.get("nickname")
        review = parsed.get("nicknameNeedsReview")
        if not isinstance(name, str) or not isinstance(review, bool):
            raise ValueError("Malformed nickname or review flag: " + asset)
        if name != at_analysis.get("value") or review != at_analysis.get("needsReview"):
            raise ValueError("Nickname differs from immutable OCR-time snapshot: " + asset)
        values, flags = _observation(result)
        mapping[asset] = {"nickname": name, "review": review,
                          "otherValues": values, "otherAuto": flags}
    if len(mapping) != EXPECTED_COUNT:
        raise ValueError("Incomplete or duplicate nickname corpus")
    return mapping, nonnick


def compare_records(golden, before, after):
    """Pure acceptance logic, also independently tested with synthetic data."""
    if set(golden) != set(before) or set(golden) != set(after):
        raise ValueError("Baseline, candidate and Golden identities do not agree")
    total = len(golden)
    if not total:
        raise ValueError("Empty corpus")
    old_correct = new_correct = old_wrong_auto = new_wrong_auto = 0
    old_good_auto = new_good_auto = 0
    new_false = []
    degraded_good_auto = []
    other_differences = []
    nickname_regressions = []
    nickname_improvements = []
    for asset in sorted(golden):
        truth = golden[asset]
        old, new = before[asset], after[asset]
        oc = old["nickname"] == truth
        nc = new["nickname"] == truth
        oa = not old["review"]
        na = not new["review"]
        old_correct += oc
        new_correct += nc
        old_wrong_auto += oa and not oc
        new_wrong_auto += na and not nc
        old_good_auto += oa and oc
        new_good_auto += na and nc
        if na and not nc and not (oa and not oc):
            new_false.append(asset)
        if oa and oc and not (na and nc):
            degraded_good_auto.append(asset)
        if oc and not nc:
            nickname_regressions.append(asset)
        if nc and not oc:
            nickname_improvements.append(asset)
        if old["otherValues"] != new["otherValues"] or old["otherAuto"] != new["otherAuto"]:
            other_differences.append(asset)
    minimum = (total * 90 + 99) // 100
    stretch = (total * 95 + 99) // 100
    result = {
        "schema": "meka142-nickname-gate-v1",
        "images": total,
        "nickname": {
            "baselineCorrect": old_correct, "candidateCorrect": new_correct,
            "baselineWrongAuto": old_wrong_auto, "candidateWrongAuto": new_wrong_auto,
            "baselineCorrectAuto": old_good_auto, "candidateCorrectAuto": new_good_auto,
            "newWrongAutoIds": new_false, "lostCorrectAutoIds": degraded_good_auto,
            "newlyCorrectIds": nickname_improvements,
            "regressedCorrectIds": nickname_regressions,
            "minimum90Count": minimum, "stretch95Count": stretch,
            "meets90": new_correct >= minimum,
            "meets95": new_correct >= stretch,
        },
        "otherFields": {
            "checkedPerImage": 16, "checkedCells": 16 * total,
            "changedImageIds": other_differences,
            "identical": not other_differences,
        },
    }
    result["safetyPass"] = (
        old_wrong_auto <= 1 and new_wrong_auto <= old_wrong_auto
        and not new_false and not degraded_good_auto and not other_differences
    )
    result["minimumAcceptancePass"] = (
        result["safetyPass"] and new_correct >= minimum
    )
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("golden", "images", "baseline", "candidate", "output"):
        p.add_argument("--" + arg, required=True)
    p.add_argument("--baseline-rawcsv")
    p.add_argument("--candidate-rawcsv")
    p.add_argument("--expect-revision", required=True)
    args = p.parse_args()
    golden = read_golden(args.golden)
    verified = verify_images(args.images, golden)
    baseline_diag = json.loads(Path(args.baseline).read_text(encoding="utf-8-sig"))
    candidate_diag = json.loads(Path(args.candidate).read_text(encoding="utf-8-sig"))
    if baseline_diag.get("codeRevision") == candidate_diag.get("codeRevision"):
        raise ValueError("Candidate uses the same code revision as baseline")
    if candidate_diag.get("codeRevision") != args.expect_revision:
        raise ValueError("Unexpected candidate code revision: " +
                         str(candidate_diag.get("codeRevision")))
    before, old_report = diagnostics_by_asset(golden, verified, baseline_diag, args.baseline_rawcsv)
    after, new_report = diagnostics_by_asset(golden, verified, candidate_diag, args.candidate_rawcsv)
    ground_truth = {r["assetId"]: r["ニックネーム"] for r in golden}
    result = compare_records(ground_truth, before, after)
    result["baselineRevision"] = baseline_diag.get("codeRevision")
    result["candidateRevision"] = candidate_diag.get("codeRevision")
    result["baselineNonNickname"] = old_report["totals"]
    result["candidateNonNickname"] = new_report["totals"]
    result["safetyPass"] = (
        result["safetyPass"] and old_report["totals"]["auto_wrong"] == 0
        and new_report["totals"]["auto_wrong"] == 0
    )
    result["minimumAcceptancePass"] = (
        result["safetyPass"] and result["nickname"]["meets90"]
    )
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("Nickname exact:", result["nickname"]["baselineCorrect"], "->",
          result["nickname"]["candidateCorrect"], "/", EXPECTED_COUNT)
    print("Wrong auto:", result["nickname"]["baselineWrongAuto"], "->",
          result["nickname"]["candidateWrongAuto"])
    print("Other cells identical:", result["otherFields"]["identical"])
    print("Safety gate:", "PASS" if result["safetyPass"] else "FAIL")
    print("90% minimum gate:", "PASS" if result["minimumAcceptancePass"] else "FAIL")
    print("95% stretch:", "PASS" if result["nickname"]["meets95"] else "NOT YET")
    return 0 if result["minimumAcceptancePass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
