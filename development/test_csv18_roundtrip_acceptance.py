"""Only synthetic CSV data: no private screenshots, nicknames or exported boxes."""
import csv
import io
import unittest

from csv18_roundtrip_acceptance import evaluate, parse_csv
from final_evidence_gate import COLS


def encode(rows, ending="\n"):
    out = io.StringIO(newline="")
    w = csv.writer(out, lineterminator="\n")
    w.writerows([COLS, *rows])
    return out.getvalue().replace("\n", ending).encode("utf-8")


def fixture():
    base=["テスト,銘柄","ピカチュウ","30","1","とくせんリンゴ",
          "とくせんリンゴ","とくせんリンゴ","エナジーチャージS","いじっぱり",
          "1","きのみの数S","おてつだいスピードM","最大所持数アップS",
          "スキル確率アップM","食材確率アップM","0","0",""]
    second=base.copy()
    second[0]="「検証」"
    second[8]="おだやか"
    second[9]="0"
    return base, second


class Csv18RoundTripAcceptanceTest(unittest.TestCase):
    def test_exact_18_column_roundtrip_and_full_mint_coverage(self):
        a,b=fixture();raw=encode([a,b]);rep=evaluate(raw,raw,True)
        self.assertEqual(rep["result"],"PASS")
        self.assertEqual(rep["matchingLogicalCells"],36)
        self.assertEqual((rep["mintUsedRows"],rep["mintUnusedRows"]),(1,1))
    def test_reordered_rows_and_line_endings_are_semantically_identical(self):
        a,b=fixture()
        rep=evaluate(encode([a,b]),encode([b,a],ending="\r\n"),True)
        self.assertEqual(rep["result"],"PASS")
        self.assertFalse(rep["rowOrderIdentical"])
        self.assertFalse(rep["byteIdentical"])
    def test_mint_flag_or_original_nature_change_is_never_silent(self):
        a,b=fixture();changed=a.copy();changed[9]="0"
        rep=evaluate(encode([a,b]),encode([changed,b]),True)
        self.assertEqual(rep["result"],"HOLD")
        self.assertIn(10,rep["changedColumnNumbersForUniqueNicknameSpecies"])
        changed=a.copy();changed[8]="やんちゃ"
        rep=evaluate(encode([a,b]),encode([changed,b]))
        self.assertIn(9,rep["changedColumnNumbersForUniqueNicknameSpecies"])
    def test_extra_box_rows_and_duplicate_occurrences_do_not_pass(self):
        a,b=fixture()
        self.assertEqual(evaluate(encode([a,b]),encode([a,b,b]))["result"],"HOLD")
        self.assertEqual(evaluate(encode([a,a]),encode([a]))["result"],"HOLD")
        self.assertEqual(evaluate(encode([a,a]),encode([a,a]))["result"],"PASS")
    def test_mint_coverage_is_not_assumed(self):
        a,b=fixture();a[9]="0"
        self.assertEqual(evaluate(encode([a,b]),encode([a,b]),True)["result"],"HOLD")
    def test_wrong_mint_neutral_nature_favorite_and_header_are_rejected(self):
        a,_=fixture()
        for i,change in [(9,"2"),(17,"1")]:
            wrong=a.copy();wrong[i]=change
            with self.assertRaises(ValueError):parse_csv(encode([wrong]),"scan")
        a[8]="てれや"
        with self.assertRaisesRegex(ValueError,"neutral"):parse_csv(encode([a]),"scan")
        a,_=fixture()
        legacy=[v for i,v in enumerate(a) if i not in (9,17)]
        h=[v for i,v in enumerate(COLS) if i not in (9,17)]
        out=io.StringIO();csv.writer(out).writerows([h,legacy])
        with self.assertRaisesRegex(ValueError,"18-column"):parse_csv(out.getvalue().encode(),"scan")
    def test_privacy_of_mismatch_summary(self):
        a,b=fixture();ret=b.copy();ret[8]="てれや"
        result=evaluate(encode([a,b]),encode([a,ret]))
        text=str(result)
        self.assertNotIn(a[0],text)
        self.assertNotIn(b[0],text)
        self.assertNotIn("ピカチュウ",text)
