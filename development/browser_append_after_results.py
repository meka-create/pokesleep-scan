#!/usr/bin/env python3
"""Post-analysis image append resets results only after an actual new image.
Chromium fixture only. No OCR, private test images, or Golden data.
"""
from __future__ import annotations
import base64
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
INSTRUMENTED=APP.replace(HOOK,"""window.__APPEND_AFTER_RESULTS_TEST__={
 paint:()=>{results=[makeProcessingFailureResult({name:'first.png'},'OCR',Error('synthetic'))];
   render();refreshCompletedProgress();},
 count:()=>results.length,
 selected:()=>selected.map(f=>f.name)
};
"""+HOOK)
CDN="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"
PNG=base64.b64decode(
 "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C9sAAAAASUVORK5CYII="
)

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
    for width in [390,1440]:
     context=browser.new_context(viewport={"width":width,"height":900},
      device_scale_factor=2 if width==390 else 1,
      is_mobile=width==390,has_touch=width==390,service_workers="block")
     page=context.new_page()
     errors=[]
     page.on("pageerror",lambda e:errors.append(str(e)))
     page.route(CDN,lambda route:route.fulfill(
      status=200,content_type="application/javascript",body="window.Tesseract={};"))
     page.route(re.compile(r"/app\.js\?"),lambda route:route.fulfill(
      status=200,content_type="application/javascript",body=INSTRUMENTED))
     page.goto(f"http://127.0.0.1:{server.server_address[1]}/?release={RELEASE}",
      wait_until="domcontentloaded",timeout=20000)
     page.wait_for_function("() => !!window.__APPEND_AFTER_RESULTS_TEST__ && !!window.POKESLEEP_CSV_GATE",
      timeout=20000)
     if page.locator("#tipsDialog").evaluate("(e)=>e.open"):
      page.locator("#tipsClose").click()
     first={"name":"first.png","mimeType":"image/png","buffer":PNG}
     second={"name":"second.png","mimeType":"image/png","buffer":PNG}
     # Opening the primary picker starts with an explicit source choice.
     page.locator(".filelabel").click()
     assert page.locator("#imageSelectSourceChoices").is_visible()
     assert page.locator("#imageSelectActionChoices").is_hidden()
     assert page.locator("#imageSourceFiles").is_visible()
     assert page.locator("#storageFiles").get_attribute("accept") is None
     # A file-manager upload of a non-image is rejected without changing state.
     with page.expect_file_chooser() as bad:
      page.locator("#imageSourceFiles").click()
     assert bad.value.element.get_attribute("id") == "storageFiles"
     bad.value.set_files([{"name":"invalid.txt","mimeType":"text/plain","buffer":b"not an image"}])
     page.locator("#appDialog").wait_for(state="visible",timeout=20000)
     assert "PNG / JPG / JPEG" in page.locator("#appDialogMessage").inner_text()
     assert page.locator("#run").is_disabled()
     page.locator("#appDialogPrimary").click()
     checks.append(f"{width}px: initial Files choice rejects nonimages without modifying state")
     # User can go back from a source choice to the existing append/replace UI.
     page.locator(".filelabel").click()
     with page.expect_file_chooser() as initial:
      page.locator("#imageSourceFiles").click()
     initial.value.set_files([first])
     page.wait_for_function("""() => document.querySelector('#uploadMain')?.textContent==='1枚を選択しました'
       && !document.querySelector('#run')?.disabled""",timeout=20000)
     page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.paint()")
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.count()")==1
     assert page.locator("#resultsCard").is_visible()
     assert page.locator("#progress").evaluate("e=>e.classList.contains('is-complete')")
     page.locator(".filelabel").click()
     assert page.locator("#imageSelectDialog").is_visible()
     assert page.locator("#imageSelectAppend").is_enabled()
     assert page.locator("#imageSelectAppendNote").count()==0
     checks.append(f"{width}px: append enabled after results, no obsolete instruction")

     # No image chosen: keep both results and original image selection.
     with page.expect_file_chooser() as cancel:
      page.locator("#imageSelectAppend").click()
      page.locator("#imageSourcePhotos").click()
     cancel.value.set_files([])
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.count()")==1
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.selected()")==["first.png"]
     assert page.locator("#resultsCard").is_visible()
     checks.append(f"{width}px: canceled append keeps the analysis and selection")

     # Byte-identical repeated image must not wipe results; the existing
     # no-new-image notice is independent of the forbidden confirmation modal.
     page.locator(".filelabel").click()
     with page.expect_file_chooser() as duplicate:
      page.locator("#imageSelectAppend").click()
      page.locator("#imageSourcePhotos").click()
     duplicate.value.set_files([first])
     page.locator("#appDialog").wait_for(state="visible",timeout=20000)
     assert "追加画像はありません" in page.locator("#appDialogTitle").inner_text()
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.count()")==1
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.selected()")==["first.png"]
     assert page.locator("#resultsCard").is_visible()
     assert page.locator("#progress").evaluate("e=>e.classList.contains('is-complete')")
     page.locator("#appDialogPrimary").click()
     checks.append(f"{width}px: duplicate-only append retains results and completed state")

     # Fresh append: merged source list, existing results cleared, fresh
     # full reanalysis available, and no confirmation interrupt.
     page.locator(".filelabel").click()
     assert page.locator("#imageSelectAppend").is_enabled()
     with page.expect_file_chooser() as new_images:
      page.locator("#imageSelectAppend").click()
      page.locator("#imageSourcePhotos").click()
     new_images.value.set_files([second])
     page.wait_for_function("""() => document.querySelector('#uploadMain')?.textContent==='2枚を選択しました'
       && !document.querySelector('#run')?.disabled
       && document.querySelector('#resultsCard')?.hidden""",timeout=20000)
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.count()")==0
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.selected()")==["first.png","second.png"]
     assert page.locator("#tbl tbody tr").count()==0
     assert page.locator("#csv").is_disabled()
     assert page.locator("#copyCsv").is_disabled()
     assert page.locator("#appDialog").is_hidden()
     # Files append and no-change cancel must work through generic Documents UI.
     page.locator(".filelabel").click()
     page.locator("#imageSelectAppend").click()
     assert page.locator("#imageSelectSourceChoices").is_visible()
     assert page.locator("#imageSelectBack").is_visible()
     page.locator("#imageSelectBack").click()
     assert page.locator("#imageSelectActionChoices").is_visible()
     page.locator("#imageSelectReplace").click()
     with page.expect_file_chooser() as replace_images:
      page.locator("#imageSourceFiles").click()
     assert replace_images.value.element.get_attribute("id") == "storageFiles"
     replace_images.value.set_files([first])
     page.wait_for_function("""() => document.querySelector('#uploadMain')?.textContent==='1枚を選択しました'
       && !document.querySelector('#run')?.disabled""",timeout=20000)
     assert page.evaluate("window.__APPEND_AFTER_RESULTS_TEST__.selected()")==["first.png"]
     checks.append(f"{width}px: source Back and Files replace preserve intended selection")

     assert page.locator("#progress").evaluate("e=>e.classList.contains('is-ready')")
     assert not errors,(width,errors)
     checks.append(f"{width}px: successful append resets results, offers full reanalysis of both images, no confirm")
     context.close()
   finally:
    browser.close()
 finally:
  server.shutdown();server.server_close()
 print(json.dumps({"status":"PASS","checks":checks,
  "scope":"Chromium synthetic selection/results; no OCR or actual image-analysis claims"},
  ensure_ascii=False,indent=2))

if __name__=="__main__":
 main()
