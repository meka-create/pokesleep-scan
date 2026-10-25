'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const i=app.indexOf('// Read-only timing probes:'),j=app.indexOf('async function trackedWorkerRecognize(',i);
assert.ok(i>=0&&j>i);
function fixture(charging=false){
 const els=Object.fromEntries(['#speedWarning','#floatingSpeedWarning'].map(id=>[id,{hidden:true,textContent:''}]));
 const ctx={Date,console,results:[],performance:{now:()=>100},
  document:{hidden:false,addEventListener(){}},$:id=>els[id]||null,
  isRunning:true,analysisPause:null,localProgressState:'running',
  localProgressVisible:true,floatingProgressShouldShow:()=>true,
  ...(charging?{navigator:{getBattery:async()=>({charging:true,addEventListener(){}})}}:{})};
 vm.createContext(ctx);vm.runInContext(app.slice(i,j),ctx);
 return {ctx,els};
}
function add(ctx,n,first=2300,extra=260,calls=12,hidden=false){
 const p={sourceIndex:n,startedAt:'2026-10-25T00:00:00Z',failed:false,
  visibility:{hiddenAtStart:hidden,hiddenAtEnd:false,hiddenMs:hidden?100:0},
  tesseract:{calls:calls+1,totalMs:first+extra*calls,
   byStage:{initialTesseract:{calls:1,totalMs:first}}}};
 const row={sourceIndex:n,parsed:{nickname:'unchanged'},performanceProfile:p};
 ctx.scanSpeedObserve(row);assert.equal(row.parsed.nickname,'unchanged');return row;
}
test('normal 30 images: no warning; extra OCR count alone never triggers',()=>{
 const {ctx,els}=fixture();for(let n=0;n<30;n++){
  const row=add(ctx,n,2200+n%5*140,250+n%4*25,n===19?29:12);
  assert.equal(row.performanceProfile.speedMonitor.slow,false);
  assert.equal(els['#speedWarning'].hidden,true);
 }assert.equal(ctx.scanSpeedSummary().events.length,0);
});
test('2-of-3 sustained slowdown warns; 3 clean images dismiss automatically',()=>{
 const {ctx,els}=fixture();for(let n=0;n<4;n++)add(ctx,n);
 add(ctx,4,6000,700);add(ctx,5);const row=add(ctx,6,6100,730);
 assert.equal(row.performanceProfile.speedMonitor.transition,'slowdown');
 assert.match(els['#speedWarning'].textContent,/解析速度が低下/);
 assert.equal(els['#floatingSpeedWarning'].hidden,true);
 ctx.localProgressVisible=false;ctx.scanSpeedRender();
 assert.equal(els['#speedWarning'].hidden,true);
 assert.equal(els['#floatingSpeedWarning'].hidden,false);
 ctx.localProgressVisible=true;ctx.scanSpeedRender();
 add(ctx,7);add(ctx,8);assert.equal(ctx.scanSpeedSummary().active,true);
 assert.equal(add(ctx,9).performanceProfile.speedMonitor.transition,'recovered');
 assert.equal(els['#speedWarning'].hidden,true);
 assert.deepEqual(Array.from(ctx.scanSpeedSummary().events,e=>e.kind),['slowdown','recovered']);
});
test('hidden-tab samples ignored and a single complex image does not warn',()=>{
 const {ctx}=fixture();for(let n=0;n<4;n++)add(ctx,n);
 add(ctx,4,7300,900);add(ctx,5);add(ctx,6,12500,1500,11,true);
 add(ctx,7,2450,270,35);
 assert.equal(ctx.scanSpeedSummary().active,false);
 assert.equal(ctx.scanSpeedSummary().slowSamples,1);
});
test('extreme slowdown detected even when all early samples are slow',()=>{
 const {ctx}=fixture();for(let n=0;n<3;n++)add(ctx,n,12000,1500);
 assert.equal(ctx.scanSpeedSummary().active,true);
});
test('charging status is optional and charging annotation never interrupts OCR',async()=>{
 const {ctx,els}=fixture(true);ctx.scanSpeedBatteryStart();await new Promise(resolve=>setImmediate(resolve));
 for(let n=0;n<4;n++)add(ctx,n);add(ctx,4,5700,680);add(ctx,5,5800,700);
 assert.equal(ctx.scanSpeedSummary().battery.charging,true);
 assert.match(els['#speedWarning'].textContent,/充電中です/);
 ctx.isRunning=false;ctx.scanSpeedRender();assert.equal(els['#speedWarning'].hidden,true);
});
test('checkpoint restoration keeps warning and 3-image recovery',()=>{
 const {ctx}=fixture(),rows=[];for(let n=0;n<4;n++)rows.push(add(ctx,n));
 rows.push(add(ctx,4,5700,680),add(ctx,5,5900,710));
 ctx.scanSpeedReset();ctx.scanSpeedRestoreProfiles(rows);
 assert.equal(ctx.scanSpeedSummary().active,true);
 add(ctx,6);add(ctx,7);add(ctx,8);assert.equal(ctx.scanSpeedSummary().active,false);
});
test('stale charging result and previous battery listeners cannot leak across scans',async()=>{
 const {ctx}=fixture();
 const managers=[];
 let resolveFirst;
 const pending=new Promise(resolve=>resolveFirst=resolve);
 const listeners=new Map();
 const battery=charging=>({
  charging,addEventListener(_name,fn){listeners.set(this,fn);},
  removeEventListener(_name,fn){if(listeners.get(this)===fn)listeners.delete(this);}
 });
 const old=battery(true),fresh=battery(false);
 ctx.navigator={getBattery:()=>managers.length++===0?pending:Promise.resolve(fresh)};
 ctx.scanSpeedBatteryStart();
 ctx.scanSpeedReset();
 ctx.scanSpeedBatteryStart();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.scanSpeedSummary().battery.charging,false);
 resolveFirst(old);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.scanSpeedSummary().battery.charging,false,'late old BatteryManager must be ignored');
 assert.equal(listeners.has(old),false);
 assert.equal(listeners.has(fresh),true);
 ctx.scanSpeedReset();
 assert.equal(listeners.has(fresh),false,'charging listener must be detached on reset');
 const oldEvent=listeners.get(fresh);
 if(oldEvent)oldEvent();
 assert.equal(ctx.scanSpeedSummary().battery.charging,null);
});
test('unsupported Battery Status API does not prevent slowdown warning',()=>{
 const {ctx,els}=fixture();
 ctx.scanSpeedBatteryStart();for(let n=0;n<4;n++)add(ctx,n);
 add(ctx,4,6000,700);add(ctx,5,6100,710);
 assert.equal(ctx.scanSpeedSummary().battery.status,'unavailable');
 assert.equal(ctx.scanSpeedSummary().active,true);
 assert.match(els['#speedWarning'].textContent,/発熱や高負荷/);
});
test('UI, persisted profile and diagnostic hooks are present',()=>{
 for(const id of ['speedWarning','floatingSpeedWarning'])assert.match(html,new RegExp('id="'+id+'"[^>]*hidden'));
 for(const needle of ['results.push(analyzed);scanSpeedObserve(analyzed);',
  'speedWatch:scanSpeedSummary()','scanSpeedRestoreProfiles(results)'])
  assert.ok(app.includes(needle),'missing '+needle);
 assert.match(app,/scanPerfResetSession\(\);scanSpeedReset\(\);results=\[\];/, 'new analyses must not reuse old warning baselines');
});
