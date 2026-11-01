const {test,expect}=require('@playwright/test');const {execFileSync,spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
let server,temp;
test.beforeAll(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'mm-browser-preview-'));const out=path.join(temp,'site');execFileSync(process.execPath,['scripts/build-russian-preview.mjs','--setup','--output',out]);
 server=spawn('python',['-m','http.server','4174','--bind','127.0.0.1','--directory',out],{stdio:'ignore'});
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:4174/setup/');if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Preview test server did not start');
});
test.afterAll(async()=>{if(server&&server.exitCode===null){await new Promise(resolve=>{server.once('exit',resolve);server.kill();});}if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test('owner saves only public settings locally and kitchen loads them without changing source',async({page})=>{
 const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4174'))external.push(r.url());});
 await page.goto('http://127.0.0.1:4174/setup/');await page.locator('#url').fill('https://orders.example.com');await page.locator('#key').fill('sb_secret_NOT_ALLOWED');await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await expect(page.locator('#message')).toContainText('только публичный');
 await page.locator('#key').fill('sb_publishable_TEST_FIXTURE_ONLY');await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await expect(page.locator('#message')).toContainText('ещё не проверено');expect(external).toEqual([]);
 await page.getByRole('link',{name:'Войти в кухню',exact:true}).click();await expect(page.locator('#login')).toBeVisible();await expect(page.locator('#mm-test-banner')).toContainText('ТЕСТОВАЯ');expect(await page.evaluate(()=>window.MISSMAKI_CONFIG.supabaseUrl)).toBe('https://orders.example.com');expect(external).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('diagnostic page refuses to run for a logged-in user without staff role',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mm-preview-public-settings',JSON.stringify({supabaseUrl:'https://orders.example.com',publishableKey:'sb_publishable_TEST_FIXTURE_ONLY'})));
 await page.route('**/shared/vendor/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:"window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'fixture'}}}})},rpc:async()=>({data:false})})};"}));
 await page.goto('http://127.0.0.1:4174/kitchen/diagnostics.html');await expect(page.locator('#run')).toBeDisabled();await expect(page.locator('#auth-status')).toContainText('без роли staff недостаточно');
});
