"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const sync=fs.readFileSync(path.join(ROOT,'.github/workflows/independent-master-sync.yml'),'utf8');
const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/pixel142-main-release.yml'),'utf8');
test('daily 04:00 JST and first merge both bootstrap the independent sync',()=>{
 assert.match(sync,/cron: '0 19 \* \* \*'/);
 assert.match(sync,/push:\s*\n\s*branches: \[main\]\s*\n\s*paths: \['\.github\/workflows\/independent-master-sync\.yml'\]/);
 assert.match(sync,/workflow_dispatch:/);
});
test('status publisher always runs after sync, including failed sync',()=>{
 assert.match(sync,/publish-status:\s*\n\s*needs: \[sync\]\s*\n\s*if: always\(\)/);
 assert.match(sync,/SYNC_RESULT: \$\{\{ needs\.sync\.result \}\}/);
 const status=sync.slice(sync.indexOf('  publish-status:'));
 assert.ok(status.startsWith('  publish-status:'), 'status job must remain present');
 assert.match(status,/git add -- master-update-status\.json public_package_manifest\.json/);
 assert.doesNotMatch(status,/git add -A|git add -- shared\/MASTER_DATA\.json/);
});
test('single Pages publisher: do not race automatic branch deployment with a second uploader',()=>{
 // Verified Pages source already builds/deploys main on both normal and bot pushes.
 // A duplicate deploy-pages job causes GitHub Pages HTTP 400 in-progress errors.
 assert.doesNotMatch(sync,/^  deploy-pages:/m);
 assert.ok(!sync.includes('actions/deploy-pages@') && !sync.includes('actions/upload-pages-artifact@'), 'duplicate deployers are forbidden');
 assert.doesNotMatch(sync,/pages: write|id-token: write/);
 const pushes=[...sync.matchAll(/git push origin HEAD:main/g)];
 assert.equal(pushes.length,2,'master and health commits still publish through main');
 assert.match(sync,/cron: '0 19 [*] [*] [*]'/);
});
test('production CI includes deployment graph regression',()=>{
 assert.match(ci,/node --test development\/master_deploy_workflow\.test\.cjs/);
});
