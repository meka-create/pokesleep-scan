"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const asset=fs.readFileSync(path.join(root,'shared/MASTER_DATA.json'));
const legacy=fs.readFileSync(path.join(root,'master_data.js'),'utf8');
const bridge=fs.readFileSync(path.join(root,'shared_master.js'),'utf8');
const gateSource=fs.readFileSync(path.join(root,'csv_gate.js'),'utf8');
const ai=JSON.parse(asset.toString('utf8'));
function harness(opts={}){
 const store=new Map(),data=opts.data||asset,failed=!!opts.failed;
 const context={
  window:{__PUBLIC_RELEASE_ID__:'step2-test'},
  crypto:opts.noCrypto?undefined:webcrypto,
  fetch:async()=>failed?{ok:false,status:503}:{ok:true,arrayBuffer:async()=>Uint8Array.from(data).buffer},
  location:{href:'http://localhost:8000/'},
  TextDecoder,AbortController,URL,setTimeout,clearTimeout,
  navigator:{locks:{request:async(_name,fn)=>fn()}},
  localStorage:opts.noStorage?
   {getItem:()=>{throw Error('storage blocked')},setItem:()=>{throw Error('storage blocked')}}:
   {getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},
  console:{warn:()=>{}}
 };
 vm.createContext(context);
 vm.runInContext(legacy,context,{filename:'master_data.js'});
 const initial=context.window.POKESLEEP_MASTER;
 vm.runInContext(bridge,context,{filename:'shared_master.js'});
 vm.runInContext(gateSource,context,{filename:'csv_gate.js'});
 return {context,initial,gate:context.window.POKESLEEP_CSV_GATE,
         bridge:context.window.POKESLEEP_SHARED_MASTER};
}
test('verified v27 master selected, preserving classifier inputs',async()=>{
 const h=harness(),status=await h.bridge.load();
 assert.equal(status.source,'pinned-ai-v27');
 assert.equal(status.sha256,'d60410ba1f92d80c67ca3ff40bc8aa7a2cd51d4c03fc33f9e99fa83bb8e77a38');
 assert.equal(h.context.window.POKESLEEP_MASTER.pokemon.length,249);
 assert.notEqual(h.initial,h.context.window.POKESLEEP_MASTER);
 assert.deepEqual(JSON.parse(JSON.stringify(h.initial.pokemon)),JSON.parse(JSON.stringify(h.context.window.POKESLEEP_MASTER.pokemon)));
});
test('tampered AI master rejected; local master untouched',async()=>{
 const h=harness({data:Buffer.from(asset.toString('utf8').replace('"2026-10-05"','"1900-01-01"'))});
 const status=await h.bridge.load();
 assert.equal(status.source,'legacy-fallback');
 assert.strictEqual(h.context.window.POKESLEEP_MASTER,h.initial);
});
test('fetch failure preserves local master',async()=>{
 const h=harness({failed:true}),status=await h.bridge.load();
 assert.equal(status.source,'legacy-fallback');
 assert.equal(status.reason,'HTTP 503');
 assert.strictEqual(h.context.window.POKESLEEP_MASTER,h.initial);
});
test('missing crypto preserves local master',async()=>{
 const h=harness({noCrypto:true}),status=await h.bridge.load();
 assert.equal(status.source,'legacy-fallback');
 assert.strictEqual(h.context.window.POKESLEEP_MASTER,h.initial);
});
const specimen=ai.pokemon.find(p=>p.name==='フシギダネ');
const fields=['サンプル,"ポケモン"','フシギダネ','10','1',
 specimen.ing1.name,specimen.ing1.name,specimen.ing1.name,
 specimen.mainSkill,'てれや',...ai.subskills.slice(0,5).map(s=>s.ja),'0','0'];
function inspect(fields,m=ai){const h=harness();return h.gate.inspect(h.gate.serialize([Array.from(h.gate.HEADER),fields]),m);}
test('CSV 16 columns escaped fields, LF and round-trip',()=>{
 const h=harness(),raw=h.gate.serialize([Array.from(h.gate.HEADER),fields]);
 const r=h.gate.inspect(raw,ai);
 assert.equal(r.ok,true,JSON.stringify(r.errors));
 assert.equal(r.rows[1][0],fields[0]);
 assert.ok(raw.includes('"サンプル,""ポケモン"""'));
 assert.ok(!raw.includes('\r'));
});
test('unknown species, invalid food, empty nickname, bad controls and levels fail',()=>{
 for(const [column,value] of [[1,'不存在種'],[4,'なし'],[0,''],[0,'AB\nCD'],[2,'150'],[3,'99']]){
  const bad=[...fields];bad[column]=value;
  const r=inspect(bad);
  assert.equal(r.ok,false,'column '+column+' value '+value+' result '+JSON.stringify(r));
 }
});
test('duplicate subskills, main skill mismatch and unknown nature fail',()=>{
 for(const [column,value] of [[10,fields[9]],[7,'偽スキル'],[8,'偽せいかく']]){
  const bad=[...fields];bad[column]=value;
  assert.equal(inspect(bad).ok,false);
 }
});
test('Mew slot3 and Darkrai slots2/3 blank accepted only for those species',()=>{
 const mew=ai.pokemon.find(p=>p.name==='ミュウ'),dark=ai.pokemon.find(p=>p.name==='ダークライ');
 const a=[...fields];a[1]='ミュウ';a[4]=mew.ing1.name;a[5]=mew.ing2.name;a[6]='';a[7]='食材ゲットS';
 assert.equal(inspect(a).ok,true,JSON.stringify(inspect(a).errors));
 const b=[...fields];b[1]='ダークライ';b[4]=dark.ing1.name;b[5]='';b[6]='';b[7]=dark.mainSkill;
 assert.equal(inspect(b).ok,true,JSON.stringify(inspect(b).errors));
 b[1]='フシギダネ';assert.equal(inspect(b).ok,false);
});
test('CSV parser rejects malformed quoting and BOM',()=>{
 const h=harness();
 for(const raw of ['\uFEFF'+h.gate.serialize([Array.from(h.gate.HEADER),fields]),'"a"z,b','"a']){
  assert.equal(h.gate.inspect(raw,ai).ok,false);
 }
});
test('filename is minute-granular and consecutive save uses _2',async()=>{
 const h=harness(),date=new Date(2026,9,12,14,35,59);
 const a=await h.gate.reserveFilename(date),b=await h.gate.reserveFilename(date);
 assert.match(a,/20261012_1435\.csv$/);assert.match(b,/20261012_1435_2\.csv$/);
 assert.doesNotMatch(a,/143559/);
 const c=await h.gate.reserveFilename(new Date(2026,9,12,14,36,1));
 assert.match(c,/20261012_1436\.csv$/);
});

test('Toxtricity forms reject importer-incompatible natures without guessing',()=>{
 const high=ai.pokemon.find(p=>p.name==='ストリンダー (ハイ)');
 const low=ai.pokemon.find(p=>p.name==='ストリンダー (ロー)');
 assert.ok(high&&low);
 const v=[...fields];v[1]=high.name;v[4]=high.ing1.name;v[5]=high.ing1.name;v[6]=high.ing1.name;v[7]=high.mainSkill;
 v[8]='てれや';assert.equal(inspect(v).ok,false);
 v[8]='いじっぱり';assert.equal(inspect(v).ok,true,JSON.stringify(inspect(v).errors));
 v[1]=low.name;v[7]=low.mainSkill;v[8]='てれや';v[4]=low.ing1.name;v[5]=low.ing1.name;v[6]=low.ing1.name;
 assert.equal(inspect(v).ok,true,JSON.stringify(inspect(v).errors));
});

test('two saves in same minute remain unique if browser storage is blocked',async()=>{
 const h=harness({noStorage:true}),dt=new Date(2026,9,12,9,4,2);
 const first=await h.gate.reserveFilename(dt),second=await h.gate.reserveFilename(dt);
 assert.notEqual(first,second);
 assert.match(first,/20261012_0904\.csv$/);
 assert.match(second,/20261012_0904_2\.csv$/);
});

test('diagnostic CSV/JSON names are executable after removing old timestamp helper',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const begin=app.indexOf('function diagnosticDownloadTimestamp(');
 const end=app.indexOf('function diagnosticSnapshotStatus(',begin);
 assert.ok(begin>=0&&end>begin,'Diagnostic timestamp definitions missing');
 const local={Date};vm.createContext(local);
 vm.runInContext(app.slice(begin,end),local);
 const dt=new Date(2026,9,12,17,46,52);
 assert.match(local.diagnosticRawCsvFilename(dt),/20261012_1746\.csv$/);
 assert.match(local.diagnosticsJsonFilename(dt),/20261012_1746\.json$/);
 assert.ok(!app.includes('csvDownloadTimestamp('),'Dangling pre-STEP2 timestamp call');
});
test('unseen together-sleep hours use user-policy 0, not ribbon threshold',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const source=app.match(/function ribbonCsvValue\([^)]*\)\{[^}]*\}/)?.[0];
 assert.ok(source,'Missing together-sleep CSV function');
 const context={};vm.createContext(context);vm.runInContext(source,context);
 assert.equal(context.ribbonCsvValue({status:'UNIQUE',hits:[{ribbonTier:4}]}),0);
});
test('ordinary species cannot export unresolved blank subskills',()=>{
 const bad=[...fields];bad[9]='';
 const v=inspect(bad);
 assert.equal(v.ok,false,JSON.stringify(v));
 assert.ok(v.errors.some(x=>x.includes('empty subskill')));
});
test('mythical subskills may be blank, with explicit CSV gate warnings',()=>{
 const dark=ai.pokemon.find(p=>p.name==='ダークライ');
 const v=[...fields];v[1]=dark.name;v[4]=dark.ing1.name;v[5]='';v[6]='';v[7]=dark.mainSkill;v[9]='';
 const r=inspect(v);
 assert.equal(r.ok,true,JSON.stringify(r.errors));
 assert.ok(r.warnings.some(x=>x.includes('empty mythical subskill')));
});

test('species-canonical CSV skill normalizes random and legendary screen aliases',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const start=app.indexOf('function mainSkillCsvValue('),end=app.indexOf('function ribbonCsvValue(',start);
 assert.ok(start>=0&&end>start);
 // Keep this test tied to the real existing Candidate125 comparator.
 const context={window:{},POKESLEEP_MASTER:ai,
  mainSkillForOutput:(p)=>p.mainSkill,
  detailedMewVersatileSkill:()=>'',mewVersatileCsvLabel:()=>''};
 vm.createContext(context);
 vm.runInContext(legacy,context);
 vm.runInContext(fs.readFileSync(path.join(root,'classifier.js'),'utf8'),context);
 context.POKESLEEP_CLASSIFIER=context.window.POKESLEEP_CLASSIFIER;
 vm.runInContext(app.slice(start,end),context);
 assert.equal(context.mainSkillCsvValue({mainSkill:'エナジーチャージS'},null,'コダック'),
              'エナジーチャージS (ランダム)');
 assert.equal(context.mainSkillCsvValue({mainSkill:'ゆめのかけらゲットS'},null,'ヤミラミ'),
              'ゆめのかけらゲットS (ランダム)');
 assert.equal(context.mainSkillCsvValue({mainSkill:'おてつだいブースト (でんき)'},null,'ライコウ'),
              'おてつだいブースト');
 assert.equal(context.mainSkillCsvValue({mainSkill:'食材ゲットS'},null,'フシギダネ'),
              '食材ゲットS');
});

test('all 249 supported species have at least one valid 16-column importer row',()=>{
 const context={window:{}};
 vm.createContext(context);
 vm.runInContext(legacy,context,{filename:'master_data.js'});
 vm.runInContext(fs.readFileSync(path.join(root,'classifier.js'),'utf8'),context,{filename:'classifier.js'});
 const cls=context.window.POKESLEEP_CLASSIFIER;
 const rows=ai.pokemon.map(p=>{
  const pr=cls.profiles(p)[0];
  assert.ok(pr&&pr.items&&pr.items.length===3,'No food profile for '+p.name);
  const foods=pr.items.map(item=>item.name==='―'?'':item.name);
  const nature=p.name==='ストリンダー (ハイ)'?'いじっぱり':'てれや';
  return ['検証用_'+p.name,p.name,'10','1',...foods,
    p.name==='ミュウ'?'きのみバースト':p.mainSkill,nature,
    ...ai.subskills.slice(0,5).map(x=>x.ja),'0','0'];
 });
 assert.equal(rows.length,249);
 const h=harness(),csv=h.gate.serialize([Array.from(h.gate.HEADER),...rows]);
 const result=h.gate.inspect(csv,ai);
 assert.equal(result.ok,true,JSON.stringify(result.errors.slice(0,25)));
 assert.equal(result.rows.length,250);
});
