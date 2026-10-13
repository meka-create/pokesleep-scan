"""Synthetic-only tests for private nickname gate. No Golden or screenshots in Git."""
from __future__ import annotations
import unittest
from nickname_meka142_gate import compare_records


class NicknameGateTests(unittest.TestCase):
    def fixture(self):
        truth = {f"MEKA142-{i:03d}": f"name{i}" for i in range(1, 11)}
        before = {}
        for i, asset in enumerate(truth, start=1):
            name = truth[asset] if i <= 8 else "wrong"
            before[asset] = {
                "nickname": name, "review": i != 9,
                "otherValues": [f"field{x}-{i}" for x in range(16)],
                "otherAuto": [True] * 15 + [False],
            }
        # 8 right+review, 1 wrong+auto, 1 wrong+review
        after = {k: {**v} for k, v in before.items()}
        return truth, before, after

    def test_safe_improvement_and_thresholds(self):
        golden, before, after = self.fixture()
        after["MEKA142-010"] = {
            **after["MEKA142-010"], "nickname": golden["MEKA142-010"]
        }
        report = compare_records(golden, before, after)
        self.assertEqual(report["nickname"]["baselineCorrect"], 8)
        self.assertEqual(report["nickname"]["candidateCorrect"], 9)
        self.assertEqual(report["nickname"]["candidateWrongAuto"], 1)
        self.assertTrue(report["safetyPass"])
        self.assertTrue(report["minimumAcceptancePass"])
        self.assertFalse(report["nickname"]["meets95"])

    def test_same_wrong_auto_count_but_new_false_accept_is_rejected(self):
        golden, before, after = self.fixture()
        after["MEKA142-009"] = {**after["MEKA142-009"], "review": True}
        after["MEKA142-010"] = {**after["MEKA142-010"], "review": False}
        report = compare_records(golden, before, after)
        self.assertEqual(report["nickname"]["candidateWrongAuto"], 1)
        self.assertEqual(report["nickname"]["newWrongAutoIds"], ["MEKA142-010"])
        self.assertFalse(report["safetyPass"])

    def test_correct_auto_confirmation_must_remain_correct_and_auto(self):
        golden, before, after = self.fixture()
        # Make one correct baseline item auto-confirmed; then demote it.
        before["MEKA142-001"] = {**before["MEKA142-001"], "review": False}
        after["MEKA142-001"] = {**after["MEKA142-001"], "review": True}
        result = compare_records(golden, before, after)
        self.assertEqual(result["nickname"]["lostCorrectAutoIds"], ["MEKA142-001"])
        self.assertFalse(result["safetyPass"])

    def test_other_field_value_or_review_change_is_rejected(self):
        golden, before, after = self.fixture()
        after["MEKA142-004"] = {
            **after["MEKA142-004"],
            "otherValues": [*before["MEKA142-004"]["otherValues"][:-1], "changed"],
        }
        self.assertFalse(compare_records(golden, before, after)["safetyPass"])
        _, before, after = self.fixture()
        after["MEKA142-002"] = {
            **after["MEKA142-002"], "otherAuto": [False] * 16,
        }
        report = compare_records(golden, before, after)
        self.assertEqual(report["otherFields"]["changedImageIds"], ["MEKA142-002"])
        self.assertFalse(report["safetyPass"])

    def test_identity_collision_and_missing_rows_fail_closed(self):
        golden, before, after = self.fixture()
        del after["MEKA142-010"]
        with self.assertRaisesRegex(ValueError, "identities"):
            compare_records(golden, before, after)

    def test_minimum_counts_for_exact_142(self):
        golden = {f"MEKA142-{i:03d}": f"n{i}" for i in range(1, 143)}
        before = {}
        for i, asset in enumerate(golden, start=1):
            before[asset] = {
                "nickname": golden[asset] if i <= 119 else "incorrect",
                "review": True, "otherValues": [i] * 16,
                "otherAuto": [True] * 16,
            }
        after = {asset: {**record} for asset, record in before.items()}
        for i in range(120, 128):
            asset = f"MEKA142-{i:03d}"
            after[asset] = {**after[asset], "nickname": golden[asset]}
        result = compare_records(golden, before, after)
        self.assertEqual(result["nickname"]["minimum90Count"], 128)
        self.assertEqual(result["nickname"]["stretch95Count"], 135)
        self.assertEqual(result["nickname"]["candidateCorrect"], 127)
        self.assertFalse(result["minimumAcceptancePass"])
        asset = "MEKA142-128"
        after[asset] = {**after[asset], "nickname": golden[asset]}
        self.assertTrue(compare_records(golden, before, after)["minimumAcceptancePass"])


if __name__ == "__main__":
    unittest.main()
