#!/usr/bin/env python3
"""Adversarial tests: STEP1 verifier must reject mutated runtime and lock."""
from __future__ import annotations
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "development/verify_baseline.py"


class BaselineMutationTests(unittest.TestCase):
    def setUp(self):
        self.working = tempfile.TemporaryDirectory(prefix="ocr_step1_")
        self.addCleanup(self.working.cleanup)
        self.root = Path(self.working.name) / "repo"
        # Mirror the runtime/verification inputs, but never copy .git or user images.
        self.root.mkdir()
        shutil.copytree(ROOT / "development", self.root / "development",
                        ignore=shutil.ignore_patterns("__pycache__"), dirs_exist_ok=True)
        for info in json.loads((ROOT / "public_package_manifest.json").read_text(
                encoding="utf-8"))["files"]:
            p = ROOT / info["path"]
            if p.is_file():
                dest = self.root / info["path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, dest)
        shutil.copy2(ROOT / "public_package_manifest.json", self.root / "public_package_manifest.json")

    def run_check(self, *args):
        cp = subprocess.run([sys.executable, str(VERIFY), "--root", str(self.root), *args],
                            capture_output=True, text=True, check=False)
        self.assertTrue(cp.stdout.strip(), cp.stderr)
        return cp.returncode, json.loads(cp.stdout)

    def test_intact_runtime_warns_about_missing_nojekyll(self):
        rc, report = self.run_check()
        self.assertEqual(rc, 0)
        self.assertEqual(report["status"], "PASS_WITH_WARNINGS")
        self.assertEqual(report["missingRuntimeFiles"], [".nojekyll"])
        self.assertEqual(report["runtimeHashesChecked"], 16)

    def test_edited_app_js_must_fail(self):
        p = self.root / "app.js"
        p.write_bytes(p.read_bytes() + b"\n// mutation\n")
        rc, report = self.run_check()
        self.assertNotEqual(rc, 0)
        self.assertTrue(any("app.js" in x for x in report["failures"]))

    def test_removed_classifier_must_fail(self):
        (self.root / "classifier.js").unlink()
        rc, report = self.run_check()
        self.assertNotEqual(rc, 0)
        self.assertTrue(any("classifier.js" in x for x in report["failures"]))

    def test_candidate_promotion_must_fail(self):
        p = self.root / "public_package_manifest.json"
        obj = json.loads(p.read_text(encoding="utf-8"))
        obj["provisional"] = False
        p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        rc, report = self.run_check()
        self.assertNotEqual(rc, 0)
        self.assertTrue(any("promoted" in x for x in report["failures"]))

    def test_lock_changed_to_formal_must_fail(self):
        p = self.root / "development/BASELINE_LOCK.json"
        obj = json.loads(p.read_text(encoding="utf-8"))
        obj["formalBaseline"]["candidate"] = "Candidate125"
        p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        rc, report = self.run_check()
        self.assertNotEqual(rc, 0)
        self.assertTrue(any("formal" in x.lower() for x in report["failures"]))

    def test_untrusted_ai_master_fails(self):
        p = self.root / "ai-master.json"
        p.write_text('{"pokemon":[]}', encoding="utf-8")
        rc, report = self.run_check("--ai-master", str(p))
        self.assertNotEqual(rc, 0)
        self.assertEqual(report["aiPinnedMasterComparison"], "MISMATCH")


if __name__ == "__main__":
    unittest.main(verbosity=2)
