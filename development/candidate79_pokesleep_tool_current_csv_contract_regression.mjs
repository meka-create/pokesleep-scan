import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const contract=JSON.parse(fs.readFileSync(path.join(here,'pokesleep_tool_csv_contract_20261004.json'),'utf8'));
const masterText=fs.readFileSync(path.join(root,'master_data.js'),'utf8').trim();
const master=JSON.parse(masterText.slice(masterText.indexOf('=')+1).trim().replace(/;$/,''));

function sameSet(actual, expected, label){
  assert.deepEqual([...new Set(actual)].sort(),[...new Set(expected)].sort(),label);
}
function extractBlock(startPrefix,endText){
  const start=app.indexOf(startPrefix);
  assert.ok(start>=0,`missing ${startPrefix}`);
  const end=app.indexOf(endText,start);
  assert.ok(end>=0,`missing block end for ${startPrefix}`);
  return app.slice(start,end+endText.length);
}
function sourceLine(prefix){
  const line=app.split('\n').find(x=>x.startsWith(prefix));
  assert.ok(line,`missing source line ${prefix}`);
  return line;
}

// Current public pokesleep-tool import contract (audited 2026-10-04).
const headerLine=sourceLine('const POKESLEEP_TOOL_CSV_HEADER=');
const headerSandbox={}; vm.createContext(headerSandbox);
vm.runInContext(`${headerLine}\nthis.header=POKESLEEP_TOOL_CSV_HEADER;`,headerSandbox);
assert.deepEqual(Array.from(headerSandbox.header),contract.header,'16-column Japanese header must match current importer labels');

sameSet(Object.values(master.ingredients),contract.acceptedIngredientsJa,'all scanner ingredient labels must be accepted by current pokesleep-tool');
sameSet(master.natures.map(x=>x.ja),contract.acceptedNaturesJa,'all scanner nature labels must be accepted by current pokesleep-tool');
sameSet(master.subskills.map(x=>x.ja),contract.acceptedSubskillsJa,'all scanner subskill labels must be accepted by current pokesleep-tool');
const currentSpecies=new Set(contract.acceptedSpeciesJa);
const scannerSpecies=[...new Set(master.pokemon.map(x=>x.name))];
assert.equal(scannerSpecies.length,247,'fixture sanity: scanner species snapshot');
for(const name of scannerSpecies)assert.ok(currentSpecies.has(name),`scanner species not accepted by current pokesleep-tool: ${name}`);
assert.deepEqual(contract.acceptedSpeciesJa.filter(x=>!scannerSpecies.includes(x)).sort(),['タマゲタケ','モロバレル'].sort(),'current tool should only have the two newer species outside scanner master snapshot');

// Evaluate the actual Candidate 79 UI map and CSV-only map. They intentionally differ for two Random variants.
const versatileUiBlock=extractBlock('const MEW_VERSATILE_SKILLS=[','];');
const versatileCsvBlock=extractBlock('const MEW_VERSATILE_CSV_LABEL_BY_KEY=new Map([',']);');
const mapSandbox={Map}; vm.createContext(mapSandbox);
vm.runInContext(`${versatileUiBlock}\nconst MEW_VERSATILE_LABEL_BY_KEY=new Map(MEW_VERSATILE_SKILLS.map(x=>[x.key,x.label]));\n${versatileCsvBlock}\nthis.ui=MEW_VERSATILE_LABEL_BY_KEY;this.csv=MEW_VERSATILE_CSV_LABEL_BY_KEY;`,mapSandbox);
const expectedEntries=Object.entries(contract.versatileCandidatesJa);
assert.equal(mapSandbox.csv.size,12);
assert.deepEqual([...mapSandbox.csv.entries()].sort(),expectedEntries.sort(),'all 12 Mew CSV labels must match current VersatileCandidates translations');
assert.equal(mapSandbox.ui.get('Charge Strength S (Random)'),'エナジーチャージS','in-game/OCR label must remain unchanged');
assert.equal(mapSandbox.ui.get('Dream Shard Magnet S (Random)'),'ゆめのかけらゲットS','in-game/OCR label must remain unchanged');
assert.equal(mapSandbox.csv.get('Charge Strength S (Random)'),'エナジーチャージS (ランダム)');
assert.equal(mapSandbox.csv.get('Dream Shard Magnet S (Random)'),'ゆめのかけらゲットS (ランダム)');
const acceptedVersatile=new Set(Object.values(contract.versatileCandidatesJa));
assert.ok(!acceptedVersatile.has('エナジーチャージS'),'ambiguous old Mew CSV label must not be considered current Versatile format');
assert.ok(!acceptedVersatile.has('ゆめのかけらゲットS'),'ambiguous old Mew CSV label must not be considered current Versatile format');

// Execute the actual CSV main-skill serializer for every Mew Versatile key.
const fnSandbox={Map,MEW_VERSATILE_CSV_LABEL_BY_KEY:mapSandbox.csv};
fnSandbox.detailedMewVersatileSkill=(parsed)=>parsed?.versatileSkill||'';
fnSandbox.mainSkillForOutput=(parsed)=>parsed?.mainSkillOutput||parsed?.mainSkill||'';
vm.createContext(fnSandbox);
vm.runInContext(`${sourceLine('function mewVersatileCsvLabel(')}\n${sourceLine('function mainSkillCsvValue(')}\nthis.mainSkillCsvValue=mainSkillCsvValue;`,fnSandbox);
for(const [key,label] of Object.entries(contract.versatileCandidatesJa)){
  const got=fnSandbox.mainSkillCsvValue({mainSkill:'オールマイティー',versatileSkill:key},{status:'UNIQUE',candidates:['ミュウ']},'');
  assert.equal(got,label,`Mew CSV label mismatch for ${key}`);
}
assert.equal(fnSandbox.mainSkillCsvValue({mainSkill:'食材ゲットS'},{status:'UNIQUE',candidates:['フシギダネ']},''),'食材ゲットS','non-Mew main-skill output must remain unchanged');

const blockerLine=sourceLine('function csvCompatibilityBlockers(');
assert.match(blockerLine,/mewVersatileCsvLabel\(versatileKey\)/,'Mew preflight must also require a current CSV label');
const rowLine=sourceLine('function toPokesleepToolCsvRow(');
assert.match(rowLine,/mainSkillCsvValue/,'all output rows must pass through CSV-specific Mew skill conversion');

console.log('OK: Candidate 79 current pokesleep-tool CSV contract audit passed');
console.log(`  header: ${contract.header.length} fields`);
console.log(`  scanner species accepted: ${scannerSpecies.length}/${scannerSpecies.length}`);
console.log(`  ingredients: ${contract.acceptedIngredientsJa.length}; natures: ${contract.acceptedNaturesJa.length}; subskills: ${contract.acceptedSubskillsJa.length}`);
console.log(`  Mew Versatile CSV labels: ${expectedEntries.length}/${expectedEntries.length}`);
