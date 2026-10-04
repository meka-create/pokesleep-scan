import fs from 'node:fs';
import crypto from 'node:crypto';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const must=[
  'function runtimeErrorText(e)',
  'async function decodeImageSource(file)',
  'for(let attempt=1;attempt<=2;attempt++)',
  'function decodeImageElementWithTimeout(file,bitmapError=null,timeoutMs=IMAGE_DECODE_TIMEOUT_MS)',
  'im.onerror=()=>fail(`画像デコードに失敗しました',
  'async function resetWorker()',
  '解析エンジンを再準備中…',
  'function isTransientOcrRuntimeError(e)',
  'async function ocrCompositeWithRecovery(canvas,idx,total)',
  'await resetWorker();await ensureWorker();return await ocrComposite(canvas,idx,total);',
  "stage='画像読み込み'",
  "stage='OCR'",
  'setPausedAnalysis(batch,i,failed)',
  '予期しないエラーで解析を中断しました${activeFile?`（${activeFile} / ${activeStage}）`',
  'runtimeErrorText(e)'
];
for(const x of must){if(!app.includes(x))throw new Error('Missing Candidate51 runtime recovery marker: '+x)}
if(/im\.onerror\s*=\s*e\s*=>[^\n]*rej\(e\)/.test(app))throw new Error('Raw image Event rejection still exists');
if(app.includes('message:`解析できませんでした: ${e.message||e}`'))throw new Error('Legacy [object Event] error formatting still exists');
for(const f of ['classifier.js','master_data.js','food_matcher.js','food_features.js','food_color_features.js']){
  const data=fs.readFileSync(new URL('../'+f,import.meta.url));
  console.log(f,crypto.createHash('sha256').update(data).digest('hex'));
}
console.log('OK: Candidate 51 mobile runtime recovery regression passed');
