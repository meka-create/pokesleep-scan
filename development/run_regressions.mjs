import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const nodeTests=[
  'candidate48_pokesleep_csv_roundtrip.mjs',
  'candidate50_classifier100_replay.mjs',
  ...fs.readdirSync(dir).filter(x=>x.endsWith('_regression.mjs')).sort()
];
let failures=0;
for(const file of [...new Set(nodeTests)]){
  const r=spawnSync(process.execPath,[path.join(dir,file)],{encoding:'utf8'});
  process.stdout.write(`\n=== ${file} ===\n${r.stdout||''}`);
  if(r.stderr)process.stderr.write(r.stderr);
  if(r.status!==0){failures++;process.stderr.write(`FAILED (${r.status}) ${file}\n`);}
}
const py='candidate50_step4_picker_accessibility_regression.py';
const pr=spawnSync('python3',[path.join(dir,py)],{encoding:'utf8'});
process.stdout.write(`\n=== ${py} ===\n${pr.stdout||''}`);
if(pr.stderr)process.stderr.write(pr.stderr);
if(pr.status!==0){failures++;process.stderr.write(`FAILED (${pr.status}) ${py}\n`);}
if(failures)throw new Error(`${failures} regression test(s) failed`);
console.log('\nOK: complete portable regression suite passed');
