#!/usr/bin/env python3
"""Offline final evidence gate. Private Golden, images and diagnostics NEVER enter CI."""
from __future__ import annotations
import argparse,csv,hashlib,io,json
from pathlib import Path
from zipfile import ZipFile
LEGACY_COLS=('ニックネーム','ポケモン','レベル','スキルレベル','食材1','食材2','食材3','メインスキル','せいかく','Lv10','Lv25','Lv50','Lv70','Lv80','一緒に眠った時間','色違い')
COLS=(*LEGACY_COLS[:9],'まっしろミント',*LEGACY_COLS[9:],'お気に入り')
LEGACY_RAW=('元画像番号','元画像ファイル名','診断状態',*LEGACY_COLS)
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
    # Historical 16-column evidence remains verifiable, but it must never be
    # mixed with the current 18-column snapshot/importer format.
    corrected_text=decode(corrected_csv)
    corrected_header=tuple(next(csv.reader(io.StringIO(corrected_text,newline='')),[]))
    if corrected_header==COLS:
        schema,raw_schema=COLS,RAW
    elif corrected_header==LEGACY_COLS:
        schema,raw_schema=LEGACY_COLS,LEGACY_RAW
    else:
        raise ValueError('Unsupported 16/18-column corrected CSV schema/header')
    raw=rows(raw_text,raw_schema)
    if snap.get('header') is not None and tuple(snap['header'])!=raw_schema:
        raise ValueError('Immutable raw snapshot schema/header mismatch')
    if snap.get('pokesleepToolHeader') is not None and tuple(snap['pokesleepToolHeader'])!=schema:
        raise ValueError('Immutable raw snapshot importer schema mismatch')
    if snap['rowCount']!=len(names) or snap['successfulRowCount']!=len(names) or snap.get('derivedRows') or snap.get('skipped') or len(raw)!=len(names):
        raise ValueError('Raw snapshot not complete and immutable')
    orig,after=rows(corrected_text,schema),rows(decode(returned_csv),schema)
    if len(orig)!=len(names) or len(after)!=len(names):raise ValueError('Import/export row count mismatch')
    if orig!=after:raise ValueError('Importer/exporter changed one or more data fields')
    if schema==COLS and any(r[9] not in ('0','1') or r[17]!='' for r in orig):
        raise ValueError('Invalid current CSV mint/favorite fields')
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
    # This is a 142-image *final* gate, not merely an importer roundtrip.
    # Its historic importer-only PASS could conceal a false-accepted OCR field:
    # corrected CSV and upstream export might agree on the same wrong value.
    # Run the independent 16-field Golden evaluator for the complete corpus.
    # The one-row synthetic importer fixture remains explicitly scoped below.
    nonnick=None
    wrong_nickname_auto=[]
    if len(names)==142:
        from step2_meka142_benchmark import FIELD_NAMES, evaluate as score_142
        needed={'corpus','assetId',*FIELD_NAMES}
        if any(needed-set(g) for g in golden):
            raise ValueError('142-image final Golden lacks mandatory non-nickname fields')
        if any(g['corpus']!='meka142' or g['assetId']!=f'MEKA142-{i+1:03d}'
               for i,g in enumerate(golden)):
            raise ValueError('142-image Golden identity/order mismatch')
        # Exact byte SHA and selected names/sizes have already been verified.
        # Unique sizes prevent ambiguous byte-identity mapping in the scorer.
        by_size={}
        for x in selected:
            size=x['size']
            if size in by_size:
                raise ValueError('Ambiguous source image size in final quality gate')
            by_size[size]=by_name[x['name']]
        report=score_142(golden,diag,by_size)
        if report['verifiedImageCount']!=142 or report['totalFields']!=2272:
            raise ValueError('Incomplete non-nickname quality evaluation')
        nonnick=report['totals']
        for i,r in enumerate(observed):
            p=r.get('parsed') or {}
            at=p.get('nicknameReviewAtAnalysis')
            if not isinstance(at,dict) or not isinstance(at.get('value'),str) or not isinstance(at.get('needsReview'),bool):
                raise ValueError('Missing immutable nickname OCR-time snapshot')
            if p.get('nicknameManualConfirmed') or r.get('manualCompletion'):
                raise ValueError('Manually modified diagnostic cannot prove automatic OCR safety')
            if (p.get('nickname')!=at['value'] or
                p.get('nicknameNeedsReview') is not at['needsReview']):
                raise ValueError('Nickname OCR snapshot was modified after analysis')
            if not at['needsReview'] and at['value']!=by_name[ordered[i]]['ニックネーム']:
                wrong_nickname_auto.append(i+1)
    failed=bool(bad or wrong_nickname_auto or (nonnick and nonnick['auto_wrong']))
    pending=bool(nonnick and nonnick['review_or_manual'])
    verdict='DATA_CORRECTION_REQUIRED' if failed else 'OCR_REVIEW_PENDING' if pending else 'PASS'
    return {'result':verdict,'rowsChecked':len(orig),
            'nonNicknameOcrChecked':nonnick is not None,
            'nonNicknameTotals':nonnick,
            'nonNicknameFullyAutomatic':nonnick is not None and not pending,
            'nicknameWrongAutoRows':wrong_nickname_auto,
            'sha256ImagesChecked':len(names),'csvColumns':len(schema),'diagnosticColumns':len(raw_schema),
            'legacyHistoricalSchema':schema==LEGACY_COLS,'csvCellsRoundTripped':len(orig)*len(schema),
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
