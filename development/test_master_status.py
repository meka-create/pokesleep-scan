"""Master sync status is honest, isolated and not a release master replacement."""
import datetime as dt
import pathlib
import sys
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"development"))
from publish_master_status import receipt, SCHEMA

class MasterStatusTest(unittest.TestCase):
    def test_all_expected_states(self):
        now=dt.datetime(2026,10,12,19,0,tzinfo=dt.timezone.utc)
        for result in ("success","failure","cancelled","skipped"):
            data=receipt(result,now)
            self.assertEqual(data["schemaVersion"],SCHEMA)
            self.assertEqual(data["state"],"healthy" if result=="success" else "attention")
            self.assertEqual(data["checkedAt"],"2026-10-12T19:00:00Z")
            self.assertIn("reasonCode",data)
    def test_past_arrival_unready_new_species_warns_but_does_not_replace_master(self):
        now=dt.datetime(2026,10,26,19,0,tzinfo=dt.timezone.utc)
        healthy=receipt("success",now,overdue_new_species=False)
        pending=receipt("success",now,overdue_new_species=True)
        failed=receipt("failure",now,overdue_new_species=True)
        self.assertEqual(healthy["state"],"healthy")
        self.assertEqual(healthy["reasonCode"],"SYNC_OK")
        self.assertEqual(pending["state"],"attention")
        self.assertEqual(pending["reasonCode"],"NEW_SPECIES_PENDING")
        self.assertEqual(failed["reasonCode"],"SYNC_FAILED")
        self.assertEqual(pending["checkedAt"],healthy["checkedAt"])
    def test_workflow_propagates_the_overdue_flag_without_failing_sync(self):
        w=(ROOT/".github/workflows/independent-master-sync.yml").read_text(encoding="utf-8")
        self.assertIn("overdue_new_species:",w)
        self.assertIn("steps.stage.outputs.overdue_new_species",w)
        self.assertIn("needs.sync.outputs.overdue_new_species",w)
        self.assertIn('status.get("overdueNewSpecies",[])',w)
        self.assertIn("--pending",w)
    def test_invalid_result_or_naive_time_refused(self):
        with self.assertRaises(ValueError):receipt("unverified")
        with self.assertRaises(ValueError):receipt("success",dt.datetime(2026,10,12))
    def test_workflow_attempts_reporting_even_if_sync_fails(self):
        w=(ROOT/".github/workflows/independent-master-sync.yml").read_text(encoding="utf-8")
        self.assertIn("cron: '0 19 * * *'",w)
        self.assertIn("publish-status:",w)
        self.assertIn("if: always()",w)
        self.assertIn("needs: [sync]",w)
        self.assertIn("needs.sync.result",w)
        self.assertIn("git add -- master-update-status.json public_package_manifest.json",w)
        self.assertNotIn("git add -A",w)
if __name__=="__main__":unittest.main()
