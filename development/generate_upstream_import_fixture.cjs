"use strict";
// Production CSV producer -> live upstream importer fixture. No user data.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const dest=process.argv[2];if(!dest)throw Error('Output fixture path required');
const master=JSON.parse(fs.readFileSync(path.join(root,'shared/MASTER_DATA.json'),'utf8'));
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const csvGate=fs.readFileSync(path.join(root,'csv_gate.js'),'utf8');
const header=source.match(/const POKESLEEP_TOOL_CSV_HEADER=\[[^;\n]+\];/);
if(!header)throw Error('Missing production CSV header');
const start=source.indexOf('function mintCsvFlag('),end=source.indexOf('function validatedCsvText(',start);
if(start<0||end<=start)throw Error('Missing production CSV serializer functions');
const mons=new Map(master.pokemon.map(p=>[p.name,p]));
const names=['ピカチュウ','ピカチュウ','ピカチュウ','エレズン','ストリンダー (ハイ)','ストリンダー (ロー)'];
const natures=['いじっぱり','おだやか','てれや','いじっぱり','いじっぱり','おだやか'];
const mint=[true,false,false,true,true,true];
const rows=names.map((name,i)=>{
 const p=mons.get(name);if(!p)throw Error('Master species missing '+name);
 return {
  sourceIndex:i,speciesManualOverride:p.name,classification:{status:'UNIQUE',candidates:[p.name]},
  parsed:{nickname:i===0?'ミント,「試験」':'テスト'+i,level:30,skillLevel:1,
   mainSkill:p.mainSkill,nature:natures[i],natureEffect:mint[i]?'neutralized':'normal',
   subs:master.subskills.slice(0,5).map(s=>({value:s.ja,needsReview:false}))},
  foods:[0,1,2].map(()=>({name:p.ing1.name,needsReview:false}))
 };
});
const ctx={window:{},results:rows,
 chosenSpecies:r=>r.speciesManualOverride,
 subskillReviewSlots:()=>[],
 mainSkillCsvValue:p=>p.mainSkill,foodCsvValue:f=>f.name,
 ribbonCsvValue:()=>0,shinyCsvValue:()=>0,
 csvCell:v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}};
vm.createContext(ctx);vm.runInContext(csvGate,ctx,{filename:'csv_gate.js'});
vm.runInContext(header[0]+ '\n'+source.slice(start,end),ctx,{filename:'app-export.js'});
const before=JSON.stringify(rows),csv=ctx.buildCsvText();
if(before!==JSON.stringify(rows))throw Error('Export mutated OCR state');
const checked=ctx.window.POKESLEEP_CSV_GATE.inspect(csv,master);
if(!checked.ok)throw Error('Production gate rejected fixture: '+checked.errors.join(' / '));
if(checked.rows.length!==rows.length+1||checked.rows.some(r=>r.length!==18))throw Error('18-column schema mismatch');
fs.writeFileSync(dest,csv,'utf8');
console.log('Production app.js + csv_gate.js generated '+rows.length+' synthetic items with verified 18-column CSV');
