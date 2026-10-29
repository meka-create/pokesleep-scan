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

if __name__=='__main__':unittest.main()
