/* Android 1080x2400 screenshot layout adapter (opt-in, fail-closed).
 * The legacy OCR classifier, food recognition, and generic crops remain intact.
 * Only use this layout after two strong, geometrically consistent green-section
 * anchors have been detected in the actual source pixels.
 */
(()=>{'use strict';
const RAW_W=1080,RAW_H=2400;
const BASE_MAIN=863,BASE_DETAIL=1876;
const RECTS=Object.freeze({
 sp:[214,171,520,246],
 nicklevel:[208,224,710,317],
 time:[447,524,900,635],
 carry:[447,674,750,779],
 mainskill:[236,1013,990,1147],
 sub10:[74,1290,529,1406],
 sub25:[548,1290,1012,1406],
 sub50:[74,1454,529,1570],
 sub70:[548,1454,1012,1570],
 sub80:[74,1618,529,1738],
 nature:[74,1999,567,2144]
});
const NICKS=Object.freeze({
 alt:[210,224,785,319],narrow:[220,224,640,318],
 wrap:[192,210,930,341],eng:[210,220,920,319],
 paddle:[217,224,910,320],star:[199,284,465,348]
});
const cache=new WeakMap();
function isCandidateSize(w,h){
 const aspect=w/h;
 return Number.isInteger(w)&&Number.isInteger(h)&&w>=450&&w<=1500&&h>=1000&&h<=3500&&aspect>.444&&aspect<.456;
}
function pickAnchors(bars){
 if(!Array.isArray(bars))return null;
 const main=bars.find(b=>b.start>=745&&b.start<=950&&b.end-b.start>=23);
 const detail=bars.find(b=>b.start>=1755&&b.start<=1995&&b.end-b.start>=23);
 if(!main||!detail||detail.start-main.start<930||detail.start-main.start>1110)return null;
 const top=bars.find(b=>b.start<=24&&b.end>=30);
 return {main:main.start,detail:detail.start,top:top?top.start:null};
}
function scanBars(canvas){
 const w=canvas.width,h=canvas.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)return [];
 const pixels=ctx.getImageData(0,0,w,h).data;
 const sy=RAW_H/h;
 let segments=[],start=-1;
 const step=3;
 // Ignore y>2200 to avoid the large footer/button accent colors.
 for(let y=0;y<=h;y++){
  let matched=0,checked=0;
  if(y<h&&y*sy<2175){
   for(let x=0;x<w;x+=step){
    const i=(y*w+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(g>=153&&g-r>=43&&g-b>=32)matched++;
    checked++;
   }
  }
  const on=checked>0&&matched/checked>=.65;
  if(on&&start<0)start=y;
  if(!on&&start>=0){
   const end=y-1;
   if((end-start+1)*sy>=23&&matched<=checked)
    segments.push({start:Math.round(start*sy),end:Math.round(end*sy)});
   start=-1;
  }
 }
 return segments;
}
function planFromBars(w,h,bars){
 if(!isCandidateSize(w,h))return null;
 const anchor=pickAnchors(bars);
 if(!anchor)return null;
 const scale=w/RAW_W;
 if(Math.abs(h/scale-RAW_H)>23)return null;
 const deltaMain=anchor.main-BASE_MAIN,deltaDetail=anchor.detail-BASE_DETAIL;
 function rect(coords,key){
  const isTop=['sp','nicklevel','time','carry'].includes(key)||key==='nick';
  const isNature=key==='nature';
  const sub=/^sub\d+/.test(key);
  const dy=isTop?deltaMain:isNature?deltaDetail:sub?
    deltaMain*.58+deltaDetail*.42:deltaMain;
  return [Math.max(0,Math.round(coords[0]*scale)),
    Math.max(0,Math.round((coords[1]+dy)*scale)),
    Math.min(w,Math.round(coords[2]*scale)),
    Math.min(h,Math.round((coords[3]+dy)*scale))];
 }
 return Object.freeze({
  kind:'meka142-android-1080x2400',
  anchors:anchor,
  confidence:anchor.top===null?'strong-two-header':'strong-three-header',
  rectFor:(key)=>RECTS[key]?rect(RECTS[key],key):null,
  nickRect:(kind)=>rect(NICKS[kind]||NICKS.alt,'nick')
 });
}
function inspect(canvas){
 if(!canvas||!isCandidateSize(canvas.width,canvas.height))return null;
 if(cache.has(canvas))return cache.get(canvas);
 const plan=planFromBars(canvas.width,canvas.height,scanBars(canvas));
 cache.set(canvas,plan);
 return plan;
}
const api={inspect,scanBars,planFromBars,pickAnchors,isCandidateSize,reference:{width:RAW_W,height:RAW_H}};
window.POKESLEEP_ANDROID_ROI=Object.freeze(api);
})();