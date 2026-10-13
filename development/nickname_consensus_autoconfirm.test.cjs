'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const start=src.indexOf('function exactSeparatedNickname(');
const end=src.indexOf('function nicknameLooksUiContaminated(',start);
assert.ok(start>=0&&end>start,'production consensus code must be present');
const state={};
const ctx={
 MAX_POKEMON_LEVEL:100,
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,''),
 nicknameLooksUiContaminated:s=>/(?:Lv[.,]?\d+|SP\s*\d+)/i.test(s),
 nicknameKnownSpeciesUiAffix:()=>false,
 nicknameNearSpeciesTypo:()=>false,
 nicknameHasUnbalancedClosingPunctuation:()=>false
};
vm.createContext(ctx);
vm.runInContext(src.slice(start,end),ctx,{filename:'consensus-review-only.js'});
function make({name='ワンダラダ',lv=61,paddle='ワンダラダLv.61',pc=99,
               tess='Lv.61ワンダラダ',tc=92,review=true,conflict=null}={}){
 const c=[{text:tess,confidence:tc,sources:[null]}];
 if(conflict)c.push({text:conflict,confidence:81,sources:[null]});
 return {nickname:name,nicknameNeedsReview:review,nicknameReviewReason:'uncertain',
  nicknameResolvedBy:'',level:lv,levelNeedsReview:false,sp:3033,helpSeconds:3521,
  mainSkill:'エナジーチャージM',nature:'てれや',foods:[1,2,3],
  nicknamePaddle:{ok:true,confidence:pc,text:paddle},nicknameCandidates:c};
}
const confirm=r=>ctx.autoConfirmCorroboratedReviewedNickname(r);
test('two different OCR systems agree on exactly one name with opposite Lv positions',()=>{
 const r=make(),stable=JSON.stringify({nickname:r.nickname,level:r.level,sp:r.sp,helpSeconds:r.helpSeconds,
  mainSkill:r.mainSkill,nature:r.nature,foods:r.foods});
 assert.equal(confirm(r),r);
 assert.equal(r.nickname,'ワンダラダ');
 assert.equal(r.nicknameNeedsReview,false);
 assert.match(r.nicknameResolvedBy,/consensus/);
 assert.equal(JSON.stringify({nickname:r.nickname,level:r.level,sp:r.sp,helpSeconds:r.helpSeconds,
  mainSkill:r.mainSkill,nature:r.nature,foods:r.foods}),stable);
});
test('level does not match source caption, or header level is uncertain',()=>{
 for(const r of [make({lv:60}),make({paddle:'ワンダラダLv.60'}),
                 make({tess:'Lv.60ワンダラダ'}),make({lv:null})]){
  confirm(r);assert.equal(r.nicknameNeedsReview,true);
 }
 const uncertain=make();uncertain.levelNeedsReview=true;confirm(uncertain);
 assert.equal(uncertain.nicknameNeedsReview,true);
});
test('strong competing Tesseract reading blocks consensus',()=>{
 for(const r of [make({conflict:'Lv.61ワンダラヲ'}),
                 make({tess:'Lv.61ワンダラヲ'}),
                 make({pc:97.9}),make({tc:89.9})]){
  confirm(r);assert.equal(r.nicknameNeedsReview,true);
 }
});
test('Paddle-only agreement and duplicated Paddle candidates are never accepted',()=>{
 const r=make({tc:0});r.nicknameCandidates=[{text:r.nicknamePaddle.text,confidence:100,sources:['paddle']}];
 confirm(r);assert.equal(r.nicknameNeedsReview,true);
});
test('existing correct auto confirmation is never touched; missing Paddle is safe',()=>{
 const old=make({review:false});const before=JSON.stringify(old);confirm(old);
 assert.equal(JSON.stringify(old),before);
 const missing=make();missing.nicknamePaddle.ok=false;confirm(missing);
 assert.equal(missing.nicknameNeedsReview,true);
});
test('short and UI-like nickname is never promoted',()=>{
 for(const r of [make({name:'ok',paddle:'okLv.61',tess:'Lv.61ok'}),
                 make({name:'Lv61ok',paddle:'Lv61okLv.61',tess:'Lv.61Lv61ok'}),
                 make({name:'ほし★',paddle:'ほし★Lv.61',tess:'Lv.61ほし★'})]){
  confirm(r);assert.equal(r.nicknameNeedsReview,true);
 }
});
test('the extra hook occurs only after verified-structure rescue, before immutable nickname snapshot',()=>{
 const rescue=src.indexOf('({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));');
 const hook=src.indexOf('parsed=autoConfirmCorroboratedReviewedNickname(parsed);');
 const snapshot=src.indexOf('Object.assign(nicknameReviewAtAnalysis,',rescue);
 assert.ok(rescue>=0&&hook>rescue&&snapshot>hook);
 assert.equal(src.split('parsed=autoConfirmCorroboratedReviewedNickname(parsed);').length-1,1);
});
