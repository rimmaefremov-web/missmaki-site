const {test,expect}=require('@playwright/test');const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');
let db;let queue=Promise.resolve();const S='33333333-3333-4333-8333-333333333333';
test.beforeAll(async()=>{
 db=new PGlite();await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;");
 for(const f of ['001_kitchen.sql','002_catalog.sql','003_guest_checkout.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));await db.query('insert into auth.users values($1)',[S]);await db.query("insert into public.staff values($1,'admin')",[S]);
});test.afterAll(async()=>db?.close());
function serial(fn){const result=queue.then(fn);queue=result.then(()=>{},()=>{});return result;}
function rpc(name,args,staff=false){return serial(()=>rawRpc(name,args,staff));}
function owner(sql,p=[]){return serial(async()=>{await db.exec('reset role');return db.query(sql,p);});}
async function rawRpc(name,args,staff=false){
 try{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff?S:'']);await db.exec(staff?'set role authenticated':'set role anon');
  if(name==='public_reviews')return {data:(await db.query("select coalesce(jsonb_agg(x),'[]'::jsonb) as r from public.public_reviews() x")).rows[0].r,error:null};
  if(!/^[a-z_]+$/.test(name)||Object.keys(args).some(x=>x!=='p'&&!/^p_[a-z_]+$/.test(x)))throw Error('Bad fixture RPC');
  const keys=Object.keys(args),r=await db.query('select public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as r',Object.values(args));return {data:r.rows[0].r,error:null};
 }catch(e){return {data:null,error:{code:e.code,message:e.message}};}
}
test('guest checkout, worker proof, kitchen statuses and review moderation work without Auth signup',async({page})=>{test.setTimeout(60000);
 await page.exposeFunction('__databaseRpc',(name,args)=>rpc(name,args));
 await page.route('**/shared/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.MISSMAKI_CONFIG={enabled:true,deploymentProfile:'ru',deploymentMode:'test',guestMode:'database-token',supabaseUrl:'https://orders.example.com',publishableKey:'TEST_FIXTURE_ONLY'};"}));
 await page.route('**/shared/vendor/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:"window.supabase={createClient:()=>({rpc:(name,args)=>window.__databaseRpc(name,args),auth:{signInAnonymously:()=>{throw Error('AUTH SIGNUP MUST NOT BE CALLED')},getSession:async()=>({data:{session:null}})}})};"}));
 await page.goto('/');
 const date=(await db.query("select ((now() at time zone 'Europe/Moscow')::date+1)::text as d")).rows[0].d;
 await page.evaluate(({date})=>{add(1);document.querySelector('input[name=fulfillment][value=pickup]').checked=true;setMethod();document.querySelector('input[name=orderTiming][value=preorder]').checked=true;updateTiming();document.getElementById('preorder-date').value=date;refreshSlots();document.getElementById('preorder-time').value='14:00';document.getElementById('name').value='АВТОТЕСТ';document.getElementById('phone').value='+70000000000';},{date});
 await page.locator('#send').focus();await page.keyboard.press('Enter');await expect(page.locator('#status')).toContainText('№',{timeout:20000});
 const order=(await owner('select id,version,customer_id,guest_session_id from public.orders')).rows[0];expect(order.customer_id).toBeNull();expect(order.guest_session_id).toBeTruthy();expect((await owner('select count(*)::int as n from auth.users')).rows[0].n).toBe(1);
 let version=1;for(const m of [15,30,45,60,90,120,150,180]){const r=await rpc('order_status',{p_id:order.id,p_status:'accepted',p_minutes:m,p_version:version++},true);expect(r.error).toBeNull();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#status')).toContainText('— '+m+' минут');}
 await rpc('order_status',{p_id:order.id,p_status:'rejected',p_minutes:null,p_version:version},true);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#status')).toContainText('не можем принять');
 await page.locator('#review-name').fill('Автор теста');await page.locator('#review-rating').selectOption('5');await page.locator('#review-text').fill('Вымышленный отзыв');await page.locator('#review-consent').check();await page.locator('#review-send').focus();await page.keyboard.press('Enter');await expect(page.locator('#review-status')).toContainText('ожидает подтверждения',{timeout:15000});
 const id=(await owner('select id from public.reviews')).rows[0].id;await rpc('moderate_review',{p_id:id,p_status:'approved',p_version:1},true);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#published-reviews')).toContainText('Вымышленный отзыв');
 await rpc('moderate_review',{p_id:id,p_status:'rejected',p_version:2},true);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#published-reviews')).toBeEmpty();await expect(page.locator('#review-status')).toContainText('ожидает подтверждения');
 await page.reload();await expect(page.locator('#status')).toContainText('не можем принять');await expect(page.locator('#published-reviews')).toBeEmpty();await expect(page.locator('#review-status')).toContainText('ожидает подтверждения');
});
