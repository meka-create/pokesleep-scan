import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(dir);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(msg);};

must(app.includes("function nicknameReviewPreviewCrop(canvas,scale=1){const card=profileCardInfo(canvas);"),'nickname review preview must anchor to detected profile card');
must(app.includes("if(!card)return cropNick(canvas,'wrap',scale);"),'nickname review preview must retain legacy fallback');
must(app.includes("cropCanvasRect(canvas,[135*sx,y1,430*sx,y2],scale)"),'nickname review preview must use card-relative display rectangle');
must(app.includes("parsed.nicknameNeedsReview?nicknameReviewPreviewCrop(canvas).toDataURL('image/png'):''"),'review preview creation must use dynamic crop');

// The OCR crop itself must stay unchanged: Candidate73 is display-preview-only.
must(app.includes("nr=await ocrSingle(cropNick(canvas,'alt'),'ニックネーム確認'"),'nickname OCR must still use cropNick');
must(app.includes("const wr=await ocrSingle(cropNick(canvas,'wrap'),'ニックネーム折返し'"),'wrapped nickname OCR must remain unchanged');

// Geometry regression for the reported 750x1631-style profile card (detected y=60..181).
const card={start:60,end:181,height:122};
const y1=card.start+card.height*.42;
const y2=card.start+card.height*.92;
must(y1>110&&y1<112,'reported-layout preview top must land above nickname row');
must(y2>172&&y2<173,'reported-layout preview bottom must retain full nickname row');
// Old fixed crop started around y=147 on this layout, which clipped the upper half of the nickname.
must(y1<147,'dynamic crop must begin materially above old fixed crop');

console.log('OK: Candidate73 nickname review preview is profile-card-relative while OCR crop stays unchanged');
