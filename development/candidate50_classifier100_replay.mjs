import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const diag=JSON.parse(fs.readFileSync(new URL('classifier100_fixture.json',import.meta.url),'utf8'));
const ctx={window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('master_data.js',root),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('classifier.js',root),'utf8'),ctx);
const C=ctx.window.POKESLEEP_CLASSIFIER;
const obs=p=>({level:p.level,sp:p.sp,helpSeconds:p.helpSeconds,carry:p.carry,skillLevel:p.skillLevel,nature:p.nature,mainSkill:p.mainSkill,subskills:(p.subskills||p.subs||[]).map(x=>typeof x==='string'?x:x.value)});
let counts={},mismatch=[];
for(const r of diag.results){
 const o=obs(r.parsed);const neutral=r.inference?.natureEffect==='neutralized';
 const x=neutral?C.inferWithoutFoodsNeutralized(o):C.inferWithoutFoods(o);
 counts[x.status]=(counts[x.status]||0)+1;
 const now=x.status+'|'+(x.candidates||[]).join(',');
 const saved=r.inference?.status+'|'+(r.inference?.candidates||[]).join(',');
 if(now!==saved)mismatch.push({file:r.file,now,saved});
}
if(diag.results.length!==100)throw new Error(`expected 100, got ${diag.results.length}`);
if(counts.UNIQUE!==100||mismatch.length)throw new Error(JSON.stringify({counts,mismatch:mismatch.slice(0,10)},null,2));
console.log('OK: Candidate 50 classifier saved-100 replay = 100/100 UNIQUE, 0 saved-species mismatches');
