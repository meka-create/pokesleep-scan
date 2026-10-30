'use strict';
// Synthetic-only safety tests. No real user screenshot/Golden values.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function part(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j);}
const ctx={parseSpText:s=>{const m=String(s).match(/sp\s*([0-9][0-9,.]*)/i);return m?+m[1].replace(/\D/g,''):null;}};
vm.createContext(ctx);vm.runInContext(part('function corroboratedHeaderSpCandidate(parsed,readings){','// Candidate124:'),ctx);
function data(){return {p:{level:40,sp:2345,carry:19},a:[{psm:'6',sp:5432,level:null,confidence:43,text:'card 5,432 Lv.40'},{psm:'11',sp:5432,level:40,confidence:59,text:'sp 5,432 Lv.40'}]};}
test('two OCR passes agree on a different SP with explicit same-card level',()=>{const {p,a}=data();assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),5432);});
test('disagreement, duplicate PSM, or weak reading blocks SP',()=>{const {p,a}=data();a[0].sp=5433;assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),null);a[0].sp=5432;a[0].psm='11';assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),null);a[0].psm='6';a[0].confidence=39;assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),null);});
test('missing independent carry, level mismatch, or no same-card proof blocks SP',()=>{const {p,a}=data();delete p.carry;assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),null);p.carry=19;a[1].level=41;assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),null);a[1].level=40;a[1].text='sp 5,432';assert.equal(ctx.corroboratedHeaderSpCandidate(p,a),null);});
test('SP adoption is protected by unique species and observed carry',()=>{assert.match(src,/inf\.carryConsistentCandidates\?\.length===1/);assert.match(src,/inf\.hits\?\.some\(x=>x\.carryMatch===true\)/);});
const sub={SUBSKILLS:['スキルレベルアップS','スキルレベルアップM','最大所持数アップM'],SUBSKILL_EXP_PAIR:new Set()};
vm.createContext(sub);vm.runInContext(part('function subskillEvidenceDecision(entries,current=\'\'){','function subskillNeedsTargetedVerification('),sub);
function e(value,score,confidence,distinctive){return {value,score,confidence,distinctive};}
test('strong S outranks weak M in suggestion, without auto-confirm',()=>{const d=sub.subskillEvidenceDecision([e('スキルレベルアップM',.64,55,false),e('スキルレベルアップS',1,87,true)],'スキルレベルアップM');assert.equal(d.value,'スキルレベルアップS');assert.equal(d.needsReview,true);});
test('strong conflicts do not change an existing candidate or auto-confirm',()=>{const d=sub.subskillEvidenceDecision([e('スキルレベルアップM',1,91,true),e('スキルレベルアップS',1,92,true)],'スキルレベルアップM');assert.equal(d.value,'スキルレベルアップM');assert.equal(d.needsReview,true);});
test('single weak evidence cannot auto-confirm',()=>{const d=sub.subskillEvidenceDecision([e('最大所持数アップM',.64,55,false)],'最大所持数アップM');assert.equal(d.needsReview,true);});
