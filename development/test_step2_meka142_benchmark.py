"""Synthetic tests only: no real screenshots, filenames, nicknames, or Golden in Git."""
import csv
import hashlib
import json
import tempfile
import zipfile
import io
import unittest
from pathlib import Path

from step2_meka142_benchmark import EXPECTED_COUNT, FIELD_NAMES, evaluate, read_golden, verify_images, verify_raw_csv
from final_evidence_gate import COLS, RAW, LEGACY_RAW


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
    raw_rows = [[i + 1, selected[i]["name"], "解析成功", *(["0"] * len(COLS))]
                for i in range(EXPECTED_COUNT)]
    assert all(len(row) == 21 for row in raw_rows)
    diag = {"version": "v12-synthetic", "results": results, "selectedFiles": selected,
            "preManualCsvSnapshot": {"schema": 2, "rowCount": EXPECTED_COUNT,
                                     "successfulRowCount": EXPECTED_COUNT,
                                     "header": list(RAW),
                                     "rows": raw_rows, "skipped": [], "derivedRows": []}}
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

    def test_both_historical_19_and_current_21_column_raw_snapshots(self):
        golden, diag = fixture()
        self.assertEqual(evaluate(golden,diag)['totalFields'],2272)
        snap=diag['preManualCsvSnapshot']
        snap['header']=list(LEGACY_RAW)
        snap['rows']=[[cell for j,cell in enumerate(row) if j not in (12,20)] for row in snap['rows']]
        self.assertTrue(all(len(row)==19 for row in snap['rows']))
        self.assertEqual(evaluate(golden,diag)['totalFields'],2272)
        snap['rows'][0].append('extra')
        with self.assertRaisesRegex(ValueError,'Missing/misaligned'):evaluate(golden,diag)
    def test_current_21_column_snapshot_rejects_missing_mint(self):
        golden,diag=fixture()
        diag['preManualCsvSnapshot']['rows'][0][12]=''
        with self.assertRaisesRegex(ValueError,'Missing/misaligned'):evaluate(golden,diag)
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


    def test_real_style_golden_zip_and_renamed_android_images(self):
        golden, diag = fixture()
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            image_zip = root / "meka142.zip"
            golden_zip = root / "golden172.zip"
            with zipfile.ZipFile(image_zip, "w") as ar:
                for i, row in enumerate(golden):
                    content = b"x" * (i + 1)
                    row["画像SHA256"] = hashlib.sha256(content).hexdigest()
                    ar.writestr("meka142/" + row["画像ファイル"], content)
                    renamed = f"10000{i:03d}.png"
                    diag["selectedFiles"][i]["name"] = renamed
                    diag["selectedFiles"][i]["size"] = len(content)
                    diag["results"][i]["file"] = renamed
                    diag["preManualCsvSnapshot"]["rows"][i][1] = renamed
            text = io.StringIO()
            writer = csv.DictWriter(text, fieldnames=list(golden[0]))
            writer.writeheader()
            writer.writerows(golden)
            # Golden172 contains nano30, but only meka142 may be evaluated.
            writer.writerow({**golden[0], "corpus": "nano30", "assetId": "NANO30-001",
                             "画像ファイル": "not_meka142.png"})
            with zipfile.ZipFile(golden_zip, "w") as ar:
                ar.writestr("GOLDEN_CORRECTED/正解表_全172.csv", text.getvalue())
            corrected = read_golden(golden_zip)
            self.assertEqual(len(corrected), 142)
            sizes = verify_images(image_zip, corrected)
            report = evaluate(corrected, diag, sizes)
            self.assertEqual(report["totals"]["auto_correct"], 2272)
            self.assertEqual(report["imageMapping"][0]["selectedAlias"], "10000000.png")
            rawcsv = root / "raw.csv"
            rows = [diag["preManualCsvSnapshot"]["header"], *diag["preManualCsvSnapshot"]["rows"]]
            with rawcsv.open("w", encoding="utf-8", newline="") as f:
                csv.writer(f).writerows(rows)
            verify_raw_csv(rawcsv, diag)
            diag["preManualCsvSnapshot"]["rows"][7][-1] = "changed"
            with self.assertRaisesRegex(ValueError, "does not equal"):
                verify_raw_csv(rawcsv, diag)

    def test_ambiguous_size_does_not_guess_original_image(self):
        golden, diag = fixture()
        same = {len(diag["selectedFiles"][0]["name"]): None}
        with self.assertRaisesRegex(ValueError, "uniquely map"):
            evaluate(golden, diag, same)

    def test_mythical_blank_is_different_from_dashed_csv(self):
        golden, diag = fixture()
        golden[0]["ポケモン名"] = "ダークライ"
        golden[0]["サブスキル5"] = "―"
        diag["results"][0]["classification"]["candidates"] = ["ダークライ"]
        diag["results"][0]["parsed"]["subskills"][-1] = ""
        # No confirming OCR evidence = still review, never auto-accept merely because legal.
        diag["results"][0]["parsed"]["subskillEvidence"][-1]["needsReview"] = True
        rep = evaluate(golden, diag)
        self.assertEqual(rep["totals"]["review_or_manual"], 1)
        self.assertEqual(rep["totals"]["auto_wrong"], 0)

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
