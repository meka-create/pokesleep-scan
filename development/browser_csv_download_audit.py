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
  currentRows:()=>results.map(r=>({nature:r.parsed?.nature,natureEffect:r.parsed?.natureEffect})),
  renderRows:()=>{render();},
  currentNicknameRows:()=>results.map(r=>({nickname:r.parsed?.nickname,nicknameReviewDraft:r.parsed?.nicknameReviewDraft??null,needsReview:!!r.parsed?.nicknameNeedsReview})),
  runExport:()=>downloadCSV(),
  runCopy:()=>copyCSV(),
  check:()=>({name:typeof diagnosticsJsonFilename(new Date()),
              raw:typeof diagnosticRawCsvFilename(new Date())}),
  probeSpeedWarning:phase=>{
    // Synthesize per-call timing; no real screenshot or recognizer is used.
    const make=(n,firstMs=2200,extraMs=265)=>{
      const calls=12,p={schema:1,sourceIndex:n,startedAt:new Date().toISOString(),failed:false,
        visibility:{hiddenAtStart:false,hiddenAtEnd:false,hiddenMs:0},
        tesseract:{calls:calls+1,totalMs:firstMs+extraMs*calls,
          byStage:{initialTesseract:{calls:1,totalMs:firstMs}}}};
      scanSpeedObserve({performanceProfile:p});
      return p.speedMonitor;
    };
    if(phase==='warn'){
      scanSpeedReset();isRunning=true;localProgressVisible=true;
      setProgressState('running',{done:0,total:20});
      setFloatingProgress('running',{done:0,total:20});
      for(let n=0;n<4;n++)make(n);
      make(4,6100,720);make(5,6200,725);
      return {summary:scanSpeedSummary(),local:!$('#speedWarning').hidden,
        floating:!$('#floatingSpeedWarning').hidden,
        text:$('#speedWarning').textContent};
    }
    if(phase==='floating'){
      localProgressVisible=false;renderFloatingProgress();scanSpeedRender();
      return {local:!$('#speedWarning').hidden,floating:!$('#floatingSpeedWarning').hidden};
    }
    if(phase==='recover'){
      localProgressVisible=true;scanSpeedRender();
      for(let n=6;n<9;n++)make(n);
      const recovered=scanSpeedSummary();
      const hidden=$('#speedWarning').hidden&&$('#floatingSpeedWarning').hidden;
      scanSpeedReset();isRunning=false;
      setProgressState('complete',{done:20,total:20});
      setFloatingProgress('complete',{done:20,total:20});
      return {summary:recovered,hidden};
    }
    throw Error('Unknown speed-warning probe phase');
  },
  probePerformance:async()=>{
    // Test-only synthetic OCR, never a user image and never production OCR.
    // This records actual Chromium wall-clock time and exercises JSON output.
    if(!results.length)throw Error('No synthetic row is loaded');
    const original=worker;
    const before=JSON.stringify({parsed:results[0].parsed,
      foods:results[0].foods,classification:results[0].classification});
    try{
      scanPerfStart(0);scanPerfStage('initialTesseract');
      worker={recognize:async()=>{await new Promise(r=>setTimeout(r,15));
        return {data:{text:'synthetic-only',words:[]}};}};
      const reading=await trackedWorkerRecognize(null);
      scanPerfStage('resultAssemblyAndPreviews');
      const profile=scanPerfFinish(false);
      results[0].performanceProfile=profile;
      await scanPerfMeasureBatch('workerPrepare',async()=>{
        await new Promise(r=>setTimeout(r,4));});
      const diag=diagnosticObject();
      return {reading:reading.data.text,profile,
        resultProfile:diag.results[0].performanceProfile,
        totals:diag.performanceDiagnostics,
        unchanged:before===JSON.stringify({parsed:results[0].parsed,
          foods:results[0].foods,classification:results[0].classification})};
    }finally{worker=original;scanPerfFinish(true);}
  },
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
  testMissingCarry:()=>{
    const species='フシギダネ',p=POKESLEEP_MASTER.pokemon.find(x=>x.name===species);
    const r={
      file:'synthetic-missing-carry.png',speciesManualOverride:species,
      inference:{status:'UNIQUE',candidates:[species],hits:[],
        profiles:[],stages:{mainSkill:[species],helpSp:[species]}},
      classification:{status:'UNIQUE',candidates:[species],hits:[],profiles:[]},
      parsed:{nickname:'所持数未取得',carry:null,carryNeedsReview:true,
        level:10,sp:1000,helpSeconds:2500,skillLevel:1,
        mainSkill:p.mainSkill,nature:'てれや',
        subs:POKESLEEP_MASTER.subskills.slice(0,5).map(x=>({value:x.ja,needsReview:false}))},
      foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false})),raw:{}
    };
    results=[r];document.querySelector('#resultsCard').hidden=false;
    document.querySelector('#csv').disabled=false;
    render();
    return {row:toPokesleepToolCsvRow(r),
      gate:POKESLEEP_CSV_GATE.inspect(buildCsvText(),POKESLEEP_MASTER).ok,
      blocker:csvCompatibilityBlockers().blocked,
      review:resultReviewState(r),carry:r.parsed.carry,
      hasControls:!!document.querySelector('.carryedit,.carrymanual,.carryconfirm'),
      diagnostics:diagnosticObject().results[0].parsed};
  },
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
                    check(len(rows)==2 and len(rows[1])==18,"CSV download row or column count")
                    check(rows[1][0]=='監査,"テスト"',"Nickname quoting not round-tripped")
                    check(rows[1][15]=='0',"Inferred ribbon threshold leaked as observed hours")
                    check(rows[1][16]=='0',"Unobserved shiny should default 0")
                    downloads.append(name)
                check(downloads[0]!=downloads[1],"Two files used identical names")
                check(re.search(r"\d{8}_\d{4}\.csv$",downloads[0]) is not None,
                      "First filename must contain minute only")
                check(re.search(r"\d{8}_\d{4}_2\.csv$",downloads[1]) is not None,
                      "Second filename must have ordinal suffix")
                evidence["checks"].append("two physical Blob CSV downloads, valid rows and numbered names")


                # Minted Pokemon: export original nature + independent mint flag.
                # No export-choice dialog; a real Blob download and a real
                # clipboard write must both use the new 18-column schema.
                page.evaluate("""()=>{
                  const p=POKESLEEP_MASTER.pokemon.find(x=>x.name==='フシギダネ');
                  const subs=POKESLEEP_MASTER.subskills.slice(0,5).map(x=>({value:x.ja,needsReview:false}));
                  const mk=(nickname,nature,mint)=>({
                    file:'mint-synthetic.png',speciesManualOverride:p.name,
                    classification:{status:'UNIQUE',candidates:[p.name],hits:[]},
                    parsed:{nickname,level:10,skillLevel:1,mainSkill:p.mainSkill,
                      nature,natureEffect:mint?'neutralized':'normal',mintDetection:{applied:mint},subs},
                    foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false}))
                  });
                  window.__STEP2_AUDIT__.setRows([mk('ミント使用','いじっぱり',true),
                                                  mk('ミント未使用','おだやか',false)]);
                }""")
                check(page.locator("#mintExportDialog").count()==0,
                      "Obsolete two-choice export modal must be removed")
                with page.expect_download(timeout=10000) as mint_info:
                    page.locator("#csv").click()
                mint_rows=list(csv.reader(io.StringIO(
                    Path(mint_info.value.path()).read_text(encoding="utf-8"))))
                check(len(mint_rows)==3 and all(len(r)==18 for r in mint_rows),
                      "Real mint download must have 18 columns")
                check(mint_rows[0][9]=="まっしろミント" and mint_rows[0][17]=="お気に入り",
                      "Latest Japanese upstream schema not used")
                check(mint_rows[1][8:10]==["いじっぱり","1"],
                      "Mint used: original nature and usage flag not preserved")
                check(mint_rows[2][8:10]==["おだやか","0"],
                      "Mint unused: original nature or usage flag not preserved")
                check(mint_rows[1][17]=="" and mint_rows[2][17]=="",
                      "Favorites must stay blank until recognized")
                page.evaluate("""()=>{
                    window.__AUDIT_COPIED__=null;
                    Object.defineProperty(navigator,'clipboard',{configurable:true,
                        value:{writeText:async text=>{window.__AUDIT_COPIED__=text;}}});
                    document.querySelector('#copyCsv').disabled=false;
                }""")
                page.locator("#copyCsv").click()
                page.wait_for_function("() => typeof window.__AUDIT_COPIED__ === 'string'",
                                       timeout=8000)
                copied=page.evaluate("window.__AUDIT_COPIED__")
                copied_rows=list(csv.reader(io.StringIO(copied),strict=True))
                check(copied_rows==mint_rows,
                      "Clipboard contents differ from real 18-column mint download")
                persisted=page.evaluate("window.__STEP2_AUDIT__.currentRows()")
                check(persisted==[
                    {"nature":"いじっぱり","natureEffect":"neutralized"},
                    {"nature":"おだやか","natureEffect":"normal"}],
                    "CSV export mutated the original analysis state")
                evidence["checks"].append(
                    "mint: real 18-column download and clipboard retain original natures and independent 1/0 usage flags")

                # OCR may leave the nickname blank, which real upstream accepts.
                # The user must see a warning; saving must still succeed after
                # an explicit choice, without inventing a species nickname.
                page.evaluate("""()=>{
                  const p=POKESLEEP_MASTER.pokemon.find(x=>x.name==='フシギダネ');
                  const subs=POKESLEEP_MASTER.subskills.slice(0,5).map(s=>({value:s.ja,needsReview:false}));
                  window.__STEP2_AUDIT__.setRows([{
                    file:'blank-nickname-mint-synthetic.png',
                    speciesManualOverride:p.name,
                    classification:{status:'UNIQUE',candidates:[p.name],hits:[]},
                    parsed:{nickname:'',nicknameNeedsReview:true,level:10,skillLevel:1,
                      mainSkill:p.mainSkill,nature:'いじっぱり',natureEffect:'neutralized',subs},
                    foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false}))
                  }]);
                }""")
                page.locator("#csv").click()
                page.locator("#appDialog").wait_for(state="visible",timeout=10000)
                check("要確認の項目があります" in page.locator("#appDialogTitle").inner_text(),
                      "Blank nickname must prompt a review warning, not an error")
                check("ニックネーム空欄 1件" in page.locator("#appDialogDetails").inner_text(),
                      "Blank nickname not disclosed in pre-export warning")
                with page.expect_download(timeout=10000) as blank_info:
                    page.locator("#appDialogPrimary").click()
                blank_rows=list(csv.reader(io.StringIO(
                    Path(blank_info.value.path()).read_text(encoding="utf-8")),strict=True))
                check(len(blank_rows)==2 and len(blank_rows[1])==18,
                      "Blank nickname did not result in valid 18-column CSV")
                check(blank_rows[1][0]=="" and blank_rows[1][8:10]==["いじっぱり","1"],
                      "Blank nickname was guessed or original mint/nature was altered")
                evidence["checks"].append(
                    "real Chrome: blank nickname review warning followed by CSV18 download, mint and nature intact")

                # Regression: ordinary (non-review) nickname edit often clears
                # the input before retyping. The CSV must use the new name, not
                # a stale empty base nickname with a hidden review draft.
                page.evaluate("""()=>{
                  const p=POKESLEEP_MASTER.pokemon.find(x=>x.name==='フシギダネ');
                  const subs=POKESLEEP_MASTER.subskills.slice(0,5).map(s=>({value:s.ja,needsReview:false}));
                  window.__STEP2_AUDIT__.setRows([{
                    file:'synthetic-ordinary-nickname.png',
                    speciesManualOverride:p.name,
                    classification:{status:'UNIQUE',candidates:[p.name],hits:[]},
                    parsed:{nickname:'修正前',nicknameNeedsReview:false,level:10,skillLevel:1,
                      mainSkill:p.mainSkill,nature:'いじっぱり',natureEffect:'neutralized',subs},
                    foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false}))
                  }]);
                  window.__STEP2_AUDIT__.renderRows();
                }""")
                nick=page.locator("#tbl tbody .nickedit")
                check(nick.count()==1 and nick.input_value()=="修正前",
                      "Ordinary nickname editor did not render as expected")
                check(page.locator("#tbl tbody .nickname-review").count()==0,
                      "Synthetic ordinary nickname unexpectedly in review mode")
                nick.fill("")
                nick.fill("修正後")
                current=page.evaluate("window.__STEP2_AUDIT__.currentNicknameRows()")
                check(current==[{"nickname":"修正後","nicknameReviewDraft":None,"needsReview":False}],
                      "Ordinary edit did not commit retyped name to CSV backing row")
                with page.expect_download(timeout=10000) as retype_info:
                    page.locator("#csv").click()
                retype_rows=list(csv.reader(io.StringIO(
                    Path(retype_info.value.path()).read_text(encoding="utf-8")),strict=True))
                check(len(retype_rows)==2 and len(retype_rows[1])==18,
                      "Retyped ordinary nickname did not download valid 18-column CSV")
                check(retype_rows[1][0]=="修正後" and retype_rows[1][8:10]==["いじっぱり","1"],
                      "CSV export kept an empty/stale nickname or changed mint/nature")
                # Previously reviewed names must still use the confirm button;
                # no automatic acceptance of uncertain OCR candidates.
                page.evaluate("""()=>{
                  const p=POKESLEEP_MASTER.pokemon.find(x=>x.name==='フシギダネ');
                  const subs=POKESLEEP_MASTER.subskills.slice(0,5).map(s=>({value:s.ja,needsReview:false}));
                  window.__STEP2_AUDIT__.setRows([{
                    file:'synthetic-reviewed-nickname.png',
                    speciesManualOverride:p.name,
                    classification:{status:'UNIQUE',candidates:[p.name],hits:[]},
                    parsed:{nickname:'要確認前',nicknameNeedsReview:true,level:10,skillLevel:1,
                      mainSkill:p.mainSkill,nature:'いじっぱり',natureEffect:'neutralized',subs},
                    foods:Array.from({length:3},()=>({name:p.ing1.name,needsReview:false}))
                  }]);
                  window.__STEP2_AUDIT__.renderRows();
                }""")
                review_nick=page.locator("#tbl tbody .nickname-review .nickedit")
                check(review_nick.count()==1,"Reviewed nickname editor did not render")
                review_nick.fill("")
                review_nick.fill("確認して修正")
                staged=page.evaluate("window.__STEP2_AUDIT__.currentNicknameRows()")[0]
                check(staged=={"nickname":"要確認前",
                              "nicknameReviewDraft":"確認して修正","needsReview":True},
                      "Reviewed nickname changed without manual confirmation")
                page.locator("#tbl tbody .nickconfirm").click()
                confirmed=page.evaluate("window.__STEP2_AUDIT__.currentNicknameRows()")[0]
                check(confirmed["nickname"]=="確認して修正" and not confirmed["needsReview"],
                      "Reviewed nickname confirm did not commit name")
                with page.expect_download(timeout=10000) as confirmed_info:
                    page.locator("#csv").click()
                confirmed_rows=list(csv.reader(io.StringIO(
                    Path(confirmed_info.value.path()).read_text(encoding="utf-8")),strict=True))
                check(confirmed_rows[1][0]=="確認して修正" and confirmed_rows[1][9]=="1",
                      "Confirmed nickname or mint missing from CSV")
                evidence["checks"].append(
                    "real Chrome: ordinary clear/retype persists correct nickname to CSV; reviewed edit requires confirm")

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

                # Mew's visible em dash is UI-only; blank 18-column importer values remain empty.
                mew=page.evaluate("window.__STEP2_AUDIT__.testMew()")
                check(not mew["errors"],"Mew manual draft unexpectedly invalid: "+str(mew["errors"]))
                check(mew["gate"],"Mew 18-column importer CSV failed validation")
                check(mew["csv"][11:15]==["","","",""],"Mew missing subskills were not blank CSV cells")
                check("―" not in mew["csv"],"UI dash leaked into Mew CSV")
                labels=page.locator("select.manual-sub option[value='']").all_text_contents()
                check(len(labels)==5 and all(v=="―" for v in labels),
                      "Mew's editable empty subskills should display em dash")
                evidence["checks"].append("Mew manual empty subskills display dash but export blank CSV cells")

                # Missing carry is OCR-only diagnostic data. It does not
                # require manual entry, block valid CSV or silently fill carry.
                carry=page.evaluate("window.__STEP2_AUDIT__.testMissingCarry()")
                check(not carry["hasControls"],"Removed carry manual controls still rendered")
                check(carry["carry"] is None,"Missing carry was filled without image evidence")
                check(carry["review"]["carry"] is False,"Carry-only review still blocks completion")
                check(not carry["blocker"],"Missing carry blocked exportable CSV fields")
                check(carry["gate"] and len(carry["row"])==18,"Missing-carry CSV was invalid")
                check(carry["diagnostics"]["carryOcrUnresolved"] is True,
                      "Raw carry OCR uncertainty was lost from diagnostics")
                check(carry["diagnostics"]["carry"] is None,
                      "Diagnostic carry was silently filled")
                with page.expect_download(timeout=10000) as info:
                    page.locator("#csv").click()
                carry_csv=Path(info.value.path()).read_text(encoding="utf-8")
                carry_rows=list(csv.reader(io.StringIO(carry_csv)))
                check(len(carry_rows)==2 and len(carry_rows[1])==18,
                      "Missing carry failed real 18-column CSV export")
                evidence["checks"].append(
                    "missing carry: no manual editor, unblocked actual CSV, retained raw diagnostic")
                # Audit the actual DOM and responsive progress switching with
                # simulated per-call delays, not real user screenshots.
                warning=page.evaluate("window.__STEP2_AUDIT__.probeSpeedWarning('warn')")
                check(warning["summary"]["active"] and warning["local"]
                      and not warning["floating"],
                      "Sustained slowdown did not show exactly one visible warning")
                check("解析速度が低下しています" in warning["text"],
                      "Warning UI did not display the required Japanese text")
                floating=page.evaluate("window.__STEP2_AUDIT__.probeSpeedWarning('floating')")
                check(not floating["local"] and floating["floating"],
                      "Warning did not follow the floating progress UI")
                recovered=page.evaluate("window.__STEP2_AUDIT__.probeSpeedWarning('recover')")
                check(not recovered["summary"]["active"] and recovered["hidden"],
                      "Three fast images failed to dismiss both speed warning banners")
                check([e["kind"] for e in recovered["summary"]["events"]]
                      == ["slowdown","recovered"],
                      "Warning transitions missing from diagnostic session summary")
                evidence["checks"].append(
                    "STEP3: real Chromium warning DOM, floating handoff, auto-recovery and diagnostics")
                # STEP 2 readiness: real Chromium, real timing hooks, real
                # downloaded diagnostics JSON, with explicitly synthetic OCR.
                probe=page.evaluate("window.__STEP2_AUDIT__.probePerformance()")
                check(probe["reading"]=="synthetic-only" and probe["unchanged"],
                      "Telemetry changed OCR result fields or mock recognition return")
                profile=probe["profile"]
                check(profile["schema"]==1 and profile["tesseract"]["calls"]==1,
                      "Per-image Tesseract counter was not populated")
                check(profile["tesseract"]["totalMs"]>=10,
                      "Chromium Tesseract wall-clock time was not recorded")
                check(profile["tesseract"]["byStage"]["initialTesseract"]["calls"]==1,
                      "The first-pass OCR time was assigned to the wrong stage")
                check(probe["totals"]["profiledImages"]==1
                      and probe["totals"]["tesseractCalls"]==1
                      and probe["totals"]["workerPrepare"]["calls"]>=1,
                      "Batch/session diagnostics are not populated")
                check(probe["resultProfile"]==profile,
                      "Diagnostic serializer dropped the per-image profile")
                # Exercise the visible user path: menu -> troubleshooting -> save.
                page.locator("#moreBtn").click()
                page.locator("#troubleshootingMenuItem").click()
                page.locator("#troubleshootingDialog").wait_for(state="visible", timeout=10000)
                with page.expect_download(timeout=10000) as diagnostics_info:
                    page.locator("#diag").click()
                diagnostics=json.loads(Path(diagnostics_info.value.path()).read_text(encoding="utf-8"))
                check(diagnostics["results"][0]["performanceProfile"]==profile,
                      "Downloaded diagnostics JSON lost per-image performance timing")
                check(diagnostics["performanceDiagnostics"]["tesseractCalls"]==1,
                      "Downloaded diagnostics JSON lost session timing")
                check(diagnostics["results"][0].get("elapsedMs") is None,
                      "Synthetic test unexpectedly impersonated measured full-image OCR time")
                evidence["checks"].append(
                    "STEP2: real Chromium diagnostic JSON includes per-image OCR and batch timings (synthetic OCR)")
                context.close()
            finally:
                browser.close()
    finally:
        srv.shutdown()
        srv.server_close()
    print(json.dumps({"status":"PASS",**evidence},ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
