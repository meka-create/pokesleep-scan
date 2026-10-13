#!/usr/bin/env python3
"""Offline final evidence gate. Private Golden, images and diagnostics NEVER enter CI."""
from __future__ import annotations
import argparse,csv,hashlib,io,json
from pathlib import Path
from zipfile import ZipFile
COLS=('ニックネーム','ポケモン','レベル','スキルレベル','食材1','食材2','食材3','メインスキル','せいかく','Lv10','Lv25','Lv50','Lv70','Lv80','一緒に眠った時間','色違い')
RAW=('元画像番号','元画像ファイル名','診断状態',*COLS)
def decode(b):
    s=b.decode('utf-8',errors='strict')
    if s.startswith('\ufeff'):raise ValueError('unexpected UTF-8 BOM')
    return s
def rows(s,columns):
    data=list(csv.reader(io.StringIO(s,newline='')))
    if not data or tuple(data[0])!=tuple(columns):raise ValueError('CSV schema/header mismatch')
    if any(len(x)!=len(columns) for x in data[1:]):raise ValueError('CSV row width mismatch')
    return data[1:]
def evaluate(golden_csv,image_zip,diagnostics_json,raw_csv,corrected_csv,returned_csv):
    """Return only counts and row numbers, not private user nicknames."""
    golden=list(csv.DictReader(io.StringIO(golden_csv.decode('utf-8-sig'),newline='')))
    names=[x['画像ファイル'] for x in golden]
    if not names or len(set(names))!=len(names):raise ValueError('Golden missing or duplicate filenames')
    by_name=dict(zip(names,golden))
    diag=json.loads(decode(diagnostics_json))
    selected,observed=diag['selectedFiles'],diag['results']
    if len(selected)!=len(names) or len(observed)!=len(names):raise ValueError('Missing diagnostic images')
    if any(x.get('processingError') for x in observed):raise ValueError('Unresolved processing failure')
    if diag.get('checkpointPersistence',{}).get('failures'):raise ValueError('Checkpoint failure')
    snap=diag['preManualCsvSnapshot'];raw_text=decode(raw_csv)
    if raw_text!=snap['csvText']:raise ValueError('Immutable raw snapshot differs from CSV')
    raw=rows(raw_text,RAW)
    if snap['rowCount']!=len(names) or snap['successfulRowCount']!=len(names) or snap.get('derivedRows') or snap.get('skipped') or len(raw)!=len(names):
        raise ValueError('Raw snapshot not complete and immutable')
    orig,after=rows(decode(corrected_csv),COLS),rows(decode(returned_csv),COLS)
    if len(orig)!=len(names) or len(after)!=len(names):raise ValueError('Import/export row count mismatch')
    if orig!=after:raise ValueError('Importer/exporter changed one or more data fields')
    if any(raw[i][0]!=str(i+1) or raw[i][1]!=selected[i].get('name') or observed[i].get('file')!=raw[i][1] or observed[i].get('sourceIndex')!=i for i in range(len(raw))):
        raise ValueError('Diagnostic / raw row mapping mismatch')
    ordered=[x['name'] for x in selected]
    if set(ordered)!=set(names) or len(set(ordered))!=len(names):raise ValueError('Diagnostic filenames differ from Golden')
    with ZipFile(io.BytesIO(image_zip)) as z:
        images={Path(x.filename).name:x for x in z.infolist() if not x.is_dir() and x.filename.lower().endswith(('.png','.jpg','.jpeg'))}
        if set(images)!=set(names) or len(images)!=len(names):raise ValueError('Image ZIP corpus mismatch')
        for x in selected:
            file=x['name'];data=z.read(images[file])
            if hashlib.sha256(data).hexdigest()!=by_name[file]['画像SHA256']:raise ValueError('Image SHA-256 mismatch')
            if x['size']!=len(data):raise ValueError('Diagnostic image length mismatch')
    bad=[i+1 for i,row in enumerate(orig) if row[0]!=by_name[ordered[i]]['ニックネーム']]
    return {'result':'PASS' if not bad else 'DATA_CORRECTION_REQUIRED','rowsChecked':len(orig),
            'sha256ImagesChecked':len(names),'csvCellsRoundTripped':len(orig)*len(COLS),
            'csvDataCellChanges':0,'byteIdentical':corrected_csv==returned_csv,
            'onlyFinalLineEndingDiff':corrected_csv.rstrip(b'\r\n')==returned_csv.rstrip(b'\r\n'),
            'rawSnapshotExact':True,'nicknamesNotCorrected':bad,'nicknameCorrectedCount':len(names)-len(bad),
            'diagCodeRevision':diag.get('codeRevision',''),
            'scope':'Original ZIP SHA verified. Pixel source bytes are not independently proven without on-device hashes.'}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for a in ('golden','images-zip','diagnostics','raw','corrected','returned'):
        p.add_argument('--'+a,required=True,type=Path)
    a=p.parse_args()
    try:
        result=evaluate(*(getattr(a,s).read_bytes() for s in ('golden','images_zip','diagnostics','raw','corrected','returned')))
    except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError) as e:
        print(json.dumps({'result':'HOLD','errorType':type(e).__name__}))
        return 2
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['result']=='PASS' else 1
if __name__=='__main__':raise SystemExit(main())
