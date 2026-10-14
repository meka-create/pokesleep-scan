'use strict';
// Synthetic observed SP / screenshot-text and 16-column CSV tests; not live OCR.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const master=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const baseline=JSON.parse(fs.readFileSync('shared/MASTER_DATA.json','utf8'));
const ctx={window:{POKESLEEP_MASTER:baseline,POKESLEEP_EXTRA_INGREDIENT_STRENGTH:{}},console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('shared_master.js','utf8'),ctx);
assert.equal(ctx.window.POKESLEEP_SHARED_MASTER.valid(master),true,'251-species runtime schema');
ctx.window.POKESLEEP_MASTER=master;
vm.runInContext(fs.readFileSync('classifier.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('csv_gate.js','utf8'),ctx);
const calc=ctx.window.POKESLEEP_CLASSIFIER,gate=ctx.window.POKESLEEP_CSV_GATE;
const nature=master.natures.find(n=>n.ja==='すなお'),species=['ムウマ','ムウマージ'];
assert.ok(nature);
for(const name of species){
 const p=master.pokemon.find(x=>x.name===name);
 assert.ok(p);
 assert.ok(typeof p.mainSkill==='string'&&p.mainSkill.trim(),name+': missing translated skill');
 const lv=30,skillLv=1,mod=calc.modFromObserved([],lv),profile=calc.profiles(p)[0];
 assert.ok(profile);
 const sp=calc.computeSp(p,profile,lv,nature,mod,0,skillLv);
 const helpSeconds=Math.floor(calc.frequency(p,lv,nature,mod,0)+1e-9);
 const obs={level:lv,sp,helpSeconds,skillLevel:skillLv,nature:nature.ja,
  mainSkill:p.mainSkill,subskills:[],foods:profile.items.map(x=>x.name)};
 assert.ok(Number.isFinite(sp));
 const result=calc.classify(obs);
 assert.equal(result.status,'UNIQUE',name+': '+JSON.stringify(result));
 assert.deepEqual([...result.candidates],[name]);
 console.log('SYNTHETIC CLASSIFICATION PASS',name,'SP',sp,'help',helpSeconds);
}
const rows=[gate.HEADER];
for(const name of species){
 const p=master.pokemon.find(x=>x.name===name);
 const food=slot=>[p.ing1,p.ing2,p.ing3].filter(Boolean).find(f=>Number.isInteger(f['c'+slot])&&f['c'+slot]>0)?.name||'';
 rows.push([name,p.name,'30','1',food(1),food(2),food(3),p.mainSkill,nature.ja,
  ...master.subskills.slice(0,5).map(x=>x.ja),'0','0']);
}
assert.ok(rows.every(x=>x.length===16));
const csv=gate.serialize(rows),check=gate.inspect(csv,master);
assert.equal(check.ok,true,JSON.stringify(check.errors));
assert.equal(gate.serialize(gate.parse(csv)),csv);
console.log('SYNTHETIC CSV GATE: PASS; two 16-column rows and roundtrip');
