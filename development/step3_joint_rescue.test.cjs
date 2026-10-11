'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx={window:{}};
vm.createContext(ctx);
for(const file of ['master_data.js','classifier.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const M=ctx.window.POKESLEEP_MASTER,C=ctx.window.POKESLEEP_CLASSIFIER;
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const start=source.indexOf('function corroboratedJointMissingNatureRescue(parsed,diag){');
const end=source.indexOf('async function rescueStructured(',start);
assert.ok(start>=0&&end>start);
ctx.MAX_POKEMON_LEVEL=100;
ctx.NATURES=M.natures.map(n=>n.ja);
ctx.MAIN_SKILLS=[...new Set(M.pokemon.map(p=>p.mainSkill))];
ctx.norm=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'');
ctx.uniqVals=xs=>[...new Set(xs.filter(v=>v!==''&&v!==null&&v!==undefined))];
ctx.applyStructuredValues=(p,vals)=>{Object.assign(p,vals);if(vals.mainSkill)p.mainScore=1;if(vals.nature)p.natureScore=1;};
ctx.inferParsed=p=>C.inferWithoutFoods({...p,subskills:p.subs.map(s=>s.value)});
vm.runInContext(source.slice(start,end),ctx,{filename:'app-joint-rescue'});
const rescue=ctx.corroboratedJointMissingNatureRescue;
function fixture({wrongMain=true,wrongLevel=false}={}){
 const sp=M.pokemon.find(p=>p.name==='フシギダネ'),lv=14,n=M.natures.find(n=>n.ja==='てれや');
 const mod=C.modFromObserved([],lv),seconds=Math.floor(C.frequency(sp,lv,n,mod,0)+1e-9);
 const p={level:wrongLevel?13:lv,sp:C.computeSp(sp,C.profiles(sp)[0],lv,n,mod,0,1),
   helpSeconds:seconds,carry:sp.carryLimit,skillLevel:1,
   mainSkill:wrongMain?'げんきエールS':sp.mainSkill,nature:'',subs:[]};
 const d={attempts:{
   natureMissing:[{value:n.ja,text:n.ja+' )',confidence:90,psm:'7'},{value:null,text:'',confidence:10,psm:'11'}],
   mainSkill:[{value:sp.mainSkill,text:sp.mainSkill+' Lv.1',confidence:91,psm:'7'},
              {value:sp.mainSkill,text:sp.mainSkill+' Lv.1',confidence:87,psm:'11'}],
   profileHeader:[{level:lv,sp:p.sp,text:'SP '+p.sp+' Lv.'+lv,confidence:90,psm:'6'},
                  {level:lv,sp:p.sp,text:'SP '+p.sp+' Lv. '+lv,confidence:82,psm:'11'}]
 }};
 return {sp,p,d};
}
test('two different OCR passes and independently observed nature repair wrong skill',()=>{
 const {sp,p,d}=fixture(),ret=rescue(p,d);
 assert.ok(ret);assert.equal(ret.species,sp.name);
 assert.equal(p.mainSkill,sp.mainSkill);assert.equal(p.nature,'てれや');
 assert.equal(ret.inference.status,'UNIQUE');
 assert.deepEqual(Array.from(ret.inference.carryConsistentCandidates),[sp.name]);
});
test('verified profile header and nature jointly rescue an incorrect level',()=>{
 const {sp,p,d}=fixture({wrongMain:false,wrongLevel:true});
 const ret=rescue(p,d);assert.ok(ret);assert.equal(ret.species,sp.name);
 assert.equal(p.level,14);assert.equal(p.nature,'てれや');
});
test('one OCR main-skill pass is not proof; do not silently fix',()=>{
 const {p,d}=fixture();d.attempts.mainSkill=d.attempts.mainSkill.slice(0,1);
 assert.equal(rescue(p,d),null);assert.equal(p.nature,'');
 assert.equal(p.mainSkill,'げんきエールS');
});
test('conflicting strong skill evidence blocks joint correction',()=>{
 const {p,d}=fixture();d.attempts.mainSkill[1].value='げんきチャージS';
 d.attempts.mainSkill[1].text='げんきチャージS Lv.1';
 assert.equal(rescue(p,d),null);
});
test('no OCR confirmation of nature blocks classifier-only guessing',()=>{
 const {p,d}=fixture();d.attempts.natureMissing[0].confidence=60;
 assert.equal(rescue(p,d),null);
});
test('independently corroborated species must also match observed carry',()=>{
 const {p,d}=fixture();p.carry=1000;
 assert.equal(rescue(p,d),null);
});
test('numeric profile level rescue requires independent matching SP',()=>{
 const {p,d}=fixture({wrongMain:false,wrongLevel:true});d.attempts.profileHeader[0].sp=9999;
 assert.equal(rescue(p,d),null);
});
test('main pipeline invokes joint evidence only after all re-OCR is collected',()=>{
 const assignment=source.indexOf('diag.attempts.mainSkill=skillA');
 const joint=source.indexOf('corroboratedJointMissingNatureRescue(parsed,diag);');
 assert.ok(assignment>0&&joint>assignment);
 assert.match(source,/diag\.applied=\{reason:'corroborated-joint-missing-nature-rescue'/);
 assert.match(source,/tryCarryCorroboratedFirstFoodRescue/);
 assert.doesNotMatch(source,/reviewQueueSummary|pendingReviewItemCount|nextReview/);
});
