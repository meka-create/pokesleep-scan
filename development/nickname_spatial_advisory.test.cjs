'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const spatial=require('../nickname_spatial.js');
const polygon=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
const line=(text,x1,x2,y1=20,y2=58,score=.97)=>({text,poly:polygon(x1,y1,x2,y2),score});
const ctx={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../nickname_spatial.js'),'utf8'),{window:ctx});
test('Paddle item polys distinguish separate Lv captions and give review-only name',()=>{
 const x=spatial.inspect([line('Lv.28',8,160),line('ムウマージ',170,450),line('Lv.30',470,620)],700,110);
 assert.equal(x.candidate,'ムウマージ');
 assert.equal(x.excludedBoxes,2);
 assert.equal(x.kind,'separate-ui-polygon');
 const p={nickname:'Lv.28ムウマージLv.30',nicknameNeedsReview:true,
  nicknameCandidates:[{text:'Lv.28ムウマージLv.30',confidence:98}],
  nicknamePaddle:{spatial:x}};
 const out=spatial.reviewOnly(p);
 assert.equal(out,p);
 assert.equal(p.nickname,'ムウマージ');
 assert.equal(p.nicknameNeedsReview,true);
 assert.equal(p.nicknameResolvedBy,'PaddleOCR-position-review-only');
 assert.ok(p.nicknameCandidates.some(x=>x.text==='Lv.28ムウマージLv.30'));
 assert.ok(p.nicknameCandidates.some(x=>x.text==='ムウマージ'));
});
test('genuine nickname ending Lv30 is not silently accepted or edited',()=>{
 const items=[line('ムウマージ',50,320),line('Lv.30',340,500)];
 const x=spatial.inspect(items,600,110);
 assert.ok(x);
 const p={nickname:'ムウマージLv.30',nicknameNeedsReview:true,
  nicknameCandidates:[],nicknamePaddle:{spatial:x}};
 spatial.reviewOnly(p);
 assert.equal(p.nicknameNeedsReview,true);
 assert.equal(p.nickname,'ムウマージ');
 assert.ok(p.nicknameCandidates.some(i=>i.text==='ムウマージLv.30'));
 // A single polygon is inseparable: don't guess by splitting its text.
 assert.equal(spatial.inspect([line('ムウマージLv.30',30,450)],600,110),null);
});
test('no review flag, no result mutation (frozen auto confirmation)',()=>{
 const evidence=spatial.inspect([line('Lv.28',5,110),line('こむぎ',140,350)],650,110);
 const p={nickname:'こむぎ',nicknameNeedsReview:false,nicknameCandidates:[],
  nicknamePaddle:{spatial:evidence}};
 const before=JSON.stringify(p);
 assert.equal(spatial.reviewOnly(p),p);
 assert.equal(JSON.stringify(p),before);
});
test('unclear geometry, overlap, or ambiguous multiple content boxes abstains',()=>{
 assert.equal(spatial.inspect([line('Lv.28',1,100),{text:'こむぎ',score:.99}],600,110),null);
 assert.equal(spatial.inspect([line('Lv.28',1,100),line('こむぎ',50,280)],600,110),null);
 assert.equal(spatial.inspect([line('Lv.28',1,110),line('こむぎ',125,360),line('すいせい',380,520)],600,110),null);
 assert.equal(spatial.inspect([line('Lv.28',1,110),line('こむぎ',125,360,20,60,.43)],600,110),null);
 assert.equal(spatial.inspect([line('Lv.28',1,110),line('こむぎ',125,620)],600,110),null);
});
test('Unicode names, stars and mixed names remain intact',()=>{
 const values=['ぴか★','Snow★','コムギA','ネコー'];
 for(const name of values){
  const x=spatial.inspect([line('LV.12',1,115),line(name,145,370)],500,110);
  assert.equal(x.candidate,name);
 }
 assert.equal(spatial.inspect([line('Lv.28',1,110),line('SP430',130,260)],500,110),null);
});
test('independent check: production only captures metadata, then applies AFTER frozen auto-confirm',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const a=source.indexOf('async function paddleNickname('),b=source.indexOf('function nicknameFallbackNeedsReview(',a);
 assert.ok(a>=0&&b>a);
 const part=source.slice(a,b);
 assert.match(part,/spatial:window\.POKESLEEP_NICKNAME_SPATIAL\?\.inspect\?\.\(items,src\.width,src\.height\)/);
 assert.match(source,/parsed=autoConfirmCorroboratedReviewedNickname\(parsed\);\n  parsed=window\.POKESLEEP_NICKNAME_SPATIAL\?\.reviewOnly\?\.\(parsed\)\|\|parsed;/);
 assert.ok(source.indexOf('parsed=autoConfirmCorroboratedReviewedNickname(parsed);')<
   source.indexOf('parsed=window.POKESLEEP_NICKNAME_SPATIAL?.reviewOnly?.(parsed)||parsed;'));
});
