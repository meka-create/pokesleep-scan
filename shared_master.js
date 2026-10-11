/* STEP2: pinned, opt-in replacement of the Candidate125 in-memory master.
 * AI v27 release master is verified byte-for-byte before the existing classifier
 * is initialized. No use of moving branches or unaudited automatic updates.
 * The legacy master_data.js MUST already be loaded as a safe fallback.
 */
(()=>{'use strict';
const PIN=Object.freeze({
  sourceRepo:'meka-create/pokesleep-ai-scan',
  commit:'c2c4761629783fb329e60b0ab237c6fc6e2448c9',
  sourcePath:'release-kit-assets/MASTER_DATA.json',
  localPath:'shared/MASTER_DATA.json',
  sha256:'d60410ba1f92d80c67ca3ff40bc8aa7a2cd51d4c03fc33f9e99fa83bb8e77a38',
  species:249, ingredients:19, natures:25, subskills:17, cutoff:'2026-10-05'
});
let state={source:'legacy-fallback',reason:'not-loaded',sha256:'',commit:PIN.commit};
const fallback=window.POKESLEEP_MASTER;
function signature(master){
 return {
  cutoff:master.cutoff,pokemon:master.pokemon,
  ingredients:master.ingredients,natures:master.natures,subskills:master.subskills
 };
}
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function valid(m){
 if(!m||typeof m!=='object'||Array.isArray(m)||m.cutoff!==PIN.cutoff)return false;
 if(!Array.isArray(m.pokemon)||m.pokemon.length!==PIN.species)return false;
 if(!m.ingredients||typeof m.ingredients!=='object'||Array.isArray(m.ingredients)||Object.keys(m.ingredients).length!==PIN.ingredients)return false;
 if(!Array.isArray(m.natures)||m.natures.length!==PIN.natures)return false;
 if(!Array.isArray(m.subskills)||m.subskills.length!==PIN.subskills)return false;
 const names=m.pokemon.map(p=>p&&p.name);
 return names.every(n=>typeof n==='string'&&n.length>0)&&new Set(names).size===PIN.species;
}
function hex(bytes){return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function load(){
 if(!valid(fallback)){state={...state,source:'unusable',reason:'legacy-master-invalid'};throw Error('Legacy master missing or invalid');}
 if(typeof fetch!=='function'||!globalThis.crypto?.subtle){
  state={...state,reason:'sha256-verification-unavailable'};return state;
 }
 try{
  const url=new URL(PIN.localPath,location.href);
  const release=String(window.__PUBLIC_RELEASE_ID__||'');
  if(release)url.searchParams.set('release',release);
  const controller=new AbortController();
  // No long-lived timer: use finally to always clear timeout.
  const timer=setTimeout(()=>controller.abort(),2200);
  let resp;
  try{resp=await fetch(url.toString(),{cache:'no-store',signal:controller.signal});}
  finally{clearTimeout(timer);}
  if(!resp.ok)throw Error('HTTP '+resp.status);
  const bytes=await resp.arrayBuffer();
  const digest=hex(await crypto.subtle.digest('SHA-256',bytes));
  if(digest!==PIN.sha256)throw Error('Pinned SHA-256 mismatch');
  const master=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!valid(master))throw Error('Invalid master schema');
  // For the first STEP2 adoption, no classifier inputs may change.
  if(canonical(signature(master))!==canonical(signature(fallback)))
    throw Error('AI master differs from frozen Candidate125 classifier inputs');
  window.POKESLEEP_MASTER=signature(master);
  state={source:'pinned-ai-v27',reason:'verified',sha256:digest,commit:PIN.commit};
 }catch(err){
  window.POKESLEEP_MASTER=fallback;
  state={source:'legacy-fallback',reason:String(err?.message||err),sha256:'',commit:PIN.commit};
  console.warn('Pinned master unavailable; using unchanged local legacy master.',err);
 }
 return {...state};
}
const api={load,getStatus:()=>({...state}),pin:PIN};
Object.freeze(api);
window.POKESLEEP_SHARED_MASTER=api;
})();