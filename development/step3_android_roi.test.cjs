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
 {weight:80,bars:[[3,60],[863,921],[1876,1933]],cardBottom:1225},
 {weight:28,bars:[[0,48],[852,910],[1866,1922]],cardBottom:1214},
 {weight:20,bars:[[3,60],[863,921],[1903,1961]],cardBottom:1281},
 {weight:4,bars:[[11,67],[871,928],[1883,1941]],cardBottom:1232},
 {weight:2,bars:[[804,862],[1886,1943]],cardBottom:1263},
 {weight:2,bars:[[0,48],[852,910],[1892,1950]],cardBottom:1270}
];
function canvasFor(bars,cardBottom=null,profile=true){
 const w=691,h=1536,data=new Uint8ClampedArray(w*h*4),sx=w/1080,sy=h/2400;
 const paint=(x1,x2,y1,y2,r,g,b)=>{
  const ix1=Math.max(0,Math.floor(x1*sx)),ix2=Math.min(w,Math.ceil(x2*sx));
  const iy1=Math.max(0,Math.floor(y1*sy)),iy2=Math.min(h,Math.ceil(y2*sy));
  for(let y=iy1;y<iy2;y++)for(let x=ix1;x<ix2;x++){
   const at=(y*w+x)*4;data[at]=r;data[at+1]=g;data[at+2]=b;data[at+3]=255;
  }
 };
 for(const [start,end] of bars)paint(52,1020,start,end+1,10,215,86);
 if(cardBottom!==null)paint(70,1010,cardBottom-6,cardBottom+1,239,160,58);
 if(profile)paint(25,635,144,147,239,150,90);
 return {width:w,height:h,getContext:()=>({
  getImageData:(x=0,y=0,width=w,height=h)=>{
   if(x===0&&y===0&&width===w&&height===h)return {data};
   const part=new Uint8ClampedArray(width*height*4);
   for(let row=0;row<height;row++){
    part.set(data.subarray(((y+row)*w+x)*4,((y+row)*w+x+width)*4),row*width*4);
   }
   return {data:part};
  }
 })};
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
  const c=canvasFor(pattern.bars,pattern.cardBottom);
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
 const a=api(),p=a.planFromBars(691,1536,[{start:3,end:60},{start:863,end:921},{start:1903,end:1961}],1281,144);
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
test('three-line main skill card moves subskill crops by the complete card-bottom shift',()=>{
 const a=api(),regular=a.inspect(canvasFor(patterns[0].bars,1225));
 const long=a.inspect(canvasFor(patterns[2].bars,1281));
 assert.equal(regular.mainSkillCardBottom,1225);
 assert.equal(long.mainSkillCardBottom,1281);
 for(const key of ['sub10','sub25','sub50','sub70','sub80']){
  const y0=regular.rectFor(key),y1=long.rectFor(key);
  assert.ok(y1[1]-y0[1]>=35,'Cut off OCR on long main skill: '+key);
  assert.ok(y1[3]-y0[3]>=35,'Text bottom missing on long main skill: '+key);
 }
 const compact=a.inspect(canvasFor(patterns[1].bars,1214));
 assert.ok(compact.rectFor('sub10')[1]<regular.rectFor('sub10')[1]);
});
test('subskill detection fails closed when main-skill orange card cannot be verified',()=>{
 const a=api(),candidate=a.inspect(canvasFor(patterns[0].bars));
 assert.ok(candidate,'Green headers should still activate safe profile crops');
 assert.equal(candidate.mainSkillCardBottom,null);
 assert.equal(candidate.rectFor('sub10'),null);
 assert.ok(candidate.rectFor('sp'));
});
test('partially clipped top green banner must not shift SP and nickname away from stable coral profile',()=>{
 const a=api();
 const normal=a.inspect(canvasFor(patterns[0].bars,1225));
 const clipped=a.inspect(canvasFor(patterns[4].bars,1263));
 assert.equal(normal.profileCardTop,144);
 assert.equal(clipped.profileCardTop,144);
 for(const key of ['sp','nicklevel','time','carry']){
  const stable=normal.rectFor(key),candidate=clipped.rectFor(key);
  assert.equal(candidate[1],stable[1],'Top OCR field incorrectly shifted by main header: '+key);
  assert.equal(candidate[3],stable[3],'Top crop bottom changed: '+key);
 }
 assert.ok(clipped.nickRect('alt'));
});
test('unverified top profile safely returns to legacy top and nickname crops',()=>{
 const a=api(),p=a.inspect(canvasFor(patterns[0].bars,1225,false));
 assert.ok(p,'Main and detail anchors still support safely detected subskills');
 assert.equal(p.profileCardTop,null);
 assert.equal(p.rectFor('sp'),null);
 assert.equal(p.nickRect('alt'),null);
 assert.ok(p.rectFor('sub10'));
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
 assert.match(app,/const androidRoiEnabled=true;/);
 assert.equal(app.includes('STEP3_ANDROID_ROI_STORAGE_KEY'),false);
 assert.equal(app.includes("$('#androidRoiEnabled')"),false);
 assert.equal(app.split('androidRoiEnabled?window.POKESLEEP_ANDROID_ROI?.inspect(canvas):null').length-1,4);
 assert.match(app,/return r\?cropCanvasRect\(canvas,r,scale\):cropByRegion\(canvas,REGIONS\[key\],scale\)/);
 assert.match(app,/function cropNick\(canvas,kind,scale=1\)/);
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(html,/'food_matcher\.js','android_roi\.js','csv_gate\.js','app\.js'/);
 assert.doesNotMatch(html,/id="androidRoiEnabled"/);
 assert.doesNotMatch(html,/android-roi-option/);
 assert.match(html,/class="file-picker-shell"/);
 assert.match(html,/id="uploadMain" class="upload-main">画像を選択する/);
 assert.match(html,/id="uploadIcon" class="upload-icon"/);
 assert.match(html,/<rect x="3" y="4" width="18" height="16" rx="3"\/>/);
 assert.match(html,/id="imageSelectDialog"/);
 assert.match(html,/\.filelabel\.is-selected\{border:2px solid #5b8fe6;background:#eaf3ff/);
 assert.doesNotMatch(html,/選択済みの画像をどうしますか？/);
 assert.doesNotMatch(html,/id="imageSelectDialogHint"/);
 assert.match(html,/id="imageSelectClose"/);
 assert.match(html,/id="imageSelectReplace"/);
 assert.match(html,/id="imageSelectAppend"/);
 assert.match(html,/id="addFiles" type="file"/);
 assert.match(html,/\.filelabel\{display:flex/);
 assert.match(html,/2px dashed #abc4eb/);
 assert.match(html,/background:#f8fbff/);
 assert.doesNotMatch(html,/addFilesButton/);
 assert.doesNotMatch(html,/additional-files-btn/);
 assert.match(app,/function openImageSelectDialog\(/);
 assert.match(app,/function closeImageSelectDialog\(/);
 assert.match(app,/setSelectedFiles\(batch,\{append:true\}\)/);
 assert.match(app,/function selectedImagesHaveSameBytes\(/);
 assert.match(app,/function removeIdenticalAppendedImages\(/);
 assert.doesNotMatch(app,/if\(append&&seen\.has\(key\)\)continue/);

});
test('PWA includes Android adapter in new versioned app shell',()=>{
 const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.match(sw,/step3-prod-multi-picker-v1-reviewclean-v1/);
 assert.match(sw,/versioned\('\.\/android_roi\.js'\)/);
 assert.match(sw,/step3=androidroi-v1/);
 assert.match(sw,/pick=multi-v1/);
 assert.match(sw,/ui=review-clean-v1/);
 assert.match(html,/set\('ui','review-clean-v1'\)/);
 assert.match(html,/set\('pick','multi-v1'\)/);
 assert.match(html,/set\('step3','androidroi-v1'\)/);
});
test('unrequested review counter and Next Review UI are removed, review filter and row priority remain',()=>{
 const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 for(const token of ['reviewQueueSummary','nextReview','reviewQueueCursor','pendingReviewItemCount','review-queue']){
  assert.ok(!app.includes(token),'Stale review-queue JS: '+token);
  assert.ok(!html.includes(token),'Stale review-queue markup: '+token);
 }
 assert.match(html,/id="reviewOnly"/);
 assert.match(html,/id="csv"/);
 assert.match(html,/id="copyCsv"/);
 assert.match(app,/\$\('#reviewOnly'\)\?\.addEventListener\('change',render\)/);
 assert.match(app,/const ordered=results\.map/);
 assert.match(app,/ap=a\.needsReview\?0/);
});
test('subskill verification and rescue use the Android card anchor, never obsolete header-relative coordinates',()=>{
 const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 const from=app.indexOf('function sectionRelativeSubskillCrop(');
 const to=app.indexOf('function adaptiveFallbackCrop(',from);
 const fromRetry=app.indexOf('function subskillRetryCrops(');
 const toRetry=app.indexOf('async function readSubskillRetry(',fromRetry);
 assert.ok(from>=0&&to>from&&fromRetry>=0&&toRetry>fromRetry);
 const selected=[77,888,456,999],canvas={width:691,height:1536};
 const context={
  androidRoiEnabled:true,
  window:{POKESLEEP_ANDROID_ROI:{inspect:()=>({rectFor:()=>selected})}},
  cropCanvasRect:(_c,rect)=>({rect}),
  crop:()=>({rect:selected}),
  layoutInfo:()=>{throw Error('Legacy relative crop must not run')},
 };
 vm.createContext(context);
 vm.runInContext(app.slice(from,to)+app.slice(fromRetry,toRetry),context);
 assert.deepEqual(Array.from(context.sectionRelativeSubskillCrop(canvas,'sub50').rect),selected);
 const retry=context.subskillRetryCrops(canvas,'sub50');
 assert.equal(retry.length,1,'Do not add stale or duplicate review evidence');
 assert.equal(retry[0][0],'primary');
});
