import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));

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

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`),'checkpoint release id must match release.json');
assert.ok(app.includes('releaseId:CHECKPOINT_RELEASE_ID'),'checkpoint metadata must record the exact public release');
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"),'checkpoint compatibility id must be explicit');
assert.ok(app.includes('compatibilityId:CHECKPOINT_COMPATIBILITY_ID'),'checkpoint metadata must record compatibility id');
assert.ok(app.includes('if(!checkpointMetaCompatible(meta))'),'restore must reject incompatible checkpoint contracts');
assert.ok(!app.includes('meta.releaseId!==CHECKPOINT_RELEASE_ID'),'public release id must no longer gate compatibility');
assert.ok(app.indexOf('if(!checkpointMetaCompatible(meta))') < app.indexOf("tx=db.transaction(['files','results'],'readonly')"),'compatibility must be checked before loading checkpoint blobs/results');
assert.ok(app.includes('return {incompatible:true,meta,discardError};'),'incompatible checkpoint must never reach normal restore path');
assert.ok(!app.includes('以前のバージョンの復旧データは使用しません'),'incompatible checkpoint discard must be silent for end users');
assert.ok(app.includes('if(snapshot.incompatible||snapshot.expired)return;'),'incompatible checkpoint must exit recovery without a user-facing modal');

// checkpointMeta is release-bound and remains lightweight.
const metaCtx={Date,Math,Number,CHECKPOINT_META_KEY:'active',CHECKPOINT_SCHEMA_VERSION:1,CHECKPOINT_RELEASE_ID:release.id,CHECKPOINT_COMPATIBILITY_ID:'checkpoint-compat-2026-10-04-v1',BUILD_ID:'v12-final'};
metaCtx.selected=[{name:'a.png',size:10,type:'image/png',lastModified:1}];
vm.createContext(metaCtx);
vm.runInContext(extractFunction('checkpointMeta')+'\nthis.api={checkpointMeta};',metaCtx);
const meta=metaCtx.api.checkpointMeta('running',0,null);
assert.equal(meta.releaseId,release.id);
assert.equal(meta.compatibilityId,'checkpoint-compat-2026-10-04-v1');
assert.equal(meta.schema,1);
assert.equal('results' in meta,false);

// Persistence failures produce one visible warning, without throwing into OCR processing.
const notices=[];
const warnCtx={
  console:{warn(){}},setTimeout(fn){fn();},checkpointPersistenceWarningShown:false,
  showAppDialog(opts){notices.push(opts);return Promise.resolve(true);}
};
vm.createContext(warnCtx);
vm.runInContext(extractFunction('checkpointPersistenceFailure')+'\nthis.api={checkpointPersistenceFailure};',warnCtx);
assert.equal(warnCtx.api.checkpointPersistenceFailure('解析結果の自動復元保存',new Error('quota')),false);
assert.equal(warnCtx.api.checkpointPersistenceFailure('解析位置の自動復元保存',new Error('quota2')),false);
assert.equal(notices.length,1,'persistence warning should be shown only once per page');
assert.equal(notices[0].title,'自動復元データを保存・更新できませんでした');
assert.match(notices[0].message,/自動復元が正常に使えない可能性/);
assert.ok(app.includes("checkpointPersistenceFailure('解析結果の自動復元変換',e)"),'checkpoint serialization failure must also be reported');

assert.ok(app.includes("catch(e){return checkpointPersistenceFailure('解析結果の自動復元保存',e);}"),'result checkpoint failure must be contained and reported');
assert.ok(app.includes("catch(e=>checkpointPersistenceFailure('解析位置の自動復元保存',e))"),'meta checkpoint failure must be contained and reported');
assert.ok(app.includes("checkpointPersistenceFailure('自動復元データの初期保存',e)"),'initial checkpoint failure must be reported');
assert.ok(app.includes("checkpointPersistenceFailure('差し替え画像の自動復元保存',e)"),'replacement-image checkpoint failure must be reported');

// A checkpoint without compatibilityId is accepted only when its old public release is explicitly allowlisted; unknown legacy releases are rejected before blobs/results are opened.
let cleared=0, openedStores=[];
const oldMeta={key:'active',schema:1,releaseId:'2026-09-01-unknown-old-release',buildId:'v12-final',status:'running',total:2,nextIndex:1,savedAt:1};
const compatDb={transaction(store){openedStores.push(store);return {objectStore(){return {get(){return {value:oldMeta};}};}};}};
const compatCtx={
  console:{warn(){}},Promise,Number,Math,File:function(){},stableSourceFiles:new WeakSet(),
  CHECKPOINT_META_KEY:'active',CHECKPOINT_SCHEMA_VERSION:1,CHECKPOINT_RELEASE_ID:release.id,CHECKPOINT_COMPATIBILITY_ID:'checkpoint-compat-2026-10-04-v1',CHECKPOINT_LEGACY_COMPAT_RELEASE_IDS:new Set(['2026-10-04-candidate84-ogp-share-card']),
  checkpointSaveChain:Promise.resolve(),checkpointSupported(){return true;},checkpointExpired(){return false;},async openCheckpointDb(){return compatDb;},
  async checkpointRequest(req){return req.value;},async checkpointTxDone(){return true;},async checkpointClearNow(){cleared++;return true;}
};
vm.createContext(compatCtx);
vm.runInContext(extractFunction('checkpointMetaCompatible')+'\n'+extractFunction('loadAnalysisCheckpoint')+'\nthis.api={loadAnalysisCheckpoint,checkpointMetaCompatible};',compatCtx);
const rejected=await compatCtx.api.loadAnalysisCheckpoint();
assert.equal(rejected.incompatible,true);
assert.equal(cleared,1);
assert.deepEqual(openedStores,['meta'],'incompatible checkpoints must be rejected before files/results are loaded');

// A result-store failure is contained, reported, and returned as false rather than thrown into OCR flow.
const persistenceCalls=[];
const writeCtx={
  Number,checkpointSessionActive:true,checkpointSupported(){return true;},checkpointResultClone(r){return r;},
  async openCheckpointDb(){throw new Error('quota');},checkpointPersistenceFailure(context,error){persistenceCalls.push([context,error.message]);return false;}
};
vm.createContext(writeCtx);
vm.runInContext(extractFunction('checkpointWriteResult')+'\nthis.api={checkpointWriteResult};',writeCtx);
assert.equal(await writeCtx.api.checkpointWriteResult({sourceIndex:0}),false);
assert.deepEqual(persistenceCalls,[['解析結果の自動復元保存','quota']]);

console.log('OK: Candidate 65 checkpoint compatibility + persistence warning regression (current silent-discard behavior) passed');
