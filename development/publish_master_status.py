#!/usr/bin/env python3
"""Write a public status receipt *only*, preserving the last verified master.

GitHub Actions runs this in a separate job after daily sync even when sync
fails. Its own failure is detected by the browser's stale-receipt deadline.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "master-update-status.json"
SCHEMA = "pokesleep-ocr-master-status-v1"

def receipt(result: str, now: dt.datetime | None = None,
            overdue_new_species: bool = False, pending_category: str = "mixed") -> dict:
    if result not in {"success", "failure", "cancelled", "skipped"}:
        raise ValueError("Unknown GitHub job result")
    if pending_category not in ("collision","data","mixed"):
        raise ValueError("Unknown pending category")
    t = now or dt.datetime.now(dt.timezone.utc)
    if t.tzinfo is None:
        raise ValueError("Time must have a timezone")
    return {
        "schemaVersion": SCHEMA,
        "state": "healthy" if result == "success" and not overdue_new_species else "attention",
        "checkedAt": t.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "reasonCode": ("SYNC_FAILED" if result != "success" else
                       "SYNC_OK" if not overdue_new_species else
                       {"collision":"NEW_FORM_NAME_CONFLICT",
                        "data":"NEW_SPECIES_DATA_INCOMPLETE",
                        "mixed":"NEW_SPECIES_PENDING"}[pending_category]),
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--result", choices=("success","failure","cancelled","skipped"), required=True)
    p.add_argument("--pending", choices=("true", "false"), default="false",
                   help="A new species has reached its arrival date but remains provisional")
    p.add_argument("--pending-category",choices=("collision","data","mixed"),
                   default="mixed",help="Why due new forms remain unpublishable")
    args = p.parse_args()
    OUTPUT.write_text(json.dumps(receipt(
        args.result,overdue_new_species=args.pending=="true",
        pending_category=args.pending_category),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Master update health:", args.result, "overdue_new_species:", args.pending,
          "category:", args.pending_category)

if __name__ == "__main__":
    main()
