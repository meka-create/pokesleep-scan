(() => {
'use strict';
const M = window.POKESLEEP_MASTER;
const BERRY_BASE={normal:28,fire:27,water:31,electric:25,grass:30,ice:32,fighting:27,poison:32,ground:29,flying:24,psychic:26,bug:24,rock:30,ghost:26,dragon:35,dark:31,steel:33,fairy:26};
const ING_BASE={leek:185,mushroom:167,egg:115,potato:124,apple:90,herb:130,sausage:103,milk:98,honey:101,oil:121,ginger:109,tomato:110,cacao:151,tail:342,soy:100,corn:140,coffee:153,pumpkin:250,avocado:162};
const ING_G=[1.0,1.003,1.007,1.011,1.016,1.021,1.027,1.033,1.039,1.046,1.053,1.061,1.069,1.077,1.085,1.094,1.104,1.114,1.124,1.134,1.145,1.156,1.168,1.18,1.192,1.205,1.218,1.231,1.245,1.259,1.274,1.288,1.303,1.319,1.335,1.351,1.368,1.385,1.402,1.42,1.439,1.457,1.477,1.496,1.517,1.537,1.558,1.58,1.602,1.625,1.648,1.671,1.696,1.72,1.745,1.771,1.798,1.824,1.852,1.88,1.927,1.975,2.024,2.075,2.127,2.18,2.235,2.29,2.348,2.406];
const SP_SKILL={
'Charge Strength S':[400,569,785,1083,1496,2066,2842],
'Charge Strength S (Random)':[400,569,785,1083,1496,2066,2842],
'Charge Energy S':[400,569,785,1083,1496,2066,2656],
'Charge Energy S (Moonlight)':[560,797,1099,1516,2094,2892],
'Charge Strength S (Stockpile)':[600,853,1177,1625,2243,3099,3984],
'Skill Copy (Transform)':[600,853,1177,1625,2243,3099,3984],
'Skill Copy (Mimic)':[600,853,1177,1625,2243,3099,3984],
'Charge Strength M':[880,1251,1726,2383,3290,4546,6252],
'Energy for Everyone S':[1120,1593,2197,3033,4187,5785],
'Cooking Assist S (Bulk Up)':[1144,1627,2244,3098,4277,5910,7596],
'Energy for Everyone S (Berry Juice)':[1220,1735,2392,3303,4559,6299],
'Helper Boost':[2800,3902,5273,6975,9317,12438],
'Berry Burst (Draco Meteor)':[2380,3385,4670,6445,8898,12294],
'Berry Burst (Disguise)':[1400,1991,2747,3791,5234,7232],
'Berry Burst':[1400,1991,2747,3791,5234,7232],
'Energy for Everyone S (Lunar Blessing)':[1400,1991,2747,3791,5234,7232],
'Charge Strength M (Bad Dreams)':[2400,3313,4643,6441,8864,11878,14072],
'Energizing Cheer S':[766,1089,1502,2074,2863,3956],
'Energizing Cheer S (Heal Pulse)':[1600,2300,3180,4417,6113,8462],
'Versatile':[1280,1651,2126,2783,3690,5056,6463,8033],
'Dream Shard Magnet S (Aura Sphere)':[1040,1479,2040,2816,3888,5372,6905,8543],
'Berry Zone (Psystrike)':[2450,3383,4733,6551,8994,12028]
};
const DEFAULT_SP=[880,1251,1726,2383,3290,4546,5843,7303];
const MAX8=new Set(['Dream Shard Magnet S','Dream Shard Magnet S (Random)','Dream Shard Magnet S (Aura Sphere)','Versatile']);
const MAX7=new Set(['Ingredient Magnet S','Ingredient Magnet S (Plus)','Ingredient Magnet S (Present)','Charge Strength M','Charge Strength M (Bad Dreams)','Charge Strength S','Charge Strength S (Random)','Charge Strength S (Stockpile)','Extra Helpful S','Cooking Power-Up S','Cooking Power-Up S (Minus)','Metronome','Skill Copy (Transform)','Skill Copy (Mimic)','Ingredient Draw S','Ingredient Draw S (Super Luck)','Ingredient Draw S (Hyper Cutter)','Cooking Assist S','Cooking Assist S (Bulk Up)']);
const RIB_CARRY=[0,1,3,6,8];
const NATURE_BY_JA=new Map(M.natures.map(x=>[x.ja,x]));
const SUB_BY_JA=new Map(M.subskills.map(x=>[x.ja,x]));

function maxSkill(skill){return MAX8.has(skill)?8:MAX7.has(skill)?7:6;}
function skillSpValues(skill){return (SP_SKILL[skill]||DEFAULT_SP).slice(0,maxSkill(skill));}
function trunc(v,n){const N=10**n;const d=Number((v*N).toFixed(6));return Math.floor(d)/N;}
function roundPos(v){return Math.floor(v+0.5);}
function floorStable(v){return Math.floor(v+1e-9);}
function mul100(v){return Number((v*100).toFixed(6));}
function ribbonSpeed(sp,tier){const el=sp.evolutionLeft||0;if(el===0)return 1;if(tier>=4)return el===2?.75:.88;if(tier>=2)return el===2?.89:.95;return 1;}
function frequency(sp,level,nature,mod,ribbon){const ugly=(level===10&&sp.frequency===2600)?.1:0;const factor=((501-level)/500)*nature.speed*ribbonSpeed(sp,ribbon)*(1-mod.hs*.07);return sp.frequency*trunc(factor,4)-ugly;}
function berryStrength(type,level){const b=BERRY_BASE[type]||0;return Math.max(b+level-1,roundPos((1.025**(level-1))*b));}
function berryCount(sp,mod){return ((sp.specialty==='Berries'||sp.specialty==='All')?2:1)+mod.bfs;}
function ingredientEnergy(profile,level){const slots=level<30?1:level<60?2:3;const vals=[];for(const it of profile.slice(0,slots)){const e=(ING_BASE[it.key]||0)*it.q;if(e>0)vals.push(e);}return vals.length?Math.floor(vals.reduce((a,b)=>a+b,0)/vals.length):0;}
function computeSp(sp,profile,level,nature,mod,ribbon,skillLevel){const freq=frequency(sp,level,nature,mod,ribbon);const H=5*trunc(3600/freq,2);const bonus=trunc(nature.energy*(1+mod.invrp+mod.bonus*.221),2);const ingRate=trunc((sp.ingRate/100)*nature.ing*(1+mod.ing*.18),4);const berryRate=ingRate>0?1-ingRate:0;const skillRate=trunc((sp.skillRate/100)*nature.skill*(1+mod.st*.18),4);const ingRp=trunc(H*ingRate*ingredientEnergy(profile.items||profile,level)*ING_G[level-1],2);const berryRp=trunc(H*berryRate*berryStrength(sp.type,level)*berryCount(sp,mod),2);const vals=skillSpValues(sp.skill);if(skillLevel<1||skillLevel>vals.length)return null;const skillRp=trunc(H*skillRate*vals[skillLevel-1],2);return roundPos(((mul100(ingRp)+mul100(berryRp)+mul100(skillRp))*mul100(bonus))/10000);}

function normalProfiles(sp){const out=[];const types=['AAA','AAB','AAC','ABA','ABB','ABC'];for(let typ0 of types){let typ=typ0;if(!sp.ing3&&typ.endsWith('C'))typ=typ.slice(0,-1)+'A';const a=sp.ing1,b=sp.ing2,c=sp.ing3;const s2=typ[1]==='A'?a:b;const s3=typ[2]==='A'?a:typ[2]==='B'?b:c;if(!a||!s2||!s3)continue;const p=[{key:a.key,name:a.name,q:a.c1},{key:s2.key,name:s2.name,q:s2.c2},{key:s3.key,name:s3.name,q:s3.c3}];const key=p.map(x=>`${x.key}:${x.q}`).join('|');if(!out.some(x=>x.key===key))out.push({key,items:p});}return out;}
function product3(a,b,c){const out=[];for(const x of a)for(const y of b)for(const z of c)out.push([x,y,z]);return out;}
const NO_FOOD='―';
function mythProfiles(sp){const opts=['c1','c2','c3'].map((ck,i)=>{const out=(sp.mythIng||[]).filter(x=>(x[ck]||0)>0).map(x=>({key:x.key,name:x.name,q:x[ck]}));const base=sp[`ing${i+1}`];if(base?.name==='unknown'&&(base[ck]||0)===0)out.push({key:'none',name:NO_FOOD,q:0});return out;});if(opts.some(x=>!x.length))return [];return product3(opts[0],opts[1],opts[2]).map(items=>({key:items.map(x=>`${x.key}:${x.q}`).join('|'),items}));}
function profiles(sp){return sp.mythIng?mythProfiles(sp):normalProfiles(sp);}
function profileFoodNames(p){return p.items.map(x=>x.name);}
function sameFoods(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i]);}
function activeSubCount(level){return [10,25,50,70,80].filter(x=>level>=x).length;}
function modFromObserved(subskills,level){const mod={hs:0,ing:0,st:0,bfs:0,inv:0,sl:0,bonus:0,invrp:0,names:[]};const n=activeSubCount(level);for(const ja of (subskills||[]).slice(0,n)){const s=SUB_BY_JA.get(ja);if(!s)continue;mod.names.push(ja);for(const k of ['hs','ing','st','bfs','inv','sl','bonus','invrp'])mod[k]+=s[k]||0;}return mod;}
function hiddenStates(sp){const out=[];for(let hist=0;hist<=Math.max(0,sp.evolutionCount||0);hist++)for(let ribbon=0;ribbon<5;ribbon++)out.push({hist,ribbon,baseCarry:sp.carryLimit+5*hist+RIB_CARRY[ribbon]});return out;}
function candidateFoodsForMainSkill(mainSkill){const s=new Set();for(const sp of M.pokemon){if(sp.mainSkill!==mainSkill)continue;for(const x of [sp.ing1,sp.ing2,sp.ing3])if(x)s.add(x.name);for(const x of (sp.mythIng||[]))if(x)s.add(x.name);}return [...s];}

function normalizeSkillLabel(s){return (s||'').normalize('NFKC').replace(/\s+/g,'');}
function mainSkillMatches(observed, masterLabel){
 const o=normalizeSkillLabel(observed), m=normalizeSkillLabel(masterLabel);
 if(!o)return false;
 // The game screen omits internal differentiators used by the data model for these skills.
 if(o==='エナジーチャージS')return m==='エナジーチャージS'||m==='エナジーチャージS(ランダム)';
 if(o==='ゆめのかけらゲットS')return m==='ゆめのかけらゲットS'||m==='ゆめのかけらゲットS(ランダム)';
 // Legendary helper boost is displayed with a type suffix such as 「(ほのお)」.
 if(o.startsWith('おてつだいブースト'))return m==='おてつだいブースト';
 return o===m;
}
function uniqueProfilesFromHits(hits){
 const out=[];
 for(const h of hits){
  const k=h.foods.join('\u0001');
  if(!out.some(x=>x.key===k))out.push({key:k,foods:[...h.foods],quantities:[...h.quantities]});
 }
 return out;
}
function inferWithoutFoods(obs){
 const stages={mainSkill:[],helpSp:[]};
 const required=['level','sp','helpSeconds','skillLevel','nature','mainSkill'];
 const missing=required.filter(k=>obs[k]===null||obs[k]===undefined||obs[k]==='');
 const nature=NATURE_BY_JA.get(obs.nature);if(!nature)missing.push('nature-map');
 if(missing.length)return {status:'MISSING_INPUT',missing,stages,candidates:[],hits:[],profiles:[],carryConsistentCandidates:[]};
 const mod=modFromObserved(obs.subskills||[],obs.level),hits=[];
 const mainCandidates=M.pokemon.filter(sp=>mainSkillMatches(obs.mainSkill,sp.mainSkill));
 stages.mainSkill=mainCandidates.map(x=>x.name);
 for(const sp of mainCandidates){
  const vals=skillSpValues(sp.skill);if(obs.skillLevel<1||obs.skillLevel>vals.length)continue;
  let speciesHit=false;
  for(let hist=0;hist<=Math.max(0,sp.evolutionCount||0);hist++){
   // A directly caught evolved Pokémon may have hist=0. Only performed evolutions force skill-level increases.
   if(obs.skillLevel<1+hist+mod.sl)continue;
   for(let ribbon=0;ribbon<5;ribbon++){
    const f=frequency(sp,obs.level,nature,mod,ribbon);if(floorStable(f)!==obs.helpSeconds)continue;
    const calculatedCarry=sp.carryLimit+5*hist+RIB_CARRY[ribbon]+mod.inv*6;
    for(const p of profiles(sp)){
     const calc=computeSp(sp,p,obs.level,nature,mod,ribbon,obs.skillLevel);if(calc!==obs.sp)continue;
     speciesHit=true;
     hits.push({pokemon:sp.name,pokemon_en:sp.name_en,profile:p.key,foods:p.items.map(x=>x.name),quantities:p.items.map(x=>x.q),evolutionHistory:hist,ribbonTier:ribbon,calculatedSp:calc,calculatedHelpSeconds:floorStable(f),exactFrequency:f,calculatedCarry,carryMatch:(obs.carry===null||obs.carry===undefined)?null:calculatedCarry===obs.carry});
    }
   }
  }
  if(speciesHit)stages.helpSp.push(sp.name);
 }
 const candidates=[...new Set(hits.map(x=>x.pokemon))];
 const carryConsistentCandidates=[...new Set(hits.filter(x=>x.carryMatch===true).map(x=>x.pokemon))];
 return {status:candidates.length===1?'UNIQUE':candidates.length>1?'AMBIGUOUS':'NO_EXACT_MATCH',missing:[],candidates,hits,profiles:uniqueProfilesFromHits(hits),carryConsistentCandidates,stages,mod};
}
// v12-beta: White Mint keeps the displayed nature name but neutralizes all nature modifiers.
// This path is only called by app.js after normal inference failed and the on-screen Mint mark was detected.
const NEUTRAL_NATURE={speed:1,energy:1,ing:1,skill:1};
function inferWithoutFoodsNeutralized(obs){
 const stages={mainSkill:[],helpSp:[]};
 const required=['level','sp','helpSeconds','skillLevel','nature','mainSkill'];
 const missing=required.filter(k=>obs[k]===null||obs[k]===undefined||obs[k]==='');
 if(!NATURE_BY_JA.get(obs.nature))missing.push('nature-map');
 if(missing.length)return {status:'MISSING_INPUT',missing,stages,candidates:[],hits:[],profiles:[],carryConsistentCandidates:[],natureEffect:'neutralized'};
 const mod=modFromObserved(obs.subskills||[],obs.level),hits=[];
 const mainCandidates=M.pokemon.filter(sp=>mainSkillMatches(obs.mainSkill,sp.mainSkill));
 stages.mainSkill=mainCandidates.map(x=>x.name);
 for(const sp of mainCandidates){
  const vals=skillSpValues(sp.skill);if(obs.skillLevel<1||obs.skillLevel>vals.length)continue;
  let speciesHit=false;
  for(let hist=0;hist<=Math.max(0,sp.evolutionCount||0);hist++){
   if(obs.skillLevel<1+hist+mod.sl)continue;
   for(let ribbon=0;ribbon<5;ribbon++){
    const f=frequency(sp,obs.level,NEUTRAL_NATURE,mod,ribbon);if(floorStable(f)!==obs.helpSeconds)continue;
    const calculatedCarry=sp.carryLimit+5*hist+RIB_CARRY[ribbon]+mod.inv*6;
    for(const p of profiles(sp)){
     const calc=computeSp(sp,p,obs.level,NEUTRAL_NATURE,mod,ribbon,obs.skillLevel);if(calc!==obs.sp)continue;
     speciesHit=true;
     hits.push({pokemon:sp.name,pokemon_en:sp.name_en,profile:p.key,foods:p.items.map(x=>x.name),quantities:p.items.map(x=>x.q),evolutionHistory:hist,ribbonTier:ribbon,calculatedSp:calc,calculatedHelpSeconds:floorStable(f),exactFrequency:f,calculatedCarry,carryMatch:(obs.carry===null||obs.carry===undefined)?null:calculatedCarry===obs.carry,natureEffect:'neutralized'});
    }
   }
  }
  if(speciesHit)stages.helpSp.push(sp.name);
 }
 const candidates=[...new Set(hits.map(x=>x.pokemon))];
 const carryConsistentCandidates=[...new Set(hits.filter(x=>x.carryMatch===true).map(x=>x.pokemon))];
 return {status:candidates.length===1?'UNIQUE':candidates.length>1?'AMBIGUOUS':'NO_EXACT_MATCH',missing:[],candidates,hits,profiles:uniqueProfilesFromHits(hits),carryConsistentCandidates,stages,mod,natureEffect:'neutralized'};
}
function resolveWithFoods(inference,foods){
 if(!inference||!inference.hits)return {status:'MISSING_INPUT',candidates:[],hits:[],profiles:[]};
 if(!foods||foods.length!==3||foods.some(x=>!x))return inference;
 const hits=inference.hits.filter(h=>sameFoods(h.foods,foods));
 const candidates=[...new Set(hits.map(x=>x.pokemon))];
 const carryConsistentCandidates=[...new Set(hits.filter(x=>x.carryMatch===true).map(x=>x.pokemon))];
 return {...inference,status:candidates.length===1?'UNIQUE':candidates.length>1?'AMBIGUOUS':'NO_EXACT_MATCH',candidates,hits,profiles:uniqueProfilesFromHits(hits),carryConsistentCandidates};
}
function classify(obs){const pre=inferWithoutFoods(obs);return (obs.foods&&obs.foods.length===3)?resolveWithFoods(pre,obs.foods):pre;}
window.POKESLEEP_CLASSIFIER={classify,inferWithoutFoods,inferWithoutFoodsNeutralized,resolveWithFoods,mainSkillMatches,profiles,frequency,computeSp,modFromObserved,skillSpValues};
})();
