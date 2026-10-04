from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
app=(root/'app.js').read_text()
start=app.index('let choicePickerSelect=')
end=app.index('function resetPreviousAnalysis()', start)
picker_js=app[start:end]

html='''<!doctype html><html><head><meta charset="utf-8"><style>
[hidden]{display:none!important}.choice-picker{position:fixed;inset:0}.choice-picker-panel{position:fixed;left:10px;top:10px;width:360px;background:white}.choice-picker-list{max-height:240px;overflow:auto}.choice-picker-option{display:block;width:100%;height:40px}.choice-picker-search-wrap[hidden]{display:none!important}
</style></head><body>
<div id="host"><select id="testSelect" aria-label="テスト候補"></select></div>
<div id="choicePicker" class="choice-picker" hidden aria-hidden="true">
  <div class="choice-picker-backdrop" data-choice-close></div>
  <section id="choicePickerPanel" class="choice-picker-panel" role="dialog" aria-modal="true" aria-labelledby="choicePickerTitle">
    <button id="choicePickerClose" type="button">×</button>
    <strong id="choicePickerTitle">候補を選択</strong>
    <div id="choicePickerSearchWrap" hidden><input id="choicePickerSearch" type="search"></div>
    <div id="choicePickerList" role="listbox" aria-labelledby="choicePickerTitle"></div>
    <div id="choicePickerCount" hidden></div>
  </section>
</div>
</body></html>'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={"width":1024,"height":800})
    page.set_content(html)
    page.add_script_tag(content="const $=s=>document.querySelector(s); let renderPending=false; function flushPendingRender(){return true;}"+picker_js)
    page.evaluate('''() => {
      const s=document.querySelector('#testSelect');
      for(let i=0;i<12;i++){const o=document.createElement('option');o.value='v'+i;o.textContent='候補 '+i;if(i===5)o.selected=true;s.appendChild(o);}
      enhanceCustomSelect(s);
    }''')
    trigger=page.locator('.custom-select-trigger')
    trigger.focus()
    page.keyboard.press('ArrowDown')
    page.wait_for_timeout(30)
    assert page.locator('#choicePicker').get_attribute('aria-hidden')=='false'
    assert trigger.get_attribute('aria-expanded')=='true'
    assert trigger.get_attribute('aria-haspopup')=='dialog'
    assert trigger.get_attribute('aria-controls')=='choicePicker'
    active=page.locator(':focus')
    assert 'choice-picker-option' in (active.get_attribute('class') or '')
    assert active.get_attribute('data-option-index')=='5'
    # Roving tabindex: only the active option participates in Tab order.
    assert page.locator('#choicePickerList .choice-picker-option[tabindex="0"]').count()==1
    assert page.locator('#choicePickerList .choice-picker-option[tabindex="-1"]').count()==11
    page.keyboard.press('ArrowDown')
    assert page.locator(':focus').get_attribute('data-option-index')=='6'
    page.keyboard.press('Home')
    assert page.locator(':focus').get_attribute('data-option-index')=='0'
    page.keyboard.press('End')
    assert page.locator(':focus').get_attribute('data-option-index')=='11'
    # Tab from the active option (last tabbable control) wraps to close; Shift+Tab wraps back.
    page.keyboard.press('Tab')
    assert page.locator(':focus').get_attribute('id')=='choicePickerClose'
    page.keyboard.press('Shift+Tab')
    assert page.locator(':focus').get_attribute('data-option-index')=='11'
    # Search is visible for 10+ choices. ArrowDown from search enters the option list without moving past active.
    search=page.locator('#choicePickerSearch')
    assert page.locator('#choicePickerSearchWrap').is_visible()
    search.fill('候補 1')
    search.focus()
    page.keyboard.press('ArrowDown')
    focus=page.locator(':focus')
    assert 'choice-picker-option' in (focus.get_attribute('class') or '')
    assert focus.inner_text().startswith('候補 1')
    # Escape closes and restores trigger focus.
    page.keyboard.press('Escape')
    page.wait_for_timeout(30)
    assert page.locator('#choicePicker').get_attribute('aria-hidden')=='true'
    assert trigger.get_attribute('aria-expanded')=='false'
    assert page.locator(':focus').get_attribute('class') and 'custom-select-trigger' in page.locator(':focus').get_attribute('class')
    # ArrowUp on the trigger opens at the last option.
    page.keyboard.press('ArrowUp')
    page.wait_for_timeout(30)
    assert page.locator(':focus').get_attribute('data-option-index')=='11'
    # Enter on focused option selects it and closes the picker (native button keyboard activation).
    page.keyboard.press('Enter')
    page.wait_for_timeout(30)
    assert page.locator('#testSelect').input_value()=='v11'
    assert page.locator('#choicePicker').get_attribute('aria-hidden')=='true'
    browser.close()
print('OK: Candidate 50 step 4 picker focus/keyboard accessibility regression passed')
