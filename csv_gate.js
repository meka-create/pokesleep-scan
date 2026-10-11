/* STEP2 read-only CSV schema validation, round-trip and collision-resistant naming.
 * Does not mutate OCR parsing or classifier. Browser download path remains browser-managed.
 */
(()=>{'use strict';
const HEADER=Object.freeze(["ニックネーム","ポケモン","レベル","スキルレベル","食材1","食材2","食材3","メインスキル","せいかく","Lv10","Lv25","Lv50","Lv70","Lv80","一緒に眠った時間","色違い"]);
const MEW_LABELS=new Set(["きのみバースト","げんきチャージS","エナジーチャージM","エナジーチャージS (ランダム)","料理パワーアップS","ゆめのかけらゲットS (ランダム)","げんきエールS","げんきオールS","おてつだいサポートS","食材ゲットS","ゆびをふる","料理チャンスS"]);
const BLANK=Object.freeze({"ダークライ":[2,3],"ミュウ":[3]});
const ToxtricityAllowed={
 'ストリンダー (ハイ)':new Set(['いじっぱり','やんちゃ','ゆうかん','なまいき','うっかりや','わんぱく','のうてんき','ようき','せっかち','むじゃき','がんばりや','きまぐれ','すなお']),
 'ストリンダー (ロー)':new Set(['さみしがり','しんちょう','おとなしい','おだやか','ずぶとい','のんき','おっとり','れいせい','ひかえめ','おくびょう','てれや','まじめ'])
};
const SLEEP_VALUES=new Set([0,200,500,1000,2000]);
const OWN_KEY='pokesleep-ocr-csv-download-counter-v1';
let memorySequence={stamp:'',count:0};
function serialize(rows){return rows.map(r=>r.map(v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n');}
function parse(text){
 if(typeof text!=='string'||text.charCodeAt(0)===0xFEFF)throw Error('CSV must be UTF-8 without BOM');
 const rows=[],row=[];let field='',quoted=false,afterQuote=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=ch;continue;}
  if(afterQuote&&ch!==','&&ch!=='\n')throw Error('Invalid quote termination');
  if(ch===','||ch==='\n'){row.push(field);field='';afterQuote=false;if(ch==='\n'){rows.push(row.splice(0));}continue;}
  if(ch==='"'){if(field!==''||afterQuote)throw Error('Invalid quote start');quoted=true;continue;}
  if(ch==='\r')throw Error('CR is forbidden');
  if(afterQuote)throw Error('Garbage after closing quote');
  field+=ch;
 }
 if(quoted)throw Error('Unterminated CSV quote');
 if(field!==''||row.length||afterQuote){row.push(field);rows.push(row);}
 return rows;
}
function allowedFood(poke,index){
 const slot=index+1,available=new Set();
 for(let j=1;j<=slot;j++){
  const entry=poke['ing'+j];
  if(entry&&Number.isInteger(entry['c'+slot])&&entry['c'+slot]>0)available.add(entry.name);
 }
 for(const entry of poke.mythIng||[]){
  if(Number.isInteger(entry['c'+slot])&&entry['c'+slot]>0)available.add(entry.name);
 }
 return available;
}
function inspect(text,master){
 const errors=[],warnings=[],rows=(()=>{try{return parse(text);}catch(e){errors.push(String(e.message||e));return [];}})();
 if(!master||!Array.isArray(master.pokemon)||!Array.isArray(master.natures)||!Array.isArray(master.subskills)){errors.push('Missing master for validation');return {ok:false,errors,warnings,rows:[]};}
 if(!rows.length){errors.push('Missing CSV header');return {ok:false,errors,warnings,rows};}
 if(JSON.stringify(rows[0])!==JSON.stringify(HEADER))errors.push('CSV header mismatch (16 columns)');
 if(rows.length<2)errors.push('No Pokemon records');
 const mons=new Map(master.pokemon.map(p=>[p.name,p]));
 const natures=new Set(master.natures.map(x=>x.ja)),subs=new Set(master.subskills.map(x=>x.ja));
 for(let i=1;i<rows.length;i++){
  const row=rows[i],prefix='CSV row '+(i+1)+': ';
  if(row.length!==16){errors.push(prefix+'must have 16 columns (got '+row.length+')');continue;}
  for(let j=0;j<row.length;j++){
   const v=row[j];if(/[\r\n\x00-\x1f\x7f]/.test(v))errors.push(prefix+'control/newline in column '+(j+1));
  }
  const [name,species,level,skill,...ignored]=row;
  if(!name.trim())errors.push(prefix+'missing nickname');
  if(name.length>120)errors.push(prefix+'nickname is implausibly long');
  const poke=mons.get(species);
  if(!poke){errors.push(prefix+'unsupported species '+species);continue;}
  if(!/^\d+$/.test(level)||+level<1||+level>100)errors.push(prefix+'invalid level');
  if(!/^\d+$/.test(skill)||+skill<1||+skill>10)errors.push(prefix+'invalid skill level');
  for(let j=0;j<3;j++){
   const value=row[4+j],allowBlank=(BLANK[species]||[]).includes(j+1);
   if(value===''){if(!allowBlank)errors.push(prefix+'food '+(j+1)+' must not be blank');continue;}
   if(!allowedFood(poke,j).has(value))errors.push(prefix+'invalid food '+(j+1)+' for '+species+': '+value);
  }
  const csvMain=row[7];
  if(species==='ミュウ'){
   if(!MEW_LABELS.has(csvMain))errors.push(prefix+'Mew versatile skill not resolved');
  }else if(csvMain!==poke.mainSkill)errors.push(prefix+'main skill differs from species master');
  if(!natures.has(row[8]))errors.push(prefix+'unsupported nature');
  if(ToxtricityAllowed[species]&&!ToxtricityAllowed[species].has(row[8]))errors.push(prefix+'Toxtricity form/nature incompatible with importer');
  const occupied=[];
  for(let j=9;j<14;j++){
   const v=row[j];if(!v){warnings.push(prefix+'empty subskill at column '+(j+1));continue;}
   if(!subs.has(v))errors.push(prefix+'unsupported subskill '+v);
   else occupied.push(v);
  }
  if(new Set(occupied).size!==occupied.length)errors.push(prefix+'duplicated subskill');
  if(!/^\d+$/.test(row[14])||!SLEEP_VALUES.has(+row[14]))errors.push(prefix+'unsupported sleep time default');
  if(row[15]!=='0'&&row[15]!=='1')errors.push(prefix+'invalid shiny flag');
 }
 if(!errors.length&&serialize(rows)!==text)errors.push('CSV is not a stable LF round-trip');
 return {ok:errors.length===0,errors,warnings,rows};
}
function minuteStamp(d){if(!d||typeof d.getTime!=='function'||!Number.isFinite(d.getTime()))throw Error('Invalid date');
 const pad=n=>String(n).padStart(2,'0');
 return String(d.getFullYear())+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes());
}
function reserveNext(stamp){
 let previous={stamp:'',count:0};try{previous=JSON.parse(localStorage.getItem(OWN_KEY)||'null')||previous;}catch(_){}
 const saved=previous.stamp===stamp&&Number.isSafeInteger(previous.count)&&previous.count>=1?previous.count:0;
 const inMemory=memorySequence.stamp===stamp?memorySequence.count:0;
 const count=Math.max(saved,inMemory)+1;
 memorySequence={stamp,count};
 try{localStorage.setItem(OWN_KEY,JSON.stringify(memorySequence));}catch(_){}
 return 'pokesleep_ocr_integrated_v12_'+stamp+(count>1?'_'+count:'')+'.csv';
}
async function reserveFilename(d=new Date()){
 const stamp=minuteStamp(d);
 if(globalThis.navigator?.locks?.request){
  try{return await navigator.locks.request('pokesleep-ocr-csv-download-counter',()=>reserveNext(stamp));}
  catch(err){console.warn('Download filename lock not available; using local counter.',err);}
 }
 return reserveNext(stamp);
}
const api=Object.freeze({HEADER,inspect,parse,serialize,minuteStamp,reserveFilename});
window.POKESLEEP_CSV_GATE=api;
})();