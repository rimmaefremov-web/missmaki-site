const {test,expect}=require('@playwright/test');
const sdk=`window.__adCalls=[];window.Ya={Context:{AdvManager:{render(o){__adCalls.push({blockId:o.blockId,renderTo:o.renderTo,keys:Object.keys(o)});if(window.__adMode==='error'){o.onError({type:'error'});return;}if(window.__adMode==='empty')return;const n=document.createElement('div');n.textContent='Тестовая реклама';n.style.cssText='height:100px;width:100%;background:#eee';document.getElementById(o.renderTo).append(n);o.onRender();}}}};window.yaContextCb.splice(0).forEach(f=>f());window.yaContextCb.push=f=>{f();return 0;};`;
async function setup(page,{consent,mode='filled'}={}){
 let loads=0;await page.addInitScript(({consent,mode})=>{if(consent)localStorage.setItem('mm-ad-consent-v1',JSON.stringify({value:consent,at:Date.now()}));window.__adMode=mode;},{consent,mode});
 await page.route('**/shared/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.MISSMAKI_CONFIG={enabled:false};'}));
 await page.route('https://yandex.ru/ads/system/context.js',r=>{loads++;return r.fulfill({contentType:'application/javascript',body:sdk});});return ()=>loads;
}
test('ads require separate consent, load once in head outside checkout, fit the content and can be declined',async({page})=>{
 const loads=await setup(page);await page.goto('/');const slot=page.locator('#yandex_rtb_R-A-20513421-1');expect(loads()).toBe(0);expect(await slot.evaluate(n=>n.getBoundingClientRect().height)).toBe(0);
 expect(await slot.evaluate(n=>n.parentElement.tagName==='MAIN'&&n.nextElementSibling.id==='reviews'&&!n.closest('form,.basket')&&!!n.previousElementSibling.querySelector('#send'))).toBe(true);
 await page.getByRole('button',{name:'Без рекламных cookies',exact:true}).click();expect(loads()).toBe(0);
 await page.getByRole('button',{name:'Настроить рекламные cookies',exact:true}).click();await page.getByRole('button',{name:'Разрешить рекламные cookies',exact:true}).click();await expect(slot).toHaveClass(/ad-filled/);expect(loads()).toBe(1);
 expect(await page.locator('head script[src="https://yandex.ru/ads/system/context.js"]').count()).toBe(1);expect(await page.evaluate(()=>__adCalls)).toEqual([{blockId:'R-A-20513421-1',renderTo:'yandex_rtb_R-A-20513421-1',keys:['blockId','renderTo','disableGrab','onError','onClose','onRender']}]);
 await page.evaluate(()=>{MMAds.load();MMAds.load();});expect(loads()).toBe(1);expect(await page.evaluate(()=>__adCalls.length)).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const boxes=await page.evaluate(()=>{const s=document.getElementById('yandex_rtb_R-A-20513421-1').getBoundingClientRect(),b=document.getElementById('send').getBoundingClientRect(),r=document.getElementById('reviews').getBoundingClientRect();return {ad:s.top,adBottom:s.bottom,button:b.bottom,reviews:r.top};});expect(boxes.ad).toBeGreaterThan(boxes.button);expect(boxes.adBottom).toBeLessThanOrEqual(boxes.reviews);
 await page.getByRole('button',{name:'Настроить рекламные cookies',exact:true}).click();await page.getByRole('button',{name:'Без рекламных cookies',exact:true}).click();expect(await slot.evaluate(n=>n.getBoundingClientRect().height)).toBe(0);await page.reload();expect(loads()).toBe(1);
});
for(const mode of ['empty','error','blocked'])test(`ads ${mode}: no reserved blank area and checkout button remains usable`,async({page})=>{
 await setup(page,{consent:'accepted',mode});if(mode==='blocked')await page.route('https://yandex.ru/ads/system/context.js',r=>r.abort());await page.clock.install();await page.goto('/');await page.clock.fastForward(21000);
 const slot=page.locator('#yandex_rtb_R-A-20513421-1');expect(await slot.evaluate(n=>({height:n.getBoundingClientRect().height,margin:getComputedStyle(n).margin}))).toEqual({height:0,margin:'0px'});await expect(page.locator('#send')).toBeAttached();
});
test('kiosk and kitchen never request ads even with previously accepted consent',async({page})=>{
 const loads=await setup(page,{consent:'accepted'});await page.goto('/kiosk.html');await page.getByRole('button',{name:'Открыть меню',exact:false}).count();await page.locator('#open-menu').click();const menu=page.frameLocator('iframe[title="Меню и оформление заказа MissMaki"]');await expect(menu.locator('#send')).toBeAttached();await expect(menu.locator('#mm-ad-preferences')).toHaveCount(0);expect(loads()).toBe(0);await page.goto('/kitchen/');expect(loads()).toBe(0);
});
