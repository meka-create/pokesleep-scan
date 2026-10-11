#!/usr/bin/env python3
"""Real Chromium STEP1 UI boot smoke; Tesseract CDN intentionally stubbed.

This tests script loading, application initialization, manual dialogs, file
selection and failure feedback. It DOES NOT perform OCR or image recognition.
"""
from __future__ import annotations

import base64
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RELEASE = json.loads((ROOT / "release.json").read_text(encoding="utf-8"))["id"]
TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C9sAAAAASUVORK5CYII="
)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    results = {"mode": "REAL_CHROMIUM_MOCK_TESSERACT_CDN_NO_OCR", "checks": [], "failures": []}
    def check(name, fn):
        try:
            fn()
            results["checks"].append({"name": name, "status": "PASS"})
        except Exception as exc:
            results["failures"].append({"name": name, "error": repr(exc)})
            raise
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(service_workers="block")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                # Do not rely on external CDNs to load UI code for this boot test.
                # Never claim that Tesseract or OCR itself has been tested.
                page.route(TESSERACT_URL, lambda r: r.fulfill(
                    status=200, content_type="application/javascript",
                    body="window.Tesseract={createWorker:()=>{throw Error('OCR stub forbidden');}};"))
                url = f"http://127.0.0.1:{port}/?release={RELEASE}"
                check("HTTP 200 startup", lambda: (
                    None if page.goto(url, wait_until="domcontentloaded", timeout=20000).status == 200
                    else (_ for _ in ()).throw(AssertionError("HTTP not 200"))))
                check("All preserved runtime scripts load and bind", lambda:
                    page.wait_for_function(
                        "()=>!!window.POKESLEEP_MASTER&&"
                        "window.POKESLEEP_MASTER.pokemon.length===249&&"
                        "typeof window.POKESLEEP_CLASSIFIER?.classify==='function'&&"
                        "document.querySelector('#run')?.onclick===null",
                        timeout=20000))
                check("Verified shared master adopted before classifier", lambda:
                    page.wait_for_function(
                        "()=>window.POKESLEEP_SHARED_MASTER?.getStatus().source==='pinned-ai-v27'&&"
                        "window.POKESLEEP_MASTER?.pokemon.length===249&&"
                        "typeof window.POKESLEEP_CSV_GATE?.inspect==='function'",
                        timeout=15000))
                check("CSV filename sequence is minute only", lambda: _check_names(page))
                check("PWA manifest includes exact 192/512 Pixel maskable icons", lambda:
                    _assert(page.evaluate("""async () => {
                      const response=await fetch('./manifest.webmanifest',{cache:'no-store'});
                      if(!response.ok)return false;
                      const data=await response.json();
                      const entries=data.icons||[];
                      const ok=dimension=>entries.some(x=>
                        x.sizes===dimension+'x'+dimension &&
                        x.purpose==='maskable' &&
                        x.src==='./icons/icon-maskable-'+dimension+'.png');
                      return ok(192)&&ok(512);
                    }"""),"Manifest lacks independently declared maskable icons"))
                # Close the first-visit tips if present; this is not a test of tips styling.
                if page.locator("#tipsDialog").evaluate("(el)=>el.open"):
                    page.locator("#tipsClose").click()
                check("Initially CSV export is disabled", lambda:
                      _assert(page.locator("#csv").is_disabled(), "CSV is enabled with no records"))
                check("Reject unsupported attachment with visible error", lambda:
                      _reject_unsupported(page))
                check("Select valid PNG without launching OCR", lambda:
                      _select_png(page))
                check("No uncaught JavaScript exceptions", lambda:
                      _assert(not errors, "Uncaught JS errors: " + repr(errors)))
                context.close()
                # Independent PWA cache test: preserve offline availability of
                # the NEW local assets. CDN OCR binaries are deliberately out of
                # scope and are not claimed as offline-capable.
                pwa=browser.new_context(service_workers="allow")
                try:
                    live=pwa.new_page()
                    live.route(TESSERACT_URL, lambda r: r.fulfill(
                        status=200, content_type="application/javascript",
                        body="window.Tesseract={createWorker:()=>{throw Error('OCR stub forbidden');}};"))
                    live.goto(url,wait_until="domcontentloaded",timeout=20000)
                    check("PWA caches STEP2 local master and CSV modules",lambda:
                        live.wait_for_function("""async ()=>{
                          if(!window.POKESLEEP_CSV_GATE)return false;
                          const cacheNames=await caches.keys();
                          const key=cacheNames.find(k=>k.endsWith('-step3-dev-android-roi-review')||k.endsWith('-step3-dev-android-roi-review-iconsv1'));
                          if(!key)return false;
                          const cache=await caches.open(key);
                          const release=window.__PUBLIC_RELEASE_ID__;
                          for(const path of ['shared_master.js','shared/MASTER_DATA.json','android_roi.js','csv_gate.js','app.js','icons/icon-maskable-192.png','icons/icon-maskable-512.png']){
                            const req=new URL(path,location.href);
                            req.searchParams.set('release',release);
                            req.searchParams.set('step2','sharedcsv-v1');
                            req.searchParams.set('step3','androidroi-v1');
                            if(!(await cache.match(req.toString())))return false;
                          }
                          return true;
                        }""",timeout=25000))
                finally:
                    pwa.close()
                degraded=browser.new_context(service_workers="block")
                try:
                    fallback_page=degraded.new_page()
                    fallback_page.route(TESSERACT_URL,lambda r:r.fulfill(
                        status=200,content_type="application/javascript",body="window.Tesseract={};"))
                    # Simulate a tampered or incomplete local master response.
                    fallback_page.route("**/shared/MASTER_DATA.json*",lambda r:r.fulfill(
                        status=200,content_type="application/json",body='{"cutoff":"1900-01-01"}'))
                    fallback_page.goto(url,wait_until="domcontentloaded",timeout=20000)
                    check("Corrupt shared master safely falls back to complete legacy classifier",lambda:
                        fallback_page.wait_for_function(
                            "()=>window.POKESLEEP_SHARED_MASTER?.getStatus().source==='legacy-fallback'&&"
                            "window.POKESLEEP_MASTER?.pokemon.length===249&&"
                            "typeof window.POKESLEEP_CLASSIFIER?.classify==='function'",
                            timeout=20000))
                finally:
                    degraded.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    results["status"] = "PASS" if not results["failures"] else "FAIL"
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return results


def _check_names(page):
    names=page.evaluate("""async ()=>{
      const d=new Date(2026,9,12,14,35,59),g=window.POKESLEEP_CSV_GATE;
      return [await g.reserveFilename(d),await g.reserveFilename(d)];
    }""")
    _assert(names[0].endswith("20261012_1435.csv"), "Wrong minute stamp: "+repr(names))
    _assert(names[1].endswith("20261012_1435_2.csv"), "Missing suffix: "+repr(names))


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)


def _reject_unsupported(page):
    page.locator("#files").set_input_files({
        "name": "invalid.txt", "mimeType": "text/plain", "buffer": b"not an image"
    })
    page.locator("#appDialog").wait_for(state="visible", timeout=10000)
    _assert("画像を選択できません" in page.locator("#appDialogTitle").inner_text(),
            "Invalid upload did not show expected dialog")
    _assert(page.locator("#run").is_disabled(), "Run enabled after invalid upload")
    page.locator("#appDialogPrimary").click()


def _select_png(page):
    page.locator("#files").set_input_files({
        "name": "dummy.png", "mimeType": "image/png", "buffer": PNG
    })
    page.wait_for_function(
        "()=>!document.querySelector('#run').disabled", timeout=15000)
    _assert(page.locator("#uploadMain").inner_text() == "1枚を選択しました",
            "PNG selection count not reflected in the upload UI")
    _assert(page.locator("#csv").is_disabled(),
            "CSV should remain blocked until analysis")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("STEP1_BROWSER_BOOT_FAILURE:", repr(e))
        raise
