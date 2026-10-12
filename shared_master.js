/* Independently managed same-repository master. The active master is pinned by
 * shared/master_release.json, not by AI Scan. Hash/schema errors keep legacy fallback.
 * The classifier is initialized ONLY after load() has finished.
 */
(()=>{'use strict';
const MASTER_PATH='shared/MASTER_DATA.json',META_PATH='shared/master_release.json';
const fallback=window.POKESLEEP_MASTER;
// Unreviewed newly introduced main skill keys must never use generic SP defaults.
window.POKESLEEP_BASELINE_SKILLS=new Set((fallback?.pokemon||[]).map(p=>p.skill));
window.POKESLEEP_BASELINE_FOODS=new Set(Object.values(fallback?.ingredients||{}));
window.POKESLEEP_EXTRA_INGREDIENT_STRENGTH={};
let state={source:'legacy-fallback',reason:'not-loaded',sha256:'',commit:''};
const signature=m=>({cutoff:m.cutoff,pokemon:m.pokemon,ingredients:m.ingredients,
 natures:m.natures,subskills:m.subskills});
const hex=bytes=>Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':
 v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
function valid(m,meta){
 if(!m||typeof m!=='object'||!Array.isArray(m.pokemon)||m.pokemon.length<240||
  !m.ingredients||typeof m.ingredients!=='object'||Array.isArray(m.ingredients)||
  Object.keys(m.ingredients).length<19||!Array.isArray(m.natures)||m.natures.length!==25||
  !Array.isArray(m.subskills)||m.subskills.length<17||
  !/^\d{4}-\d{2}-\d{2}$/.test(m.cutoff||''))return false;
 const names=m.pokemon.map(p=>p?.name);
 if(names.some(n=>typeof n!=='string'||!n)||new Set(names).size!==names.length)return false;
 if(meta&&(meta.speciesCount!==m.pokemon.length||meta.ingredientCount!==Object.keys(m.ingredients).length||
  meta.natureCount!==m.natures.length||meta.subskillCount!==m.subskills.length||
  meta.cutoff!==m.cutoff))return false;
 const ingredients=new Set(Object.keys(m.ingredients));
 const labels=Object.values(m.ingredients);
 if(labels.some(v=>typeof v!=='string'||!v.trim())||new Set(labels).size!==labels.length)return false;
 const added=[...ingredients].filter(k=>!Object.hasOwn(fallback.ingredients,k));
 const extra=m.ingredientStrength||{};
 if(!extra||typeof extra!=='object'||Array.isArray(extra)||
    Object.keys(extra).length!==added.length||added.some(k=>
       !Object.hasOwn(extra,k)||!Number.isInteger(extra[k])||extra[k]<=0||extra[k]>3000)||
    Object.keys(extra).some(k=>!added.includes(k)))return false;
 for(const p of m.pokemon){
  if(!p.name_en||!p.skill||!p.mainSkill||!Number.isFinite(p.frequency)||p.frequency<=0||
   !Number.isInteger(p.carryLimit)||p.carryLimit<=0||p.carryLimit>999||
   !['ingRate','skillRate'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=100)||
   !Number.isInteger(p.evolutionCount)||p.evolutionCount< -1||p.evolutionCount>5||
   !Number.isInteger(p.evolutionLeft)||p.evolutionLeft<0||p.evolutionLeft>5||
   !['Berries','Ingredients','Skills','All'].includes(p.specialty)||
   !/^\d{4}-\d{2}-\d{2}$/.test(p.arrival||''))return false;
  if(!p.ing1||!p.ing2)return false;
  for(let i=1;i<=3;i++){const v=p['ing'+i];
   if(v&&!String(v.key).startsWith('unknown')&&
      (!Number.isInteger(v['c'+i])||v['c'+i]<=0||v['c'+i]>999))return false;
  }
  for(const v of [p.ing1,p.ing2,p.ing3,...(p.mythIng||[])])
   if(v&&(!v.key||(v.key!=='unknown'&&!ingredients.has(v.key)&&!/^unknown\d$/.test(v.key))||
       !['c1','c2','c3'].every(k=>v[k]===null||v[k]===undefined||
        (Number.isInteger(v[k])&&v[k]>=0&&v[k]<=999))))return false;
 }
 return true;
}
async function jsonAndBytes(path){
 const url=new URL(path,location.href),release=String(window.__PUBLIC_RELEASE_ID__||'');
 if(release)url.searchParams.set('release',release);
 url.searchParams.set('step2','sharedcsv-v1');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8000);
 try{
  const response=await fetch(url.toString(),{cache:'no-store',signal:ctrl.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(Number(response.headers?.get('content-length'))>1024*1024)throw Error('master resource too large');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<20||bytes.byteLength>1024*1024)throw Error('master resource size invalid');
  const json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return {bytes,json};
 }finally{clearTimeout(timer);}
}
async function load(){
 if(!valid(fallback)){state={source:'unusable',reason:'legacy-master-invalid',sha256:'',commit:''};throw Error('Legacy master unusable');}
 if(typeof fetch!=='function'||!globalThis.crypto?.subtle){state={...state,reason:'sha256-unavailable'};return {...state};}
 try{
  const meta=(await jsonAndBytes(META_PATH)).json;
  if(meta.schema!==1||meta.sourceRepo!=='nitoyon/pokesleep-tool'||
   !/^[a-f0-9]{64}$/.test(meta.sha256||'')||
   !/^[a-f0-9]{40}$/.test(meta.sourceCommit||''))throw Error('Untrusted master metadata');
  const {bytes,json:master}=await jsonAndBytes(MASTER_PATH);
  if(hex(await crypto.subtle.digest('SHA-256',bytes))!==meta.sha256)throw Error('Pinned master SHA-256 mismatch');
  if(!valid(master,meta))throw Error('Invalid master schema');
  window.POKESLEEP_EXTRA_INGREDIENT_STRENGTH={...(master.ingredientStrength||{})};
  window.POKESLEEP_MASTER=signature(master);
  state={source:'verified-local-master',reason:'verified',sha256:meta.sha256,commit:meta.sourceCommit};
 }catch(err){
  window.POKESLEEP_EXTRA_INGREDIENT_STRENGTH={};
  window.POKESLEEP_MASTER=fallback;
  state={source:'legacy-fallback',reason:String(err?.message||err),sha256:'',commit:''};
  console.warn('Independent master unavailable; preserving legacy fallback',err);
 }
 return {...state};
}
const api={load:async()=>{const result=await load();window.dispatchEvent?.(new Event('bukkomi-master-ready'));return result;},getStatus:()=>({...state}),canonical,valid};
Object.freeze(api);window.POKESLEEP_SHARED_MASTER=api;
})();
