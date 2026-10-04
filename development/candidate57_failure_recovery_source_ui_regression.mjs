import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url),'utf8'));

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  if(app.slice(Math.max(0,start-6),start)==='async ')start-=6;
  const parenStart=app.indexOf('(',app.indexOf(`function ${name}`,start));
  let pDepth=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){
    if(app[i]==='(')pDepth++;
    else if(app[i]===')' && --pDepth===0){parenEnd=i;break;}
  }
  const bodyStart=app.indexOf('{',parenEnd),depthStart=bodyStart;
  let depth=0,end=-1;
  for(let i=depthStart;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}' && --depth===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

// Stable in-memory source copy: verify PNG/JPEG signature handling and actual clone semantics.
const ctx={File,Blob,WeakMap,WeakSet,Uint8Array,ArrayBuffer,Date,Promise,Math,Error,setTimeout,clearTimeout,IMAGE_SOURCE_READ_TIMEOUT_MS:15000};
ctx.stableSourcePromises=new WeakMap();
ctx.stableSourceFiles=new WeakSet();
vm.createContext(ctx);
vm.runInContext(extractFunction('imageSignatureKind')+'\n'+extractFunction('imageArrayBufferWithTimeout')+'\n'+extractFunction('stableImageSource')+'\nthis.api={imageSignatureKind,stableImageSource};',ctx);
const pngBytes=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
const src=new File([pngBytes],'sample.png',{type:'image/png',lastModified:123});
const stable=await ctx.api.stableImageSource(src);
assert.notEqual(stable,src);
assert.equal(stable.name,'sample.png');
assert.equal(stable.type,'image/png');
assert.equal(stable.size,src.size);
assert.equal(await ctx.api.stableImageSource(src),stable,'same source should reuse prepared in-memory copy');
await assert.rejects(()=>ctx.api.stableImageSource(new File([Uint8Array.from([1,2,3])],'bad.png',{type:'image/png'})),/PNG \/ JPEG/);

// Recovery UI only appears on fatal processing errors and exposes the three safe choices.
for(const marker of ['processing-retry','processing-reselect','processing-delete','再解析','画像を再選択','解析失敗データを削除しますか？'])assert.ok(app.includes(marker),`missing recovery marker: ${marker}`);
assert.match(app,/r\.processingError\?`<div class="processing-error-note"[\s\S]*processing-recovery-actions/);
assert.match(app,/results\.splice\(ri,1\)/);
assert.match(app,/selected\.splice\(si,1\)/);
assert.match(app,/if\(!r\?\.processingError\|\|r\.recoveryBusy\|\|isRunning\)return/);

// Current recovery semantics: stop at the failed image and keep stable sources lazy.
assert.ok(app.includes("makeProcessingFailureResult(file,'解析中断'"));
assert.ok(app.includes('setPausedAnalysis(batch,nextIndex,failed)'));
assert.ok(app.includes("checkpointWriteResultAndMeta(failed,'paused',nextIndex,nextIndex)"));
assert.ok(app.includes('sourceFile=await stableImageSource(inputFile)'));
assert.ok(!app.includes('primeStableImageSources(selected)'),'selected images must not be eagerly copied');

// Card no longer shows a filename; the filename remains in the image modal title.
assert.ok(!app.includes('class="file-source-name"'),'card filename should be removed');
assert.ok(!html.includes('.file-source-name'),'obsolete filename styling should be removed');
assert.ok(!app.includes('>▧</span>'),'old placeholder image glyph should be removed');
assert.match(app,/file-open-icon[\s\S]*<svg viewBox="0 0 24 24"/);
assert.match(html,/\.file-open-icon svg\{/);
assert.ok(app.includes("title.textContent=r.file||'元のスクリーンショット'"));

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
console.log('OK: Candidate 57 failure recovery + stable source + premium image button regression passed');
