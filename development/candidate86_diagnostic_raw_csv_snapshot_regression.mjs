import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const html=fs.readFileSync(new URL('index.html',root),'utf8');

function extractFunction(name){
  const markers=[`function ${name}(`,`async function ${name}(`];
  let start=-1;for(const m of markers){start=app.indexOf(m);if(start>=0)break;}
  assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}

assert.match(html,/id="diagRawCsv"/,'diagnostic raw CSV button missing');
assert.match(html,/要確認が残っていても保存でき/,'UI must explain review-safe diagnostic export');
assert.match(app,/preManualCsvSnapshot:diagnosticPreManualCsvSnapshot\(\)/,'diagnostic JSON must embed same snapshot');
assert.match(app,/result\.preManualCsvRow=toDiagnosticRawCsvRow\(result\)/,'successful result must freeze row immediately after analysis');

const ctx={
  NO_FOOD:'なし',
  POKESLEEP_TOOL_CSV_HEADER:['ニックネーム','ポケモン','Lv','スキルLv','食材1','食材2','食材3','メインスキル','せいかく','サブスキル1','サブスキル2','サブスキル3','サブスキル4','サブスキル5','一緒に寝た時間','色違い'],
  preManualCsvSnapshot:null,
  results:[],selected:[],
  String,Number,Date,Array,Set,Math,
  mainSkillCsvValue:(p)=>p.mainSkill||'',
  ribbonCsvValue:()=>0,
  shinyCsvValue:()=>0,
  csvDownloadTimestamp:(d)=>'20261004-154500',
  csvCell:(v)=>{v=String(v??'');return /[",\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;}
};
vm.createContext(ctx);
for(const name of ['diagnosticRawFoodCsvValue','diagnosticRawSpeciesValue','toDiagnosticRawCsvRow','diagnosticRawCsvFilename','diagnosticSnapshotStatus','capturePreManualCsvSnapshot','diagnosticPreManualCsvSnapshot']){
  vm.runInContext(`${extractFunction(name)}\nthis.${name}=${name};`,ctx);
}

const raw={
  file:'review.png',sourceIndex:0,
  parsed:{nickname:'テスト',level:25,skillLevel:1,mainSkill:'食材ゲットS',nature:'おだやか',subs:[
    {value:'睡眠EXPボーナス',needsReview:true},{value:'スキル確率アップM',needsReview:true},{value:'食材確率アップS'},{value:'最大所持数アップM'},{value:'おてつだいスピードS'}
  ]},
  classification:{candidates:['イーブイ']},
  foods:[{name:'モーモーミルク',needsReview:true},{name:'リラックスカカオ',needsReview:true},{name:'なし',needsReview:true}]
};
const row=ctx.toDiagnosticRawCsvRow(raw);
assert.equal(row.length,16);
assert.equal(row[4],'モーモーミルク','review food must remain in diagnostic raw CSV');
assert.equal(row[5],'リラックスカカオ','review food candidate must remain');
assert.equal(row[6],'','NO_FOOD keeps CSV-compatible blank representation');
assert.equal(row[9],'睡眠EXPボーナス','review subskill must remain in diagnostic raw CSV');
assert.equal(row[10],'スキル確率アップM','review subskill must remain in diagnostic raw CSV');
raw.preManualCsvRow=[...row];
ctx.results=[raw];ctx.selected=[{name:'review.png'}];
const snap=ctx.capturePreManualCsvSnapshot({force:true});
assert.equal(snap.rowCount,1);
assert.equal(snap.successfulRowCount,1);
assert.equal(snap.rawRows[0].length,16);
assert.equal(snap.rows[0][0],1);
assert.equal(snap.rows[0][1],'review.png');
assert.equal(snap.rows[0][2],'解析成功');
assert.ok(snap.csvText.includes('睡眠EXPボーナス'));
assert.equal(snap.filename,'pokesleep_ocr_raw_before_review_20261004-154500.csv');

// Later manual edits must not alter the frozen diagnostic row.
raw.parsed.nickname='手動修正後';
raw.parsed.subs[0].value='リサーチEXPボーナス';
raw.foods[0].name='ワカクサ大豆';
const snap2=ctx.capturePreManualCsvSnapshot({force:true});
assert.equal(snap2.rawRows[0][0],'テスト');
assert.equal(snap2.rawRows[0][4],'モーモーミルク');
assert.equal(snap2.rawRows[0][9],'睡眠EXPボーナス');

// A processing failure/manual-only completion must not be misrepresented as a pre-manual analyzed row.
ctx.preManualCsvSnapshot=null;
ctx.results=[{file:'failed.png',sourceIndex:0,preManualCsvRow:null,preManualCsvUnavailableReason:'processing-error',processingError:{stage:'OCR'},parsed:{nickname:'手動',level:1,skillLevel:1,mainSkill:'x',nature:'すなお',subs:[]},classification:{candidates:['イーブイ']},foods:[]}];ctx.selected=[{name:'failed.png'}];
const snap3=ctx.capturePreManualCsvSnapshot({force:true});
assert.equal(snap3.rowCount,1);
assert.equal(snap3.successfulRowCount,0);
assert.equal(snap3.rows[0][1],'failed.png');
assert.equal(snap3.rows[0][2],'解析失敗: OCR');
assert.equal(snap3.skipped.length,1);
assert.equal(snap3.skipped[0].reason,'processing-error');

const downloadFn=extractFunction('downloadDiagnosticRawCSV');
assert.ok(!downloadFn.includes('confirmCsvAction'),'diagnostic raw CSV must not be blocked by normal CSV review gate');
assert.match(downloadFn,/snapshot\.csvText/);

console.log('OK: Candidate 86 diagnostic raw values remain frozen/exportable and are embedded in the current traceable diagnostics snapshot');
