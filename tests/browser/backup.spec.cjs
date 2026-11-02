const {test,expect}=require('@playwright/test');const fs=require('node:fs');
test('admin export is encrypted locally and restoration never uploads the file or passphrase',async({page},info)=>{
 const backup={format:'missmaki-business',version:1,createdAt:new Date().toISOString(),orders:[{id:'fixture-order',name:'PRIVATE FIXTURE ORDER'}],reviews:[],audit:[]};
 await page.route('**/shared/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.MISSMAKI_CONFIG={enabled:true,deploymentProfile:'ru',deploymentMode:'test',supabaseUrl:'https://orders.example.com',publishableKey:'sb_publishable_TEST_FIXTURE_ONLY'};"}));
 await page.addInitScript(data=>{window.__backup=data;window.__calls=[];window.__backupClient={rpc:async(name,args)=>{window.__calls.push({name,args});return {data:window.__backup,error:null};}};},backup);
 await page.route('**/shared/vendor/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.__backupClient};'}));
 const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173'))external.push(r.url());});
 await page.goto('/kitchen/backup.html');await page.locator('#secret').fill('private-test-password');await page.locator('#confirm').fill('private-test-password');let download=page.waitForEvent('download');await page.locator('#export').click();let file=await download;const saved=info.outputPath('encrypted.json');await file.saveAs(saved);const encrypted=fs.readFileSync(saved,'utf8');expect(encrypted).not.toContain('PRIVATE FIXTURE');expect(encrypted).not.toContain('private-test-password');await expect(page.locator('#secret')).toHaveValue('');await expect(page.locator('#message')).toContainText('Файл подготовлен');
 await page.locator('#file').setInputFiles(saved);await page.locator('#secret').fill('wrong-password');await page.locator('#restore').click();await expect(page.locator('#message')).toContainText('Неверный пароль');
 await page.locator('#secret').fill('private-test-password');download=page.waitForEvent('download');await page.locator('#restore').click();file=await download;expect(file.suggestedFilename()).toBe('MissMaki-restore.sql');await expect(page.locator('#message')).toContainText('не выполнялся');
 expect(await page.evaluate(()=>window.__calls)).toEqual([{name:'business_backup',args:{}}]);expect(external).toEqual([]);
});
