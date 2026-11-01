const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');const vm=require('node:vm');
test('cutover removes old transports and preserves menu and photographs',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mm-cutover-'));
 try{
  for(const d of ['scripts','test','shared'])fs.mkdirSync(path.join(temp,d));
  for(const f of ['scripts/enable-kitchen.mjs','scripts/kitchen-config.mjs','index.html','test/index.html','privacy.html','data-processing.html','cookies.html'])fs.copyFileSync(f,path.join(temp,f));
  const before=fs.readFileSync('index.html','utf8');
  execFileSync(process.execPath,['scripts/enable-kitchen.mjs','https://orders.example.com','sb_publishable_TEST_FIXTURE_ONLY','--verified'],{cwd:temp});
  const after=fs.readFileSync(path.join(temp,'index.html'),'utf8');
  assert(!/script\.google|telegramConfirmed|function customerDecision|function jsonpGet/.test(after));
  for(const re of [/const groups=(\[.*?\]);\s*const esc=/s,/const approvedPhotos=(.*?);\n/s])assert.equal(after.match(re)[1],before.match(re)[1]);
  for(const m of after.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  assert(fs.readFileSync(path.join(temp,'test/index.html'),'utf8').includes('url=/'));
  assert.throws(()=>execFileSync(process.execPath,['scripts/enable-kitchen.mjs','https://orders.example.com','sb_secret_TEST_FIXTURE_ONLY','--verified'],{cwd:temp,stdio:'pipe'}));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
