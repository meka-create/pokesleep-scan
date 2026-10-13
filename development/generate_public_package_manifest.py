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
# These are the only JSON documents designed to ship in the public PWA.
# Adding another intentional public JSON requires a reviewed change here.
PUBLIC_JSON={
    'release.json','master-update-status.json',
    'shared/MASTER_DATA.json','shared/master_release.json'
}
PUBLIC_MEDIA_DIRS={'assets','icons'}
PRIVATE_SUFFIXES={
    '.zip','.7z','.rar','.tar','.gz','.csv','.tsv','.xls','.xlsx',
    '.jsonl','.ndjson','.har','.log','.db','.sqlite','.sqlite3',
    '.pdf','.doc','.docx','.ppt','.pptx'
}
MEDIA_SUFFIXES={'.png','.jpg','.jpeg','.webp','.gif','.avif','.heic','.heif','.svg'}
SENSITIVE_SUFFIXES={'.pem','.key','.p12','.pfx','.jks','.keystore','.kdbx','.ovpn','.mobileconfig','.sql','.bak','.backup','.old','.tfstate'}


def private_file_risk(path):
    """Fail closed before a private corpus/output accidentally reaches Pages."""
    p=pathlib.PurePosixPath(path)
    name=p.name.casefold()
    if any(part in ('.','..') for part in p.parts) or p.is_absolute():
        return 'unsafe repository path'
    if any(word in name for word in (
            'golden','正解表','diagnostics','raw_before_review',
            'pokesleep_ocr_','input_manifest','private_','meka142-',
            'nano30','screenshot_','img_')):
        return 'private corpus or OCR-export filename'
    suffix=p.suffix.lower()
    # The Pages workflow publishes the repository tree. Common credential
    # formats and undeclared hidden files must be explicitly reviewed, even
    # when their filenames do not look like an OCR dataset.
    if name.startswith('.env') or suffix in SENSITIVE_SUFFIXES:
        return 'credential, secret, backup or configuration file'
    if re.search(r'(^|[._-])(?:api[_-]?key|credentials?|secret|access[_-]?token|private[_-]?key)([._-]|$)', name):
        return 'credential-like filename'
    if any(part.startswith('.') for part in p.parts) and not (
            path in {'.gitignore','.nojekyll'} or p.parts[0]=='.github'):
        return 'unreviewed hidden file or directory'
    if suffix in PRIVATE_SUFFIXES:
        return 'non-public archive, dataset or document type'
    if suffix=='.json' and path not in PUBLIC_JSON:
        return 'unreviewed JSON may contain private analysis results'
    if suffix in MEDIA_SUFFIXES and (not p.parts or p.parts[0] not in PUBLIC_MEDIA_DIRS):
        return 'image/media must be in a reviewed public asset directory'
    return ''


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
        issue=private_file_risk(path)
        if issue:raise ValueError('Private/publication-risk file '+path+': '+issue)
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
