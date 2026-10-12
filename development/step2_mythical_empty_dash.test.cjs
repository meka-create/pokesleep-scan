'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','food_matcher.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const win={POKESLEEP_FOOD_COLOR_FEATURES:{foods:{}}};
vm.runInNewContext(js,{window:win,document:{}});
const {explicitThirdFoodDashStats:stats,explicitThirdFoodDash:screen}=win.POKESLEEP_FOOD_MATCHER;
function rgba(w=67,h=61,kind='dash'){
 const a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  let rgb=kind==='white'?[254,254,254]:[254,253,225];
  if(kind==='dash'&&y>=16&&y<=22&&x>=17&&x<=49)rgb=[251,237,186];
  if(kind==='real-icon'&&y>=14&&y<=43&&x>=17&&x<=49)rgb=[198,121,85];
  a.set([...rgb,255],i);
 }
 return a;
}
test('Only visible, pale horizontal dash is independently accepted',()=>{
 const found=stats(rgba(),67,61);
 assert.equal(found.confirmed,true);
 assert.ok(found.dash>.025&&found.dash<.11);
 assert.equal(stats(rgba(67,61,'real-icon'),67,61).confirmed,false);
 assert.equal(stats(rgba(67,61,'white'),67,61).confirmed,false);
 assert.equal(stats(rgba(67,61,'no-dash'),67,61).confirmed,false);
});
test('Pixel-copy failure, missing dimensions, or unexpected layout abstains',()=>{
 assert.equal(stats(null,67,61).confirmed,false);
 assert.equal(stats(rgba(),66,61).confirmed,false);
 assert.equal(screen({width:600,height:600}).confirmed,false);
 assert.equal(screen({width:1080,height:2200}).confirmed,false);
});
test('Normalized screen coordinates are scanned only with compatible screenshot geometry',()=>{
 const expected=rgba();
 const fake={width:691,height:1536,getContext:()=>({getImageData:(x,y,w,h)=>{
  assert.equal(x,537);assert.equal(y,199);assert.equal(w,67);assert.equal(h,61);
  return {data:expected};
 }})};
 assert.equal(screen(fake).confirmed,true);
});
test('Production may accept dash only for legal species and weak third-food OCR',()=>{
 assert.match(app,/noneFoodAllowed\(species,i\).*f\.allowed\.includes\(NO_FOOD\)/);
 assert.match(app,/if\(i===2&&\(Number\(f\.score\)\|\|0\)<\.70\)/);
 assert.match(app,/if\(marker\?\.confirmed\)/);
 assert.match(app,/f\.method='explicit-screen-dash';f\.needsReview=false/);
 assert.match(app,/foodEmptyTemplateScore\(POKESLEEP_FOOD_MATCHER\.cropFood/);
 assert.match(app,/function csvFoodResolvedForPokesleepTool/);
});
