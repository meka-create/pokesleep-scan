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

assert.ok(!app.includes('function checkpointDeleteResult('),'dead checkpointDeleteResult must be removed');
assert.match(html,/元画像番号・ファイル名・診断状態/,'troubleshooting UI must explain traceable diagnostic CSV');
assert.match(app,/pokesleep_ocr_v12_diagnostics_\$\{csvDownloadTimestamp\(d\)\}\.json/,'diagnostic JSON filename must be timestamped');
assert.match(app,/schema:2/,'diagnostic snapshot schema must be bumped for traceability columns');
assert.match(app,/\['元画像番号','元画像ファイル名','診断状態',\.\.\.POKESLEEP_TOOL_CSV_HEADER\]/,'diagnostic CSV must prepend source mapping columns');

const ctx={
  NO_FOOD:'なし',
  POKESLEEP_TOOL_CSV_HEADER:['ニックネーム','ポケモン','レベル','スキルレベル','食材1','食材2','食材3','メインスキル','せいかく','Lv10','Lv25','Lv50','Lv70','Lv80','一緒に眠った時間','色違い'],
  preManualCsvSnapshot:null,results:[],selected:[],String,Number,Date,Array,Set,Map,Math,
  mainSkillCsvValue:(p)=>p.mainSkill||'',ribbonCsvValue:()=>0,shinyCsvValue:()=>0,
  csvDownloadTimestamp:()=> '20261004-181300',
  csvCell:(v)=>{v=String(v??'');return /[",\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;}
};
vm.createContext(ctx);
for(const name of ['diagnosticRawFoodCsvValue','diagnosticRawSpeciesValue','toDiagnosticRawCsvRow','diagnosticRawCsvFilename','diagnosticsJsonFilename','diagnosticSnapshotStatus','capturePreManualCsvSnapshot','diagnosticPreManualCsvSnapshot']){
  vm.runInContext(`${extractFunction(name)}\nthis.${name}=${name};`,ctx);
}
const success={file:'001.png',sourceIndex:0,parsed:{nickname:'A',level:10,skillLevel:1,mainSkill:'食材ゲットS',nature:'すなお',subs:[{value:'きのみの数S'},{value:'おてつだいスピードM'},{value:'最大所持数アップS'},{value:'食材確率アップS'},{value:'スキル確率アップS'}]},classification:{candidates:['ピカチュウ']},foods:[{name:'とくせんリンゴ'},{name:'あまいミツ'},{name:'なし'}]};
success.preManualCsvRow=ctx.toDiagnosticRawCsvRow(success);
const failed={file:'002.png',sourceIndex:1,processingError:{stage:'画像読み込み'},preManualCsvRow:null,preManualCsvUnavailableReason:'processing-error'};
ctx.results=[success,failed];ctx.selected=[{name:'001.png'},{name:'002.png'},{name:'003.png'}];
const snap=ctx.capturePreManualCsvSnapshot({force:true});
assert.equal(snap.schema,2);
assert.equal(snap.rowCount,3,'one diagnostic row must exist per selected source');
assert.equal(snap.successfulRowCount,1);
assert.deepEqual(Array.from(snap.rows[0].slice(0,3)),[1,'001.png','解析成功']);
assert.deepEqual(Array.from(snap.rows[1].slice(0,3)),[2,'002.png','解析失敗: 画像読み込み']);
assert.deepEqual(Array.from(snap.rows[2].slice(0,3)),[3,'003.png','未処理']);
assert.equal(snap.rows[1].length,19);assert.equal(snap.rows[2].length,19);
assert.equal(snap.rawRows.length,1);assert.equal(snap.rawRows[0].length,16);
assert.deepEqual(Array.from(snap.rowMap.map(x=>x.sourceIndex)),[0,1,2]);
assert.deepEqual(Array.from(snap.rowMap.map(x=>x.csvRow)),[2,3,4]);
assert.ok(snap.csvText.includes('元画像ファイル名'));
assert.ok(snap.csvText.includes('002.png,解析失敗: 画像読み込み'));
assert.equal(ctx.diagnosticsJsonFilename(new Date()),'pokesleep_ocr_v12_diagnostics_20261004-181300.json');

const normalHeader=app.match(/const POKESLEEP_TOOL_CSV_HEADER=\[(.*?)\];/s)?.[1]||'';
assert.ok(normalHeader&&!normalHeader.includes('元画像番号'),'normal pokesleep-tool CSV header must remain untouched');
console.log('OK: Candidate 88 diagnostic CSV is source-traceable including failure/unprocessed rows; JSON name is timestamped; dead checkpoint helper removed');
