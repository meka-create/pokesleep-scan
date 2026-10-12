#!/usr/bin/env python3
"""Deterministic, self-excluding SHA-256 inventory for the public Git repository.

Regenerate: python development/generate_public_package_manifest.py --write
Verify:     python development/generate_public_package_manifest.py --check

This is a repository-file ledger, not a claim that every path is in the PWA
precache or served by GitHub Pages. No input screenshots/Golden are included.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'public_package_manifest.json'
EXCLUDED={'public_package_manifest.json'}

def build():
    release=json.loads((ROOT/'release.json').read_text(encoding='utf-8'))['id']
    sw=(ROOT/'sw.js').read_text(encoding='utf-8')
    app=(ROOT/'app.js').read_text(encoding='utf-8')
    if f"const RELEASE_ID = '{release}';" not in sw:
        raise ValueError('Service worker release mismatch')
    if f"CHECKPOINT_RELEASE_ID='{release}'" not in app:
        raise ValueError('App checkpoint release mismatch')
    build_id=re.search(r"const BUILD_ID='([^']+)'",app)
    if not build_id:
        raise ValueError('Missing app build ID')
    tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT)
    files=[]
    for byte_path in tracked.split(b'\0'):
        if not byte_path:continue
        path=byte_path.decode('utf-8')
        if path in EXCLUDED:continue
        file=ROOT/path
        if not file.is_file():
            raise ValueError('Missing tracked file: '+path)
        content=file.read_bytes()
        files.append({'path':path,'bytes':len(content),
                      'sha256':hashlib.sha256(content).hexdigest()})
    files.sort(key=lambda x:x['path'])
    paths={x['path'] for x in files}
    for essential in ['app.js','index.html','sw.js','master_data.js',
                      'shared_master.js','classifier.js','food_matcher.js',
                      'csv_gate.js','android_roi.js','development/step3_carry_food3.test.cjs']:
        if essential not in paths:raise ValueError('Missing crucial file: '+essential)
    if any(s in x['path'].lower() for x in files for s in ('golden','diagnostics_2026','raw_before_review')):
        raise ValueError('Private regression data appears in Git tracked files')
    return {
      'schemaVersion':2,
      'kind':'current-tracked-repository-inventory',
      'releaseId':release,
      'appBuildId':build_id.group(1),
      'purpose':'SHA-256 file inventory of tracked repository resources; excludes this self-referential manifest',
      'scopeNote':'Not a claim of GitHub Pages served routes, precached assets, or runtime-only public allowlist',
      'developmentIncludedInPublicRepository':any(x.startswith('development/') for x in paths),
      'knownHistoricalBaseline':'Candidate125; see Git commit history for that older package',
      'fileCount':len(files),
      'files':files
    }

def render():
    return json.dumps(build(),ensure_ascii=False,indent=2)+'\n'

def main():
    p=argparse.ArgumentParser()
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check',action='store_true')
    mode.add_argument('--write',action='store_true')
    mode.add_argument('--stdout',action='store_true')
    args=p.parse_args()
    content=render()
    if args.stdout:
        print('-----BEGIN_CURRENT_MANIFEST-----')
        print(content,end='')
        print('-----END_CURRENT_MANIFEST-----')
        return 0
    if args.write:
        OUTPUT.write_text(content,encoding='utf-8')
        print('wrote',OUTPUT.name)
        return 0
    existing=OUTPUT.read_text(encoding='utf-8')
    if existing!=content:
        print('Public package manifest is stale: regenerate with --write',file=sys.stderr)
        return 1
    print('public_package_manifest.json: PASS',len(build()['files']),'tracked files')
    return 0

if __name__=='__main__':sys.exit(main())
