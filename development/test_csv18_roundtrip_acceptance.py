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
    def test_box_superset_matches_only_scanned_entries_and_reports_scope(self):
        a,b=fixture()
        source=encode([a])
        box=encode([b,a,b])
        self.assertEqual(evaluate(source,box)["result"],"HOLD")
        result=evaluate(source,box,allow_extra_box_rows=True)
        self.assertEqual(result["result"],"PASS")
        self.assertTrue(result["sourceRowsPresentUnmodified"])
        self.assertFalse(result["logicalRowsIdentical"])
        self.assertEqual(result["matchingLogicalCells"],18)
        self.assertEqual(result["additionalUnverifiedBoxRows"],2)
        self.assertEqual(result["mintUsedRows"],1)
        self.assertEqual(result["mintUnusedRows"],0)
        self.assertFalse(result["bothMintStatesCovered"])
        self.assertEqual(evaluate(source,box,True,True)["result"],"HOLD")
    def test_box_superset_refuses_modified_mint_or_missing_duplicate(self):
        a,b=fixture()
        self.assertEqual(evaluate(encode([a,a]),encode([a,b]),
                                  allow_extra_box_rows=True)["result"],"HOLD")
        changed=a.copy();changed[9]="0"
        x=evaluate(encode([a]),encode([b,changed]),allow_extra_box_rows=True)
        self.assertEqual(x["result"],"HOLD")
        self.assertIn(10,x["changedColumnNumbersForUniqueNicknameSpecies"])
        changed=a.copy();changed[8]="やんちゃ"
        x=evaluate(encode([a]),encode([b,changed]),allow_extra_box_rows=True)
        self.assertEqual(x["result"],"HOLD")
        self.assertIn(9,x["changedColumnNumbersForUniqueNicknameSpecies"])
    def test_box_superset_still_validates_all_imported_rows(self):
        a,b=fixture()
        bad=b.copy();bad[9]="2"
        with self.assertRaisesRegex(ValueError,"mint flag"):
            evaluate(encode([a]),encode([a,bad]),allow_extra_box_rows=True)
    def test_mint_coverage_is_not_assumed(self):
        a,b=fixture();a[9]="0"
        self.assertEqual(evaluate(encode([a,b]),encode([a,b]),True)["result"],"HOLD")
    def test_blank_nickname_with_mint_is_losslessly_verified(self):
        a,b=fixture()
        a[0]=""
        out=evaluate(encode([a,b]),encode([a,b]),True)
        self.assertEqual(out["result"],"PASS")
        self.assertEqual((out["mintUsedRows"],out["mintUnusedRows"]),(1,1))
        self.assertEqual(out["matchingLogicalCells"],36)
        self.assertNotIn("ピカチュウ",str(out))
    def test_species_missing_and_whitespace_only_nickname_are_rejected(self):
        a,_=fixture()
        no_species=a.copy();no_species[1]=""
        with self.assertRaisesRegex(ValueError,"species"):
            parse_csv(encode([no_species]),"scan")
        blank_space=a.copy();blank_space[0]="   "
        with self.assertRaisesRegex(ValueError,"whitespace"):
            parse_csv(encode([blank_space]),"scan")
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
