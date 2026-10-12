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
 const status=sync.slice(sync.indexOf('  publish-status:'),sync.indexOf('  deploy-pages:'));
 assert.match(status,/git add -- master-update-status\.json public_package_manifest\.json/);
 assert.doesNotMatch(status,/git add -A|git add -- shared\/MASTER_DATA\.json/);
});
test('GITHUB_TOKEN master push always includes an explicit Pages deployment',()=>{
 assert.match(sync,/  deploy-pages:/);
 assert.match(sync,/needs: \[sync, publish-status\]/);
 assert.match(sync,/if: always\(\) && needs\.publish-status\.result == 'success'/);
 assert.match(sync,/pages: write/);
 assert.match(sync,/id-token: write/);
 assert.match(sync,/environment:\s*\n\s*name: github-pages/);
 assert.match(sync,/ref: main[\s\S]*?uses: actions\/upload-pages-artifact@v3[\s\S]*?uses: actions\/deploy-pages@v4/);
 assert.match(sync,/Verify the final public state and its release hashes/);
});
test('production CI includes deployment graph regression',()=>{
 assert.match(ci,/node --test development\/master_deploy_workflow\.test\.cjs/);
});
