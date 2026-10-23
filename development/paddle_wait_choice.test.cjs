'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const a=app.indexOf('/* Time out the decision prompt'),b=app.indexOf('async function ensurePaddleRaw(idx,total)',a);
assert.ok(a>=0&&b>a,'Paddle decision wrapper is present outside frozen nickname selection');
const source=app.slice(a,b);
function makeHarness(){
 const timers=new Map(),buttons={},title={textContent:'高精度解析の準備に時間がかかっています'};
 let count=0,done=null,modal=null,closeCalls=0,releaseCalls=0;
 const get=id=>buttons[id]||(buttons[id]={hidden:true,events:{},addEventListener(type,fn){this.events[type]=fn;}});
 const context={Promise,Date,Error,console,
  paddleInitDiagnostics:{stage:'model-mirror',waitChoices:[]},
  paddleModelFetchControllers:new Set(),
  setTimeout(fn,ms){const id=++count;timers.set(id,{fn,ms});return id;},
  clearTimeout(id){timers.delete(id);},
  $:sel=>sel==='#appDialogTitle'?title:get(sel),
  showAppDialog(opts){modal={opts,resolve:null};return new Promise(r=>{modal.resolve=r;});},
  closeAppDialog(){closeCalls++;},
  releasePaddleRuntimePreservingDiagnostics(){releaseCalls++;return Promise.resolve();},
  ensurePaddleRaw(){return new Promise(resolve=>{done=resolve;});}
 };
 vm.createContext(context);
 vm.runInContext("let paddleSkipForBatch=false,paddleWaitSkipResolve=null,paddleWaitChoiceDialogOpen=false;const PADDLE_PREPARE_CHOICE_MS=90*1000;\n"+source,context);
 return {context,timers,buttons,get,finish:v=>done?.(v),modal:()=>modal,close:()=>closeCalls,releases:()=>releaseCalls,async tick(){await Promise.resolve();await Promise.resolve();}};
}
test('before 90s no dialog or switch and Paddle result is preserved',async()=>{
 const h=makeHarness(),engine={predict(){return 'verified';}};
 const pending=h.context.ensurePaddle(0,3);
 assert.equal([...h.timers.values()][0].ms,90000);
 assert.equal(h.modal(),null);
 assert.equal(h.get('#paddleWaitSwitch').hidden,true);
 h.finish(engine);
 assert.equal(await pending,engine);
 assert.equal(h.timers.size,0);
 assert.equal(h.modal(),null);
});
test('90s shows existing styled dialog and continuing wait does not downgrade accuracy',async()=>{
 const h=makeHarness(),engine={predict(){return 'verified';}};
 const pending=h.context.ensurePaddle(0,3);
 [...h.timers.values()][0].fn();
 assert.match(h.modal().opts.title,/高精度解析の準備/);
 assert.equal(h.modal().opts.primaryLabel,'待機を続ける');
 assert.equal(h.modal().opts.secondaryLabel,'高精度解析なしで続行');
 assert.equal(h.get('#paddleWaitSwitch').hidden,true);
 h.modal().resolve(true);await h.tick();
 assert.equal(h.get('#paddleWaitSwitch').hidden,false);
 assert.equal(h.get('#paddleFloatingSwitch').hidden,false);
 assert.equal(h.context.paddleInitDiagnostics.waitChoices[0].action,'continue-waiting');
 h.finish(engine);
 assert.equal(await pending,engine);
 assert.equal(h.get('#paddleWaitSwitch').hidden,true);
 assert.equal(h.releases(),0);
});
test('user may switch after wait; pending engine is abandoned without blocking batch',async()=>{
 const h=makeHarness();
 const pending=h.context.ensurePaddle(0,3);
 [...h.timers.values()][0].fn();
 h.modal().resolve(true);await h.tick();
 h.get('#paddleWaitSwitch').events.click();
 await assert.rejects(pending,/ユーザー選択/);
 assert.equal(h.releases(),1);
 assert.equal(h.context.paddleInitDiagnostics.waitChoices.at(-1).action,'tesseract-only');
 await assert.rejects(h.context.ensurePaddle(1,3),/ユーザー選択/);
 h.finish({predict(){}});
 await h.tick();
 assert.equal(h.get('#paddleWaitSwitch').hidden,true);
});
test('secondary button switches immediately without repeated 90s dialogs',async()=>{
 const h=makeHarness();
 const pending=h.context.ensurePaddle(0,4);
 [...h.timers.values()][0].fn();
 h.modal().resolve(false);await h.tick();
 await assert.rejects(pending,/ユーザー選択/);
 assert.equal(h.releases(),1);
 assert.equal(h.get('#paddleWaitSwitch').hidden,true);
 assert.equal(h.timers.size,0);
});
test('engine ready while modal is open closes dialog, never forces accuracy downgrade',async()=>{
 const h=makeHarness(),engine={ready:true};
 const pending=h.context.ensurePaddle(0,1);
 [...h.timers.values()][0].fn();
 h.finish(engine);
 assert.equal(await pending,engine);
 assert.equal(h.close(),1);
 assert.equal(h.releases(),0);
 h.modal().resolve(true);await h.tick();
 assert.equal(h.get('#paddleWaitSwitch').hidden,true);
});
test('existing progress layout and frozen nickname OCR hooks are preserved',()=>{
 assert.match(html,/id="progress"[\s\S]*id="bar"[\s\S]*id="paddleWaitSwitch"/);
 assert.match(html,/id="floatingBar"[\s\S]*id="paddleFloatingSwitch"/);
 assert.match(html,/id="paddleWaitSwitch"[^>]*hidden/);
 assert.match(html,/id="paddleFloatingSwitch"[^>]*hidden/);
 assert.match(app,/const highAccuracy=!!\$\('#paddleFallback'\)\?\.checked/);
 assert.match(app,/const ocr=await ensurePaddle\(idx,total\)/);
 assert.match(app,/function recordPaddleWaitChoice/);
 assert.match(app,/paddleModelFetchControllers/);
});
