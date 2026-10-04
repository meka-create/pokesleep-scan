import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const one=prefix=>{const line=app.split('\n').find(x=>x.startsWith(prefix));assert.ok(line,`missing ${prefix}`);return line;};
const source=[
  one('function closeChoicePicker('),
  one('function reviewEditorActive('),
  one('function flushPendingRender('),
].join('\n');

assert.doesNotMatch(one('function reviewEditorActive('),/custom-select-trigger/,'a closed custom-select trigger must not keep analysis rendering blocked');
assert.match(one('function closeChoicePicker('),/setTimeout\(flushPendingRender,0\)/,'closing the picker must schedule a pending-render flush');
assert.match(app,/\$\('#tbl'\)\?\.addEventListener\('focusout',\(\)=>setTimeout\(flushPendingRender,0\)\);/,'focusout must use the same safe flush helper');

const queue=[];
let renderCount=0;
const picker={hidden:false,setAttribute(){}};
const bodyClassList={remove(){}};
const trigger={
  attrs:{},
  setAttribute(k,v){this.attrs[k]=v;},
  focus(){documentStub.activeElement=this;},
  matches(selector){return selector.includes('.custom-select-trigger');}
};
const editor={matches(selector){return selector.includes('.nickedit');}};
const documentStub={
  activeElement:trigger,
  body:{classList:bodyClassList},
  contains(x){return x===trigger;}
};
const sandbox={
  console,
  document:documentStub,
  renderPending:true,
  choicePickerSelect:{},
  choicePickerTrigger:trigger,
  choicePickerOptions:[{value:'x'}],
  $:sel=>sel==='#choicePicker'?picker:null,
  setTimeout:fn=>{queue.push(fn);return queue.length;},
  render(){renderCount++;},
};
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.api={closeChoicePicker,reviewEditorActive,flushPendingRender};`,sandbox);

// Reproduce the Candidate 49 failure mode: analysis finishes while picker is open,
// closing restores focus to the trigger. Trigger focus alone must no longer block flush.
sandbox.api.closeChoicePicker(true);
assert.equal(picker.hidden,true);
assert.equal(documentStub.activeElement,trigger);
assert.equal(queue.length,1,'close should enqueue one flush');
queue.shift()();
assert.equal(renderCount,1,'pending render must flush after picker close');
assert.equal(sandbox.renderPending,false,'flush must clear renderPending');

// A real text/review editor still protects the user's in-progress edit.
sandbox.renderPending=true;
documentStub.activeElement=editor;
assert.equal(sandbox.api.flushPendingRender(),false);
assert.equal(renderCount,1);
assert.equal(sandbox.renderPending,true);

// If another picker opens before the scheduled flush fires, defer until that picker closes.
documentStub.activeElement=trigger;
picker.hidden=false;
assert.equal(sandbox.api.flushPendingRender(),false);
assert.equal(sandbox.renderPending,true);
picker.hidden=true;
assert.equal(sandbox.api.flushPendingRender(),true);
assert.equal(renderCount,2);
assert.equal(sandbox.renderPending,false);

console.log('OK: Candidate 50 step 2 picker renderPending flush regression passed');
