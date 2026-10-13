#!/usr/bin/env python3
"""Desktop/mobile use one compact UI: Chromium layout & interaction regression.
Synthetic failures only; no OCR, saved images, or private Golden data.
"""
from __future__ import annotations
import functools
import http.server
import json
import re
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=json.loads((ROOT/"release.json").read_text(encoding="utf-8"))["id"]
APP=(ROOT/"app.js").read_text(encoding="utf-8")
HOOK="setTimeout(()=>{void initCheckpointRecovery();},0);"
assert APP.count(HOOK)==1
INSTRUMENTED=APP.replace(HOOK,"""window.__UNIFIED_UI_AUDIT__={
 paint:()=>{results=[makeProcessingFailureResult({name:'mobile-layout.png'},'OCR',
  Error('synthetic test'))];render();},
 manual:()=>{const r=results[0];r.manualDraft=makeManualDraft(r);r.manualEditOpen=true;render();}
};
"""+HOOK)
CDN="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"

class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 server=http.server.ThreadingHTTPServer(("127.0.0.1",0),
  functools.partial(Handler,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 checks=[]
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True)
   try:
    for width,height in [(390,844),(480,960),(768,1024),(1440,900),(1920,1080)]:
     context=browser.new_context(viewport={"width":width,"height":height},
      device_scale_factor=2 if width<=480 else 1,
      is_mobile=width<=480,has_touch=width<=480,service_workers="block")
     page=context.new_page()
     errors=[]
     page.on("pageerror",lambda e:errors.append(str(e)))
     page.route(CDN,lambda route:route.fulfill(status=200,content_type="application/javascript",
      body="window.Tesseract={};"))
     page.route(re.compile(r"/app\.js\?"),lambda route:route.fulfill(
      status=200,content_type="application/javascript",body=INSTRUMENTED))
     page.goto(f"http://127.0.0.1:{server.server_address[1]}/?release={RELEASE}",
      wait_until="domcontentloaded",timeout=20000)
     page.wait_for_function("() => !!window.__UNIFIED_UI_AUDIT__ && !!window.POKESLEEP_CSV_GATE",
      timeout=20000)
     if page.locator("#tipsDialog").evaluate("(e)=>e.open"):
      page.locator("#tipsClose").click()
     page.evaluate("window.__UNIFIED_UI_AUDIT__.paint()")
     assert page.locator("#tbl tbody tr").count()==1
     state=page.evaluate("""() => {
      const s=x=>document.querySelector(x),css=x=>getComputedStyle(s(x));
      const shell=s('.shell').getBoundingClientRect();
      const row=s('#tbl tbody tr').getBoundingClientRect();
      const result=s('#resultsCard').getBoundingClientRect();
      return {
       shellLeft:shell.left,shellWidth:shell.width,resultWidth:result.width,
       outerWidth:document.documentElement.scrollWidth,viewport:innerWidth,
       table:css('#tbl').display,thead:css('#tbl thead').display,
       tbody:css('#tbl tbody').display,tr:css('#tbl tbody tr').display,
       gridColumns:css('#tbl tbody tr').gridTemplateColumns,
       firstSource:css('#tbl .file-cell').display,
       desktopImage:css('#tbl .file-open-desktop').display,
       mobileImage:css('#tbl .file-open-mobile').display,
       nickname:css('#tbl .nickname-cell').order,
       species:css('#tbl .pokemon-cell').order,
       foods:css('#tbl .foods').order,
       nature:css('#tbl .nature-cell').order,
       actions:css('.result-actions').display,
       buttons:css('.result-actions').gridTemplateColumns,
       picker:css('.filelabel').minHeight,
       rowWidth:row.width
      };
     }""")
     assert state["shellWidth"]<=480.5,(width,state)
     if width>=480:
      assert abs(state["shellLeft"]-(width-state["shellWidth"])/2)<2,(width,state)
     assert state["outerWidth"]<=width+2,(width,state)
     assert state["table"]=="block" and state["thead"]=="none",(width,state)
     assert state["tbody"]=="block" and state["tr"]=="grid",(width,state)
     assert state["firstSource"]=="none" and state["desktopImage"]=="none",(width,state)
     assert state["mobileImage"] in ("inline-flex","flex"),(width,state)
     assert [state[x] for x in ("nickname","species","foods","nature")]==["2","4","5","9"],(width,state)
     assert state["actions"]=="grid" and len(state["buttons"].split(" "))==2,(width,state)
     assert state["rowWidth"]<=state["resultWidth"]+2,(width,state)
     assert abs(float(state["picker"].replace("px",""))-184)<1,(width,state)
     page.locator("#reviewOnly").check()
     assert page.locator("#tbl tbody tr").is_visible()
     page.evaluate("window.__UNIFIED_UI_AUDIT__.manual()")
     assert page.locator("#tbl .manual-species").count()==1,(width,"no manual species dropdown")
     trigger=page.locator("#tbl .manual-species").locator("..").locator(".custom-select-trigger")
     trigger.click()
     search=page.locator("#choicePickerSearch")
     assert search.is_visible(),(width,"search box unavailable")
     for query in ("ミ","み","ﾐ"):
      search.fill(query)
      choices=page.locator("#choicePickerList .choice-picker-option-label").all_text_contents()
      assert "ミュウ" in choices,(width,query,choices[:12])
     search.fill("ゅう")
     assert page.locator("#choicePickerList .choice-picker-option").count()==0
     page.keyboard.press("Escape")
     assert page.locator("#choicePicker").is_hidden()
     assert not errors,(width,errors)
     checks.append(f"{width}px: mobile results card order, compact single-column UI, export controls, picker, kana search")
     context.close()
   finally:
    browser.close()
 finally:
  server.shutdown();server.server_close()
 print(json.dumps({"status":"PASS","checks":checks,"scope":"Chromium synthetic UI, no OCR"},ensure_ascii=False,indent=2))

if __name__=="__main__":
 main()
