"""Synthetic tests only: no real screenshots, filenames, nicknames, or Golden in Git."""
import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from step2_meka142_benchmark import EXPECTED_COUNT, FIELD_NAMES, evaluate, read_golden, verify_images


def fixture():
    golden, results, selected = [], [], []
    for i in range(EXPECTED_COUNT):
        name = f"synthetic_{i:03d}.png"
        fields = {
            "ポケモン名": "フシギダネ", "レベル": "10", "SP": "501",
            "おてつだい時間_秒": "4303", "最大所持数": "11",
            "メインスキルLv": "1", "メインスキル": "食材ゲットS", "せいかく": "てれや",
            "食材1": "あまいミツ", "食材2": "あんみんトマト", "食材3": "ほっこりポテト",
        }
        for j in range(5):
            fields[f"サブスキル{j+1}"] = f"合成スキル{j+1}"
        golden.append({"index": str(i), "corpus": "meka142", "assetId": f"MEKA142-{i+1:03d}",
                       "画像ファイル": name, "画像SHA256": hashlib.sha256(name.encode()).hexdigest(), **fields})
        selected.append({"name": name, "size": len(name), "type": "image/png"})
        results.append({
            "file": name, "sourceIndex": i, "classification": {"status": "UNIQUE", "candidates": ["フシギダネ"],
                                                              "speciesManualOverride": ""},
            "reviewState": {"species": False, "level": False, "sp": False, "helpSeconds": False,
                            "skillLevel": False, "mainSkill": False, "nature": False},
            "parsed": {"level": 10, "sp": 501, "helpSeconds": 4303, "carry": 11, "skillLevel": 1,
                       "mainSkill": "食材ゲットS", "nature": "てれや",
                       "carryOcrUnresolved": False, "carryNeedsReview": False,
                       "subskills": [f"合成スキル{j+1}" for j in range(5)],
                       "subskillReviewSlots": [],
                       "subskillEvidence": [{"needsReview": False, "reviewReason": "strong-ocr"} for _ in range(5)]},
            "foods": [{"name": x, "needsReview": False, "manualOverride": False}
                      for x in ("あまいミツ", "あんみんトマト", "ほっこりポテト")],
        })
    diag = {"version": "v12-synthetic", "results": results, "selectedFiles": selected,
            "preManualCsvSnapshot": {"rowCount": EXPECTED_COUNT, "skipped": [], "derivedRows": []}}
    return golden, diag


class Meka142BenchmarkTest(unittest.TestCase):
    def test_synthetic_all_142_fully_auto_correct(self):
        golden, diag = fixture()
        rep = evaluate(golden, diag)
        self.assertEqual(rep["totalFields"], 2272)
        self.assertEqual(rep["totals"], {"auto_correct": 2272, "auto_wrong": 0, "review_or_manual": 0})
        self.assertEqual(rep["fullAutoCorrectImages"], 142)
        self.assertTrue(rep["allFieldsAutomaticallyCorrect"])

    def test_false_auto_confirmation_is_detected(self):
        golden, diag = fixture()
        diag["results"][2]["parsed"]["level"] = 11
        rep = evaluate(golden, diag)
        self.assertEqual(rep["totals"]["auto_wrong"], 1)
        self.assertFalse(rep["zeroWrongAutomaticConfirmation"])
        self.assertEqual(rep["nonAutoOrWrongDetails"][0]["field"], "レベル")

    def test_manual_or_review_never_counts_as_auto_success(self):
        golden, diag = fixture()
        diag["results"][0]["reviewState"]["level"] = True
        diag["results"][1]["foods"][0]["manualOverride"] = True
        diag["results"][2]["parsed"]["subskillEvidence"][0]["reviewReason"] = "manual-inline-confirmed"
        rep = evaluate(golden, diag)
        self.assertEqual(rep["totals"]["auto_wrong"], 0)
        self.assertEqual(rep["totals"]["review_or_manual"], 3)
        self.assertFalse(rep["allFieldsAutomaticallyCorrect"])

    def test_derived_pre_manual_snapshot_refused(self):
        golden, diag = fixture()
        diag["preManualCsvSnapshot"]["derivedRows"].append({"sourceIndex": 1})
        with self.assertRaisesRegex(ValueError, "derived"):
            evaluate(golden, diag)

    def test_strict_142_correspondence(self):
        golden, diag = fixture()
        diag["selectedFiles"][13]["name"] = "different.png"
        with self.assertRaisesRegex(ValueError, "correspondence"):
            evaluate(golden, diag)
        golden, diag = fixture()
        diag["results"].pop()
        with self.assertRaisesRegex(ValueError, "142 selected"):
            evaluate(golden, diag)

    def test_read_golden_and_original_image_sha_gate(self):
        golden, _ = fixture()
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            images = root / "images"
            images.mkdir()
            golden_csv = root / "golden.csv"
            with golden_csv.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=list(golden[0]))
                writer.writeheader()
                writer.writerows(golden)
            for row in golden:
                (images / row["画像ファイル"]).write_bytes(row["画像ファイル"].encode())
            read_back = read_golden(golden_csv)
            self.assertEqual(len(read_back), 142)
            verify_images(images, read_back)
            (images / golden[42]["画像ファイル"]).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify_images(images, read_back)


if __name__ == "__main__":
    unittest.main()
