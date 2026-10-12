"use strict";
const fs=require('node:fs'),path=require('node:path');
const test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('image viewing button retains subtle compact base layout',()=>{
 const css=html.match(/\.file-open\{display:inline-flex[^}]*\}/)?.[0];
 assert.ok(css,'missing source-image button style');
 assert.match(css,/min-height:28px/);
 assert.match(css,/padding:3px 7px/);
 assert.match(css,/font-size:9\.5px/);
});
test('phone layout keeps its original compact 30px image button height',()=>{
 const mobileStart=html.indexOf('@media(max-width:680px){.pokemon-cell');
 const compactRule=html.indexOf('.file-open{width:auto;min-height:30px;padding:4px 7px',mobileStart);
 const lateTouchRule=html.lastIndexOf('@media(max-width:760px){');
 assert.ok(mobileStart>=0&&compactRule>mobileStart&&compactRule<lateTouchRule,
   'The 30px button must be in the mobile stylesheet before other touch rules');
});
test('large 44px touch targets remain on review controls, not the image button',()=>{
 const block=html.match(/\/\* Mobile touch targets remain large without the extra review navigator\. \*\/\s*@media\(max-width:760px\)\{([\s\S]*?)\}\s*<\/style>/);
 assert.ok(block,'missing touch-target rule');
 assert.doesNotMatch(block[1],/\.file-open\b/);
 assert.match(block[1],/\.nickconfirm,\.subskillconfirm,\.foodconfirm,\.speciesconfirm,\.manual-open\{min-height:44px\}/);
});
