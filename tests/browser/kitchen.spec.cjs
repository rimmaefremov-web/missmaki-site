const {test,expect}=require('@playwright/test');
// Browser contract tests use an explicit fake API. These do not prove Supabase deployment.
async function mock(page,{staff=false,offline=false}={}){
 await page.addInitScript(({staff,offline})=>{
  window.__fake={staff,offline,status:'new',minutes:null,version:1,reviewStatus:'pending',calls:[]};
  const f=window.__fake;
  const order=()=>({id:'o1',request_id:f.createdRequest||'r1',number:42,name:'Тест',phone:'+79530000000',address:'Адрес',area:'Южный',fulfillment:'delivery',timing:'asap',created_at:new Date().toISOString(),items:[{name:'Ролл',quantity:2,price:470}],delivery:200,total:1140,payment:'При получении',comment:'',status:f.status,minutes:f.minutes,version:f.version});
  const review=()=>({id:'rev1',name:'Автор',rating:5,body:'Вкусно <script>test</script>',created_at:new Date().toISOString(),status:f.reviewStatus,version:1});
  function result(table,filters){if(f.offline)return {data:null,error:{message:'Нет сети'}};if(table==='orders'){let a=[order()];for(const [k,v] of filters)a=a.filter(o=>o[k]===v);return {data:a,error:null};}if(table==='reviews')return {data:[review()],error:null};return {data:[],error:null};}
  const query=table=>{const filters=[];let single=false;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},range(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){const r=result(table,filters);if(single&&r.data)r.data=r.data[0]||null;return Promise.resolve(r).then(resolve,reject);}};return q;};
  window.__client={auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signInAnonymously:async()=>({data:{}}),signInWithPassword:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>({})},from:query,channel(){const c={on(){return c;},subscribe(fn){setTimeout(()=>fn('SUBSCRIBED'),0);return c;}};return c;},removeChannel(){},async rpc(name,args){f.calls.push({name,args});if(f.offline)return {error:{message:'Нет сети'}};let data=null;if(name==='is_staff')data=f.staff;if(name==='order_status'){f.status=args.p_status;f.minutes=args.p_minutes;f.version++;}if(name==='moderate_review')f.reviewStatus=args.p_status;if(name==='public_reviews')data=f.reviewStatus==='approved'?[review()]:[];if(name==='my_reviews')data=[{...review(),status:f.reviewStatus==='approved'?'approved':'pending'}];if(name==='availability')data={ok:true,available:true};if(name==='create_order'){f.createdRequest=args.p_request;data={ok:true,number:42,id:'o1'};if(f.failOrderOnce){f.failOrderOnce=false;return {error:{message:'Ответ потерян'}};}}return {data,error:null};}};
 },{staff,offline});
 await page.route('**/shared/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.MISSMAKI_CONFIG={enabled:true,supabaseUrl:'https://test.supabase.co',publishableKey:'test-only'};"}));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.__client};'}));
}
test('staff panel, every wait button, refusal and moderation',async({page})=>{
 await mock(page,{staff:true});await page.goto('/kitchen/');await expect(page.getByRole('heading',{name:/Заказ №42/})).toBeVisible();
 for(const m of [15,30,45,60,90,120,150,180]){
  await page.getByRole('button',{name:m+' минут',exact:true}).click();await page.getByRole('button',{name:'Принятые',exact:true}).click();await expect(page.getByText('Ожидание '+m+' минут',{exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'ОТКАЗ',exact:true}).click();await page.getByRole('button',{name:'Отклонённые',exact:true}).click();await expect(page.getByRole('heading',{name:/Заказ №42 · Отклонён/})).toBeVisible();
 await page.getByRole('button',{name:'Отзывы',exact:true}).click();await page.getByRole('button',{name:'ПРИНЯТЬ',exact:true}).click();await expect(page.getByText('Опубликован',{exact:true})).toBeVisible();await page.getByRole('button',{name:'ОТКЛОНИТЬ',exact:true}).click();await expect(page.getByText('Отклонён',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('unauthorized visitor cannot see kitchen data',async({page})=>{await mock(page);await page.goto('/kitchen/');await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#error')).toContainText('Доступ только');});
test('connection failure warns and recovers',async({page})=>{await mock(page,{staff:true});await page.goto('/kitchen/');await expect(page.locator('#connection')).toContainText('Соединение есть');await page.evaluate(()=>window.__fake.offline=true);await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.locator('#connection')).toContainText('Нет соединения');await page.evaluate(()=>window.__fake.offline=false);await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.locator('#connection')).toContainText('Соединение есть');});
test('customer live acceptance, rejected review stays pending, no legacy requests',async({page})=>{
 await mock(page);let legacy=[];page.on('request',r=>{if(/script.google|telegram/.test(r.url()))legacy.push(r.url());});
 await page.addInitScript(()=>localStorage.setItem('missmaki-active-order','r1'));
 await page.goto('/');await expect(page.locator('#status')).toContainText('№42');
 await page.evaluate(()=>{window.__fake.status='accepted';window.__fake.minutes=15;});await expect(page.locator('#status')).toHaveText('Ваш заказ №42 принят! Время ожидания — 15 минут');
 await page.evaluate(()=>window.__fake.reviewStatus='rejected');await expect(page.locator('#review-status')).toHaveText('Ваш отзыв ожидает подтверждения');await expect(page.locator('#published-reviews')).toBeEmpty();
 await page.reload();await expect(page.locator('#review-status')).toHaveText('Ваш отзыв ожидает подтверждения');await expect(page.locator('#published-reviews')).toBeEmpty();expect(legacy).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('lost order response restores checkout after reload and reuses request ID',async({page})=>{
 await mock(page);await page.goto('/');await page.evaluate(()=>{isOpen=()=>true;add(1);document.querySelector('input[name="fulfillment"][value="pickup"]').checked=true;setMethod();updateHours();window.__fake.failOrderOnce=true;});
 await page.locator('#name').fill('Покупатель');await page.locator('#phone').fill('+79530000000');await page.locator('#send').click();
 await expect(page.locator('#status')).toContainText('Не удалось подтвердить отправку');
 const request=await page.evaluate(()=>JSON.parse(localStorage.getItem('mm-pending-submission')).requestId);
 await page.reload();await expect(page.locator('#name')).toHaveValue('Покупатель');await expect(page.locator('#cart')).toContainText('Филадельфия');await page.locator('#send').click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('mm-pending-submission'))).toBeNull();
 const calls=await page.evaluate(()=>window.__fake.calls.filter(c=>c.name==='create_order'));expect(calls[0].args.p_request).toBe(request);
});
