#!/usr/bin/env python3
"""Real Chromium UI regression for the 90-second Paddle choice, without actual OCR.

Only synthetic stalled promises are injected; no private screenshots or model
assets are touched. This test verifies the *existing* modal and progress buttons.
"""
from __future__ import annotations

import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        return


def must(ok: bool, message: str):
    if not ok:
        raise AssertionError(message)


def arm(page, name: str):
    page.evaluate("name => window.__auditPaddleArm(name)", name)


def main():
    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT))
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                ctx = browser.new_context(service_workers="block")
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.route(TESSERACT, lambda route: route.fulfill(
                    status=200, content_type="application/javascript",
                    body="window.Tesseract={createWorker:()=>{throw Error('OCR stub');}};"))
                # app.js uses an IIFE: its internal functions are deliberately
                # NOT exposed to page scripts. Inject a test-only hook into
                # the fetched JS text just before the closing IIFE marker.
                # No hook is committed to production app.js.
                def serve_instrumented_app(route):
                    response=route.fetch()
                    original=response.body().decode("utf-8")
                    marker="setTimeout(()=>{void initCheckpointRecovery();},0);"
                    must(original.count(marker)==1,"Failed to find one production IIFE test injection point")
                    hook="""
                    window.__auditPaddleArm = name => {
                      paddleSkipForBatch=false;
                      paddleOcr=null;
                      paddleInitPromise=new Promise(resolve=>{window.__auditPaddleReady=resolve;});
                      window.__auditPaddleOutcome='waiting';
                      window.__auditPaddleProm=ensurePaddle(0,1)
                        .then(()=>{window.__auditPaddleOutcome='ready';})
                        .catch(e=>{window.__auditPaddleOutcome=String(e.message||e);});
                      window.__auditPaddleName=name;
                    };
                    window.__auditPaddleOtherWarning = () => showAppDialog({
                      title:'別の保存警告', message:'自動復元保存に関する警告',
                      primaryLabel:'閉じる', tone:'warning'
                    });
                    """
                    route.fulfill(status=200,content_type="application/javascript",
                                  body=original.replace(marker,hook+marker))
                page.route("**/app.js*",serve_instrumented_app)
                page.goto(f"http://127.0.0.1:{server.server_port}/",
                          wait_until="domcontentloaded", timeout=20000)
                page.wait_for_function(
                    "() => !!window.POKESLEEP_MASTER && "
                    "typeof window.POKESLEEP_CSV_GATE?.inspect==='function' && "
                    "typeof window.__auditPaddleArm==='function'",
                    timeout=20000)
                if page.locator("#tipsDialog").evaluate("(el)=>el.open"):
                    page.locator("#tipsClose").click()
                page.clock.install()
                arm(page, "explicit-choice")
                must(page.locator("#paddleWaitSwitch").is_hidden(),
                     "Tesseract-only switch must be hidden before 90 seconds")
                page.clock.fast_forward(90_000)
                page.locator("#appDialog").wait_for(state="visible", timeout=8000)
                must("高精度解析の準備" in page.locator("#appDialogTitle").inner_text(),
                     "90-second modal must show the original Japanese UX")
                must(page.locator("#appDialogPrimary").inner_text()=="待機を続ける",
                     "primary button must keep full nickname accuracy")
                page.locator("#appDialogPrimary").click()
                page.locator("#paddleWaitSwitch").wait_for(state="visible", timeout=8000)
                page.locator("#paddleWaitSwitch").click()
                page.wait_for_function(
                    "()=>window.__auditPaddleOutcome.includes('ユーザー選択')",
                    timeout=8000)
                must(page.locator("#paddleWaitSwitch").is_hidden(),
                     "switch must disappear after Tesseract-only selection")
                must(page.locator("#appDialog").is_hidden(),
                     "choice modal must be closed after explicit selection")
                # A different warning interrupting the choice is not consent
                # to downgrade; the in-flight nickname preparation must remain.
                arm(page,"preemption")
                page.clock.fast_forward(90_000)
                page.locator("#appDialog").wait_for(state="visible", timeout=8000)
                page.evaluate("() => { void window.__auditPaddleOtherWarning(); }")
                must(page.locator("#appDialogTitle").inner_text()=="別の保存警告",
                     "replacement warning must be displayed")
                must(page.evaluate("window.__auditPaddleOutcome")=="waiting",
                     "a replaced 90-second dialog must not auto-skip Paddle")
                page.locator("#appDialogPrimary").click()
                page.locator("#paddleWaitSwitch").wait_for(state="visible",timeout=8000)
                page.evaluate("window.__auditPaddleReady({predict(){return [];}})")
                page.wait_for_function(
                    "()=>window.__auditPaddleOutcome==='ready'", timeout=8000)
                must(page.locator("#paddleWaitSwitch").is_hidden(),
                     "switch must disappear after engine readiness")
                # Protect unrelated confirmations that predate the 90-second timer.
                arm(page, "existing-warning")
                page.evaluate("() => { void window.__auditPaddleOtherWarning(); }")
                page.locator("#appDialog").wait_for(state="visible", timeout=8000)
                page.clock.fast_forward(90_000)
                must(page.locator("#appDialogTitle").inner_text()=="別の保存警告",
                     "90-second Paddle notice must not replace an existing warning")
                must(page.evaluate("window.__auditPaddleOutcome")=="waiting",
                     "Paddle must keep waiting if another confirmation is already open")
                must(page.locator("#paddleWaitSwitch").get_attribute("hidden") is None,
                     "non-blocking Tesseract-only switch should remain available")
                page.locator("#appDialogPrimary").click()
                page.evaluate("window.__auditPaddleReady({predict(){return [];}})")
                page.wait_for_function(
                    "()=>window.__auditPaddleOutcome==='ready'", timeout=8000)
                must(page.locator("#paddleWaitSwitch").is_hidden(),
                     "switch must disappear after the prepared engine is ready")
                must(not errors, "Uncaught browser errors: "+repr(errors))
                print("PASS Chromium Paddle 90-second modal, explicit skip, warning preemption, existing dialog protection and late ready")
                ctx.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
