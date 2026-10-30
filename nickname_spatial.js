/* Nickname-only geometry advisory for PaddleOCR.js 0.4.2.
 * Never changes an OCR auto-confirmation decision. Keep the actual OCR result
 * and all original candidates available for manual review. No network calls.
 */
(()=>{'use strict';
 const UI_ONLY=/^(?:(?:Lv[.,:]?\d{1,3})+(?:Lv)?|Lv|SP[.,:]?[0-9,]{1,8})$/i;
 const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'')
  .replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,'');
 function bounds(item,width,height){
  const points=item?.poly;
  if(!Array.isArray(points)||points.length!==4||!points.every(p=>
   Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return null;
  const xx=points.map(p=>p[0]),yy=points.map(p=>p[1]);
  const x1=Math.min(...xx),x2=Math.max(...xx),y1=Math.min(...yy),y2=Math.max(...yy);
  if(x1<0||y1<0||x2>width||y2>height||x2-x1<5||y2-y1<4)return null;
  return {x1,x2,y1,y2,cx:(x1+x2)/2,cy:(y1+y2)/2};
 }
 function inspect(items,width,height){
  if(!Array.isArray(items)||items.length<2||items.length>12||
    !Number.isFinite(width)||!Number.isFinite(height)||width<50||height<30)return null;
  const lines=items.map(item=>({
    text:clean(item?.text),score:Number(item?.score),box:bounds(item,width,height)
  }));
  // All text regions must be accounted for, and each geometry must be sane:
  // malformed/missing bounding boxes are not license to discard characters.
  if(lines.some(x=>!x.text||!x.box||!Number.isFinite(x.score)||x.score<.50))return null;
  const ui=lines.filter(x=>UI_ONLY.test(x.text));
  const content=lines.filter(x=>!UI_ONLY.test(x.text));
  // A single actual nickname "Lv.30" is not removable, nor is a nickname
  // with a level-like suffix if the OCR returns only one fused polygon.
  if(!ui.length||content.length!==1||content[0].text.length<2||
    content[0].text.length>18||UI_ONLY.test(content[0].text)||
    /(?:Lv[.,:]?\d{1,3}|SP[.,:]?\d{2,})/i.test(content[0].text))return null;
  // Different polygons must not cover the same rendered characters.
  const cb=content[0].box;
  for(const x of ui){
   const b=x.box,overlapX=Math.max(0,Math.min(cb.x2,b.x2)-Math.max(cb.x1,b.x1)),
     overlapY=Math.max(0,Math.min(cb.y2,b.y2)-Math.max(cb.y1,b.y1));
   if(overlapX>.25*Math.min(cb.x2-cb.x1,b.x2-b.x1)&&
      overlapY>.25*Math.min(cb.y2-cb.y1,b.y2-b.y1))return null;
  }
  return {candidate:content[0].text,confidence:Math.round(content[0].score*100),
   excludedBoxes:ui.length,recognizedBoxes:lines.length,kind:'separate-ui-polygon'};
 }
 function reviewOnly(parsed){
  const spatial=parsed?.nicknamePaddle?.spatial;
  if(!spatial?.candidate||!parsed.nicknameNeedsReview)return parsed;
  const suggestion=clean(spatial.candidate);
  if(!suggestion||suggestion.length<2||suggestion.length>18)return parsed;
  const before=clean(parsed.nickname);
  const candidates=Array.isArray(parsed.nicknameCandidates)?parsed.nicknameCandidates:[];
  // Add one distinguishable advisory without changing votes or the frozen
  // Paddle/Tesseract decision. Never turn review into automatic confirmation.
  if(!candidates.some(x=>clean(x?.text)===suggestion)){
   parsed.nicknameCandidates=[{text:suggestion,confidence:Math.min(89,spatial.confidence),
     source:'paddle-spatial-review-only'},...candidates];
  }
  parsed.nicknameSpatialCandidate=suggestion;
  // The existing caption safety rule decides whether to prefer the advisory
  // as the *editable* display. The original reading remains a dropdown choice.
  if(/(?:Lv[.,:]?\d{1,3}|SP[.,:]?\d{2,})/i.test(before)&&before!==suggestion){
   if(!parsed.nicknameCandidates.some(x=>clean(x?.text)===before))
    parsed.nicknameCandidates.push({text:before,confidence:0,source:'original-unfiltered'});
   parsed.nickname=suggestion;
   parsed.nicknameResolvedBy='PaddleOCR-position-review-only';
   parsed.nicknameReviewReason='周辺UIと分離した候補（要確認）';
  }
  parsed.nicknameNeedsReview=true;
  return parsed;
 }
 const api=Object.freeze({inspect,reviewOnly});
 if(typeof window!=='undefined')window.POKESLEEP_NICKNAME_SPATIAL=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
