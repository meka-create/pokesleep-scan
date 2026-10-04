import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public_package_manifest.json'),'utf8'));

assert.ok(!manifest.files.some(x=>x.path==='public_package_manifest.json'),'package manifest must not hash itself');
for(const item of manifest.files){
  const full=path.join(root,item.path);assert.ok(fs.existsSync(full),`missing ${item.path}`);
  const data=fs.readFileSync(full);
  assert.equal(data.length,item.bytes,`byte mismatch ${item.path}`);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256,`sha mismatch ${item.path}`);
}
assert.ok(fs.existsSync(path.join(root,'assets','ogp-card.png')),'OGP image missing');
assert.match(index,/property="og:image"/);assert.match(index,/name="twitter:card" content="summary_large_image"/);
assert.ok(fs.existsSync(path.join(here,'configure_public_url.mjs')),'public URL configurator missing');

assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`),'public release id remains recorded');
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"),'checkpoint compatibility id missing');
assert.ok(app.includes('compatibilityId:CHECKPOINT_COMPATIBILITY_ID'),'new checkpoint metadata must record compatibility id');
assert.ok(app.includes('function checkpointMetaCompatible(meta)'),'compatibility helper missing');
assert.ok(app.includes("CHECKPOINT_LEGACY_COMPAT_RELEASE_IDS=new Set(['2026-10-04-candidate82-subskill-review-tuning-csv-timestamp','2026-10-04-candidate83-analysis-screen-wake-lock','2026-10-04-candidate84-ogp-share-card'])"));
assert.ok(app.includes('if(!checkpointMetaCompatible(meta))'),'restore must use compatibility id, not public release equality');
assert.ok(!app.includes('meta.releaseId!==CHECKPOINT_RELEASE_ID'),'public release id must not be the compatibility gate');

const compatFn=app.match(/function checkpointMetaCompatible\(meta\)\{[^}]+\}[^}]*\}/)?.[0] || app.match(/function checkpointMetaCompatible\(meta\)\{.*?\}/s)?.[0];
assert.ok(compatFn,'could not extract checkpointMetaCompatible');
const compatCtx={CHECKPOINT_SCHEMA_VERSION:1,CHECKPOINT_COMPATIBILITY_ID:'checkpoint-compat-2026-10-04-v1',CHECKPOINT_LEGACY_COMPAT_RELEASE_IDS:new Set(['2026-10-04-candidate82-subskill-review-tuning-csv-timestamp','2026-10-04-candidate83-analysis-screen-wake-lock','2026-10-04-candidate84-ogp-share-card'])};
vm.createContext(compatCtx);vm.runInContext(compatFn+'\nthis.compat=checkpointMetaCompatible;',compatCtx);
assert.equal(compatCtx.compat({schema:1,compatibilityId:'checkpoint-compat-2026-10-04-v1',releaseId:'future-release'}),true,'same compatibility id must survive public release changes');
assert.equal(compatCtx.compat({schema:1,releaseId:'2026-10-04-candidate84-ogp-share-card'}),true,'Candidate84 legacy checkpoint must migrate');
assert.equal(compatCtx.compat({schema:1,releaseId:'2026-09-01-unknown'}),false,'unknown legacy release must not migrate');
assert.equal(compatCtx.compat({schema:2,compatibilityId:'checkpoint-compat-2026-10-04-v1'}),false,'schema mismatch must still reject');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'candidate85-ogp-'));
for(const name of ['index.html','release.json','public_package_manifest.json'])fs.copyFileSync(path.join(root,name),path.join(tmp,name));
fs.mkdirSync(path.join(tmp,'assets'),{recursive:true});fs.copyFileSync(path.join(root,'assets','ogp-card.png'),path.join(tmp,'assets','ogp-card.png'));
fs.mkdirSync(path.join(tmp,'development'),{recursive:true});fs.copyFileSync(path.join(here,'configure_public_url.mjs'),path.join(tmp,'development','configure_public_url.mjs'));
const run=spawnSync(process.execPath,[path.join(tmp,'development','configure_public_url.mjs'),'https://example.test/tools/bukkomi/','--root',tmp],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr||run.stdout);
const configured=fs.readFileSync(path.join(tmp,'index.html'),'utf8');
assert.ok(configured.includes('<link rel="canonical" href="https://example.test/tools/bukkomi/">'));
assert.ok(configured.includes('<meta property="og:url" content="https://example.test/tools/bukkomi/">'));
assert.ok(configured.includes(`content="https://example.test/tools/bukkomi/assets/ogp-card.png?release=${release.id}"`));
const configuredManifest=JSON.parse(fs.readFileSync(path.join(tmp,'public_package_manifest.json'),'utf8'));
assert.ok(!configuredManifest.files.some(x=>x.path==='public_package_manifest.json'));
assert.equal(configuredManifest.publicUrl.page,'https://example.test/tools/bukkomi/');

console.log('OK: Candidate 85 package manifest, public OGP URL configuration, and checkpoint compatibility split passed');
