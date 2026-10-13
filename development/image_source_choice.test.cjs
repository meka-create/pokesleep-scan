'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
test('initial image selection directly invokes the generic native file picker',()=>{
 assert.doesNotMatch(html,/id="imageSelectSourceChoices"|id="imageSourcePhotos"|id="imageSourceFiles"|id="imageSelectBack"/);
 assert.match(html,/<input id="storageFiles" type="file" multiple hidden/);
 assert.doesNotMatch(html,/<input id="storageFiles"[^>]*accept=/);
 assert.match(app,/function openImagePickerOrActions\(\)/);
 assert.match(app,/if\(selected\.length\)\{openImageSelectDialog\(\);return;\}\s*imageSelectionAppend=false;\s*triggerImageFilePicker\(storageInput\)/);
 assert.match(app,/const invalid=incoming\.filter\(f=>!isAcceptedImageFile\(f\)\)/);
 assert.match(app,/const batch=\[\.\.\.e\.target\.files\],append=imageSelectionAppend/);
 assert.match(app,/setSelectedFiles\(batch,\{append,clearInput:true\}\)/);
});
test('selected images preserve the action modal; both actions open Files immediately',()=>{
 assert.match(html,/id="imageSelectDialog"/);
 assert.match(html,/id="imageSelectActionChoices"/);
 assert.match(html,/id="imageSelectReplace"/);
 assert.match(html,/id="imageSelectAppend"/);
 assert.match(app,/function openImageSelectDialog\(\)/);
 assert.match(app,/imageSelectionAppend=false;\s*closeImageSelectDialog\(\{restoreFocus:false\}\);\s*triggerImageFilePicker\(storageInput\)/);
 assert.match(app,/imageSelectionAppend=true;\s*closeImageSelectDialog\(\{restoreFocus:false\}\);\s*triggerImageFilePicker\(storageInput\)/);
 assert.match(app,/const files=append\?\[\.\.\.selected,\.\.\.incoming\]:incoming/);
 assert.match(app,/if\(append&&stable\.length===previousCount\)/);
 assert.doesNotMatch(app,/setImageSelectStep|#imageSourcePhotos|#imageSourceFiles/);
});
test('keyboard support remains and the action dialog is only announced when applicable',()=>{
 assert.match(html,/class="filelabel" role="button" tabindex="0"/);
 assert.match(app,/dropZone\?\.addEventListener\('keydown'/);
 assert.match(app,/label\?\.setAttribute\('aria-haspopup','dialog'\)/);
 assert.match(app,/label\?\.removeAttribute\('aria-haspopup'\)/);
});
