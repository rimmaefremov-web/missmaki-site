const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});window.__nativeUUIDMissing=true;});
 await page.route('**/shared/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.MISSMAKI_CONFIG={enabled:true,deploymentProfile:'ru',supabaseUrl:'https://orders.example.com',publishableKey:'TEST_FIXTURE_ONLY'};"}));
 await page.route('**/shared/vendor/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:"window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'fixture'}}}})},rpc:async()=>({data:[],error:null}),from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:null,error:null})};return q;},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}})};"}));
});
test('UUID fallback is available without randomUUID and all generated identifiers are v4',async({page})=>{
 await page.goto('/');const result=await page.evaluate(()=>({nativeWasMissing:window.__nativeUUIDMissing,ids:Array.from({length:500},()=>MMCompat.uuid())}));expect(result.nativeWasMissing).toBe(true);expect(new Set(result.ids).size).toBe(500);for(const id of result.ids)expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('technical checkout errors are replaced with Russian guidance and cart is retained',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{isOpen=()=>true;add(1);document.querySelector('input[name=fulfillment][value=pickup]').checked=true;setMethod();updateHours();MM.rpc=async()=>{throw new TypeError('crypto.randomUUID is undefined');};});await page.locator('#send').focus();await page.locator('#send').press('Enter');await expect(page.locator('#status')).toContainText('Не удалось подтвердить');await expect(page.locator('#status')).not.toContainText(/randomUUID|undefined|TypeError/);expect(await page.evaluate(()=>Object.keys(cart).length)).toBe(1);
});
test('missing cryptographic randomness stops checkout with readable Russian message',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{isOpen=()=>true;add(1);document.querySelector('input[name=fulfillment][value=pickup]').checked=true;setMethod();updateHours();Object.defineProperty(crypto,'getRandomValues',{value:undefined,configurable:true});});await page.locator('#send').focus();await page.locator('#send').press('Enter');await expect(page.locator('#status')).toContainText('Safari или Chrome');await expect(page.locator('#status')).not.toContainText(/randomUUID|undefined|TypeError/);expect(await page.evaluate(()=>Object.keys(cart).length)).toBe(1);
});
