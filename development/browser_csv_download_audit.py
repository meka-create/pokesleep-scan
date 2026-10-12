#!/usr/bin/env python3
"""Real Chromium CSV download integration with synthetic, explicitly marked
test-only data. No screenshot OCR and no changes to checked-in runtime app.js."""
from __future__ import annotations
import csv
import functools
import http.server
import io
import json
import re
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RELEASE=json.loads((ROOT/"release.json").read_text(encoding="utf-8"))["id"]
CDN="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"
JS=(ROOT/"app.js").read_text(encoding="utf-8")
HOOK="setTimeout(()=>{void initCheckpointRecovery();},0);"
assert JS.count(HOOK)==1
INSTRUMENTED=JS.replace(HOOK,'''window.__STEP2_AUDIT__={
  setRows:rows=>{results=rows;},
  runExport:()=>downloadCSV(),
  runCopy:()=>copyCSV(),
  check:()=>({name:typeof diagnosticsJsonFilename(new Date()),
              raw:typeof diagnosticRawCsvFilename(new Date())}),
  testMew:()=>{
    const species='ミュウ',profile=manualProfilesForSpecies(species)[0];
    const r={
     file:'synthetic-mew.png',speciesManualOverride:species,
     classification:{status:'UNIQUE',candidates:[species],hits:[],profiles:[],stages:{mainSkill:[species]}},
     inference:{status:'UNIQUE',candidates:[species],hits:[],profiles:[],stages:{mainSkill:[species]}},
     parsed:{nickname:'テストミュウ',nicknameNeedsReview:false,level:10,skillLevel:1,
      mainSkill:'オールマイティー',versatileSkill:MEW_VERSATILE_SKILLS[0].key,
      nature:'てれや',subs:[{value:POKESLEEP_MASTER.subskills[0].ja,needsReview:false},
       ...Array.from({length:4},()=>({value:'',needsReview:false}))]},
     foods:profile.map(name=>({name,needsReview:false})),raw:{}
    };
    results=[r];r.manualDraft=makeManualDraft(r);r.manualEditOpen=true;
    document.querySelector('#resultsCard').hidden=false;
    render();
    const csv=toPokesleepToolCsvRow(r);
    return {csv,errors:manualDraftErrors(r.manualDraft),
     gate:POKESLEEP_CSV_GATE.inspect(buildCsvText(),POKESLEEP_MASTER).ok};
  },
  testCarry:()=>{
    const species='ジュカイン',p=POKESLEEP_MASTER.pokemon.find(x=>x.name===species);
    const r={
      file:'synthetic-carry.png',speciesManualOverride:species,
      inference:{status:'UNIQUE',candidates:[species],
        hits:[{pokemon:species,calculatedCarry:26},{pokemon:species,calculatedCarry:32}],
        profiles:[],stages:{mainSkill:[species],helpSp:[species]}},
      classification:{status:'UNIQUE',candidates:[species],hits:[],profiles:[]},
      parsed:{nickname:'所持数確認',carry:null,carryNeedsReview:true,
        level:28,sp:0,skillLevel:1,mainSkill:p.mainSkill,nature:'てれや',
        subs:POKESLEEP_MASTER.subskills.slice(0,5).map(x=>({value:x.ja,needsReview:false}))},
      foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false})),raw:{}
    };
    results=[r];document.querySelector('#resultsCard').hidden=false;render();
    return {options:carryManualChoices(r),hasControl:!!document.querySelector('.carryedit')};
  },
  carryResult:()=>({parsed:results[0].parsed,review:resultReviewState(results[0])})
};
'''+HOOK)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,fmt,*args):pass


def check(cond,msg):
    if not cond:raise AssertionError(msg)


def main():
    srv=http.server.ThreadingHTTPServer(("127.0.0.1",0),
        functools.partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    port=srv.server_address[1]
    evidence={"scope":"Chromium real Blob downloads; test-only synthetic results; OCR NOT EXECUTED",
              "checks":[]}
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            try:
                context=browser.new_context(accept_downloads=True,service_workers="block")
                page=context.new_page()
                page.route(CDN,lambda r:r.fulfill(status=200,
                    content_type="application/javascript",body="window.Tesseract={};"))
                page.route(re.compile(r"/app\.js\?"),lambda r:r.fulfill(
                    status=200,content_type="application/javascript",body=INSTRUMENTED))
                page.goto("http://127.0.0.1:"+str(port)+"/?release="+RELEASE,
                          wait_until="domcontentloaded",timeout=20000)
                page.wait_for_function("() => !!window.__STEP2_AUDIT__ && !!window.POKESLEEP_CSV_GATE",timeout=20000)
                if page.locator("#tipsDialog").evaluate("(e)=>e.open"):
                    page.locator("#tipsClose").click()
                check(page.evaluate("() => {try {return window.__STEP2_AUDIT__.check().raw==='string'}catch(e){return false}}"),
                      "Diagnostic CSV timestamp regression")
                evidence["checks"].append("diagnostic filenames callable")

                # Create a semantically valid, synthetic row. No private images.
                page.evaluate("""()=>{
                  const p=POKESLEEP_MASTER.pokemon.find(x=>x.name==='フシギダネ');
                  const subs=POKESLEEP_MASTER.subskills.slice(0,5).map(x=>({value:x.ja,needsReview:false}));
                  const food=Array.from({length:3},()=>({name:p.ing1.name,needsReview:false}));
                  const fake={
                    file:'audit-synthetic.png',speciesManualOverride:p.name,
                    classification:{status:'UNIQUE',candidates:[p.name],hits:[{ribbonTier:4}]},
                    parsed:{nickname:'監査,"テスト"',nicknameNeedsReview:false,
                      level:10,skillLevel:1,mainSkill:p.mainSkill,
                      nature:'てれや',subs},
                    foods:food
                  };
                  window.__STEP2_AUDIT__.setRows([fake]);
                  document.querySelector('#resultsCard').hidden=false;
                  document.querySelector('#csv').disabled=false;
                }""")
                downloads=[]
                for i in range(2):
                    with page.expect_download(timeout=10000) as info:
                        page.locator("#csv").click()
                    item=info.value
                    name=item.suggested_filename
                    raw=Path(item.path()).read_bytes()
                    check(not raw.startswith(b"\xef\xbb\xbf"),"Unexpected BOM in actual download")
                    check(b"\r" not in raw,"Unexpected CR in actual download")
                    rows=list(csv.reader(io.StringIO(raw.decode("utf-8"),newline=""),strict=True))
                    check(len(rows)==2 and len(rows[1])==16,"CSV download row or column count")
                    check(rows[1][0]=='監査,"テスト"',"Nickname quoting not round-tripped")
                    check(rows[1][14]=='0',"Inferred ribbon threshold leaked as observed hours")
                    check(rows[1][15]=='0',"Unobserved shiny should default 0")
                    downloads.append(name)
                check(downloads[0]!=downloads[1],"Two files used identical names")
                check(re.search(r"\d{8}_\d{4}\.csv$",downloads[0]) is not None,
                      "First filename must contain minute only")
                check(re.search(r"\d{8}_\d{4}_2\.csv$",downloads[1]) is not None,
                      "Second filename must have ordinal suffix")
                evidence["checks"].append("two physical Blob CSV downloads, valid rows and numbered names")

                # Invalid species/level from the app's row writer must fail at
                # the CSV gate rather than initiate a download.
                page.evaluate("""()=>{
                  const r=window.__STEP2_AUDIT__;
                  const p=POKESLEEP_MASTER.pokemon.find(x=>x.name==='フシギダネ');
                  const subs=POKESLEEP_MASTER.subskills.slice(0,5).map(x=>({value:x.ja}));
                  r.setRows([{speciesManualOverride:p.name,
                     classification:{status:'UNIQUE',candidates:[p.name],hits:[]},
                     parsed:{nickname:'bad',level:999,skillLevel:1,mainSkill:p.mainSkill,
                             nature:'てれや',subs},
                     foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false}))}]);
                }""")
                page.locator("#csv").click()
                page.locator("#appDialog").wait_for(state="visible",timeout=10000)
                check("CSV出力前の確認が必要です" in page.locator("#appDialogTitle").inner_text(),
                      "Invalid CSV not rejected through real download click")
                check("レベルを再確認してください" in page.locator("#appDialogDetails").inner_text(),
                      "Unexpected gate failure reason")
                page.locator("#appDialogPrimary").click()
                evidence["checks"].append("invalid level blocked at actual UI export action")

                # Mew's visible em dash is UI-only; blank 16-column importer values remain empty.
                mew=page.evaluate("window.__STEP2_AUDIT__.testMew()")
                check(not mew["errors"],"Mew manual draft unexpectedly invalid: "+str(mew["errors"]))
                check(mew["gate"],"Mew 16-column importer CSV failed validation")
                check(mew["csv"][10:14]==["","","",""],"Mew missing subskills were not blank CSV cells")
                check("―" not in mew["csv"],"UI dash leaked into Mew CSV")
                labels=page.locator("select.manual-sub option[value='']").all_text_contents()
                check(len(labels)==5 and all(v=="―" for v in labels),
                      "Mew's editable empty subskills should display em dash")
                evidence["checks"].append("Mew manual empty subskills display dash but export blank CSV cells")

                # Manually observed carry values remain enterable when hidden
                # ribbon models disagree with correct on-screen capacity.
                carry=page.evaluate("window.__STEP2_AUDIT__.testCarry()")
                check(carry["hasControl"],"Missing carry correction control")
                check(carry["options"]==[26,32],"Unexpected synthetic classifier values")
                selector=page.locator("select.carryedit")
                visible_debug=page.evaluate("""() => {
                  let el=document.querySelector('select.carryedit'),stack=[];
                  while(el){const st=getComputedStyle(el);
                   stack.push({name:el.tagName,id:el.id,cls:el.className,
                     hidden:el.hidden,display:st.display,visibility:st.visibility,
                     rect:el.getBoundingClientRect().height});el=el.parentElement;}
                  return {stack,reviewOnly:document.querySelector('#reviewOnly')?.checked,
                    count:document.querySelectorAll('#tbl tbody tr').length};
                }""")
                check(selector.is_visible(),"Hidden carry editor: "+str(visible_debug))
                check(selector.locator("option[value='27']").count()==0,
                      "Unexpected out-of-model shortcut")
                selector.select_option("manual")
                entry=page.locator("input.carrymanual")
                check(entry.is_visible(),"Manual carry field not revealed")
                entry.fill("251")
                check(page.locator("button.carryconfirm").is_disabled(),
                      "Out-of-bounds carry was enabled")
                entry.fill("27")
                page.locator("button.carryconfirm").click()
                fixed=page.evaluate("window.__STEP2_AUDIT__.carryResult()")
                check(fixed["parsed"]["carry"]==27 and fixed["parsed"]["carryManualConfirmed"],
                      "Explicitly confirmed carry was not persisted")
                check(fixed["parsed"]["carryVerificationOutOfModel"],
                      "Audit trail failed to record classifier disagreement")
                check(not fixed["review"]["carry"],
                      "Explicitly verified carry is still flagged missing")
                evidence["checks"].append("Chromium carry editor confirms out-of-model game values safely")
                context.close()
            finally:
                browser.close()
    finally:
        srv.shutdown()
        srv.server_close()
    print(json.dumps({"status":"PASS",**evidence},ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
