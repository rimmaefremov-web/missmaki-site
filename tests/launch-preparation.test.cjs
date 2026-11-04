const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');const {execFileSync}=require('node:child_process');
test('launch package is isolated, preserves site data, removes test tools and prepares a safe fallback without legacy delivery',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mm-launch-')),out=path.join(temp,'package');const source=fs.readFileSync('index.html'),config=fs.readFileSync('shared/config.js');
 try{
  fs.writeFileSync(path.join(temp,'public.json'),JSON.stringify({url:'https://orders.example.com',key:'sb_publishable_TEST_FIXTURE_ONLY'}));
  execFileSync(process.execPath,['scripts/prepare-launch.mjs','--config',path.join(temp,'public.json'),'--output',out]);
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'release-manifest.json')));assert.equal(manifest.notDeployed,true);assert(manifest.blockers.length);assert(manifest.candidate.length);assert.equal(manifest.pickupCells.included,true);assert.equal(manifest.pickupCells.state,'installation_and_live_verification_pending');assert(fs.existsSync(path.join(out,'database/INSTALL_PICKUP_008.sql')));assert(fs.existsSync(path.join(out,'site-before.zip')));
  for(const folder of ['candidate','safe-fallback']){
   const html=fs.readFileSync(path.join(out,folder,'index.html'),'utf8');assert(!/script\.google|telegramConfirmed|preview-settings/.test(html));assert(!fs.existsSync(path.join(out,folder,'setup')));assert(!fs.existsSync(path.join(out,folder,'kitchen/diagnostics.html')));
   const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(out,folder,'shared/config.js'),'utf8'),box);assert.equal(box.window.MISSMAKI_CONFIG.deploymentMode,'production');assert.equal(box.window.MISSMAKI_CONFIG.guestMode,'supabase-anonymous');
  }
  const nodes={send:{},'review-send':{},status:{},'review-status':{}};const sandbox={document:{getElementById:id=>nodes[id],createElement:()=>({setAttribute(){},style:{}}),querySelector:()=>({prepend(){}})}};
  vm.runInNewContext(fs.readFileSync(path.join(out,'safe-fallback/shared/maintenance.js'),'utf8'),sandbox);assert.equal(nodes.send.disabled,true);assert.equal(nodes['review-send'].disabled,true);assert.equal(sandbox.submitReview({preventDefault(){}}),false);
  assert.deepEqual(fs.readFileSync('index.html'),source);assert.deepEqual(fs.readFileSync('shared/config.js'),config);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
