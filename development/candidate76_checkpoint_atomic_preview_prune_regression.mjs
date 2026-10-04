import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  if(app.slice(Math.max(0,start-6),start)==='async ')start-=6;
  const fnStart=app.indexOf(`function ${name}`,start);
  const parenStart=app.indexOf('(',fnStart);
  let p=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){
    if(app[i]==='(')p++;
    else if(app[i]===')'&&--p===0){parenEnd=i;break;}
  }
  const bodyStart=app.indexOf('{',parenEnd);
  let d=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){
    if(app[i]==='{')d++;
    else if(app[i]==='}'&&--d===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

// Checkpoint-safe result records must contain plain analysis data only, not preview Data URLs.
const cloneCtx={JSON,console,checkpointPersistenceFailure(){return false;}};
vm.createContext(cloneCtx);
vm.runInContext(extractFunction('checkpointResultClone')+'\nthis.clone=checkpointResultClone;',cloneCtx);
const original={
  sourceIndex:7,file:'x.png',sourceFile:{name:'x.png'},recoveryBusy:'retry',
  nicknamePreview:'data:image/png;base64,NICK',
  foodPreviews:['data:image/png;base64,F1','','data:image/png;base64,F3'],
  classificationPreview:'data:image/png;base64,CLASS',
  manualPreviews:{profile:'data:image/png;base64,MANUAL'},
  manualPreviewErrors:{profile:'decode failed'},
  parsed:{nickname:'テスト'},foods:[{name:'A'}]
};
const cloned=cloneCtx.clone(original);
for(const key of ['sourceFile','recoveryBusy','nicknamePreview','foodPreviews','classificationPreview','manualPreviews']){
  assert.equal(cloned[key],undefined,`${key} must not be persisted in checkpoint result records`);
}
assert.deepEqual(JSON.parse(JSON.stringify(cloned.manualPreviewErrors)),{profile:'decode failed'},'small preview error metadata may remain');
assert.ok(!JSON.stringify(cloned).includes('data:image/'),'checkpoint result must contain no preview Data URL');

// Retry transition must delete the stale processingError record and switch meta to running
// in one results+meta readwrite transaction.
const ops=[];
const txs=[];
const atomicCtx={
  Number,Promise,
  checkpointSessionActive:true,
  checkpointSaveChain:Promise.resolve(),
  checkpointSupported(){return true;},
  checkpointMeta(status,nextIndex,pauseIndex){return {key:'active',status,nextIndex,pauseIndex};},
  cancelScheduledCheckpointResultSave(i){ops.push(['cancel',i]);},
  async openCheckpointDb(){return {transaction(stores,mode){txs.push([stores,mode]);return {objectStore(name){return {
    delete(key){ops.push(['delete',name,key]);},
    put(value){ops.push(['put',name,value]);}
  };}};}};},
  async checkpointTxDone(){ops.push(['done']);return true;},
  checkpointPersistenceFailure(){return false;}
};
vm.createContext(atomicCtx);
vm.runInContext(extractFunction('checkpointPrepareRetry')+'\nthis.prepare=checkpointPrepareRetry;',atomicCtx);
assert.equal(await atomicCtx.prepare(4),true);
assert.deepEqual(JSON.parse(JSON.stringify(txs)),[[['results','meta'],'readwrite']]);
assert.deepEqual(ops[0],['cancel',4]);
assert.deepEqual(ops[1],['delete','results',4]);
assert.equal(ops[2][0],'put');
assert.equal(ops[2][1],'meta');
assert.equal(ops[2][2].status,'running');
assert.equal(ops[2][2].nextIndex,4);
assert.deepEqual(ops[3],['done']);

// The in-memory pause/failure card must stay intact until the atomic checkpoint transition commits.
let resolvePrepare;
const preparePromise=new Promise(r=>{resolvePrepare=r;});
const old={file:'failed.jpg',sourceIndex:1,sourceFile:{name:'failed.jpg'},processingError:{stage:'OCR',message:'worker'}};
const batch=[{name:'0.jpg'},old.sourceFile,{name:'2.jpg'}];
const retryCtx={
  results:[{sourceIndex:0},old],selected:[batch[0],old.sourceFile,batch[2]],analysisPause:{batch,index:1,result:old},isRunning:false,
  renders:0,resets:0,runs:0,
  pausedFailureIndex(ri){return retryCtx.analysisPause&&retryCtx.results[ri]===retryCtx.analysisPause.result?retryCtx.analysisPause.index:-1;},
  render(){retryCtx.renders++;},
  async checkpointPrepareRetry(){return preparePromise;},
  async checkpointReadStableFile(){return {name:'failed.jpg',tag:'fresh'};},
  cloneStableImageSource(file){return file;},
  async resetAnalysisRuntimeForRetry(){retryCtx.resets++;},
  async runAnalysisBatch(nextBatch,index){retryCtx.runs++;retryCtx.runIndex=index;return true;},
  async ensureWorker(){throw new Error('not expected');},
  async analyzeSingleImage(){throw new Error('not expected');},
  makeProcessingFailureResult(){throw new Error('not expected');},
  refreshCompletedProgress(){},syncSessionGuard(){},console
};
vm.createContext(retryCtx);
vm.runInContext(extractFunction('retryProcessingFailure')+'\nthis.retry=retryProcessingFailure;',retryCtx);
const pending=retryCtx.retry(1);
await Promise.resolve();
assert.ok(retryCtx.analysisPause,'pause must remain active while atomic retry checkpoint update is pending');
assert.equal(retryCtx.results.length,2,'old failure card must remain in memory until atomic update commits');
assert.equal(retryCtx.runs,0,'batch must not restart before atomic checkpoint update commits');
resolvePrepare(true);
await pending;
assert.equal(retryCtx.analysisPause,null);
assert.equal(retryCtx.results.length,1);
assert.equal(retryCtx.resets,1);
assert.equal(retryCtx.runs,1);
assert.equal(retryCtx.runIndex,1);

// Restored review results regenerate stripped previews lazily from their persisted source image.
const restored={
  sourceIndex:0,sourceFile:{name:'restored.png'},processingError:null,
  parsed:{nickname:'候補',nicknameNeedsReview:true,subs:[{value:'睡眠EXPボーナス',needsReview:true},{value:'最大所持数アップM'},{value:'スキル確率アップS'},{value:'げんき回復ボーナス'},{value:'食材確率アップS'}]},
  foods:[{name:'',needsReview:true},{name:'A',needsReview:false},{name:'B',needsReview:false}],
  classification:{status:'NO_EXACT_MATCH'},
  nicknamePreview:undefined,foodPreviews:undefined,classificationPreview:undefined,subskillPreviews:undefined
};
const regenCtx={
  Promise,setTimeout,console,
  results:[restored],renderPending:false,renders:0,
  nicknameDataNeedsReview(){return true;},speciesNeedsReview(){return true;},subskillReviewSlots(){return [0];},
  async imageToCanvas(){return {tag:'canvas'};},
  nicknameReviewPreviewCrop(){return {toDataURL(){return 'data:image/png;base64,NICK';}};},
  POKESLEEP_FOOD_MATCHER:{cropFood(_c,key){return {toDataURL(){return `data:image/png;base64,${key}`;}};}},
  makeClassificationPreview(){return 'data:image/png;base64,CLASS';},
  generateSubskillReviewPreviewsFromCanvas(r,_canvas,indexes){r.subskillPreviews=r.subskillPreviews||['','','','',''];for(const i of indexes)r.subskillPreviews[i]=`data:image/png;base64,SUB${i}`;return indexes.length>0;},
  reviewEditorActive(){return false;},render(){regenCtx.renders++;}
};
vm.createContext(regenCtx);
vm.runInContext(extractFunction('regenerateRestoredReviewPreviews')+'\nthis.regen=regenerateRestoredReviewPreviews;',regenCtx);
assert.equal(await regenCtx.regen(regenCtx.results),true);
assert.equal(restored.nicknamePreview,'data:image/png;base64,NICK');
assert.deepEqual(JSON.parse(JSON.stringify(restored.foodPreviews)),['data:image/png;base64,food1','','']);
assert.equal(restored.classificationPreview,'data:image/png;base64,CLASS');
assert.equal(restored.subskillPreviews[0],'data:image/png;base64,SUB0');
assert.equal(regenCtx.renders,1);

assert.ok(app.includes('void regenerateRestoredReviewPreviews(results)'),'checkpoint restore must schedule review-preview regeneration after safe restore points');
console.log('OK: Candidate 76 atomic retry checkpoint + preview Data URL pruning regression passed');
