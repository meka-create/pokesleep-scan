import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function sourceLine(prefix) {
  const line = app.split('\n').find((x) => x.startsWith(prefix));
  assert.ok(line, `missing source line: ${prefix}`);
  return line;
}

const actualSource = [
  sourceLine('function csvCell('),
  sourceLine('const POKESLEEP_TOOL_CSV_HEADER='),
  sourceLine('function csvFoodResolvedForPokesleepTool('),
  sourceLine('function csvCompatibilityBlockers('),
  sourceLine('function foodCsvValue('),
  sourceLine('function mainSkillCsvValue('),
  sourceLine('function ribbonCsvValue('),
  sourceLine('function shinyCsvValue('),
  sourceLine('function toPokesleepToolCsvRow('),
  sourceLine('function buildCsvText('),
].join('\n');

const mewVersatileMap = new Map([
  ['Charge Strength S (Random)','エナジーチャージS (ランダム)'],
  ['Charge Strength M','エナジーチャージM'],
  ['Dream Shard Magnet S (Random)','ゆめのかけらゲットS (ランダム)'],
  ['Ingredient Magnet S','食材ゲットS'],
  ['Charge Energy S','げんきチャージS'],
  ['Energizing Cheer S','げんきエールS'],
  ['Energy for Everyone S','げんきオールS'],
  ['Tasty Chance S','料理チャンスS'],
  ['Cooking Power-Up S','料理パワーアップS'],
  ['Extra Helpful S','おてつだいサポートS'],
  ['Metronome','ゆびをふる'],
  ['Berry Burst','きのみバースト'],
]);
const sandbox = {
  console,
  results: [],
  NO_FOOD: '―',
  MEW_VERSATILE_KEYS: new Set(mewVersatileMap.keys()),
  detailedMewVersatileSkill(parsed) {
    return parsed?.versatileSkill || '';
  },
  mewVersatileSkillLabel(key) {
    return mewVersatileMap.get(key) || '';
  },
  mewVersatileCsvLabel(key) {
    return mewVersatileMap.get(key) || '';
  },
  chosenSpecies(r) {
    if (r?.speciesManualOverride) return r.speciesManualOverride;
    const c = r?.classification;
    return c?.status === 'UNIQUE' && c?.candidates?.length === 1 ? c.candidates[0] : '';
  },
  noneFoodAllowed(species, index) {
    return (species === 'ミュウ' && index === 2) || (species === 'ダークライ' && (index === 1 || index === 2));
  },
  mainSkillForOutput(parsed) {
    return parsed.mainSkillOutput || parsed.mainSkill || '';
  },
  sleepTogetherValue(classification) {
    return classification?.sleepTogetherValue ?? '';
  },
  subskillReviewSlots(r) {
    return (r?.parsed?.subs||[]).map((x,i)=>x?.needsReview?i:-1).filter(i=>i>=0);
  },
};
vm.createContext(sandbox);
vm.runInContext(`${actualSource}\nthis.__api={csvCell,POKESLEEP_TOOL_CSV_HEADER,csvFoodResolvedForPokesleepTool,csvCompatibilityBlockers,foodCsvValue,mainSkillCsvValue,ribbonCsvValue,shinyCsvValue,toPokesleepToolCsvRow,buildCsvText};`, sandbox);
const api = sandbox.__api;

const confirmSource = sourceLine('async function confirmCsvAction(');
assert.match(confirmSource, /csvCompatibilityBlockers\(\)/, 'save/copy confirmation must run compatibility preflight first');
assert.match(confirmSource, /return false/, 'unsafe CSV must not have an override path');
const buildSource = sourceLine('function buildCsvText(');
assert.match(buildSource, /results\.map\(toPokesleepToolCsvRow\)/, 'every result must remain one output row');
assert.ok(!/results\.filter/.test(buildSource), 'CSV builder must not silently filter result rows');

assert.equal(api.POKESLEEP_TOOL_CSV_HEADER.length, 16);
assert.deepEqual(Array.from(api.POKESLEEP_TOOL_CSV_HEADER), ['ニックネーム','ポケモン','レベル','スキルレベル','食材1','食材2','食材3','メインスキル','せいかく','Lv10','Lv25','Lv50','Lv70','Lv80','一緒に眠った時間','色違い']);
assert.equal(api.csvCell('A,B'), '"A,B"');
assert.equal(api.csvCell('A"B'), '"A""B"');

const subs = ['きのみの数S','おてつだいボーナス','', 'スキル確率アップM','最大所持数アップL'];
function result({file='x.png',species='フシギダネ',foods=['あまいミツ','あんみんトマト','ほっこりポテト'],foodReview=[],nickname='テスト, "A"',mainSkill='食材ゲットS',mainSkillOutput='',versatileSkill='',sleepTogetherValue=0,shiny=false,subsValue=subs}={}) {
  return {
    file,
    speciesManualOverride:'',
    parsed:{nickname,level:60,skillLevel:3,mainSkill,mainSkillOutput,versatileSkill,nature:'きまぐれ',subs:subsValue.map(value=>({value})),shiny},
    foods:foods.map((name,i)=>({name,needsReview:foodReview.includes(i)})),
    classification: species ? {status:'UNIQUE',candidates:[species],sleepTogetherValue} : {status:'AMBIGUOUS',candidates:['フシギダネ','フシギソウ'],sleepTogetherValue},
  };
}

// A fully resolved normal row is exportable, remains 16 columns, and uses pokesleep-tool ingredient semantics.
sandbox.results=[result()];
let blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,false);
let text=api.buildCsvText();
assert.equal(text.charCodeAt(0), 'ニ'.charCodeAt(0), 'must not prepend UTF-8 BOM');
assert.ok(!text.includes('\r'), 'must use LF only');

function parseCsv(text) {
  const rows=[]; let row=[], field='', i=0, quoted=false;
  while (i < text.length) {
    const ch=text[i];
    if (quoted) {
      if (ch==='"' && text[i+1]==='"') { field+='"'; i+=2; continue; }
      if (ch==='"') { quoted=false; i++; continue; }
      field+=ch; i++; continue;
    }
    if (ch==='"') { quoted=true; i++; continue; }
    if (ch===',') { row.push(field); field=''; i++; continue; }
    if (ch==='\n') { row.push(field); rows.push(row); row=[]; field=''; i++; continue; }
    field+=ch; i++;
  }
  row.push(field); rows.push(row);
  return rows;
}

const rows=parseCsv(text);
assert.equal(rows.length,2);
assert.equal(rows[0].length,16);
assert.equal(rows[1].length,16);
assert.equal(rows[1][0],'テスト, "A"');
assert.equal(rows[1][11],'', 'blank subskill must remain blank/null-compatible');
const reviewRow=result({subsValue:['睡眠EXPボーナス','最大所持数アップM','スキル確率アップS','げんき回復ボーナス','']});
reviewRow.parsed.subs[0].needsReview=true;
sandbox.results=[reviewRow];
assert.equal(parseCsv(api.buildCsvText())[1][9],'', 'review-required subskill must export blank instead of an uncertain OCR value');
sandbox.results=[result()];

const normalPokemon={ing1:'あまいミツ',ing2:'あんみんトマト',ing3:'ほっこりポテト'};
function importIngredientEquivalent(row,{myth=false,pokemon=normalPokemon}={}) {
  const [ing1,ing2,ing3]=row.slice(4,7).map(x=>x || undefined);
  if (myth) return [ing1,ing2,ing3];
  const slot2=ing2===pokemon.ing1?'A':'B';
  const slot3=ing3===pokemon.ing1?'A':ing3===pokemon.ing2?'B':ing3===pokemon.ing3?'C':'A';
  return `A${slot2}${slot3}`;
}
assert.equal(importIngredientEquivalent(rows[1]),'ABC');

// Mew: display can stay オールマイティー(...), CSV must contain the concrete versatile skill; confirmed ― is blank.
sandbox.results=[result({species:'ミュウ',foods:['ふといながねぎ','ふといながねぎ','―'],mainSkill:'オールマイティー',mainSkillOutput:'オールマイティー (ゆめのかけらゲットS)',versatileSkill:'Dream Shard Magnet S (Random)',sleepTogetherValue:200})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,false);
let mewRow=parseCsv(api.buildCsvText())[1];
assert.equal(mewRow[6],'');
assert.equal(mewRow[7],'ゆめのかけらゲットS (ランダム)');
assert.equal(mewRow[14],'200');
assert.deepEqual(importIngredientEquivalent(mewRow,{myth:true}),['ふといながねぎ','ふといながねぎ',undefined]);

// Mew with unresolved Versatile must block instead of exporting generic オールマイティー.
sandbox.results=[result({species:'ミュウ',foods:['ふといながねぎ','ふといながねぎ','―'],mainSkill:'オールマイティー',versatileSkill:''})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,true);
assert.equal(blockers.versatileRows,1);
assert.equal(api.mainSkillCsvValue(sandbox.results[0].parsed,sandbox.results[0].classification),'');

// Darkrai: confirmed ― in slots 2/3 is allowed and exported as blank cells.
sandbox.results=[result({species:'ダークライ',foods:['とくせんリンゴ','―','―']})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,false);
const darkraiRow=parseCsv(api.buildCsvText())[1];
assert.deepEqual(darkraiRow.slice(4,7),['とくせんリンゴ','','']);

// Unresolved species must block: pokesleep-tool otherwise silently skips that row.
sandbox.results=[result({species:''})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,true);
assert.equal(blockers.speciesRows,1);

// Any unresolved/blank food must block instead of being silently reinterpreted.
sandbox.results=[result({foods:['あまいミツ','','ほっこりポテト']})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,true);
assert.equal(blockers.foodSlots,1);
const unsafeNormalRow=api.toPokesleepToolCsvRow(sandbox.results[0]);
assert.equal(importIngredientEquivalent(unsafeNormalRow),'ABC', 'this fixture happens to map slot2 to B, demonstrating why blank has semantics rather than unknown');

sandbox.results=[result({foodReview:[1]})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,true);
assert.equal(blockers.foodSlots,1);

// Even on mythical slots, blank/unresolved is different from an explicitly confirmed ― and therefore blocks.
sandbox.results=[result({species:'ミュウ',foods:['ふといながねぎ','ふといながねぎ','']})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,true);
assert.equal(blockers.foodSlots,1);

// ― is only safe on species/slots where the classifier profile explicitly allows no food.
sandbox.results=[result({species:'フシギダネ',foods:['あまいミツ','―','ほっこりポテト']})];
blockers=api.csvCompatibilityBlockers();
assert.equal(blockers.blocked,true);
assert.equal(blockers.foodSlots,1);

// Shiny and unknown ribbon follow pokesleep-tool-compatible scalar output.
sandbox.results=[result({shiny:true,sleepTogetherValue:''})];
const scalarRow=api.toPokesleepToolCsvRow(sandbox.results[0]);
assert.equal(scalarRow[14],0);
assert.equal(scalarRow[15],1);

console.log('OK: Candidate 48 pokesleep-tool CSV preflight + round-trip compatibility checks passed');
