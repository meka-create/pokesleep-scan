import fs from 'node:fs';
import assert from 'node:assert/strict';
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8')).id;
assert.equal(release,'2026-10-05-candidate94-pwa-clean-url-stable-manifest');
assert.ok(index.includes('href="./manifest.webmanifest"'));
assert.ok(!index.includes('manifest.webmanifest?release='));
assert.ok(sw.includes("'./manifest.webmanifest'"));
assert.ok(!sw.includes("versioned('./manifest.webmanifest')"));
assert.ok(index.includes("current.searchParams.delete('release')"));
assert.ok(index.includes("current.searchParams.delete('_')"));
assert.ok(index.includes("history.replaceState(null,'',current.toString())"));
assert.ok(index.includes('location.replace(current.toString())'));
assert.equal(manifest.id,'./');
assert.equal(manifest.start_url,'./');
assert.equal(manifest.scope,'./');
assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons)assert.ok(icon.src.includes(`release=${release}`));

// Execute the release-navigation behavior with a tiny browser mock.
const fnMatch=index.match(/const moveToRelease=id=>\{[\s\S]*?\n  \};/);
assert.ok(fnMatch,'moveToRelease must be extractable');
const fnExpr=fnMatch[0].replace(/^const moveToRelease=/,'(').replace(/;$/,')');
const makeCtx=href=>({
  URL,
  location:{href,replaceCalls:[],replace(v){this.replaceCalls.push(v);}},
  history:{calls:[],replaceState(_a,_b,v){this.calls.push(v);}}
});
{
  const ctx=makeCtx(`https://example.test/pokesleep-scan/?release=${release}`);
  const moveToRelease=Function('URL','location','history',`return ${fnExpr}`)(ctx.URL,ctx.location,ctx.history);
  assert.equal(moveToRelease(release),false);
  assert.equal(ctx.location.replaceCalls.length,0,'matching release must not reload again');
  assert.equal(ctx.history.calls.length,1,'matching transient release URL must be cleaned');
  assert.equal(ctx.history.calls[0],'https://example.test/pokesleep-scan/');
}
{
  const ctx=makeCtx('https://example.test/pokesleep-scan/');
  const moveToRelease=Function('URL','location','history',`return ${fnExpr}`)(ctx.URL,ctx.location,ctx.history);
  assert.equal(moveToRelease(release),true);
  assert.equal(ctx.history.calls.length,0);
  assert.equal(ctx.location.replaceCalls.length,1,'clean stale/current URL must use one cache-busting navigation');
  assert.equal(ctx.location.replaceCalls[0],`https://example.test/pokesleep-scan/?release=${release}`);
}
console.log('OK: Candidate94 clean visible URL + stable manifest PWA regression passed');
