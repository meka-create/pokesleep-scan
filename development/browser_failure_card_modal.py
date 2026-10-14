#!/usr/bin/env python3
"""Chromium verification of failure-card controls and modal backdrop dismissal.
Synthetic records only. No OCR execution, private images or Golden data.
"""
from __future__ import annotations
import base64,functools,http.server,json,re,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=json.loads((ROOT/'release.json').read_text(encoding='utf-8'))['id']
APP=(ROOT/'app.js').read_text(encoding='utf-8')
HOOK='setTimeout(()=>{void initCheckpointRecovery();},0);'
assert APP.count(HOOK)==1
INSTRUMENTED=APP.replace(HOOK,"""window.__FAILURE_CARD_UI_TEST__={
  install:()=>{
    const buf=Uint8Array.of(137,80,78,71,13,10,26,10,0);
    const file=new File([buf],'synthetic-failure.png',{type:'image/png'});
    selected=[file];
    const r=makeProcessingFailureResult(file,'OCR',new Error('synthetic-only'),0,
      {sourceFile:file,sourceIndex:0});
    delete r.processingError;
    r.classification.status='MISSING_INPUT';
    r.inference.status='MISSING_INPUT';
    results=[r];
    checkpointSessionActive=false;
    document.querySelector('#resultsCard').hidden=false;
    render();
  },
  // Exercise the actual IndexedDB stores, not only mocked checkpoint helpers.
  persist:async()=>{
    const file=selected[0],db=await openCheckpointDb(),
      record=await checkpointFileRecord(file,0),
      clone=checkpointResultClone(results[0]);
    const tx=db.transaction(['meta','files','results'],'readwrite');
    tx.objectStore('meta').put(checkpointMeta('completed',1,null));
    tx.objectStore('files').put(record);
    tx.objectStore('results').put(clone);
    await checkpointTxDone(tx);
    checkpointSessionActive=true;
    return true;
  },
  stored:async()=>{
    const db=await openCheckpointDb(),tx=db.transaction(['meta','files','results'],'readonly'),
      meta=await checkpointRequest(tx.objectStore('meta').getAll()),
      files=await checkpointRequest(tx.objectStore('files').getAll()),
      rows=await checkpointRequest(tx.objectStore('results').getAll());
    await checkpointTxDone(tx);
    return {meta:meta.length,files:files.length,rows:rows.length,active:checkpointSessionActive};
  },
  count:()=>({results:results.length,selected:selected.length}),
  openChoice:()=>openImageSelectDialog()
};
"""+HOOK)
CDN='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'

class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def tap_outside(page):
 page.mouse.click(4,4)

def main():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 passed=[]
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True)
   try:
    for w,h in ((390,844),(1440,900)):
     ctx=browser.new_context(viewport={'width':w,'height':h},service_workers='block',
       is_mobile=w<500,has_touch=w<500)
     page=ctx.new_page()
     errors=[]
     page.on('pageerror',lambda err:errors.append(str(err)))
     page.route(CDN,lambda r:r.fulfill(status=200,content_type='application/javascript',body='window.Tesseract={};'))
     page.route(re.compile(r'/app\.js\?'),lambda r:r.fulfill(status=200,content_type='application/javascript',body=INSTRUMENTED))
     page.goto(f'http://127.0.0.1:{server.server_address[1]}/?release={RELEASE}',wait_until='domcontentloaded',timeout=20000)
     page.wait_for_function('()=>!!window.__FAILURE_CARD_UI_TEST__ && !!window.POKESLEEP_CSV_GATE',timeout=20000)
     if page.locator('#tipsDialog').evaluate('(e)=>e.open'):
      page.locator('#tipsClose').click()
     page.evaluate('window.__FAILURE_CARD_UI_TEST__.install()')
     assert page.locator('#tbl .status-pill.bad').count()==1,(w,'missing red status')
     assert page.locator('#tbl .manual-open').count()==1,(w,'missing manual')
     assert page.locator('#tbl .processing-delete').count()==1,(w,'missing delete')
     positions=page.evaluate("""()=>{
      const manual=document.querySelector('#tbl .manual-open').getBoundingClientRect(),
        remove=document.querySelector('#tbl .processing-delete').getBoundingClientRect();
      return {mHeight:manual.height,dHeight:remove.height,mX:manual.x,dX:remove.x};
     }""")
     assert positions['mHeight']==31 and positions['dHeight']==31,(w,positions)
     assert positions['dX']>positions['mX'],(w,positions)
     # Native image-selection dialog: outside click should close without changing images.
     page.evaluate('window.__FAILURE_CARD_UI_TEST__.openChoice()')
     assert page.locator('#imageSelectDialog').evaluate('(e)=>e.open')
     tap_outside(page)
     assert not page.locator('#imageSelectDialog').evaluate('(e)=>e.open'),(w,'choice dialog still open')
     assert page.evaluate('window.__FAILURE_CARD_UI_TEST__.count().selected')==1
     # Informational dialogs should dismiss via their backdrop.
     page.locator('#moreBtn').click()
     page.locator('#sourcesMenuItem').click()
     assert page.locator('#sourcesDialog').evaluate('(e)=>e.open')
     tap_outside(page)
     assert not page.locator('#sourcesDialog').evaluate('(e)=>e.open'),(w,'sources dialog still open')
     # The destructive confirmation stays open on outside tap, then Cancel preserves the item.
     page.locator('#tbl .processing-delete').click()
     assert page.locator('#appDialog').evaluate('(e)=>e.open')
     assert '削除' in page.locator('#appDialogTitle').inner_text()
     tap_outside(page)
     assert page.locator('#appDialog').evaluate('(e)=>e.open'),(w,'destructive dialog dismissed unexpectedly')
     page.locator('#appDialogSecondary').click()
     assert page.evaluate('window.__FAILURE_CARD_UI_TEST__.count()')=={'results':1,'selected':1}
     page.evaluate('window.__FAILURE_CARD_UI_TEST__.persist()')
     assert page.evaluate('window.__FAILURE_CARD_UI_TEST__.stored()')=={'meta':1,'files':1,'rows':1,'active':True}
     page.locator('#tbl .processing-delete').click()
     page.locator('#appDialogPrimary').click()
     assert page.evaluate('window.__FAILURE_CARD_UI_TEST__.count()')=={'results':0,'selected':0}
     assert page.evaluate('window.__FAILURE_CARD_UI_TEST__.stored()')=={'meta':0,'files':0,'rows':0,'active':False},(w,'stale checkpoint remained after deletion')
     assert not errors,(w,errors)
     passed.append(f'{w}px: 31px controls, red-card deletion, safe cancel, backdrop dismissal')
     ctx.close()
   finally:
    browser.close()
 finally:
  server.shutdown();server.server_close()
 print(json.dumps({'status':'PASS','checks':passed,'mode':'synthetic Chrome interactions without OCR'},ensure_ascii=False,indent=2))

if __name__=='__main__':
 main()
