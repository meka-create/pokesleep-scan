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

def receipt(result: str, now: dt.datetime | None = None) -> dict:
    if result not in {"success", "failure", "cancelled", "skipped"}:
        raise ValueError("Unknown GitHub job result")
    t = now or dt.datetime.now(dt.timezone.utc)
    if t.tzinfo is None:
        raise ValueError("Time must have a timezone")
    return {
        "schemaVersion": SCHEMA,
        "state": "healthy" if result == "success" else "attention",
        "checkedAt": t.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "reasonCode": "SYNC_OK" if result == "success" else "SYNC_FAILED",
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--result", choices=("success","failure","cancelled","skipped"), required=True)
    args = p.parse_args()
    OUTPUT.write_text(json.dumps(receipt(args.result),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Master update health:", args.result)

if __name__ == "__main__":
    main()
