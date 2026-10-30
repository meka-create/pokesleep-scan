'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const start=src.indexOf('// Nickname-only advisory rescue:');
const end=src.indexOf('function nicknameLooksUiContaminated(',start);
assert.ok(start>=0&&end>start,'nickname-only production helper must exist');
const ctx={
 MAX_POKEMON_LEVEL:100,
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,'')
};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx,{filename:'nickname-review-helper.js'});
const parse=(raw,lv)=>ctx.stripVerifiedNicknameLevelCaption(raw,lv);
function row({current,paddle,level=55,review=true,candidates=[]}){
 return {nickname:current,nicknameNeedsReview:review,level,sp:4400,helpSeconds:3300,
  nature:'ゆうかん',foods:'unmodified',nicknameResolvedBy:'',
  nicknamePaddle:{ok:true,confidence:98,text:paddle,cleanedText:paddle},
  nicknameCandidates:candidates};
}
test('exact on-screen level caption is removable from either end; wrong levels are not stripped',()=>{
 assert.equal(parse('Lv.55アオゾラ',55),'アオゾラ');
 assert.equal(parse('アオゾラLV.55',55),'アオゾラ');
 assert.equal(parse('LV.59ユウLV',59),'ユウ');
 assert.equal(parse('オハヨウLv.27LV.30LV',27),'オハヨウ');
 assert.equal(parse('Lv.55アオゾラ',54),'');
 assert.equal(parse('Lv.55アオゾラ',null),'');
 assert.equal(parse('Lv.55',55),'');
 assert.equal(parse('Lv.55カ',55),'');
});
test('existing reviewed nickname gains a cleaner editable candidate but stays reviewed',()=>{
 const r=row({current:'アオゾラに',paddle:'アオゾラLv.55'});
 const before={sp:r.sp,helpSeconds:r.helpSeconds,nature:r.nature,foods:r.foods};
 assert.equal(ctx.improveReviewedNicknameCaption(r),r);
 assert.equal(r.nickname,'アオゾラ');
 assert.equal(r.nicknameNeedsReview,true);
 assert.deepEqual({sp:r.sp,helpSeconds:r.helpSeconds,nature:r.nature,foods:r.foods},before);
 assert.equal(r.nicknameResolvedBy,'PaddleOCR-level-caption-review-only');
});
test('unreviewed names cannot be edited or auto-accepted by this helper',()=>{
 const r=row({current:'カナミ',paddle:'カナキLv.55',review:false});
 ctx.improveReviewedNicknameCaption(r);
 assert.equal(r.nickname,'カナミ');assert.equal(r.nicknameNeedsReview,false);
});
test('strong current Tesseract evidence vetoes Paddle truncation',()=>{
 const r=row({current:'カナマル',paddle:'カナLv.55',
  candidates:[{text:'Lv.55カナマル',confidence:93},{text:'カナLv.55',confidence:98}]});
 ctx.improveReviewedNicknameCaption(r);
 assert.equal(r.nickname,'カナマル');assert.equal(r.nicknameNeedsReview,true);
});
test('a second strong crop of Paddle candidate permits advisory replacement without auto-confirm',()=>{
 const r=row({current:'ヒマワエ',paddle:'ヒマワリLv.55',
  candidates:[{text:'Lv.55ヒマワエ',confidence:92},{text:'Lv.55ヒマワリ',confidence:80}]});
 ctx.improveReviewedNicknameCaption(r);
 assert.equal(r.nickname,'ヒマワリ');assert.equal(r.nicknameNeedsReview,true);
});
test('unavailable or weak Paddle evidence is inert',()=>{
 for(const bad of [{ok:false,confidence:100,text:'ユキLv.55'},{ok:true,confidence:89,text:'ユキLv.55'}]){
  const r=row({current:'ユキコ',paddle:'ユキLv.55'});r.nicknamePaddle=bad;
  ctx.improveReviewedNicknameCaption(r);
  assert.equal(r.nickname,'ユキコ');assert.equal(r.nicknameNeedsReview,true);
 }
});

test('post-structure retry recovers reviewed captions and refreshes immutable snapshot',()=>{
 for(const [caption,level,want] of [
  ['Lv.14ok',14,'ok'],['LV.17A70',17,'A70'],['LV.16B58',16,'B58']]){
  const p=row({current:caption,paddle:caption,level:null,review:true});
  ctx.improveReviewedNicknameCaption(p);
  assert.equal(p.nickname,caption);
  p.level=level;ctx.improveReviewedNicknameCaption(p);
  assert.equal(p.nickname,want);
  assert.equal(p.nicknameNeedsReview,true);
 }
 const rescue=src.indexOf('({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));');
 const retry=src.indexOf('parsed=improveReviewedNicknameCaption(parsed);',rescue);
 const snapshot=src.indexOf('Object.assign(nicknameReviewAtAnalysis,',rescue);
 assert.ok(rescue>=0 && retry>rescue && snapshot>retry,'snapshot must reflect final nickname');
});

test('all other production code is byte-for-byte identical to pre-nickname baseline',()=>{
 const crypto=require('node:crypto');
 let restored=src.slice(0,start)+src.slice(end);
 // Explicitly audit and roll back only these narrow, approved non-frozen
 // changes before checking the historical complete-source fingerprint.
 // The original expected SHA-256 is NOT changed; unexpected edits still fail.
 function approvedSpan(a,b,expectedSha,baseline){
  const startAt=restored.indexOf(a),endAt=restored.indexOf(b,startAt+a.length);
  assert.ok(startAt>=0&&endAt>startAt,'missing audited scope '+a);
  assert.equal(restored.split(a).length-1,1,'ambiguous audited scope '+a);
  const original=restored.slice(startAt,endAt);
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),
   expectedSha,'unaudited change in '+a);
  restored=restored.slice(0,startAt)+baseline+restored.slice(endAt);
 }
 approvedSpan('// Independent noisy Mew skill evidence:','function longestCommonRun(',
  '876b79ceb560c8226d02ce346c9cd811589c0006a4e4b0908dd688fbf646547a',
  "function detailedMewVersatileSkill(parsed){const explicit=String(parsed?.versatileSkill||'');if(MEW_VERSATILE_KEYS.has(explicit))return explicit;for(const t of [parsed?.mainSkillRaw||'',...rescueTextValues(parsed?.structuredRescue?.attempts||{})]){const v=mewVersatileSkillFromText(t);if(v)return v;}return '';}"+"\\n".replace('\\n','\n') + "function detailedMewMainSkill(parsed){const key=detailedMewVersatileSkill(parsed),label=mewVersatileSkillLabel(key);return label?`オールマイティー (${label})`:'';}\n");
 approvedSpan('// Review-only veto on conflicting small-kana readings.','function observedFromParsed(',
  'caf8c20d309bbfe210640394845b41318a3864b6e9ddada760123e7940b4c6f9','');
 approvedSpan(' const p=r.parsed||{};\n if(!p.nicknameManualConfirmed){',
  ' if(weakThirdFoodEvidence(r.foods))',
  'b42557afb92cc74e0c9ff8bfe1c20471ee27ff36dd4acdf13b110f6248666e82',
  ' const p=r.parsed||{};\n if(!p.nicknameManualConfirmed)applyNicknameSafety(p);\n');
 approvedSpan('};applyResultReviewSafetyGuards(result);',
  'for(let fi=0;fi<result.foods.length;fi++)',
  'd24acf688ab694a6ed72c7fd7eecf161c197d1dfa0835e7b47b473136e83c044',
  '};applyResultReviewSafetyGuards(result);');
 approvedSpan('  profiledImages:ps.length,totalImageMs:',
  '  workerPrepare:{...scanPerfSession.workerPrepare}',
  'dff327e16dd5499a3d1ac683a8a1d93c7f6513bcfd5ac4d6b4623b89cfbbfa8f',
  "  profiledImages:ps.length,totalImageMs:sum(p=>p.totalMs),\n  tesseractCalls:ps.reduce((acc,p)=>acc+(p.tesseract?.calls||0),0),\n  tesseractMs:sum(p=>p.tesseract?.totalMs),\n");
 const consensusCall='parsed=autoConfirmCorroboratedReviewedNickname(parsed);';
 assert.equal(restored.split(consensusCall).length-1,1,'one reviewed-name promotion hook');
 restored=restored.replace('  '+consensusCall+'\n','');
 // Spatial review is a new post-consensus, review-only hook. Check it
 // verbatim before removing it so the historical flow fingerprint remains.
 const spatialCall='  parsed=window.POKESLEEP_NICKNAME_SPATIAL?.reviewOnly?.(parsed)||parsed;\n';
 assert.equal(restored.split(spatialCall).length-1,1,'spatial review hook must be unique');
 restored=restored.replace(spatialCall,'');
 const call='parsed=improveReviewedNicknameCaption(parsed);';
 assert.equal(restored.split(call).length-1,2,'nickname hook before and after level rescue');
 restored=restored.replace(call,'');
 const later=`({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));`;
 // Replace only the added post-structure review segment with its original flow.
 const post="({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));\n  // Retry nickname-only caption cleanup after structured OCR provides a verified level.\n  // Reconcile the immutable OCR-time snapshot with the final reviewed candidate.\n  parsed=improveReviewedNicknameCaption(parsed);\n  Object.assign(nicknameReviewAtAnalysis,{value:parsed.nickname,needsReview:!!parsed.nicknameNeedsReview,reason:parsed.nicknameReviewReason||'',resolvedBy:parsed.nicknameResolvedBy||''});\n  inference=await retryMissingCarryFromVisibleCard";
 const old='({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));inference=await retryMissingCarryFromVisibleCard';
 assert.equal(restored.split(post).length-1,1);
 restored=restored.replace(post,old);
 restored=restored.replace("codeRevision:'20261013-nickname-consensus-gated-v3'",
  "codeRevision:'20261013-food3-pixel-v6-direct-files'");
 // Auto master-sync intentionally rotates only these release tokens. Normalize
 // their values so a legitimate new master does not require a manual SHA edit.
 // All OCR/control-flow code remains covered by the surrounding-code digest.
 const releaseTokens=[
  [/const BUILD_ID='[^']+'/,"const BUILD_ID='v12-AUTO-RELEASE'"],
  [/CHECKPOINT_RELEASE_ID='[^']+'/,"CHECKPOINT_RELEASE_ID='AUTO-RELEASE'"],
  [/version:'v12-[^']+'/,"version:'v12-AUTO-RELEASE'"]
 ];
 for(const [regex,canonical] of releaseTokens){
  assert.equal([...restored.matchAll(new RegExp(regex.source,'g'))].length,1,
   'release token must appear exactly once: '+regex.source);
  restored=restored.replace(regex,canonical);
 }
 // PR #64 changes only the CSV export warning, not nickname OCR. Check the
 // exact approved warning implementation, then restore the previously audited
 // export-only function before comparing the ORIGINAL frozen surrounding digest.
 // Do not expand this exception to other functions or update the baseline SHA.
 const newCsvWarnings="function csvWarnings(){const blank=results.filter(x=>!String(x?.parsed?.nickname||'').trim()).length,nw=results.filter(x=>x?.parsed?.nicknameNeedsReview&&String(x?.parsed?.nickname||'').trim()).length,sw=results.reduce((n,r)=>n+subskillReviewSlots(r).length,0),mw=results.filter(x=>x.manualEditOpen&&!x.manualCompleted).length;return [blank?`ニックネーム空欄 ${blank}件（空欄のまま出力します）`:'',nw?`ニックネーム要確認 ${nw}件（現在の読み取り値を出力）`:'',sw?`サブスキル要確認 ${sw}枠（pokesleep-toolでは未設定として読み込まれます）`:'',mw?`手動補完中 ${mw}件（確定前の編集内容はCSVに反映されません）`:''].filter(Boolean);}\n";
 const baselineCsvWarnings="function csvWarnings(){const nw=results.filter(x=>x.parsed.nicknameNeedsReview).length,sw=results.reduce((n,r)=>n+subskillReviewSlots(r).length,0),mw=results.filter(x=>x.manualEditOpen&&!x.manualCompleted).length;return [nw?`ニックネーム要確認 ${nw}件（現在の読み取り値を出力）`:'',sw?`サブスキル要確認 ${sw}枠（pokesleep-toolでは未設定として読み込まれます）`:'',mw?`手動補完中 ${mw}件（確定前の編集内容はCSVに反映されません）`:'' ].filter(Boolean);}\n";
 assert.equal(restored.split(newCsvWarnings).length-1,1,
  'approved CSV empty-nickname warning changed without audit');
 restored=restored.replace(newCsvWarnings,baselineCsvWarnings);
 // PR #65 fixes only the ordinary nickname editor's input routing. Verify
 // exact audited handler bytes, then normalize ONLY that handler back to the
 // pre-fix implementation before computing the unchanged frozen surrounding SHA.
 const oldNicknameEditHandler="for(const el of tb.querySelectorAll('.nickedit'))el.addEventListener('input',e=>{const r=results[+e.target.dataset.ri],p=r.parsed;if(nicknameDataNeedsReview(r)){p.nicknameReviewDraft=e.target.value;const td=e.target.closest('td'),b=td?.querySelector('.nickconfirm'),sel=td?.querySelector('.nickcandidate');if(b)b.disabled=!e.target.value.trim();if(sel&&sel.value!==e.target.value){sel.value='';syncCustomSelectTrigger(sel);}}else{if(p.nickname!==e.target.value){p.nicknameManualConfirmed=false;e.target.closest('.nick-field')?.querySelector('.review-actions')?.remove();}p.nickname=e.target.value;scheduleCheckpointResultSave(r);}});";
 const newNicknameEditHandler="for(const el of tb.querySelectorAll('.nickedit'))el.addEventListener('input',e=>{const r=results[+e.target.dataset.ri],p=r.parsed;\n  // Decide from the rendered editor, not the nickname's mutable data state.\n  // Clearing an ordinary nickname temporarily makes nicknameDataNeedsReview true;\n  // switching to review-draft mode mid-typing kept the CSV nickname empty.\n  if(e.target.closest('.nickname-review')){p.nicknameReviewDraft=e.target.value;const td=e.target.closest('td'),b=td?.querySelector('.nickconfirm'),sel=td?.querySelector('.nickcandidate');if(b)b.disabled=!e.target.value.trim();if(sel&&sel.value!==e.target.value){sel.value='';syncCustomSelectTrigger(sel);}}\n  else{if(p.nickname!==e.target.value){p.nicknameManualConfirmed=false;e.target.closest('.nick-field')?.querySelector('.review-actions')?.remove();}p.nickname=e.target.value;delete p.nicknameReviewDraft;scheduleCheckpointResultSave(r);}});";
 assert.equal(restored.split(newNicknameEditHandler).length-1,1,
  'ordinary nickname editor changed outside approved clear/retype fix');
 restored=restored.replace(newNicknameEditHandler,oldNicknameEditHandler);
 // PR #67: only the verified layoutInfo clipped-top-header routing may differ.
 // Check exact approved source, then restore the original byte sequence
 // before evaluating the original immutable nickname-surrounding SHA.
 const newLayoutBandSelection=" // A clipped \"おてつだい能力\" banner can be just 1-19 px tall at y=0.\n // The first *wide* band (not only the first 20px+ headerBand) is the\n // reliable top-banner witness. Shift to the later two section headers only\n // when BOTH occur in order and are separated by at least 300px.\n // This prevents interpreting the cropped banner as the main-skill header,\n // which made time/carry disappear and broke species/nature rescue.\n const topBanner=wideBands[0]?.start<80;\n if(topBanner){\n  const later=headerBands.filter(x=>x.start>=250);\n  const next= later.length?later.find(x=>x.start>later[0].end+300):null;\n  if(next){main=later[0];detail=next;}\n }";
 const oldLayoutBandSelection=" // Some screenshots begin exactly at the green \"おてつだい能力\" banner. In that layout the\n // first wide green band is not the main-skill section header. Skip that top banner and use the\n // next two real section headers so relative subskill crops do not drift upward.\n if(headerBands[0]?.start<80){const later=headerBands.filter(x=>x.start>=250);if(later.length){main=later[0];detail=later.find(x=>x.start>main.end+300)||wideBands.find(x=>x.start>main.end+300)||detail;}}";
 assert.equal(restored.split(newLayoutBandSelection).length-1,1,
  'layoutInfo cropped-top banner fix changed outside audited code');
 restored=restored.replace(newLayoutBandSelection,oldLayoutBandSelection);
 // PR #71 adds only locked-food color/shape disagreement guards. Restore
 // EXACT audited non-nickname implementation before checking the original
 // frozen nickname-surrounding digest; never merely update the expected SHA.
 const approvedFoodBlock="// The first observed false-accept occurred when the locked-food shape matcher\n// overruled the color matcher. Also catch historical checkpoint results emitted\n// before the fix, where dimmedShapeArbitration was marked but needsReview=false.\nfunction hasUnreviewedDimmedFoodConflict(f){\n return !!f&&!f.manualOverride&&(\n  f.dimmedShapeConflict===true||\n  (f.dimmedShapeArbitration===true&&Array.isArray(f.colorRanking)&&\n   f.colorRanking[0]?.name&&f.colorRanking[0].name!==f.name));\n}\nfunction markFoodReviews(foods){return (foods||[]).map(x=>({...x,\n needsReview:!!x.needsReview||hasUnreviewedDimmedFoodConflict(x)||\n  !!(x.method==='image'&&x.name&&Number.isFinite(x.margin)&&x.margin<FOOD_REVIEW_MARGIN),\n reviewReason:hasUnreviewedDimmedFoodConflict(x)?\n  'dimmed-color-shape-disagreement':x.reviewReason}));}\n";
 const previousFoodMark="function markFoodReviews(foods){return (foods||[]).map(x=>({...x,needsReview:!!x.needsReview||!!(x.method==='image'&&x.name&&Number.isFinite(x.margin)&&x.margin<FOOD_REVIEW_MARGIN)}));}\n";
 const approvedFoodDataReview="function foodDataNeedsReview(r){return !!r?.foods?.some((x,i)=>{const name=String(typeof x==='string'?x:(x?.name||'')).trim();if(x?.needsReview||hasUnreviewedDimmedFoodConflict(x)||!name)return true;if(typeof foodSlotNeedsReview==='function')return foodSlotNeedsReview(r,i);return false;});}";
 const previousFoodDataReview="function foodDataNeedsReview(r){return !!r?.foods?.some((x,i)=>{const name=String(typeof x==='string'?x:(x?.name||'')).trim();if(x?.needsReview||!name)return true;if(typeof foodSlotNeedsReview==='function')return foodSlotNeedsReview(r,i);return false;});}";
 const approvedCheckpointFoodReview="function applyResultReviewSafetyGuards(r){\n if(!r||r.processingError)return r;\n // Persisted analyses from older releases may still contain the known\n // incorrect shape-over-color choice. Restore their actionable review flag.\n for(const f of r.foods||[]){\n  if(hasUnreviewedDimmedFoodConflict(f)){\n   f.needsReview=true;\n   f.reviewReason='dimmed-color-shape-disagreement';\n   delete f.reviewSelection;\n  }\n }\n const p=r.parsed||{};";
 const previousCheckpointFoodReview="function applyResultReviewSafetyGuards(r){\n if(!r||r.processingError)return r;\n const p=r.parsed||{};";
 for(const [current,original,label] of [
  [approvedFoodBlock,previousFoodMark,'locked-food disagreement review'],
  [approvedFoodDataReview,previousFoodDataReview,'CSV/review safety check'],
  [approvedCheckpointFoodReview,previousCheckpointFoodReview,'old checkpoint restore']
 ]){
  assert.equal(restored.split(current).length-1,1,
   'approved food-safety scope changed: '+label);
  restored=restored.replace(current,original);
 }
 // The spatial advisory adds only a Paddle metadata property and a
 // post-consensus review-only hook. Restore exactly those two strings before
 // asserting the SAME original non-nickname SHA; never change voting.
 const originalPaddleReturn="   return {text,confidence:score,source:'paddle',ok:!!text,metrics:res?.metrics||null,runtime:res?.runtime||null,errorStage:null};";
 const spatialPaddleReturn="   return {text,confidence:score,source:'paddle',ok:!!text,metrics:res?.metrics||null,runtime:res?.runtime||null,errorStage:null,spatial:window.POKESLEEP_NICKNAME_SPATIAL?.inspect?.(items,src.width,src.height)||null};";
 const originalPostConsensus="  parsed=autoConfirmCorroboratedReviewedNickname(parsed);\n  Object.assign(nicknameReviewAtAnalysis,";
 const spatialPostConsensus="  parsed=autoConfirmCorroboratedReviewedNickname(parsed);\n  parsed=window.POKESLEEP_NICKNAME_SPATIAL?.reviewOnly?.(parsed)||parsed;\n  Object.assign(nicknameReviewAtAnalysis,";
 assert.equal(src.split(spatialPostConsensus).length-1,1,
  'review-only spatial invocation changed outside approved scope');
 for(const [present,previous,label] of [
  [spatialPaddleReturn,originalPaddleReturn,'Paddle spatial metadata']
 ]){
  assert.equal(restored.split(present).length-1,1,'unexpected geometry scope: '+label);
  restored=restored.replace(present,previous);
 }
 // PR #73: the only new non-nickname changes are the independently
 // corroborated SP header rescue and review-only subskill candidate ranking.
 // Verify EXACT approved source before normalizing to the original immutable
 // surrounding-code digest. A broad SHA update would hide unrelated changes.
 const approvedHeaderHelper="// Independent profile-card SP corroboration. Never trust classifier-only corrections.\nfunction corroboratedHeaderSpCandidate(parsed,readings){\n if(!Array.isArray(readings)||readings.length!==2||!Number.isInteger(parsed?.level)||\n    !Number.isInteger(parsed?.sp)||!Number.isInteger(parsed?.carry))return null;\n if(new Set(readings.map(x=>String(x?.psm||''))).size!==2||\n    !readings.some(x=>x.psm==='6')||!readings.some(x=>x.psm==='11'))return null;\n if(readings.some(x=>!Number.isInteger(x?.sp)||x.sp<100||x.sp>200000||\n    Number(x.confidence)<40||parseSpText(x.text||'')!==x.sp))return null;\n const value=readings[0].sp;\n if(value===parsed.sp||readings[1].sp!==value||\n    !readings.some(x=>Number(x.confidence)>=50))return null;\n if(readings.some(x=>Number(x.confidence)>=50&&Number.isInteger(x.level)&&x.level!==parsed.level))return null;\n if(!readings.some(x=>Number(x.level)===parsed.level&&\n    /sp\\s*[0-9][0-9,.]*/i.test(x.text||'')&&/Lv\\.?\\s*\\d+/i.test(x.text||'')))return null;\n return value;\n}\n";
 const approvedHeaderTrial="  // Recovered SP needs two independent header OCR passes and exact\n  // classifier agreement with the observed carry before adoption.\n  const headerSp=corroboratedHeaderSpCandidate(parsed,headerA);\n  if(headerSp!==null){\n   const p={...parsed,subs:parsed.subs.map(x=>({...x}))};\n   applyStructuredValues(p,{sp:headerSp});\n   const inf=inferParsed(p);\n   if(inf.status==='UNIQUE'&&inf.candidates?.length===1&&\n      inf.carryConsistentCandidates?.length===1&&\n      inf.carryConsistentCandidates[0]===inf.candidates[0]&&\n      inf.hits?.some(x=>x.carryMatch===true)){\n    trials.push({field:'sp',value:headerSp,inference:inf,species:inf.candidates[0]});\n   }\n  }\n";
 const approvedReviewRanking="const strongerIndependentTop=!!second&&top.votes===1&&second.votes===1&&top.distinctiveVotes>=1&&top.bestScore>=.99&&top.bestConfidence>=80&&second.distinctiveVotes===0&&second.bestScore<.8;const keep=strongerIndependentTop?top.value:(currentValid||top.value);return {value:keep,needsReview:true,reason:'subskill-ocr-conflict',candidates:ranked};}";
 const previousReviewRanking="const keep=currentValid||top.value;return {value:keep,needsReview:true,reason:'subskill-ocr-conflict',candidates:ranked};}";
 for(const [present,previous,label] of [
  [approvedHeaderHelper,'','independent header SP helper'],
  [approvedHeaderTrial,'','unique-species + observed-carry header trial'],
  [approvedReviewRanking,previousReviewRanking,'subskill review-only candidate']
 ]){
  assert.equal(restored.split(present).length-1,1,'approved OCR scope changed: '+label);
  restored=restored.replace(present,previous);
 }
 const sha=crypto.createHash('sha256').update(restored,'utf8').digest('hex');
 // PR #54 adds export-only mint choices without changing frozen nickname helpers.
 // The surrounding-code baseline changes, while frozen nickname-specific hashes remain untouched.
 // The approved main baseline includes PR #46/#47 failure-card UI changes, not
 // a nickname OCR change. Frozen nickname-specific hashes remain untouched.
 assert.equal(sha,'ba424399fda3196db52ea51e05aee2d7bf671b12a7693d855f4c0a099b9e652b',
  'non-nickname implementation changed unexpectedly');
});
