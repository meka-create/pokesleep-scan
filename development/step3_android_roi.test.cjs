'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(ROOT,'android_roi.js'),'utf8');
function api(){
 const c={window:{}};vm.createContext(c);vm.runInContext(js,c,{filename:'android_roi.js'});
 return c.window.POKESLEEP_ANDROID_ROI;
}
const patterns=[
 {weight:80,bars:[[3,60],[863,921],[1876,1933]]},
 {weight:28,bars:[[0,48],[852,910],[1866,1922]]},
 {weight:20,bars:[[3,60],[863,921],[1903,1961]]},
 {weight:4,bars:[[11,67],[871,928],[1883,1941]]},
 {weight:2,bars:[[804,862],[1886,1943]]},
 {weight:2,bars:[[0,48],[852,910],[1892,1950]]}
];
function canvasFor(bars){
 const w=691,h=1536,data=new Uint8ClampedArray(w*h*4),sx=w/1080,sy=h/2400;
 for(const [start,end] of bars){
  const y0=Math.floor(start*sy),y1=Math.ceil(end*sy);
  for(let y=y0;y<y1;y++)for(let x=Math.floor(52*sx);x<Math.ceil(1020*sx);x++){
   const at=(y*w+x)*4;data[at]=10;data[at+1]=215;data[at+2]=86;data[at+3]=255;
  }
 }
 return {width:w,height:h,getContext:()=>({getImageData:()=>({data})})};
}
test('Android candidate size needs portrait 1080:2400 aspect ratio',()=>{
 const a=api();
 assert.equal(a.isCandidateSize(691,1536),true);
 assert.equal(a.isCandidateSize(691,1024),false);
 assert.equal(a.isCandidateSize(600,1536),false);
});
test('green section-bar detection enables all representative meka142 variants',()=>{
 const a=api();
 for(const pattern of patterns){
  const c=canvasFor(pattern.bars);
  const result=a.inspect(c);
  assert.ok(result,'Valid screenshot pattern rejected '+JSON.stringify(pattern));
  const crop=result.rectFor('mainskill');
  const nature=result.rectFor('nature');
  assert.ok(crop[1]>c.height*.34&&crop[3]<c.height*.55);
  assert.ok(nature[1]>c.height*.76&&nature[3]<c.height*.92);
  assert.equal(a.inspect(c),result,'Canvas detection should be cached');
 }
});
test('rescue crops stay inside expected green-bound sections',()=>{
 const a=api(),p=a.planFromBars(691,1536,[{start:3,end:60},{start:863,end:921},{start:1903,end:1961}]);
 assert.ok(p);
 for(const key of ['sp','nicklevel','time','carry','mainskill','sub10','sub25','sub50','sub70','sub80','nature']){
  const r=p.rectFor(key);
  assert.ok(r.every(Number.isFinite),'Invalid rect '+key);
  assert.ok(r[0]>=0&&r[1]>=0&&r[2]<=691&&r[3]<=1536,'Out of bounds '+key);
  assert.ok(r[2]>r[0]&&r[3]>r[1]);
 }
 for(const kind of ['alt','narrow','wrap','eng','paddle','star']){
  const r=p.nickRect(kind);
  assert.ok(r[2]>r[0]&&r[3]>r[1]);
 }
});
test('missing or ill-placed section anchors fail closed to original crops',()=>{
 const a=api();
 assert.equal(a.inspect(canvasFor([[3,60],[863,921]])),null);
 assert.equal(a.planFromBars(691,1536,[{start:863,end:921},{start:1450,end:1507}]),null);
 assert.equal(a.planFromBars(691,1000,[{start:863,end:921},{start:1876,end:1933}]),null);
});
test('ROI code never removes legacy crop path or classifier',()=>{
 const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 assert.match(app,/window\.POKESLEEP_ANDROID_ROI\?\.inspect\(canvas\)/);
 assert.match(app,/return r\?cropCanvasRect\(canvas,r,scale\):cropByRegion\(canvas,REGIONS\[key\],scale\)/);
 assert.match(app,/function cropNick\(canvas,kind,scale=1\)/);
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/'food_matcher\.js','android_roi\.js','csv_gate\.js','app\.js'/);
});
test('PWA includes Android adapter in new versioned app shell',()=>{
 const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(sw,/step3-dev-android-roi-review/);
 assert.match(sw,/versioned\('\.\/android_roi\.js'\)/);
 assert.match(sw,/step3=androidroi-v1/);
 assert.match(html,/set\('step3','androidroi-v1'\)/);
});
test('review queue summary and focusable next action are part of the app',()=>{
 const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(app,/const pendingRows=ordered\.filter\(x=>x\.needsReview\)/);
 assert.match(app,/reviewQueueCursor/);
 assert.match(app,/target\.focus\(\{preventScroll:true\}\)/);
 assert.match(html,/id="reviewQueueSummary"/);
 assert.match(html,/id="nextReview"/);
});
