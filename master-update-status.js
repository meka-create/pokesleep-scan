/* Master update health, following AI Bukkomi Scan's warning-only design. */
(()=>{'use strict';
const badge=document.getElementById('masterUpdateWarning');
const dialog=document.getElementById('masterUpdateDialog');
const close=document.getElementById('masterUpdateClose');
if(!badge||!dialog||!close)return;
const SCHEMA='pokesleep-ocr-master-status-v1',MAX_AGE_MS=50*3600*1000;
let current={state:'pending',reason:'initializing'},serial=0;
function readStatus(data,now=Date.now()){
 if(!data||data.schemaVersion!==SCHEMA||!['healthy','attention','pending'].includes(data.state)||typeof data.reasonCode!=='string'||data.reasonCode.length>120)
  return {state:'attention',reason:'invalid-status'};
 const t=Date.parse(data.state==='pending'?data.createdAt:data.checkedAt);
 if(!Number.isFinite(t)||t>now+600000||now-t>MAX_AGE_MS)
  return {state:'attention',reason:'stale-or-unavailable'};
 return {state:data.state,reason:data.reasonCode||data.state};
}
function localFailure(){
 const s=window.POKESLEEP_SHARED_MASTER?.getStatus?.();
 return !!s&&s.reason!=='not-loaded'&&s.source!=='verified-local-master';
}
function render(remote){
 const problem=remote.state==='attention'||localFailure();
 current={...remote,state:problem?'attention':remote.state};
 badge.hidden=!problem;
 if(!problem&&dialog.open)dialog.close?.();
 // The notice is strictly opt-in; it NEVER opens on startup.
}
async function refresh(){
 const id=++serial;let status;
 try{
  const u=new URL('master-update-status.json',document.baseURI);
  u.searchParams.set('_',String(Date.now()));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const res=await fetch(u.toString(),{cache:'no-store',redirect:'error',signal:controller.signal});
   if(!res.ok||Number(res.headers.get('content-length'))>4096)throw Error('unavailable');
   status=readStatus(await res.json());
  }finally{clearTimeout(timer);}
 }catch(_){status={state:'attention',reason:'fetch-failed'};}
 if(id===serial)render(status);
}
badge.addEventListener('click',()=>{
 if(badge.hidden)return;
 if(typeof dialog.showModal==='function')dialog.showModal();
 else dialog.setAttribute('open','');
});
close.addEventListener('click',()=>dialog.close?.());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close?.();});
window.addEventListener('bukkomi-master-ready',()=>render(current));
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.POKESLEEP_MASTER_UPDATE_WATCH={readStatus,getState:()=>({...current}),refresh};
refresh();
})();
