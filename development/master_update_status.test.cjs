"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'master-update-status.js'),'utf8');
const healthy=(state,ts=new Date().toISOString())=>({
 schemaVersion:'pokesleep-ocr-master-status-v1',state,checkedAt:ts,createdAt:ts,
 reasonCode:state==='healthy'?'VERIFIED':'DAILY_UPDATE_FAILED'
});
function harness(feed,{localSource='verified-local-master'}={}){
 const events={},nodes={};
 for(const id of ['masterUpdateWarning','masterUpdateDialog','masterUpdateClose']){
  nodes[id]={hidden:id==='masterUpdateWarning',open:false,handlers:{},
   addEventListener(type,fn){this.handlers[type]=fn;},
   showModal(){this.open=true;},close(){this.open=false;},
   setAttribute(){this.open=true;},
   click(){this.handlers.click?.({target:this});}};
 }
 const master={source:localSource,reason:'verified'};
 const document={baseURI:'https://test.invalid/',hidden:false,getElementById:id=>nodes[id],addEventListener:(type,fn)=>events[type]=fn};
 const window={POKESLEEP_SHARED_MASTER:{getStatus:()=>master},addEventListener:(type,fn)=>events[type]=fn};
 const ctx={document,window,URL,Date,AbortController,setTimeout,clearTimeout,console,
   fetch:async()=>({ok:true,headers:{get:()=>null},json:async()=>feed})};
 vm.createContext(ctx);vm.runInContext(js,ctx);
 return {nodes,ctx,master,events,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('fresh healthy status: warning hidden, modal never auto-opens',async()=>{
 const h=harness(healthy('healthy'));await h.flush();
 assert.equal(h.nodes.masterUpdateWarning.hidden,true);
 assert.equal(h.nodes.masterUpdateDialog.open,false);
});
test('failed run: icon visible, dialog only opens on tap, X closes it',async()=>{
 const h=harness(healthy('attention'));await h.flush();
 assert.equal(h.nodes.masterUpdateWarning.hidden,false);
 assert.equal(h.nodes.masterUpdateDialog.open,false);
 h.nodes.masterUpdateWarning.click();assert.equal(h.nodes.masterUpdateDialog.open,true);
 h.nodes.masterUpdateClose.click();assert.equal(h.nodes.masterUpdateDialog.open,false);
});
test('stale or malformed feed fails closed, never falsely healthy',async()=>{
 const h=harness(healthy('healthy','2026-10-01T00:00:00Z'));await h.flush();
 assert.equal(h.nodes.masterUpdateWarning.hidden,false);
 assert.equal(h.ctx.window.POKESLEEP_MASTER_UPDATE_WATCH.readStatus(null).state,'attention');
});
test('browser local master fallback displays warning even when daily job healthy',async()=>{
 const h=harness(healthy('healthy'));await h.flush();
 h.master.source='legacy-fallback';h.master.reason='Pinned SHA-256 mismatch';
 h.events['bukkomi-master-ready']();
 assert.equal(h.nodes.masterUpdateWarning.hidden,false);
});
test('pending is quiet until 50-hour deadline',async()=>{
 const h=harness(healthy('pending'));await h.flush();
 assert.equal(h.nodes.masterUpdateWarning.hidden,true);
 assert.equal(h.ctx.window.POKESLEEP_MASTER_UPDATE_WATCH.readStatus(healthy('pending','2026-10-01T00:00:00Z')).state,'attention');
});
test('workflow records failure after resetting unverified candidate',()=>{
 const wf=fs.readFileSync(path.join(root,'.github/workflows/independent-master-sync.yml'),'utf8');
 assert.match(wf,/if: always\(\)/);
 assert.match(wf,/needs: \[sync\]/);
 assert.match(wf,/git add -- master-update-status.json public_package_manifest.json/);
 assert.match(wf,/development\/publish_master_status.py/);
});
