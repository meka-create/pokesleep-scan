"""Synthetic-only negative controls for the offline final evidence gate."""
import csv,hashlib,io,json,sys,unittest
from pathlib import Path
from zipfile import ZipFile
sys.path.insert(0,str(Path(__file__).resolve().parent))
from final_evidence_gate import evaluate,COLS,RAW,LEGACY_COLS,LEGACY_RAW

def mkcsv(lines):
    f=io.StringIO(newline='')
    csv.writer(f,lineterminator='\n').writerows(lines)
    return f.getvalue().rstrip('\n').encode('utf-8')
def fixtures():
    image=b'\x89PNG\r\n\x1a\nSYNTHETIC-ONLY'
    name='synthetic-fixture.png';archive=io.BytesIO()
    with ZipFile(archive,'w') as z:z.writestr('synthetic/'+name,image)
    golden=mkcsv([['画像ファイル','ニックネーム','画像SHA256'],[name,'正解',hashlib.sha256(image).hexdigest()]])
    before=['誤読','テスト種','15','1','食材A','食材B','食材C','技能','てれや','0','A','B','C','D','E','0','0','']
    after=before.copy();after[0]='正解'
    raw=mkcsv([RAW,['1',name,'解析成功',*before]])
    corrected=mkcsv([COLS,after])
    diag={'selectedFiles':[{'name':name,'size':len(image),'type':'image/png'}],
          'results':[{'file':name,'sourceIndex':0,'processingError':None}],
          'checkpointPersistence':{'failures':[]},
          'preManualCsvSnapshot':{'csvText':raw.decode(),'rowCount':1,'successfulRowCount':1,'derivedRows':[],'skipped':[]},
          'codeRevision':'synthetic'}
    return [golden,archive.getvalue(),json.dumps(diag).encode(),raw,corrected,corrected]

class FinalEvidenceTests(unittest.TestCase):
    def test_success(self):
        r=evaluate(*fixtures())
        self.assertEqual((r['result'],r['csvCellsRoundTripped'],r['sha256ImagesChecked']),('PASS',18,1))
    def test_unfixed_nickname_not_pass(self):
        a=fixtures();a[4]=a[5]=a[4].replace('正解'.encode(),'誤読'.encode())
        self.assertEqual(evaluate(*a)['nicknamesNotCorrected'],[1])
        self.assertEqual(evaluate(*a)['result'],'DATA_CORRECTION_REQUIRED')
    def test_legacy_16_column_evidence_is_supported_only_as_historical(self):
        a=fixtures()
        def to_legacy_csv(data,raw=False):
            lines=list(csv.reader(io.StringIO(data.decode('utf-8'),newline='')))
            off=3 if raw else 0
            return mkcsv([[c for j,c in enumerate(row) if j not in (off+9,off+17)] for row in lines])
        a[3]=to_legacy_csv(a[3],True)
        a[4]=to_legacy_csv(a[4])
        a[5]=to_legacy_csv(a[5])
        diag=json.loads(a[2]);diag['preManualCsvSnapshot']['csvText']=a[3].decode()
        a[2]=json.dumps(diag).encode()
        r=evaluate(*a)
        self.assertEqual((r['result'],r['csvColumns'],r['diagnosticColumns'],r['csvCellsRoundTripped']),
                         ('PASS',16,19,16))
        self.assertTrue(r['legacyHistoricalSchema'])
        a[5]=fixtures()[5]
        with self.assertRaisesRegex(ValueError,'schema/header'):evaluate(*a)
    def test_current_18_column_mint_and_favorite_are_strict(self):
        a=fixtures()
        a[4]=a[5]=a[4].replace(b',0,A,B,C,D,E,0,0,',b',2,A,B,C,D,E,0,0,')
        with self.assertRaisesRegex(ValueError,'mint/favorite'):evaluate(*a)
    def test_import_mutation_fails(self):
        a=fixtures();a[5]=a[5].replace(b'15',b'16')
        with self.assertRaisesRegex(ValueError,'changed'):evaluate(*a)
    def test_raw_snapshot_mutation_fails(self):
        a=fixtures();a[3]+=b'\n'
        with self.assertRaisesRegex(ValueError,'snapshot'):evaluate(*a)
    def test_image_tampering_fails(self):
        a=fixtures();x=hashlib.sha256(b'\x89PNG\r\n\x1a\nSYNTHETIC-ONLY').hexdigest().encode()
        a[0]=a[0].replace(x,b'0'*64)
        with self.assertRaisesRegex(ValueError,'SHA'):evaluate(*a)
    def test_bad_source_index_fails(self):
        a=fixtures();x=json.loads(a[2]);x['results'][0]['sourceIndex']=1;a[2]=json.dumps(x).encode()
        with self.assertRaisesRegex(ValueError,'mapping'):evaluate(*a)
    def test_unresolved_processing_failure_fails(self):
        a=fixtures();x=json.loads(a[2]);x['results'][0]['processingError']={'stage':'synthetic'};a[2]=json.dumps(x).encode()
        with self.assertRaisesRegex(ValueError,'Unresolved'):evaluate(*a)


# Complete 142-row synthetic release fixture, with NO user screenshots or values.
# Unlike the historic one-row import fixture, the real quality gate must
# examine all sixteen automatically accepted non-nickname values.
def complete_142_fixture():
    from step2_meka142_benchmark import FIELD_NAMES
    gold=[['corpus','assetId','画像ファイル','画像SHA256','ニックネーム',*FIELD_NAMES]]
    selected,observed,raw_rows,corrected_rows=[],[],[RAW],[COLS]
    values={
        'ポケモン名':'合成種','レベル':'15','SP':'1234',
        'おてつだい時間_秒':'2670','最大所持数':'16',
        'メインスキルLv':'1','メインスキル':'合成スキル','せいかく':'てれや',
        '食材1':'食材A','食材2':'食材B','食材3':'食材C',
        'サブスキル1':'A','サブスキル2':'B','サブスキル3':'C',
        'サブスキル4':'D','サブスキル5':'E',
    }
    archive=io.BytesIO()
    with ZipFile(archive,'w') as z:
        for i in range(142):
            name=f'fixture_{i+1:03d}.png'
            image=b'\x89PNG\r\n\x1a\nSYNTHETIC'+bytes([i])*(i+1)
            z.writestr('synthetic/'+name,image)
            gold.append(['meka142',f'MEKA142-{i+1:03d}',name,hashlib.sha256(image).hexdigest(),
                         '正解',*[values[k] for k in FIELD_NAMES]])
            selected.append({'name':name,'size':len(image),'type':'image/png'})
            imported=['正解','合成種','15','1','食材A','食材B','食材C',
                      '合成スキル','てれや','0','A','B','C','D','E','0','0','']
            raw_rows.append([str(i+1),name,'解析成功',*imported])
            corrected_rows.append(imported)
            parsed={'nickname':'正解','nicknameNeedsReview':False,
                    'nicknameReviewAtAnalysis':{'value':'正解','needsReview':False},
                    'nicknameManualConfirmed':False,
                    'level':15,'sp':1234,'helpSeconds':2670,'carry':16,
                    'carryNeedsReview':False,'carryOcrUnresolved':False,
                    'skillLevel':1,'mainSkill':'合成スキル','nature':'てれや',
                    'subskills':['A','B','C','D','E'],
                    'subskillEvidence':[{'needsReview':False,
                        'reviewReason':'subskill-ocr-consensus'} for _ in range(5)],
                    'subskillReviewSlots':[]}
            state={k:False for k in ('species','nickname','level','sp','helpSeconds',
                  'carry','skillLevel','mainSkill','nature','foods','subskills')}
            observed.append({'file':name,'sourceIndex':i,'processingError':None,
                'parsed':parsed,'reviewState':state,
                'classification':{'status':'UNIQUE','candidates':['合成種'],
                    'speciesManualOverride':''},
                'foods':[{'name':name,'needsReview':False}
                         for name in ['食材A','食材B','食材C']]})
    raw=mkcsv(raw_rows)
    corrected=mkcsv(corrected_rows)
    diag={'version':'v12-synthetic-audit','selectedFiles':selected,'results':observed,
          'checkpointPersistence':{'failures':[]},
          'preManualCsvSnapshot':{
              'schema':2,'header':list(RAW),'pokesleepToolHeader':list(COLS),
              'csvText':raw.decode('utf-8'),'rows':[
                  [i+1,*row[1:]] for i,row in enumerate(raw_rows[1:])],
              'rowCount':142,'successfulRowCount':142,'derivedRows':[],'skipped':[]},
          'codeRevision':'synthetic'}
    return [mkcsv(gold),archive.getvalue(),json.dumps(diag,ensure_ascii=False).encode('utf-8'),
            raw,corrected,corrected]

class Strict142QualityGateTests(unittest.TestCase):
    def test_full_synthetic_142_quality_pass(self):
        r=evaluate(*complete_142_fixture())
        self.assertEqual(r['result'],'PASS')
        self.assertTrue(r['nonNicknameOcrChecked'])
        self.assertTrue(r['nonNicknameFullyAutomatic'])
        self.assertEqual(r['nonNicknameTotals'],
                         {'auto_correct':2272,'auto_wrong':0,'review_or_manual':0})
        self.assertEqual(r['nicknameWrongAutoRows'],[])

    def test_wrong_auto_sp_cannot_hide_behind_successful_csv_roundtrip(self):
        a=complete_142_fixture()
        diag=json.loads(a[2]);diag['results'][4]['parsed']['sp']=999
        a[2]=json.dumps(diag,ensure_ascii=False).encode('utf-8')
        r=evaluate(*a)
        self.assertEqual(r['result'],'DATA_CORRECTION_REQUIRED')
        self.assertEqual(r['nonNicknameTotals']['auto_wrong'],1)

    def test_unresolved_carry_cannot_pass_final_zero_review_goal(self):
        a=complete_142_fixture()
        diag=json.loads(a[2]);diag['results'][4]['parsed']['carryNeedsReview']=True
        a[2]=json.dumps(diag,ensure_ascii=False).encode('utf-8')
        r=evaluate(*a)
        self.assertEqual(r['result'],'OCR_REVIEW_PENDING')
        self.assertEqual(r['nonNicknameTotals']['review_or_manual'],1)
        self.assertFalse(r['nonNicknameFullyAutomatic'])

    def test_false_automatic_nickname_even_if_corrected_csv_is_safe_is_rejected(self):
        a=complete_142_fixture()
        diag=json.loads(a[2])
        p=diag['results'][6]['parsed'];p['nickname']='誤読'
        p['nicknameReviewAtAnalysis']['value']='誤読'
        a[2]=json.dumps(diag,ensure_ascii=False).encode('utf-8')
        r=evaluate(*a)
        self.assertEqual(r['result'],'DATA_CORRECTION_REQUIRED')
        self.assertEqual(r['nicknameWrongAutoRows'],[7])

    def test_142_image_golden_without_non_nickname_fields_is_rejected(self):
        a=complete_142_fixture()
        data=list(csv.reader(io.StringIO(a[0].decode('utf-8'),newline='')))
        for row in data:del row[-1]
        a[0]=mkcsv(data)
        with self.assertRaisesRegex(ValueError,'mandatory non-nickname'):
            evaluate(*a)

    def test_inconsistent_post_manual_nickname_snapshot_is_rejected(self):
        a=complete_142_fixture()
        diag=json.loads(a[2]);diag['results'][0]['parsed']['nickname']='変更済み'
        a[2]=json.dumps(diag,ensure_ascii=False).encode('utf-8')
        with self.assertRaisesRegex(ValueError,'snapshot was modified'):
            evaluate(*a)


if __name__=='__main__':unittest.main()
