#!/usr/bin/env python3
"""Real Chromium smoke test: shared choice picker kana-folded prefix search.
Synthetic UI fixtures only; no OCR, user images, or Golden test data.
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
INSTRUMENTED=APP.replace(HOOK,"""window.__PICKER_KANA_TEST__={
 paint:()=>{results=[makeProcessingFailureResult({name:'synthetic.png'},'OCR',
   Error('synthetic OCR failed'))];render();},
 manual:()=>{results[0].manualDraft=makeManualDraft(results[0]);
  results[0].manualEditOpen=true;render();},
 enhance:root=>enhanceCustomSelects(root)
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
    page=browser.new_page(viewport={"width":412,"height":915},
      device_scale_factor=2.625,is_mobile=True,has_touch=True,
      service_workers="block")
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.route(CDN,lambda route:route.fulfill(status=200,
      content_type="application/javascript",body="window.Tesseract={};"))
    page.route(re.compile(r"/app\.js\?"),lambda route:route.fulfill(status=200,
      content_type="application/javascript",body=INSTRUMENTED))
    page.goto(f"http://127.0.0.1:{server.server_address[1]}/?release={RELEASE}",
      wait_until="domcontentloaded",timeout=25000)
    page.wait_for_function("() => !!window.__PICKER_KANA_TEST__ && !!window.POKESLEEP_CSV_GATE",
      timeout=20000)
    if page.locator("#tipsDialog").evaluate("(e)=>e.open"):
     page.locator("#tipsClose").click()
    page.evaluate("window.__PICKER_KANA_TEST__.paint()")
    assert page.locator("#tbl tbody tr").count()==1
    assert page.locator("#tbl .nickname-field-label").all_text_contents()==["ニックネーム"]
    assert page.locator("#tbl .nickedit").count()==1
    heading=page.locator("#tbl .nickname-field-label").evaluate("""el => ({
      label:el.innerText,fontSize:getComputedStyle(el).fontSize,
      fontWeight:getComputedStyle(el).fontWeight,
      color:getComputedStyle(el).color
    })""")
    assert heading["fontSize"]=="9px" and heading["fontWeight"]=="850",heading
    checks.append("Nickname caption above unresolved editing field, same visual style as mobile headings")
    page.evaluate("window.__PICKER_KANA_TEST__.manual()")
    assert page.locator("#tbl .manual-inline-label").filter(has_text="ニックネーム").count()==1
    assert page.locator("#tbl .nickname-field-label").count()==0
    checks.append("Full manual mode retains exactly one nickname caption")
    # Use the real custom-select renderer. Every searchable category shares
    # its menu filter. The tests drive the displayed popup and type into it.
    page.evaluate("""() => {
      const host=document.createElement('div');
      host.id='picker-kana-fixtures';
      document.body.append(host);
      const labels=['ピカチュウ','ミュウ','ミュウツー','カミツルギ',
        'ニャース','ホゲータ','ホーホー','サンダース','アーボック',
        'キモリ','ラルトス','ニンフィア'];
      for(const css of ['speciesedit','foodedit','subskilledit',
         'manual-editor-input manual-species','manual-editor-input manual-main-skill',
         'manual-editor-input manual-nature','nickcandidate']){
       const select=document.createElement('select');
       select.className=css;
       select.setAttribute('aria-label',css);
       const placeholder=document.createElement('option');
       placeholder.value='';placeholder.disabled=true;placeholder.selected=true;
       placeholder.textContent='候補を選択';select.append(placeholder);
       for(const label of labels){
        const opt=document.createElement('option');opt.value=label;opt.textContent=label;
        select.append(opt);
       }
       host.append(select);
      }
      window.__PICKER_KANA_TEST__.enhance(host);
    }""")
    triggers=page.locator("#picker-kana-fixtures .custom-select-trigger")
    assert triggers.count()==7
    for i in range(7):
     triggers.nth(i).click()
     search=page.locator("#choicePickerSearch")
     assert search.is_visible(),f"Dropdown {i} missing search"
     for query in ["ミ","み","ﾐ","みゅ"]:
      search.fill(query)
      labels=page.locator("#choicePickerList .choice-picker-option-label").all_text_contents()
      assert labels==["ミュウ","ミュウツー"],(i,query,labels)
     search.fill("ゅう")
     assert page.locator("#choicePickerList .choice-picker-option").count()==0
     assert "一致する候補がありません" in page.locator("#choicePickerList").inner_text()
     search.fill("ミ")
     page.locator("#choicePickerList .choice-picker-option").filter(has_text="ミュウ").first.click()
     assert page.locator("#picker-kana-fixtures select").nth(i).input_value()=="ミュウ"
     assert page.locator("#choicePicker").is_hidden()
    checks.append("All 7 picker types: ミ/み/ﾐ prefix matches ミュウ, not mid-string ゅう")
    assert not errors,errors
    page.close()
   finally:
    browser.close()
 finally:
  server.shutdown();server.server_close()
 print(json.dumps({"status":"PASS","checks":checks,"scope":"Chromium synthetic UI; no OCR"},ensure_ascii=False,indent=2))

if __name__=="__main__":
 main()
