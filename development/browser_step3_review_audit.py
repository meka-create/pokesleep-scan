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
                # Move the synthetic pointer away and suppress transient hover transitions
                # so this test asserts the actual stable idle/selected CSS colors.
                page.locator(".filelabel").evaluate("(el)=>el.style.transition='none'")
                page.mouse.move(0,0)
                idle_color=page.locator(".filelabel").evaluate("(el)=>getComputedStyle(el).backgroundColor")
                assert idle_color=="rgb(248, 251, 255)",idle_color
                page.locator("#files").set_input_files(first,timeout=30000)
                page.wait_for_function("""() =>
                  document.querySelector('#uploadMain')?.textContent==='100枚を選択しました' &&
                  !document.querySelector('#run')?.disabled""",timeout=45000)
                assert page.locator("#addFilesButton").count()==0
                assert page.locator("#addFilesRow").count()==0
                assert page.locator("#imageSelectDialog").is_hidden()
                appearance=page.evaluate("""() => {
                  const el=document.querySelector('.filelabel');
                  const icon=document.querySelector('#uploadIcon svg');
                  const css=getComputedStyle(el);
                  const i=getComputedStyle(document.querySelector('#uploadIcon'));
                  return {border:css.borderTopWidth,style:css.borderTopStyle,
                    background:css.backgroundColor,radius:parseFloat(css.borderTopLeftRadius),
                    icon:!!icon,rect:!!icon?.querySelector('rect'),
                    circle:!!icon?.querySelector('circle'),path:!!icon?.querySelector('path'),
                    iconSize:i.width,label:el.getAttribute('aria-label')};
                }""")
                page.mouse.move(0,0)
                assert appearance["border"]=="2px" and appearance["style"]=="solid",appearance
                assert appearance["radius"]>=16 and appearance["background"]=="rgb(234, 243, 255)",appearance
                assert appearance["background"]!=idle_color,appearance
                assert appearance["icon"] and appearance["rect"] and appearance["circle"] and appearance["path"],appearance
                assert appearance["iconSize"]=="56px",appearance
                assert page.locator("#uploadSub").inner_text()==""
                checks.append("AI Scan picture icon, selected pale-blue fill and solid blue border")
                drop=page.locator(".filelabel")
                drop.click()
                assert page.locator("#imageSelectDialog").is_visible()
                assert page.locator("#imageSelectDialogHint").count()==0
                assert page.locator("#imageSelectDialog").get_attribute("aria-describedby") is None
                assert page.locator("#imageSelectReplace").is_visible()
                assert page.locator("#imageSelectAppend").is_enabled()
                page.locator("#imageSelectClose").click()
                assert page.locator("#imageSelectDialog").is_hidden()
                assert page.locator("#uploadMain").inner_text()=="100枚を選択しました"
                checks.append("selected picker opens hint-free modal; X closes without clearing selection")
                drop.click()
                with page.expect_file_chooser() as chooser_info:
                    page.locator("#imageSelectAppend").click()
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
                drop.click()
                assert page.locator("#imageSelectDialog").is_visible()
                with page.expect_file_chooser() as dup_chooser:
                    page.locator("#imageSelectAppend").click()
                dup_chooser.value.set_files([first[0]])
                page.locator("#appDialog").wait_for(state="visible",timeout=10000)
                assert "追加画像はありません" in page.locator("#appDialogTitle").inner_text()
                assert page.evaluate("window.__STEP3_REVIEW_AUDIT__.names().length")==142
                page.locator("#appDialogPrimary").click()
                checks.append("duplicate second-batch selection blocked without losing earlier 142 images")
                # Replacing 142 photos from the selected-image modal replaces
                # the complete list rather than accidentally appending.
                drop.click()
                with page.expect_file_chooser() as replace_picker:
                    page.locator("#imageSelectReplace").click()
                replace_picker.value.set_files([first[0]])
                page.wait_for_function("""() =>
                  document.querySelector('#uploadMain')?.textContent==='1枚を選択しました' &&
                  !document.querySelector('#run')?.disabled""",timeout=45000)
                assert page.evaluate("window.__STEP3_REVIEW_AUDIT__.names()")==["IMG_0001.png"]
                checks.append("choose-again replaces entire 142-image selection without invoking OCR")

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
