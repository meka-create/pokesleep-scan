"""Synthetic privacy regression: no real screenshots, Golden, or diagnostics."""
import unittest
from generate_public_package_manifest import private_file_risk

class PublicationGuardTests(unittest.TestCase):
    def test_block_unexpected_user_uploads_and_renamed_corpa(self):
        forbidden = [
            "meka142.zip", "subfolder/Golden172_Nickname.zip",
            "debug/pokesleep_ocr_raw_before_review_20261013.csv",
            "raw/Screenshot_20261008-004323.png",
            "MEKA142-005.png", "tests/IMG_4226.jpg",
            "diagnostics.json", "output/analysis.json",
            "private_replay_data.txt",
            "exports/正解表_全172.csv", "data/raw_export.tsv",
            "notes/screenshot_images.7z",
            "backup/database.sqlite", "userdata/session.jsonl",
            "user-feedback.pdf",
        ]
        for path in forbidden:
            with self.subTest(path=path):
                self.assertTrue(private_file_risk(path),path)

    def test_allow_existing_intended_public_code_assets_and_master(self):
        permitted = [
            ".gitignore",".github/workflows/pixel142-main-release.yml",
            "app.js","development/test_public_package_privacy.py",
            "development/nickname_meka142_gate.py",
            "development/step2_meka142_benchmark.py",
            "development/nickname_freeze.test.cjs",
            "development/ROADMAP_20261013.md",
            "assets/example-screenshot.png","assets/food-icons/tomato.png",
            "icons/icon-192.png", "shared/MASTER_DATA.json",
            "shared/master_release.json", "release.json",
            "master-update-status.json", "master_data.js"
        ]
        for path in permitted:
            with self.subTest(path=path):
                self.assertEqual(private_file_risk(path),'',path)
    def test_fail_closed_for_unreviewed_json_even_if_not_named_diagnostics(self):
        self.assertIn("JSON",private_file_risk("development/corpus_metadata.json"))
        self.assertIn("JSON",private_file_risk("profile.json"))
        self.assertEqual(private_file_risk("shared/MASTER_DATA.json"),'')

if __name__=="__main__":
    unittest.main()
