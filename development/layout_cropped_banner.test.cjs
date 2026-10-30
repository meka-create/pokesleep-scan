'use strict';
// Synthetic-only pixel geometry: no private game screenshots in CI.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const begin=app.indexOf('function layoutInfo(');
const end=app.indexOf('function profileCardInfo(',begin);
assert.ok(begin>=0&&end>begin,'extract real production layoutInfo code');

function inspect(bands,h=1536,w=691){
 const buffer=new Uint8ClampedArray(w*h*4);
 // Each item is [startY,endY,greenPixelsPerRow]. Wide section = 613px;
 // narrower time/carry labels = 202px. All coordinates are synthetic.
 for(const [start,end,count] of bands){
  for(let y=start;y<=end;y++){
   for(let x=0;x<count;x++){
    const i=(y*w+x)*4;buffer[i]=30;buffer[i+1]=220;buffer[i+2]=60;buffer[i+3]=255;
   }
  }
 }
 const canvas={width:w,height:h,getContext:()=>({getImageData:()=>({data:buffer})})};
 const ctx={layoutCache:new WeakMap(),ADAPTIVE_LAYOUT_MAX_H:1470};
 vm.createContext(ctx);vm.runInContext(app.slice(begin,end),ctx);
 return ctx.layoutInfo(canvas);
}

test('cropped 16-px top green header does not masquerade as main skill section',()=>{
 const L=inspect([[0,15,603],[209,245,202],[325,360,201],
                  [411,446,202],[529,566,613],[1194,1231,612]]);
 assert.equal(L.main?.start,529);
 assert.equal(L.detail?.start,1194);
 assert.equal(L.time?.start,325);
 assert.equal(L.carry?.start,411);
 assert.equal(L.carry?.end,446);
 // Existing policy intentionally keeps h=1536 on fixed Android ROIs;
 // this layout repair must not secretly turn on experimental adaptive crops.
 assert.equal(L.adaptive,false);
});
test('regular full-height top banner retains established main/detail/time/carry',()=>{
 const L=inspect([[3,40,612],[235,270,202],[350,386,202],
                  [437,472,202],[553,591,612],[1201,1239,613]]);
 assert.deepEqual([L.time?.start,L.carry?.start,L.main?.start,L.detail?.start],
                  [350,437,553,1201]);
});
test('a wide top strip without two later full section headings is not shifted',()=>{
 const L=inspect([[0,15,603],[209,245,202],[325,360,202],
                  [411,446,202],[529,566,613]]);
 assert.equal(L.main?.start,0);
 assert.equal(L.detail?.start,529);
 assert.equal(L.time,null);
 assert.equal(L.carry,null);
 assert.equal(L.adaptive,false);
});
