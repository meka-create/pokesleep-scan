/* Master update health, following AI Bukkomi Scan's warning-only design. */
(()=>{'use strict';
const badge=document.getElementById('masterUpdateWarning');
const dialog=document.getElementById('masterUpdateDialog');
const close=document.getElementById('masterUpdateClose');
const title=document.getElementById('masterUpdateTitle');
const message=document.getElementById('masterUpdateMessage');
if(!badge||!dialog||!close)return;
const SCHEMA='pokesleep-ocr-master-status-v1',MAX_AGE_MS=50*3600*1000;
// Keep the verified remote receipt separate from temporary local-master
// fallback state. Re-rendering on master recovery must not retain a stale
// attention flag that was only caused by a device-side loading problem.
let current={state:'pending',reason:'initializing'};
let lastRemote={state:'pending',reason:'initializing'},serial=0;
const REMOTE_REASONS={
 healthy:new Set(['SYNC_OK']),
 attention:new Set(['SYNC_FAILED','NEW_SPECIES_PENDING',
                    'NEW_FORM_NAME_CONFLICT','NEW_SPECIES_DATA_INCOMPLETE']),
 pending:new Set(['SYNC_PENDING'])
};
function readStatus(data,now=Date.now()){
 if(!data||data.schemaVersion!==SCHEMA||
    !Object.hasOwn(REMOTE_REASONS,data.state)||
    typeof data.reasonCode!=='string'||data.reasonCode.length>120||
    !REMOTE_REASONS[data.state].has(data.reasonCode))
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
 lastRemote={...remote};
 const brokenMaster=localFailure();
 const problem=remote.state==='attention'||brokenMaster;
 current={...remote,state:problem?'attention':remote.state};
 badge.hidden=!problem;
 // Pending new data is not a failure of the verified existing master.
 // Keep generic failure copy for actual sync errors or local master faults.
 if(title&&message){
  if(remote.reason==='NEW_FORM_NAME_CONFLICT'&&!brokenMaster){
   title.textContent='新フォームの名前が重複しています';
   message.textContent='追加予定の別フォームが既存のポケモンと同じ日本語名で、能力や識別情報が異なるため安全に区別できません。そのフォームだけ登録を保留し、他のマスター自動更新は継続します。既存のマスターデータは正常に使用できます。';
  }else if(remote.reason==='NEW_SPECIES_DATA_INCOMPLETE'&&!brokenMaster){
   title.textContent='新しいポケモンのデータが未完成です';
   message.textContent='実装予定日を迎えた新しいポケモンの必要な能力値・食材などが未登録です。未完成のポケモンだけを保留し、他のマスター自動更新は継続します。既存のマスターデータは正常に使用できます。';
  }else if(remote.reason==='NEW_SPECIES_PENDING'&&!brokenMaster){
   title.textContent='新しいポケモンの登録を確認中です';
   message.textContent='一部の新フォームで日本語名の重複や未完成のデータがあります。該当フォームだけ登録を保留し、毎日の自動更新で再確認します。既存のマスターデータは正常に使用できます。';
  }else{
   title.textContent='マスター更新を確認できませんでした';
   message.textContent='現在は保存済みのマスターデータを使用しています。新しく追加されたポケモンや食材には対応していない可能性があります。';
  }
 }
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
window.addEventListener('bukkomi-master-ready',()=>render(lastRemote));
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.POKESLEEP_MASTER_UPDATE_WATCH={readStatus,getState:()=>({...current}),refresh};
refresh();
})();
