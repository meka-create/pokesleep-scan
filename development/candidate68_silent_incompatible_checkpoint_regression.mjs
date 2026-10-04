import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));

assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`),'checkpoint release id must follow release.json');
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"),'checkpoint compatibility id must be separate from public release');
assert.ok(app.includes('if(!checkpointMetaCompatible(meta))'),'old/mismatched checkpoint contracts must still be rejected');
assert.ok(!app.includes('meta.releaseId!==CHECKPOINT_RELEASE_ID'),'public release id must not be the compatibility gate');
assert.ok(app.includes('return {incompatible:true,meta,discardError};'),'incompatible checkpoint must still be discarded before restore');
assert.ok(app.includes('if(snapshot.incompatible||snapshot.expired)return;'),'recovery must silently stop after incompatible checkpoint discard');
assert.ok(!app.includes('以前のバージョンの復旧データは使用しません'),'old-version checkpoint notice must not be shown');
assert.ok(!app.includes('バージョン違いによる不整合を防ぐため、以前のバージョンで保存された解析途中データは復元せず破棄しました。'),'old-version checkpoint explanatory modal text must be removed');

console.log('OK: Candidate 68 silently discards incompatible checkpoints without user-facing modal');
