#!/usr/bin/env python3
"""Offline 18-column CSV round-trip acceptance; never uploads or prints private data."""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path

from final_evidence_gate import COLS

NEUTRAL_NATURES = frozenset(("てれや", "がんばりや", "すなお", "きまぐれ", "まじめ"))


def parse_csv(data: bytes, label: str) -> list[tuple[str, ...]]:
    """Parse importable CSV. Exception texts contain no Pokémon/nickname values."""
    try:
        source = data.decode("utf-8", errors="strict")
    except UnicodeError as exc:
        raise ValueError(f"{label}: not valid UTF-8") from exc
    if source.startswith("\ufeff"):
        raise ValueError(f"{label}: UTF-8 BOM not supported")
    try:
        records = list(csv.reader(io.StringIO(source, newline=""), strict=True))
    except csv.Error as exc:
        raise ValueError(f"{label}: malformed CSV quoting") from exc
    if not records or tuple(records[0]) != COLS:
        raise ValueError(f"{label}: expected exact current 18-column header")
    if len(records) < 2:
        raise ValueError(f"{label}: no Pokémon data rows")
    for line_number, row in enumerate(records[1:], start=2):
        if len(row) != 18:
            raise ValueError(f"{label}: wrong column count at record {line_number}")
        # BoxImporter accepts an empty nickname. Species is mandatory;
        # whitespace-only nicknames would be trimmed by upstream and lose bytes.
        if not row[1].strip():
            raise ValueError(f"{label}: missing species at record {line_number}")
        if row[0] and not row[0].strip():
            raise ValueError(f"{label}: whitespace-only nickname at record {line_number}")
        if row[9] not in ("0", "1"):
            raise ValueError(f"{label}: invalid mint flag at record {line_number}")
        if row[9] == "1" and row[8] in NEUTRAL_NATURES:
            raise ValueError(f"{label}: neutral nature cannot retain mint at record {line_number}")
        if row[17] != "":
            raise ValueError(f"{label}: unexpected favorite field at record {line_number}")
        if any(any(ord(ch) < 32 or ord(ch) == 127 for ch in val) for val in row):
            raise ValueError(f"{label}: control character at record {line_number}")
    return [tuple(row) for row in records[1:]]


def evaluate(scan_csv: bytes, returned_csv: bytes, require_both_mint_states: bool = False,
             allow_extra_box_rows: bool = False) -> dict:
    """Strict by default; optional Box-superset comparison for existing entries.

    Even in subset mode every scanned row (including duplicate occurrences)
    must be matched exactly. No private names or row values are reported.
    """
    source = parse_csv(scan_csv, "scan")
    returned = parse_csv(returned_csv, "returned")
    mints = sum(row[9] == "1" for row in source)
    unmatched_source = Counter(source) - Counter(returned)
    unmatched_returned = Counter(returned) - Counter(source)
    equal = not unmatched_source and not unmatched_returned
    source_rows_preserved = not unmatched_source
    accepted_match = source_rows_preserved if allow_extra_box_rows else equal
    coverage = mints > 0 and mints < len(source)
    changed_fields = set()
    source_pairs = {}
    returned_pairs = {}
    for row in source:
        source_pairs.setdefault(row[:2], []).append(row)
    for row in returned:
        returned_pairs.setdefault(row[:2], []).append(row)
    # Only compare unique nickname/species pairs; duplicates cannot be matched
    # unambiguously. Multiset equality above still tests duplicates exactly.
    for key, records in source_pairs.items():
        other = returned_pairs.get(key, [])
        if len(records) == len(other) == 1:
            changed_fields.update(i + 1 for i, (a, b) in
                                  enumerate(zip(records[0], other[0])) if a != b)
    status = "PASS" if accepted_match and (coverage or not require_both_mint_states) else "HOLD"
    return {
        "result": status, "schemaColumns": 18,
        "scanRows": len(source), "returnedRows": len(returned),
        "mintUsedRows": mints, "mintUnusedRows": len(source) - mints,
        "bothMintStatesCovered": coverage,
        "requireBothMintStates": bool(require_both_mint_states),
        "allowExtraBoxRows": bool(allow_extra_box_rows),
        "sourceRowsPresentUnmodified": source_rows_preserved,
        "logicalRowsIdentical": equal,
        "rowOrderIdentical": source == returned,
        "byteIdentical": scan_csv == returned_csv,
        "matchingLogicalCells": 18 * len(source) if accepted_match else None,
        "unmatchedScanRowOccurrences": sum(unmatched_source.values()),
        "unmatchedReturnedRowOccurrences": sum(unmatched_returned.values()),
        "additionalUnverifiedBoxRows": sum(unmatched_returned.values()),
        "changedColumnNumbersForUniqueNicknameSpecies": sorted(changed_fields),
        "scanSha256": hashlib.sha256(scan_csv).hexdigest(),
        "returnedSha256": hashlib.sha256(returned_csv).hexdigest(),
        "privacy": "No names, Pokémon values, or full CSV rows are printed",
        "scope": ("Verifies scanned rows against returned Box. Existing Box rows are not "
                  "independently checked for previous changes; OCR image accuracy not established"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan", required=True, type=Path, help="18-column CSV saved on Pixel 7a")
    parser.add_argument("--returned", required=True, type=Path,
                        help="CSV exported after importing into pokesleep-tool")
    parser.add_argument("--require-both-mint-states", action="store_true",
                        help="Require mint-used and mint-unused rows in the scanned CSV")
    parser.add_argument("--allow-extra-box-rows", action="store_true",
                        help="Ignore unrelated existing Box entries; still match all scanned rows")
    args = parser.parse_args()
    try:
        report = evaluate(args.scan.read_bytes(), args.returned.read_bytes(),
                          args.require_both_mint_states, args.allow_extra_box_rows)
    except (OSError, ValueError) as exc:
        # Sanitized errors only; do not echo raw file paths or private CSV data.
        reason = str(exc) if isinstance(exc, ValueError) else "Cannot read one of the files"
        print(json.dumps({"result": "HOLD", "reason": reason}, ensure_ascii=False))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
