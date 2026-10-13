(() => {
'use strict';
const F=window.POKESLEEP_FOOD_COLOR_FEATURES;
const REF_W=691,REF_H=1536,TOP_ANCHOR=10,MAIN_ANCHOR=559,TOP_HEADER_MIN_GREEN=260;
const FOOD_BOXES={food1:[290,220,390,300],food2:[405,220,505,300],food3:[520,220,620,300]};
const TARGET_MAX=[44,48,52,56,60,64], variantCache=new Map(), sourceCanvasCache=new Map();
function greenAnchorInfo(canvas,refY=TOP_ANCHOR){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,d=ctx.getImageData(0,0,w,h).data,target=refY*h/REF_H,lo=Math.max(0,Math.floor(target-h*.07)),hi=Math.min(h,Math.ceil(target+h*.07));let by=Math.round(target),best=-1;for(let y=lo;y<hi;y++){let c=0;for(let x=0;x<w;x+=2){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>=145&&g-r>=35&&g-b>=20)c++;}if(c>best){best=c;by=y;}}return {y:by,best,target};}
function cropFood(canvas,key){const [x1,y1,x2,y2]=FOOD_BOXES[key],h=canvas.height,sy=h/REF_H,sx=canvas.width/REF_W,top=greenAnchorInfo(canvas),main=top.best>=TOP_HEADER_MIN_GREEN?null:greenAnchorInfo(canvas,MAIN_ANCHOR),dy=top.best>=TOP_HEADER_MIN_GREEN?top.y-TOP_ANCHOR*sy:(main&&main.best>=TOP_HEADER_MIN_GREEN?main.y-MAIN_ANCHOR*sy:0);const ax=Math.max(0,Math.round(x1*sx)),ay=Math.max(0,Math.round(y1*sy+dy)),bx=Math.min(canvas.width,Math.round(x2*sx)),by=Math.min(h,Math.round(y2*sy+dy));const out=document.createElement('canvas');out.width=Math.max(1,bx-ax);out.height=Math.max(1,by-ay);out.getContext('2d',{willReadFrequently:true}).drawImage(canvas,ax,ay,bx-ax,by-ay,0,0,out.width,out.height);return out;}
function sourceCanvas(label){if(sourceCanvasCache.has(label))return sourceCanvasCache.get(label);const f=F.foods[label];if(!f)return null;const c=document.createElement('canvas');c.width=f.w;c.height=f.h;const ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.createImageData(f.w,f.h);im.data.set(f.rgba);ctx.putImageData(im,0,0);sourceCanvasCache.set(label,c);return c;}
function variants(label){if(variantCache.has(label))return variantCache.get(label);const src=sourceCanvas(label),f=F.foods[label],out=[];if(!src)return out;for(const target of TARGET_MAX){const sc=target/Math.max(f.w,f.h),w=Math.max(2,Math.round(f.w*sc)),h=Math.max(2,Math.round(f.h*sc)),c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,w,h);out.push({w,h,data:ctx.getImageData(0,0,w,h).data});}variantCache.set(label,out);return out;}
function median(a){if(!a.length)return 255;a.sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function cropData(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,d=ctx.getImageData(0,0,w,h).data,rs=[],gs=[],bs=[];for(let y=2;y<Math.min(68,h);y++)for(let x=5;x<Math.min(82,w);x++){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),mean=(r+g+b)/3;if(mean>210&&mx-mn<55){rs.push(r);gs.push(g);bs.push(b);}}return {w,h,d,bg:[median(rs),median(gs),median(bs)]};}
function scoreVariant(crop,v){const {w:W,h:H,d,bg}=crop,{w,h,data:t}=v;if(w>=W||h>=H)return -2;const bx=Math.round((W-w)/2),by=Math.round((H-h)/2)-5;let best=-2;for(let y=Math.max(0,by-8);y<=Math.min(H-h,by+8);y+=4)for(let x=Math.max(0,bx-10);x<=Math.min(W-w,bx+10);x+=4){let dot=0,nd=0,nv=0,n=0;for(let ty=0;ty<h;ty++)for(let tx=0;tx<w;tx++){const ti=(ty*w+tx)*4,a=t[ti+3]/255;if(a<=.08)continue;const si=((y+ty)*W+x+tx)*4;for(let c=0;c<3;c++){const dv=crop.d[si+c]-bg[c],vv=(t[ti+c]-bg[c])*a;dot+=dv*vv;nd+=dv*dv;nv+=vv*vv;}n++;}if(n&&nd>0&&nv>0){const s=dot/Math.sqrt(nd*nv);if(s>best)best=s;}}return best;}
function scoreShapeVariant(crop,v){const {w:W,h:H,d,bg}=crop,{w,h,data:t}=v;if(w>=W||h>=H)return -2;const bx=Math.round((W-w)/2),by=Math.round((H-h)/2)-5;let best=-2;for(let y=Math.max(0,by-8);y<=Math.min(H-h,by+8);y+=4)for(let x=Math.max(0,bx-10);x<=Math.min(W-w,bx+10);x+=4){let inter=0,tm=0,cm=0;for(let ty=0;ty<h;ty++)for(let tx=0;tx<w;tx++){const ti=(ty*w+tx)*4,isTemplate=t[ti+3]/255>.08,si=((y+ty)*W+x+tx)*4,dr=crop.d[si]-bg[0],dg=crop.d[si+1]-bg[1],db=crop.d[si+2]-bg[2],isCrop=Math.sqrt(dr*dr+dg*dg+db*db)>25;if(isTemplate)tm++;if(isCrop)cm++;if(isTemplate&&isCrop)inter++;}if(tm+cm){const s=2*inter/(tm+cm);if(s>best)best=s;}}return best;}
function matchCanvas(canvas,allowed){const crop=cropData(canvas),vals=[];for(const label of allowed||[]){let best=-2;for(const v of variants(label)){const s=scoreVariant(crop,v);if(s>best)best=s;}vals.push({name:label,score:best});}vals.sort((a,b)=>b.score-a.score);const top=vals[0]||{name:'',score:0},second=vals[1]||{name:'',score:0};return {name:top.name,score:top.score,second:second.name,secondScore:second.score,margin:top.score-second.score,ranking:vals};}
function matchDimmedFoodIcon(canvas,allowed,maxColorScore=Infinity){const color=matchCanvas(canvas,allowed);if(!Array.isArray(color.ranking)||color.ranking.length<2||color.margin>.04||color.score>maxColorScore)return color;const crop=cropData(canvas),shape=[];for(const label of allowed||[]){let best=-2;for(const v of variants(label)){const s=scoreShapeVariant(crop,v);if(s>best)best=s;}shape.push({name:label,score:best});}shape.sort((a,b)=>b.score-a.score);const top=shape[0]||{name:'',score:0},second=shape[1]||{name:'',score:0},shapeMargin=top.score-second.score;if(top.name&&top.name===color.second&&shapeMargin>=.04){return {name:top.name,score:top.score,second:second.name,secondScore:second.score,margin:shapeMargin,ranking:shape,dimmedShapeArbitration:true,colorRanking:color.ranking};}return color;}
function uniqueProfiles(hits){const out=[];for(const h of hits||[]){const k=h.foods.join('\u0001');if(!out.some(x=>x.key===k))out.push({key:k,foods:[...h.foods]});}return out;}
function resolveSlots(screenCanvas,inference,level){const ps=uniqueProfiles(inference?.hits||[]),keys=['food1','food2','food3'];return keys.map((key,i)=>{const allowed=[...new Set(ps.map(p=>p.foods[i]).filter(Boolean))];
// ― denotes a genuinely absent icon. The independent empty-slot matcher
// in app.js verifies it; never require a sprite or rank it as a normal food.
const drawable=allowed.filter(name=>name!=='―');
if(drawable.some(name=>!F.foods[name]))return {name:'',score:0,second:'',secondScore:0,margin:0,method:'missing-template',allowed,needsReview:true,reviewReason:'missing-food-template'};
if(!drawable.length)return {name:'',score:0,second:'',secondScore:0,margin:0,method:'no-regular-food',allowed,needsReview:true,reviewReason:'no-regular-food-template'};
if(drawable.length===1&&allowed.length===1)return {name:drawable[0],score:1,second:'',secondScore:0,margin:1,method:'db-inferred',allowed};
const crop=cropFood(screenCanvas,key),isDimmedFood2=i===1&&Number.isFinite(level)&&level<30,isDimmedFood3=i===2&&Number.isFinite(level)&&level<60,m=isDimmedFood2?matchDimmedFoodIcon(crop,drawable):isDimmedFood3?matchDimmedFoodIcon(crop,drawable,.82):matchCanvas(crop,drawable);return {...m,method:'image',allowed};});}
// Independent shape recheck is advisory ONLY. Color-template recognition
// remains unchanged; a disagreeing opinion must never silently alter a food.
function reviewShapeOpinion(screenCanvas,key,allowed){
 const unique=[...new Set((allowed||[]).filter(name=>F.foods[name]))];
 if(unique.length<2)return null;
 const crop=cropData(cropFood(screenCanvas,key)),ranked=[];
 for(const name of unique){
  let best=-2;
  for(const v of variants(name))best=Math.max(best,scoreShapeVariant(crop,v));
  ranked.push({name,score:best});
 }
 ranked.sort((x,y)=>y.score-x.score);
 const top=ranked[0],second=ranked[1];
 return {name:top.name,score:top.score,second:second.name,
  secondScore:second.score,margin:top.score-second.score,ranking:ranked,
  method:'shape-review-only',automatic:false};
}

// An independent within-image comparison can corroborate a dimmed food3
// against a confidently known food1/food2. Never infer from similar templates
// alone: require strong pixel identity inside this ONE screenshot.
function iconSelfCorrelation(a,b){
 if(!a||!b||a.width!==100||a.height!==80||b.width!==100||b.height!==80)return -1;
 const A=a.getContext('2d',{willReadFrequently:true}).getImageData(0,0,100,80).data;
 const B=b.getContext('2d',{willReadFrequently:true}).getImageData(0,0,100,80).data;
 const ga=new Float64Array(8000),gb=new Float64Array(8000);
 for(let p=0;p<8000;p++){const j=p*4;ga[p]=.299*A[j]+.587*A[j+1]+.114*A[j+2];gb[p]=.299*B[j]+.587*B[j+1]+.114*B[j+2];}
 let best=-1;
 for(const dy of [-2,0,2])for(const dx of [-2,0,2]){
  let n=0,sa=0,sb,saa=0,sbb=0,sab=0;sb=0;
  for(let y=10;y<62;y++)for(let x=12;x<83;x++){
   const yy=y+dy,xx=x+dx;
   if(yy<10||yy>=62||xx<12||xx>=83)continue;
   const va=ga[y*100+x],vb=gb[yy*100+xx];
   n++;sa+=va;sb+=vb;saa+=va*va;sbb+=vb*vb;sab+=va*vb;
  }
  const cov=sab-sa*sb/n,ea=saa-sa*sa/n,eb=sbb-sb*sb/n;
  if(ea>1e-3&&eb>1e-3)best=Math.max(best,cov/Math.sqrt(ea*eb));
 }
 return best;
}
function thirdFoodSelfMatchFromScores(foods,score0,score1){
 const third=foods?.[2];if(!third||third.method!=='image'||!Array.isArray(third.allowed)||third.allowed.length<2)return null;
 const ranked=new Map();
 for(const [i,score] of [[0,score0],[1,score1]]){
  const prev=foods[i],name=prev?.name||'';
  if(prev?.needsReview||prev?.manualOverride||!name||!third.allowed.includes(name)||!Number.isFinite(score))continue;
  ranked.set(name,Math.max(score,ranked.get(name)??-1));
 }
 const entries=[...ranked.entries()].sort((a,b)=>b[1]-a[1]);
 if(!entries.length||entries[0][1]<.90)return null;
 // If two distinct earlier icons look equally close, abstain.
 if(entries[1]&&entries[0][1]-entries[1][1]<.12)return null;
 return {name:entries[0][0],score:entries[0][1],secondName:entries[1]?.[0]||'',secondScore:entries[1]?.[1]??-1,method:'within-image-grayscale-correlation'};
}
function thirdFoodSelfMatch(screenCanvas,foods){
 const third=foods?.[2];if(!third||third.method!=='image'||!Array.isArray(third.allowed)||third.allowed.length<2)return null;
 const last=cropFood(screenCanvas,'food3');
 const scores=[0,1].map(i=>{
  const prev=foods[i],name=prev?.name||'';
  if(prev?.needsReview||prev?.manualOverride||!name||!third.allowed.includes(name))return -1;
  return iconSelfCorrelation(cropFood(screenCanvas,'food'+(i+1)),last);
 });
 return thirdFoodSelfMatchFromScores(foods,scores[0],scores[1]);
}

// Independent direct-pixel evidence for two recognizable locked food3 icons.
// Separate physical regions: potato fill/bottom/side; oil body/neck/label.
// No correlation scores, source filenames, species IDs, or Golden-derived
// runtime lookups. An unsupported appearance MUST remain under manual review.
function lockedFood3PixelWitnessFromRgba(rgba,w,h,allowed){
 if(w!==100||h!==80||!rgba||rgba.length!==w*h*4)return null;
 const candidates=new Set(allowed||[]);
 const region=(x1,y1,x2,y2)=>{
  const channel=[[],[],[]];
  for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
   const j=(y*w+x)*4;
   if(rgba[j+3]!==255)return null;
   for(let c=0;c<3;c++)channel[c].push(rgba[j+c]);
  }
  return channel.map(v=>{v.sort((a,b)=>a-b);return (v[(v.length-1)>>1]+v[v.length>>1])/2;});
 };
 const center=region(46,29,56,39),bottom=region(46,40,56,50),
  left=region(25,28,32,44),neck=region(46,6,56,16),
  lowerLabel=region(46,48,56,58);
 if(!center||!bottom||!left||!neck||!lowerLabel)return null;
 const within=(rgb,lo,hi)=>rgb.every((v,i)=>v>=lo[i]&&v<=hi[i]);
 const potato=candidates.has('ほっこりポテト')&&
  within(center,[248,218,172],[255,231,186])&&
  within(bottom,[245,206,161],[255,230,186])&&
  within(left,[245,208,164],[255,231,186]);
 const oil=candidates.has('ピュアなオイル')&&
  within(center,[241,229,150],[252,244,169])&&
  within(neck,[176,186,162],[200,208,183])&&
  within(lowerLabel,[233,235,198],[250,249,224]);
 if(potato===oil)return null; // reject ambiguous evidence
 return {name:potato?'ほっこりポテト':'ピュアなオイル',
  method:'three-region-visible-pixel-witness',
  evidence:potato?{center,bottom,left}:{center,neck,lowerLabel}};
}
function lockedFood3PixelWitness(screenCanvas,foods,level){
 const third=foods?.[2];
 if(!(Number.isFinite(level)&&level<60)||third?.method!=='image'||
   !third.needsReview||third.manualOverride||!Array.isArray(third.allowed)||
   third.allowed.length<2||!Array.isArray(third.ranking))return null;
 // Never introduce a new name: only inspect an already ranked top-two food.
 const leading=third.ranking.slice(0,2).map(x=>x.name);
 const allowed=third.allowed.filter(name=>leading.includes(name));
 if(!allowed.length||!screenCanvas||screenCanvas.width!==REF_W||
   Math.abs(screenCanvas.height-REF_H)>1)return null;
 const crop=cropFood(screenCanvas,'food3');
 if(crop.width!==100||crop.height!==80)return null;
 const rgba=crop.getContext('2d',{willReadFrequently:true}).getImageData(0,0,100,80).data;
 return lockedFood3PixelWitnessFromRgba(rgba,100,80,allowed);
}

// Explicit pale horizontal dash in food3: independent evidence of the game
// displaying "―".  Strictly fail closed if layout, palette, or glyph differs.
// Coordinates are absolute normalized screenshot coordinates, NOT an OCR
// template, since the no-food icon is above the standard food crop on Mew.
function explicitThirdFoodDashStats(rgba,w,h){
 if(!rgba||w<24||h<24||rgba.length!==w*h*4)return {confirmed:false,reason:'geometry'};
 let nonPale=0,paleBg=0,dash=0,frames=w*h;
 for(let j=0;j<rgba.length;j+=4){
  const r=rgba[j],g=rgba[j+1],b=rgba[j+2];
  if(r<244||g<222||b<166)nonPale++;
  if(r>=250&&g>=246&&b>=215&&b<=238)paleBg++;
  if(r>=247&&g>=224&&g<=245&&b>=170&&b<210)dash++;
 }
 const contamination=nonPale/frames,background=paleBg/frames,mark=dash/frames;
 return {confirmed:contamination<=.01&&background>=.67&&mark>=.025&&mark<=.11,
  contamination,background,dash:mark};
}
function explicitThirdFoodDash(screenCanvas){
 if(!screenCanvas||!Number.isFinite(screenCanvas.width)||!Number.isFinite(screenCanvas.height)
    ||screenCanvas.width<500||screenCanvas.height<1000
    ||Math.abs(screenCanvas.width/screenCanvas.height-REF_W/REF_H)>.006)
   return {confirmed:false,reason:'unsupported-layout'};
 const [sx,sy]=[screenCanvas.width/REF_W,screenCanvas.height/REF_H];
 const [x0,y0,x1,y1]=[537,199,604,260];
 const x=Math.round(x0*sx),y=Math.round(y0*sy),
  w=Math.round(x1*sx)-x,h=Math.round(y1*sy)-y;
 if(w<24||h<24||x+w>screenCanvas.width||y+h>screenCanvas.height)
  return {confirmed:false,reason:'invalid-crop'};
 const data=screenCanvas.getContext('2d',{willReadFrequently:true}).getImageData(x,y,w,h).data;
 return explicitThirdFoodDashStats(data,w,h);
}
window.POKESLEEP_FOOD_MATCHER={cropFood,matchCanvas,resolveSlots,reviewShapeOpinion,iconSelfCorrelation,thirdFoodSelfMatchFromScores,thirdFoodSelfMatch,lockedFood3PixelWitnessFromRgba,lockedFood3PixelWitness,explicitThirdFoodDashStats,explicitThirdFoodDash};
})();
