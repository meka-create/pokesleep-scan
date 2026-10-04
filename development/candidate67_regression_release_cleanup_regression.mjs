import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  const parenStart=app.indexOf('(',start);let p=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){if(app[i]==='(')p++;else if(app[i]===')'&&--p===0){parenEnd=i;break;}}
  const bodyStart=app.indexOf('{',parenEnd);let d=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')d++;else if(app[i]==='}'&&--d===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

// Release IDs stay internally consistent, but historical regression files must not pin old IDs.
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(html.includes('href="./manifest.webmanifest"'));
assert.ok(!html.includes('manifest.webmanifest?release='));
assert.ok(html.includes("current.searchParams.delete('release')"));
assert.ok(html.includes('history.replaceState')); 
const testFiles=fs.readdirSync(new URL('.',import.meta.url)).filter(x=>x.endsWith('.mjs'));
for(const file of testFiles){
  const src=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(src,/assert\.equal\(release\.id\s*,\s*['"][^'"]+['"]\)/,`${file} must not pin a historical release id`);
}
assert.ok(fs.existsSync(new URL('classifier100_fixture.json',import.meta.url)),'classifier replay fixture must be bundled');
for(const key of ['manualPreviews','nicknamePreview','foodPreviews','classificationPreview'])assert.ok(app.includes(`key==='${key}'`),`checkpoint-safe result serialization must exclude ${key}`);

// A detected update remains deferred while the session is active, then is consumed as soon as the app becomes idle.
assert.ok(html.includes("window.__BUKKOMI_PENDING_RELEASE_ID__=latest"));
assert.ok(html.includes("window.addEventListener('bukkomi-session-idle',applyPendingRelease)"));
assert.ok(html.includes("if(!pending||window.__BUKKOMI_SESSION_ACTIVE__)return false"));
assert.ok(html.includes("window.__BUKKOMI_PENDING_RELEASE_ID__=''"));
assert.ok(html.includes('return moveToRelease(pending)'));
assert.ok(app.includes("window.dispatchEvent(new Event('bukkomi-session-idle'))"));

const events=[];
const classList={toggle(){}};
const guardCtx={
  window:{__BUKKOMI_SESSION_ACTIVE__:true,dispatchEvent:e=>events.push(e.type)},
  document:{documentElement:{classList},body:{classList}},Event:class{constructor(type){this.type=type;}},
  isRunning:false,analysisPause:null,checkpointPreparing:false,checkpointRestoreRunning:false,selected:[],results:[],
  pullRefreshGuardActive(){return false;}
};
vm.createContext(guardCtx);
vm.runInContext(extractFunction('syncSessionGuard')+'\nthis.syncSessionGuard=syncSessionGuard;',guardCtx);
guardCtx.syncSessionGuard();
assert.deepEqual(events,['bukkomi-session-idle'],'active -> idle must publish exactly one release-safe point');
guardCtx.syncSessionGuard();
assert.deepEqual(events,['bukkomi-session-idle'],'repeated idle sync must not duplicate the event');

// The removed second-row/manual-panel implementation must not coexist with the current inline editor.
for(const stale of ['function renderManualPanel(','.manual-panel','.manual-edit-row','.manual-species-search','speciesSearch:\'\'']){
  assert.ok(!app.includes(stale)&&!html.includes(stale),`legacy manual completion artifact remains: ${stale}`);
}
for(const current of ['manual-inline-field','manual-inline-actions','manual-editor-input manual-species','manual-editor-input manual-food','manual-editor-input manual-sub']){
  assert.ok(app.includes(current)||html.includes(current),`current inline manual UI missing: ${current}`);
}

console.log('OK: Candidate 67 regression cleanup + pending release + legacy manual removal regression passed');
