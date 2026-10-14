'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function portion(begin,end){const i=app.indexOf(begin),j=app.indexOf(end,i);assert.ok(i>=0&&j>i,begin);return app.slice(i,j)}
const deleteSource=portion('async function deleteProcessingFailure(ri){','async function resumeAfterManualCompletion(ri){');
const outsideSource=portion('function clickedDialogBackdrop(event,dialog){','function closeImageSelectDialog({restoreFocus=true}={}){');
function harness({kind='readFailure',confirmed=true,save=true,paused=false}={}){
 const data=kind==='normal'?{classification:{status:'UNIQUE'}}:kind==='readFailure'?{classification:{status:'NO_EXACT_MATCH'}}:{classification:{status:'MISSING_INPUT'},processingError:{stage:'解析'}};
 data.sourceIndex=1;data.file='sample.png';
 const selected=[{name:'first.png'},{name:'sample.png'},{name:'last.png'}];
 const results=[{sourceIndex:0,file:'first.png'},{...data}];
 if(!paused)results.push({sourceIndex:2,file:'last.png'});
 const state={results,selected,analysisPause:paused?{result:results[1],index:1,batch:[...selected]}:null,checkpointSessionActive:true,isRunning:false,preManualCsvSnapshot:{old:true},calls:[],confirmed,saved:save};
 const ctx={...state,
   statusView:r=>[r.processingError?'解析失敗':r.classification?.status==='NO_EXACT_MATCH'?'読取失敗':'完了',r.processingError||r.classification?.status==='NO_EXACT_MATCH'?'bad':'ok'],
   pausedFailureIndex:i=>paused&&i===1?1:-1,
   showAppDialog:async props=>{state.calls.push(['dialog',props]);return confirmed},
   checkpointCommitSnapshot:async(...args)=>{state.calls.push(['checkpoint',args]);return save},
   updateUploadSelectionUI:n=>state.calls.push(['upload',n]),
   syncSessionGuard:()=>state.calls.push(['sync']),
   checkpointRehydrateRemainingSources:async()=>{},
   resetAnalysisRuntimeForRetry:async()=>{},
   runAnalysisBatch:async(batch,n)=>{state.calls.push(['resume',batch.length,n]);return true},
   saveAnalysisCheckpoint:async()=>true,
   releaseAnalysisRuntimeAfterCompletion:async()=>{},
   render:()=>state.calls.push(['render']),
   refreshCompletedProgress:()=>{},
   syncRunActionButton:()=>{},
 };
 vm.createContext(ctx);vm.runInContext(deleteSource,ctx);
 return {ctx,state,delete:()=>vm.runInContext('deleteProcessingFailure(1)',ctx)};
}
test('bad labels, not processingError alone, make deletion available',()=>{
 assert.match(app,/const deleteAction=cl==='bad'/);
 assert.match(app,/class="card-primary-actions"/);
 assert.doesNotMatch(app,/processingErrorHtml=r\.processingError[^;]*class="processing-delete"/);
});
test('31px compact buttons and red destructive contrast',()=>{
 assert.match(html,/\.nickconfirm,\.subskillconfirm,\.foodconfirm,\.speciesconfirm,\.manual-open\{min-height:31px\}/);
 assert.match(html,/\.card-primary-actions \.processing-delete\{[^}]*min-height:31px[^}]*color:#a12f3b/);
});
test('read-failure card can be removed, and persistent mapping renumbered',async()=>{
 const h=harness();await h.delete();assert.equal(h.ctx.results.length,2);assert.equal(h.ctx.selected.length,2);
 assert.equal(h.ctx.results[1].sourceIndex,1);assert.equal(h.state.calls.find(x=>x[0]==='checkpoint')[1][2],'completed');
 assert.equal(h.state.calls.find(x=>x[0]==='dialog')[1].secondaryLabel,'キャンセル');
 assert.equal(h.ctx.preManualCsvSnapshot,null);
});
test('processing error can be deleted and paused batch resumes',async()=>{
 const h=harness({kind:'processing',paused:true});await h.delete();
 assert.equal(h.ctx.results.length,1);assert.equal(h.ctx.analysisPause,null);
 assert.deepEqual(h.state.calls.filter(x=>x[0]==='resume').map(x=>x.slice(1)),[[2,1]]);
});
test('cancel, regular complete card or failed checkpoint never remove image',async()=>{
 for(const opt of [{confirmed:false},{kind:'normal'},{save:false}]){
  const h=harness(opt);await h.delete();
  assert.equal(h.ctx.results.length,3);assert.equal(h.ctx.selected.length,3);
 }
});
test('native image-choice dialog closes only for genuine outside coordinates',()=>{
 const c={};vm.createContext(c);vm.runInContext(outsideSource,c);
 const box={left:100,right:400,top:100,bottom:500};
 const dialog={getBoundingClientRect:()=>box};
 assert.equal(c.clickedDialogBackdrop({target:dialog,clientX:90,clientY:200},dialog),true);
 assert.equal(c.clickedDialogBackdrop({target:dialog,clientX:150,clientY:200},dialog),false);
 assert.equal(c.clickedDialogBackdrop({target:{},clientX:90,clientY:200},dialog),false);
 assert.match(app,/imageSelectDialog\?\.addEventListener\('click',e=>\{if\(clickedDialogBackdrop\(e,imageSelectDialog\)\)closeImageSelectDialog\(\);\}\)/);
 assert.match(app,/appDialogSecondary'\)\?\.hidden&&clickedDialogBackdrop/);
});
