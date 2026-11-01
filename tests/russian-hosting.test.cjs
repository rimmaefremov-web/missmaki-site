const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');const {execFileSync}=require('node:child_process');const {createHash}=require('node:crypto');const {pathToFileURL}=require('node:url');
const root=process.cwd();const fixtureKey='sb_publishable_TEST_FIXTURE_ONLY';
test('Russian deployment accepts a dedicated HTTPS API and rejects cloud/secret configurations',async()=>{
 const {configuration}=await import(pathToFileURL(path.join(root,'scripts/kitchen-config.mjs')));
 assert.equal(configuration('https://orders.example.com/',fixtureKey,'test').supabaseUrl,'https://orders.example.com');
 const anon='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.TEST_SIGNATURE';assert.equal(configuration('https://orders.example.com',anon,'test').publishableKey,anon);
 for(const u of ['https://project.supabase.co','http://orders.example.com','https://user:password@orders.example.com','https://orders.example.com/rest/v1','https://orders.example.com/?secret=1','https://127.0.0.1','https://localhost','https://orders.example.com:8443'])assert.throws(()=>configuration(u,fixtureKey,'test'));
 for(const k of ['sb_secret_TEST_ONLY','password','eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.TEST_SIGNATURE'])assert.throws(()=>configuration('https://orders.example.com',k,'test'));
});
test('preview export is isolated, contains no old transport or repository secrets and leaves source unchanged',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mm-ru-'));const out=path.join(temp,'preview');
 const files=['index.html','shared/config.js','privacy.html','test/index.html'];const before=files.map(f=>fs.readFileSync(f));
 try{
  execFileSync(process.execPath,['scripts/build-russian-preview.mjs','https://orders.example.com',fixtureKey,'--output',out]);
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(out,'shared/config.js'),'utf8'),sandbox);const c=sandbox.window.MISSMAKI_CONFIG;assert.equal(c.enabled,true);assert.equal(c.deploymentMode,'test');assert.equal(c.deploymentProfile,'ru');assert.equal(c.captchaSiteKey,'');
  const html=fs.readFileSync(path.join(out,'index.html'),'utf8');assert(!/script\.google|telegramConfirmed|cdn\.jsdelivr/.test(html));assert(html.includes('shared/vendor/supabase.js'));assert(!/cdn\.jsdelivr/.test(fs.readFileSync(path.join(out,'kitchen/index.html'),'utf8')));
  for(const f of ['.git','.env','CNAME','scripts','tests','node_modules','supabase'])assert(!fs.existsSync(path.join(out,f)),f);
  assert(fs.existsSync(path.join(out,'kitchen/index.html')));assert(fs.existsSync(path.join(out,'assets/missmaki-logo-small.webp')));
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-russian-preview.mjs','https://orders.example.com',fixtureKey,'--output',out],{stdio:'pipe'}));
  for(const [i,f] of files.entries())assert.deepEqual(fs.readFileSync(f),before[i]);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('browser runtime refuses foreign cloud and foreign CAPTCHA in Russian profile',()=>{
 for(const [url,captcha] of [['https://fixture-only.supabase.co',''],['https://orders.example.com','test-sitekey']]){
  const window={MISSMAKI_CONFIG:{enabled:true,deploymentProfile:'ru',supabaseUrl:url,publishableKey:fixtureKey,captchaSiteKey:captcha}};
  vm.runInNewContext(fs.readFileSync('shared/api.js','utf8'),{window,URL});assert.throws(()=>window.MM.client(),/Российский профиль/);
 }
});
test('Supabase library is local, pinned and matches recorded digest',()=>{
 const digest=createHash('sha256').update(fs.readFileSync('shared/vendor/supabase.js')).digest('hex');assert(fs.readFileSync('shared/vendor/README.md','utf8').includes(digest));
 for(const f of ['index.html','kitchen/index.html'])assert(!/https:\/\/cdn\.jsdelivr/.test(fs.readFileSync(f,'utf8')));
});
