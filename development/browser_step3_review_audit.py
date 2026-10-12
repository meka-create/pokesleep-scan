#!/usr/bin/env python3
"""STEP3 Android-sized Chromium review-queue interaction audit.
Synthetic failed analysis records only. No user images, OCR models, or uploads.
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
JS=(ROOT/"app.js").read_text(encoding="utf-8")
HOOK="setTimeout(()=>{void initCheckpointRecovery();},0);"
assert JS.count(HOOK)==1
INSTRUMENTED=JS.replace(HOOK,"""window.__STEP3_REVIEW_AUDIT__={
  paint:()=>{
    results=[makeProcessingFailureResult({name:'audit-01.png'},'OCR',Error('simulated')),
             makeProcessingFailureResult({name:'audit-02.png'},'OCR',Error('simulated'))];
    render();
  },
  names:()=>selected.map(f=>f.name)
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
                ctx=browser.new_context(viewport={"width":412,"height":915},
                                        device_scale_factor=2.625,is_mobile=True,
                                        has_touch=True,service_workers="block")
                page=ctx.new_page()
                errors=[]
                page.on("pageerror",lambda err:errors.append(str(err)))
                page.route(CDN,lambda route:route.fulfill(
                    status=200,content_type="application/javascript",
                    body="window.Tesseract={};"))
                page.route(re.compile(r"/app\.js\?"),lambda route:route.fulfill(
                    status=200,content_type="application/javascript",body=INSTRUMENTED))
                page.goto(f"http://127.0.0.1:{server.server_address[1]}/?release={RELEASE}",
                          wait_until="domcontentloaded",timeout=20000)
                page.wait_for_function("() => !!window.__STEP3_REVIEW_AUDIT__ && !!window.POKESLEEP_CSV_GATE",
                                       timeout=20000)
                if page.locator("#tipsDialog").evaluate("(e)=>e.open"):
                    page.locator("#tipsClose").click()
                page.evaluate("window.__STEP3_REVIEW_AUDIT__.paint()")
                assert page.locator("#resultsCard").is_visible(),"Results not visible"
                assert page.locator("#tbl tbody tr.needs-review").count()==2,"Expected two uncertain rows"
                checks.append("two synthetic processing failures rendered")
                # The user requested removal of the unsolicited summary/count
                # and "Next review" button. Existing result rows and filter remain.
                assert page.locator("#reviewQueue").count()==0
                assert page.locator("#reviewQueueSummary").count()==0
                assert page.locator("#nextReview").count()==0
                assert page.locator("#csv").count()==1
                assert page.locator("#copyCsv").count()==1
                checks.append("unsolicited review summary and Next-review button are absent")
                page.locator("#reviewOnly").check()
                assert page.locator("#tbl tbody tr.needs-review").count()==2
                assert all(tr.is_visible() for tr in page.locator("#tbl tbody tr.needs-review").all())
                checks.append("filter preserves visible unresolved rows")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth+2"),\
                    "Unexpected horizontal viewport overflow on Pixel-sized screen"
                checks.append("Pixel-width page has no outer horizontal overflow")
                assert page.locator("#androidRoiEnabled").count()==0
                assert page.locator(".android-roi-option").count()==0
                assert page.locator(".file-picker-shell>.filelabel").count()==1
                assert page.locator("#addFilesRow").is_hidden()
                checks.append("Android optimization switch removed; original picker preserved")
                picker=page.evaluate("""() => {
                  const drop=document.querySelector('.filelabel');
                  const cs=getComputedStyle(drop),r=drop.getBoundingClientRect();
                  return {height:r.height,minHeight:parseFloat(cs.minHeight)};
                }""")
                assert picker["height"]>=183.5 and picker["minHeight"]>=184,picker
                checks.append("screenshot picker restored to full-size touch target")
                import base64
                png=base64.b64decode(
                    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C9sAAAAASUVORK5CYII="
                )
                first=[{"name":f"IMG_{i:04d}.png","mimeType":"image/png","buffer":png}
                       for i in range(1,101)]
                second=[{"name":f"IMG_{i:04d}.png","mimeType":"image/png","buffer":png}
                        for i in range(101,143)]
                page.locator("#files").set_input_files(first,timeout=30000)
                page.wait_for_function("""() =>
                  document.querySelector('#uploadMain')?.textContent==='100枚を選択しました' &&
                  !document.querySelector('#run')?.disabled""",timeout=45000)
                add=page.locator("#addFilesButton")
                assert add.is_visible() and add.is_enabled(),"Add images option missing after first batch"
                button_style=add.evaluate("""(el) => {
                  const r=el.getBoundingClientRect();
                  const frame=document.querySelector('.file-picker-shell');
                  const f=frame.getBoundingClientRect(),drop=document.querySelector('.filelabel').getBoundingClientRect();
                  const cs=getComputedStyle(el),svg=el.querySelector('svg');
                  return {width:r.width,height:r.height,radius:parseFloat(cs.borderTopLeftRadius),
                    blue:cs.backgroundColor,hasIcon:!!svg,aria:el.getAttribute('aria-label'),
                    inFrame:r.left>=f.left&&r.right<=f.right+1&&r.top>=f.top&&r.bottom<=f.bottom+1,
                    inPicker:r.left>=drop.left&&r.right<=drop.right+1&&r.top>=drop.top&&r.bottom<=drop.bottom+1,
                    rightGap:drop.right-r.right,bottomGap:drop.bottom-r.bottom,
                    oldLabel:!!frame.querySelector('.android-roi-option')};
                }""")
                assert button_style["width"]>=44 and button_style["height"]>=44,button_style
                assert button_style["radius"]>=button_style["width"]/2-1,button_style
                assert button_style["hasIcon"] and button_style["aria"]=="画像を追加する",button_style
                assert button_style["inFrame"] and button_style["inPicker"],button_style
                assert 0<=button_style["rightGap"]<=20 and 0<=button_style["bottomGap"]<=20,button_style
                assert not button_style["oldLabel"],button_style
                assert button_style["blue"].startswith("rgb("),button_style
                assert page.locator("#uploadSub").inner_text()=="","Redundant add-image instructions returned"
                checks.append("blue circular plus is inside lower-right of 100-image selected frame")
                with page.expect_file_chooser() as chooser_info:
                    add.click()
                chooser_info.value.set_files(second)
                page.wait_for_function("""() =>
                  document.querySelector('#uploadMain')?.textContent==='142枚を選択しました' &&
                  !document.querySelector('#run')?.disabled""",timeout=45000)
                assert page.evaluate("window.__STEP3_REVIEW_AUDIT__.names().length")==142
                assert page.evaluate(
                    "new Set(window.__STEP3_REVIEW_AUDIT__.names()).size")==142
                assert page.locator("#run").is_enabled()
                assert not page.locator("#appDialog").is_visible()
                checks.append("Pixel photo picker 100+42 batches preserved as 142 unique images; OCR not run")
                # Attempting to add an already-selected screenshot is not permitted
                # to duplicate the CSV row or alter the original 142-image list.
                with page.expect_file_chooser() as dup_chooser:
                    add.click()
                dup_chooser.value.set_files([first[0]])
                page.locator("#appDialog").wait_for(state="visible",timeout=10000)
                assert "追加画像はありません" in page.locator("#appDialogTitle").inner_text()
                assert page.evaluate("window.__STEP3_REVIEW_AUDIT__.names().length")==142
                page.locator("#appDialogPrimary").click()
                checks.append("duplicate second-batch selection blocked without losing earlier 142 images")
                assert not errors,errors
                ctx.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(json.dumps({"status":"PASS","checks":checks,"scope":"synthetic UI only; no OCR"},ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
