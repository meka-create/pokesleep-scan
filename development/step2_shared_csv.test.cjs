"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
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
  fetch:async(url)=>failed?{ok:false,status:503}:{ok:true,arrayBuffer:async()=>Uint8Array.from(String(url).includes('master_release.json')?(opts.receipt||Buffer.from(fs.readFileSync(path.join(root,'shared/master_release.json')))):data).buffer},
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
test('independent verified master selected, preserving old classifier inputs',async()=>{
 const h=harness(),status=await h.bridge.load();
 assert.equal(status.source,'verified-local-master');
 assert.equal(status.sha256,JSON.parse(fs.readFileSync(path.join(root,'shared/master_release.json'))).sha256);
 assert.equal(h.context.window.POKESLEEP_MASTER.pokemon.length,ai.pokemon.length);
 assert.notEqual(h.initial,h.context.window.POKESLEEP_MASTER);
 assert.ok(h.initial.pokemon.every(p=>h.context.window.POKESLEEP_MASTER.pokemon.some(x=>x.name_en===p.name_en)), 'Valid updates may append species but must not lose existing ones');
});
test('new species joins normal classification without preapproval',async()=>{
 const next=JSON.parse(JSON.stringify(ai));
 const seed=next.pokemon.find(p=>p.name==='フシギダネ');
 const fresh={...JSON.parse(JSON.stringify(seed)),name:'新規追加ポケモン',name_en:'NewlyAddedPokemon'};
 next.pokemon.push(fresh);
 const raw=Buffer.from(JSON.stringify(next));
 const receipt={...JSON.parse(fs.readFileSync(path.join(root,'shared/master_release.json'))),
   speciesCount:next.pokemon.length,sha256:createHash('sha256').update(raw).digest('hex')};
 const h=harness({data:raw,receipt:Buffer.from(JSON.stringify(receipt))});
 assert.equal((await h.bridge.load()).source,'verified-local-master');
 vm.runInContext(fs.readFileSync(path.join(root,'classifier.js'),'utf8'),h.context);
 const cls=h.context.window.POKESLEEP_CLASSIFIER;
 const nature=next.natures.find(n=>n.ja==='てれや'),mod=cls.modFromObserved([],10);
 const profile=cls.profiles(seed)[0],seconds=cls.frequency(seed,10,nature,mod,0);
 const sp=cls.computeSp(seed,profile,10,nature,mod,0,1);
 const obs={level:10,sp,helpSeconds:Math.floor(seconds+1e-9),skillLevel:1,nature:'てれや',
 mainSkill:seed.mainSkill,subskills:[]};
 const inference=cls.inferWithoutFoods(obs);
 assert.ok(inference.stages.mainSkill.includes(fresh.name));
 assert.ok(inference.candidates.includes(seed.name),'baseline species calculation must remain valid');
 assert.ok(inference.candidates.includes(fresh.name),'new species must reach final calculated candidates, not just initial skill filter');
 assert.notEqual(inference.status,'UNIQUE','identical new and existing species must not produce a false unique identification');
});
test('future ingredient energy from verified master feeds actual classifier SP calculation',async()=>{
 const future=JSON.parse(JSON.stringify(ai));
 future.ingredients.futureFood='未来の食材';
 future.ingredientStrength={futureFood:123};
 const seed=future.pokemon.find(x=>x.name==='フシギダネ');
 const species={...JSON.parse(JSON.stringify(seed)),name:'未来モン',name_en:'Futuremon',
   ing1:{...seed.ing1,key:'futureFood',name:'未来の食材'}};
 future.pokemon.push(species);
 const raw=Buffer.from(JSON.stringify(future));
 const receipt={...JSON.parse(fs.readFileSync(path.join(root,'shared/master_release.json'))),
   sha256:createHash('sha256').update(raw).digest('hex'),
   speciesCount:future.pokemon.length,ingredientCount:Object.keys(future.ingredients).length};
 const h=harness({data:raw,receipt:Buffer.from(JSON.stringify(receipt))});
 assert.equal((await h.bridge.load()).source,'verified-local-master');
 assert.equal(h.context.window.POKESLEEP_EXTRA_INGREDIENT_STRENGTH.futureFood,123);
 vm.runInContext(fs.readFileSync(path.join(root,'classifier.js'),'utf8'),h.context);
 const cls=h.context.window.POKESLEEP_CLASSIFIER,fp=cls.profiles(species)[0];
 assert.equal(fp.items[0].name,'未来の食材');
 const n=future.natures.find(x=>x.ja==='てれや');
 const mod=cls.modFromObserved([],10);
 const rp=cls.computeSp(species,fp,10,n,mod,0,1);
 assert.ok(Number.isFinite(rp)&&rp>0,'Future food must not be silently computed as zero');
 const malformed=JSON.parse(JSON.stringify(future));
 delete malformed.ingredientStrength;
 const badRaw=Buffer.from(JSON.stringify(malformed));
 const badReceipt={...receipt,sha256:createHash('sha256').update(badRaw).digest('hex')};
 const bad=harness({data:badRaw,receipt:Buffer.from(JSON.stringify(badReceipt))});
 assert.equal((await bad.bridge.load()).source,'legacy-fallback','missing new food energy must not be promoted');
});
test('properly hashed but numerically invalid master is refused before OCR initialization',async()=>{
 const fake=JSON.parse(JSON.stringify(ai));fake.pokemon[0].ingRate='not-a-number';
 const raw=Buffer.from(JSON.stringify(fake));
 const meta={...JSON.parse(fs.readFileSync(path.join(root,'shared/master_release.json'))),
  sha256:createHash('sha256').update(raw).digest('hex')};
 const h=harness({data:raw,receipt:Buffer.from(JSON.stringify(meta))});
 assert.equal((await h.bridge.load()).source,'legacy-fallback');
 assert.strictEqual(h.context.window.POKESLEEP_MASTER,h.initial);
});
test('hashed master with missing required ingredient quantity never replaces live fallback',async()=>{
 const fake=JSON.parse(JSON.stringify(ai));fake.pokemon[0].ing1.c1=null;
 const raw=Buffer.from(JSON.stringify(fake));
 const meta={...JSON.parse(fs.readFileSync(path.join(root,'shared/master_release.json'))),
  sha256:createHash('sha256').update(raw).digest('hex')};
 const h=harness({data:raw,receipt:Buffer.from(JSON.stringify(meta))});
 assert.equal((await h.bridge.load()).source,'legacy-fallback');
 assert.strictEqual(h.context.window.POKESLEEP_MASTER,h.initial);
});
test('tampered independent master rejected; local master untouched',async()=>{
 const h=harness({data:Buffer.from(asset.toString('utf8').replace(/"cutoff"\s*:\s*"[^"]+"/,'"cutoff":"1900-01-01"'))});
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
 specimen.mainSkill,'てれや','0',...ai.subskills.slice(0,5).map(s=>s.ja),'0','0',''];
function inspect(fields,m=ai){const h=harness();return h.gate.inspect(h.gate.serialize([Array.from(h.gate.HEADER),fields]),m);}
test('CSV 18 columns escaped fields, LF and round-trip',()=>{
 const h=harness(),raw=h.gate.serialize([Array.from(h.gate.HEADER),fields]);
 const r=h.gate.inspect(raw,ai);
 assert.equal(r.ok,true,JSON.stringify(r.errors));
 assert.equal(r.rows[1][0],fields[0]);
 assert.ok(raw.includes('"サンプル,""ポケモン"""'));
 assert.ok(!raw.includes('\r'));
});
test('empty nickname is importable but flagged for user review; mint and nature survive',()=>{
 const h=harness(),v=[...fields];v[0]='';v[8]='いじっぱり';v[9]='1';
 const raw=h.gate.serialize([Array.from(h.gate.HEADER),v]),out=h.gate.inspect(raw,ai);
 assert.equal(out.ok,true,JSON.stringify(out.errors));
 assert.equal(out.rows[1].length,18);
 assert.equal(out.rows[1][0],'');
 assert.deepEqual(Array.from(out.rows[1].slice(8,10)),['いじっぱり','1']);
 assert.ok(out.warnings.some(w=>w.includes('blank nickname')));
});
test('empty nicknames receive a nonblocking UI warning without altering actual OCR values',()=>{
 const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const begin=source.indexOf('function csvWarnings('),end=source.indexOf('function csvFoodResolvedForPokesleepTool(',begin);
 assert.ok(begin>=0&&end>begin);
 const rows=[{parsed:{nickname:'',nicknameNeedsReview:false},manualEditOpen:false},
  {parsed:{nickname:'読み取り候補',nicknameNeedsReview:true},manualEditOpen:false}];
 const ctx={results:rows,subskillReviewSlots:()=>[]};vm.createContext(ctx);
 vm.runInContext(source.slice(begin,end),ctx);
 const warnings=Array.from(ctx.csvWarnings());
 assert.ok(warnings.some(w=>w.includes('ニックネーム空欄 1件')));
 assert.ok(warnings.some(w=>w.includes('ニックネーム要確認 1件')));
 assert.equal(rows[0].parsed.nickname,'');
});
test('unknown species, invalid food, malformed nickname, bad controls and levels fail',()=>{
 for(const [column,value] of [[1,'不存在種'],[4,'なし'],[0,'   '],[0,'AB\nCD'],[2,'150'],[3,'99']]){
  const bad=[...fields];bad[column]=value;
  const r=inspect(bad);
  assert.equal(r.ok,false,'column '+column+' value '+value+' result '+JSON.stringify(r));
 }
});
test('duplicate subskills, main skill mismatch and unknown nature fail',()=>{
 for(const [column,value] of [[11,fields[10]],[7,'偽スキル'],[8,'偽せいかく']]){
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
 const bad=[...fields];bad[10]='';
 const v=inspect(bad);
 assert.equal(v.ok,false,JSON.stringify(v));
 assert.ok(v.errors.some(x=>x.includes('empty subskill')));
});
test('mythical subskills may be blank, with explicit CSV gate warnings',()=>{
 const dark=ai.pokemon.find(p=>p.name==='ダークライ');
 const v=[...fields];v[1]=dark.name;v[4]=dark.ing1.name;v[5]='';v[6]='';v[7]=dark.mainSkill;v[10]='';
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

test('all active master species have at least one valid 18-column importer row',()=>{
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
    p.name==='ミュウ'?'きのみバースト':p.mainSkill,nature,'0',
    ...ai.subskills.slice(0,5).map(x=>x.ja),'0','0',''];
 });
 assert.equal(rows.length,ai.pokemon.length);
 const h=harness(),csv=h.gate.serialize([Array.from(h.gate.HEADER),...rows]);
 const result=h.gate.inspect(csv,ai);
 assert.equal(result.ok,true,JSON.stringify(result.errors.slice(0,25)));
 assert.equal(result.rows.length,ai.pokemon.length+1);
});

test('filename reservations survive alternating minutes and backward clock adjustments',async()=>{
 const h=harness(),first=new Date(2026,9,12,14,35,59),next=new Date(2026,9,12,14,36,1);
 const a=await h.gate.reserveFilename(first);
 const b=await h.gate.reserveFilename(next);
 const c=await h.gate.reserveFilename(first);
 assert.match(a,/20261012_1435\.csv$/);
 assert.match(b,/20261012_1436\.csv$/);
 assert.match(c,/20261012_1435_2\.csv$/);
});

test('raw diagnostic CSV and JSON maintain independent minute counters',async()=>{
 const h=harness(),when=new Date(2026,9,12,18,5,43);
 const csv=await h.gate.reserveFilename(when);
 const raw1=await h.gate.reserveFilename(when,'raw');
 const json1=await h.gate.reserveFilename(when,'diagnostics');
 const raw2=await h.gate.reserveFilename(when,'raw');
 const json2=await h.gate.reserveFilename(when,'diagnostics');
 const csv2=await h.gate.reserveFilename(when);
 assert.match(csv,/20261012_1805\.csv$/);
 assert.match(raw1,/raw_before_review_20261012_1805\.csv$/);
 assert.match(raw2,/raw_before_review_20261012_1805_2\.csv$/);
 assert.match(json1,/diagnostics_20261012_1805\.json$/);
 assert.match(json2,/diagnostics_20261012_1805_2\.json$/);
 assert.match(csv2,/20261012_1805_2\.csv$/);
 await assert.rejects(h.gate.reserveFilename(when,'bad-kind'),/Unknown download category/);
});

test('mint: 18-column export keeps original nature and writes an independent 1/0 flag',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const begin=app.indexOf('function mintCsvFlag('),end=app.indexOf('function validatedCsvText(',begin);
 assert.ok(begin>=0&&end>begin,'18-column app export functions must exist');
 const mons=new Map(ai.pokemon.map(p=>[p.name,p]));
 const subs=ai.subskills.slice(0,5).map(x=>({value:x.ja,needsReview:false}));
 const make=(species,nature,minted)=>{
  const p=mons.get(species);assert.ok(p);
  return {speciesManualOverride:species,parsed:{nickname:'ミント試験',nature,
   natureEffect:minted?'neutralized':'normal',level:30,skillLevel:1,mainSkill:p.mainSkill,subs},
   classification:{status:'UNIQUE',candidates:[species]},
   foods:[0,1,2].map(()=>({name:p.ing1.name,needsReview:false}))};
 };
 const rows=[make('フシギダネ','いじっぱり',true),make('フシギダネ','おだやか',false),
  make('エレズン','いじっぱり',true),make('ストリンダー (ハイ)','いじっぱり',true),
  make('ストリンダー (ロー)','おだやか',true),make('ピカチュウ','てれや',false)];
 const before=JSON.stringify(rows),gate=harness().gate;
 const ctx={results:rows,POKESLEEP_TOOL_CSV_HEADER:gate.HEADER,
  chosenSpecies:r=>r.speciesManualOverride,subskillReviewSlots:()=>[],
  mainSkillCsvValue:p=>p.mainSkill,foodCsvValue:f=>f.name,
  ribbonCsvValue:()=>0,shinyCsvValue:()=>0,
  csvCell:v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}};
 vm.createContext(ctx);vm.runInContext(app.slice(begin,end),ctx);
 const actual=rows.map(r=>Array.from(ctx.toPokesleepToolCsvRow(r)));
 assert.ok(actual.every(x=>x.length===18));
 assert.deepEqual(actual.map(x=>x[8]),rows.map(x=>x.parsed.nature));
 assert.deepEqual(actual.map(x=>x[9]),['1','0','1','1','1','0']);
 assert.ok(actual.every(x=>x[17]===''));
 const checked=gate.inspect(ctx.buildCsvText(),ai);
 assert.equal(checked.ok,true,JSON.stringify(checked.errors));
 assert.equal(JSON.stringify(rows),before,'raw OCR/manual rows mutated');
 assert.ok(!app.includes('chooseMintCsvMode('),'obsolete export modal still in app');
});
test('all Toxel nature names survive new mint flag; reject neutral-mint contradictions',()=>{
 const h=harness(),gate=h.gate,app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const begin=app.indexOf('function mintCsvFlag('),end=app.indexOf('function validatedCsvText(',begin);
 const p=ai.pokemon.find(x=>x.name==='エレズン'),natures=new Set(['てれや','がんばりや','すなお','きまぐれ','まじめ']);
 const rows=ai.natures.map(n=>[...fields].map((v,i)=>{
  if(i===1)return p.name;
  if(i===4||i===5||i===6)return p.ing1.name;
  if(i===7)return p.mainSkill;
  if(i===8)return n.ja;
  if(i===9)return natures.has(n.ja)?'0':'1';
  return v;
 }));
 const csv=gate.serialize([Array.from(gate.HEADER),...rows]);
 assert.equal(gate.inspect(csv,ai).ok,true,JSON.stringify(gate.inspect(csv,ai).errors));
 const bad=[...rows[0]];bad[8]='てれや';bad[9]='1';
 assert.equal(gate.inspect(gate.serialize([Array.from(gate.HEADER),bad]),ai).ok,false);
 for(const [i,value] of [[9,'true'],[9,'2'],[17,'❤']]){
  const row=[...rows[0]];row[i]=value;
  assert.equal(gate.inspect(gate.serialize([Array.from(gate.HEADER),row]),ai).ok,false);
 }
 assert.equal(rows.length,ai.natures.length);
 assert.equal(typeof begin,'number');assert.ok(end>begin);
});

test('legacy 16-column CSV and displaced mint flag fail the current CSV gate',()=>{
 const gate=harness().gate,header=Array.from(gate.HEADER);
 const legacyHead=header.filter((_,i)=>i!==9&&i!==17),legacyRow=fields.filter((_,i)=>i!==9&&i!==17);
 assert.equal(legacyHead.length,16);assert.equal(legacyRow.length,16);
 assert.equal(gate.inspect(gate.serialize([legacyHead,legacyRow]),ai).ok,false);
 const shifted=[...fields];shifted.splice(9,1);shifted.push('0');
 assert.equal(shifted.length,18);
 assert.equal(gate.inspect(gate.serialize([header,shifted]),ai).ok,false);
});
test('real raw diagnostic snapshot is 3 columns plus 18, keeping nature and mint',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const b=app.indexOf('function capturePreManualCsvSnapshot(');
 const e=app.indexOf('function diagnosticPreManualCsvSnapshot(',b);
 assert.ok(b>=0&&e>b);
 const gate=harness().gate,raw=[...fields];raw[8]='いじっぱり';raw[9]='1';
 const ctx={results:[{sourceIndex:0,file:'synthetic.png',preManualCsvRow:raw}],
  selected:[{name:'synthetic.png'}],preManualCsvSnapshot:null,Date,
  POKESLEEP_TOOL_CSV_HEADER:Array.from(gate.HEADER),
  diagnosticSnapshotStatus:()=> 'ready',diagnosticRawCsvFilename:()=> 'synthetic.csv',
  csvCell:v=>gate.serialize([[v]])};
 vm.createContext(ctx);vm.runInContext(app.slice(b,e),ctx);
 const s=ctx.capturePreManualCsvSnapshot(),parsed=gate.parse(s.csvText);
 assert.equal(s.header.length,21);
 assert.equal(s.header[12],'まっしろミント');
 assert.equal(s.rows[0].length,21);
 assert.equal(s.rows[0][11],'いじっぱり');
 assert.equal(s.rows[0][12],'1');
 assert.equal(s.rawRows[0].length,18);
 assert.equal(parsed[0].length,21);
 assert.equal(parsed[1].length,21);
 assert.equal(gate.inspect(s.csvText,ai).ok,false);
});
