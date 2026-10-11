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
// Wide orange border at the bottom of the main-skill card. Its position
// follows wrapped skill descriptions, unlike the detail-header position.
// On the private Android 142-image layout audit it was detectable on 142/142.
function mainSkillCardBottom(canvas,mainY){
 const w=canvas.width,h=canvas.height,sx=w/RAW_W,sy=h/RAW_H;
 const x0=Math.round(70*sx),x1=Math.round(1010*sx);
 const y0=Math.max(0,Math.round((mainY+280)*sy));
 const y1=Math.min(h,Math.round((mainY+510)*sy));
 const width=x1-x0,height=y1-y0;
 if(width<100||height<30)return null;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)return null;
 let pixels;
 try{pixels=ctx.getImageData(x0,y0,width,height).data;}
 catch(_){return null;}
 let runStart=-1;
 for(let y=0;y<=height;y++){
  let matched=0,checked=0;
  if(y<height){
   for(let x=0;x<width;x+=3){
    const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(r>215&&g>96&&g<218&&b<153&&r-g>48)matched++;
    checked++;
   }
  }
  const on=checked>0&&matched/checked>.70;
  if(on&&runStart<0)runStart=y;
  if(!on&&runStart>=0){
   const last=y-1;
   if(last-runStart+1>=2){
    const bottom=Math.round((last+y0)/sy);
    if(bottom>=mainY+300&&bottom<=mainY+485)return bottom;
   }
   runStart=-1;
  }
 }
 return null;
}
// Profile card's coral top border is the reliable vertical anchor for
// SP, nickname, time and carry. The green main-skill header may move by 60px
// even when the top profile card remains at the same y=144 in all 142 samples.
function profileCardTop(canvas){
 const w=canvas.width,h=canvas.height,sx=w/RAW_W,sy=h/RAW_H;
 const x0=Math.round(25*sx),x1=Math.round(635*sx);
 const y0=Math.round(90*sy),y1=Math.round(220*sy);
 const width=x1-x0,height=y1-y0;
 if(width<100||height<30)return null;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)return null;
 let data;
 try{data=ctx.getImageData(x0,y0,width,height).data;}
 catch(_){return null;}
 for(let y=0;y<height;y++){
  let matched=0,checked=0;
  for(let x=0;x<width;x+=3){
   const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
   if(r>225&&g>90&&g<190&&b<150&&r-g>55)matched++;
   checked++;
  }
  if(checked>0&&matched/checked>.55)return Math.round((y+y0)/sy);
 }
 return null;
}
function planFromBars(w,h,bars,cardBottom=null,profileTop=null){
 if(!isCandidateSize(w,h))return null;
 const anchor=pickAnchors(bars);
 if(!anchor)return null;
 const scale=w/RAW_W;
 if(Math.abs(h/scale-RAW_H)>23)return null;
 const deltaMain=anchor.main-BASE_MAIN,deltaDetail=anchor.detail-BASE_DETAIL;
 const profileReliable=Number.isFinite(profileTop)&&profileTop>=90&&profileTop<=220;
 const topShift=profileReliable?profileTop-144:null;
 const cardReliable=Number.isFinite(cardBottom)&&cardBottom>=anchor.main+300&&cardBottom<=anchor.main+485;
 // The five subskills move with the orange card's actual bottom edge.
 // Do not guess their coordinates from the green detail header: a wrapped
 // three-line description shifts them by ~55px while detail shifts only ~27px.
 const subShift=cardReliable?cardBottom-1225:null;
 function rect(coords,key){
  const isTop=['sp','nicklevel','time','carry'].includes(key)||key==='nick';
  const isNature=key==='nature';
  const sub=/^sub\d+/.test(key);
  if(sub&&subShift===null)return null; // fail closed to legacy OCR crop
  if(isTop&&topShift===null)return null; // profile header not verified
  const dy=isTop?topShift:isNature?deltaDetail:sub?subShift:deltaMain;
  return [Math.max(0,Math.round(coords[0]*scale)),
    Math.max(0,Math.round((coords[1]+dy)*scale)),
    Math.min(w,Math.round(coords[2]*scale)),
    Math.min(h,Math.round((coords[3]+dy)*scale))];
 }
 return Object.freeze({
  kind:'meka142-android-1080x2400',
  anchors:anchor,
  mainSkillCardBottom:cardReliable?cardBottom:null,
  profileCardTop:profileReliable?profileTop:null,
  confidence:anchor.top===null?'strong-two-header':'strong-three-header',
  rectFor:(key)=>RECTS[key]?rect(RECTS[key],key):null,
  nickRect:(kind)=>rect(NICKS[kind]||NICKS.alt,'nick')
 });
}
function inspect(canvas){
 if(!canvas||!isCandidateSize(canvas.width,canvas.height))return null;
 if(cache.has(canvas))return cache.get(canvas);
 const bars=scanBars(canvas),anchor=pickAnchors(bars);
 const bottom=anchor?mainSkillCardBottom(canvas,anchor.main):null;
 const top=anchor?profileCardTop(canvas):null;
 const plan=planFromBars(canvas.width,canvas.height,bars,bottom,top);
 cache.set(canvas,plan);
 return plan;
}
const api={inspect,scanBars,mainSkillCardBottom,profileCardTop,planFromBars,pickAnchors,isCandidateSize,reference:{width:RAW_W,height:RAW_H}};
window.POKESLEEP_ANDROID_ROI=Object.freeze(api);
})();