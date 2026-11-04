const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {randomBytes,randomUUID,createHmac,createHash}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();const S='33333333-3333-4333-8333-333333333333',A='11111111-1111-4111-8111-111111111111';let tokenA,tokenB,order,request,payload,review;
async function role(id=null){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'));}
async function rpc(name,args){if(name==='public_reviews')return (await db.query("select coalesce(jsonb_agg(x),'[]'::jsonb) as value from public.public_reviews() x")).rows[0].value;const keys=Object.keys(args);return (await db.query('select public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as value',Object.values(args))).rows[0].value;}
async function proof(token,scope,id=null,p={}){const c=await rpc('guest_challenge',{p_token:token,p_scope:scope,p_request:id,p_payload:p});for(let n=0;n<10000000;n++){const h=createHash('sha256').update(c.seal+':'+n).digest();if(!h[0]&&!h[1]&&h[2]<64)return {p_challenge:c,p_solution:String(n)};}throw Error('No proof');}
async function mint(){const token=randomBytes(32).toString('hex');await rpc('guest_session',{p_token:token,...await proof(token,'session')});return token;}
before(async()=>{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;");
 for(const f of ['001_kitchen.sql','002_catalog.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users values($1),($2)',[S,A]);await db.query("insert into public.staff values($1,'admin')",[S]);
 const priorDate=(await db.query("select ((now() at time zone 'Europe/Moscow')::date+2)::text as d")).rows[0].d;
 await role(A);await rpc('create_order',{p_request:randomUUID(),p:{name:'Старый тестовый клиент',phone:'+70000000000',address:'Тест',area:'Самовывоз',fulfillment:'pickup',timing:'preorder',requestedDate:priorDate,requestedTime:'15:00',items:[{sku:'5:0',quantity:1}],subtotal:470,delivery:0,total:470,comment:'НЕ ГОТОВИТЬ'}});
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/003_guest_checkout.sql','utf8'));
 const date=(await db.query("select ((now() at time zone 'Europe/Moscow')::date+1)::text as date")).rows[0].date;
 payload={name:'АВТОТЕСТ',phone:'+70000000000',address:'Тест',area:'Самовывоз',fulfillment:'pickup',timing:'preorder',requestedDate:date,requestedTime:'14:00',items:[{sku:'5:0',quantity:1}],subtotal:470,delivery:0,total:470,comment:'НЕ ГОТОВИТЬ'};
});after(()=>db.close());
test('HMAC matches RFC algorithm; private schema and raw tables are closed',async()=>{
 const key=(await db.query('select key from missmaki_private.guest_secret')).rows[0].key;
 const value=(await db.query("select missmaki_private.seal('test-message') as seal")).rows[0].seal;assert.equal(value,createHmac('sha256',Buffer.from(key)).update('test-message').digest('hex'));
 await role();await assert.rejects(db.query('select * from missmaki_private.guest_secret'),/permission denied/);await assert.rejects(db.query('select * from public.orders'),/permission denied/);
});
test('session mint requires server-signed proof and creates no Auth accounts',async()=>{
 await role();const token=randomBytes(32).toString('hex');const c=await rpc('guest_challenge',{p_token:token,p_scope:'session'});
 await assert.rejects(rpc('guest_session',{p_token:token,p_challenge:{...c,seal:'0'.repeat(64)},p_solution:'0'}),/подпись/);
 tokenA=await mint();tokenB=await mint();assert.notEqual(tokenA,tokenB);
 await role(S);assert.equal(await rpc('is_staff',{}),true);await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,2);await role();
});
test('order writes validate price, count failed attempts, reject proof/payload tampering',async()=>{
 await role();await assert.rejects(rpc('guest_challenge',{p_token:tokenA,p_scope:'order',p_request:randomUUID(),p_payload:{comment:'x'.repeat(70000)}}),/Неверный запрос/);const id=randomUUID();const bad={...payload,total:1};const challenge=await proof(tokenA,'order',id,bad);
 await assert.rejects(rpc('guest_create_order',{p_token:tokenB,p_request:id,p:bad,...challenge}),/подпись/);
 await assert.rejects(rpc('guest_create_order',{p_token:tokenA,p_request:id,p:payload,...challenge}),/подпись/);
 const failed=await rpc('guest_create_order',{p_token:tokenA,p_request:id,p:bad,...challenge});assert.equal(failed.ok,false);assert.match(failed.message,/Стоимость/);
 await assert.rejects(rpc('guest_create_order',{p_token:tokenA,p_request:id,p:bad,...challenge}),/уже использована/);
 await db.exec('reset role');assert.equal((await db.query("select n from missmaki_private.quotas where key='order-minute'")).rows[0].n,1);await role();
});
test('guest order persists once, retries converge and foreign tokens cannot read it',async()=>{
 request=randomUUID();order=await rpc('guest_create_order',{p_token:tokenA,p_request:request,p:payload,...await proof(tokenA,'order',request,payload)});assert.equal(order.ok,true);
 const retry=await rpc('guest_create_order',{p_token:tokenA,p_request:request,p:payload,p_challenge:null,p_solution:null});assert.equal(retry.id,order.id);await assert.rejects(rpc('guest_create_order',{p_token:tokenA,p_request:request,p:null,p_challenge:null,p_solution:null}),/уже использован/);
 const own=await rpc('guest_order',{p_token:tokenA,p_request:request});assert.equal(own.number,order.number);assert.equal(await rpc('guest_order',{p_token:tokenB,p_request:request}),null);
 await assert.rejects(db.query("update public.orders set status='accepted'"),/permission denied/);
 await assert.rejects(rpc('order_status',{p_id:order.id,p_status:'accepted',p_minutes:15,p_version:1}),/permission denied/);
});
test('staff retains all eight wait times, rejection and audit for guest orders',async()=>{
 await role(S);let version=1;
 for(const minutes of [15,30,45,60,90,120,150,180]){await rpc('order_status',{p_id:order.id,p_status:'accepted',p_minutes:minutes,p_version:version++});await role();const row=await rpc('guest_order',{p_token:tokenA,p_request:request});assert.equal(row.minutes,minutes);assert.equal(row.status,'accepted');await role(S);}
 await rpc('order_status',{p_id:order.id,p_status:'rejected',p_minutes:null,p_version:version});const events=(await db.query('select * from public.audit where entity_id=$1',[order.id])).rows;assert.equal(events.length,10);
 await role();assert.equal((await rpc('guest_order',{p_token:tokenA,p_request:request})).status,'rejected');
});
test('guest reviews remain pending externally on rejection; only staff publishes',async()=>{
 const id=randomUUID(),p={name:'Автор',rating:5,body:'Тест',consent:true};const args={p_token:tokenA,p_request:id,p_name:p.name,p_rating:p.rating,p_body:p.body,p_consent:true};
 const result=await rpc('guest_submit_review',{...args,...await proof(tokenA,'review',id,p)});assert.equal(result.ok,true);review=result.id;
 assert.equal((await rpc('public_reviews',{})).length,0);assert.equal((await rpc('guest_my_reviews',{p_token:tokenB})).length,0);
 await role(S);await rpc('moderate_review',{p_id:review,p_status:'approved',p_version:1});await role();assert.equal((await rpc('public_reviews',{})).length,1);assert.equal((await rpc('guest_my_reviews',{p_token:tokenA}))[0].status,'approved');
 await role(S);await rpc('moderate_review',{p_id:review,p_status:'rejected',p_version:2});await role();assert.equal((await rpc('public_reviews',{})).length,0);assert.equal((await rpc('guest_my_reviews',{p_token:tokenA}))[0].status,'pending');
});
test('email users cannot bypass guest proof/rate limits using legacy RPCs',async()=>{
 await role(A);await assert.rejects(rpc('create_order',{p_request:randomUUID(),p:payload}),/защищённую гостевую/);
 await assert.rejects(rpc('submit_review',{p_request:randomUUID(),p_name:'Спам',p_rating:5,p_body:'Тест',p_consent:true}),/защищённую гостевую/);
});
test('quota increments are atomic; expiry denies even known tokens; difficulty cannot be lowered',async()=>{
 await db.exec('reset role');await db.query("select missmaki_private.quota('unit-limit',1,60)");await assert.rejects(db.query("select missmaki_private.quota('unit-limit',1,60)"),/много запросов/);
 await db.query("update missmaki_private.guest_sessions set expires_at=now()-interval '1 second' where token_hash=missmaki_private.token_hash($1)",[tokenB]);await role();await assert.rejects(rpc('guest_order',{p_token:tokenB,p_request:request}),/истекла/);
 const token=randomBytes(32).toString('hex');const c=await rpc('guest_challenge',{p_token:token,p_scope:'session'});await assert.rejects(rpc('guest_session',{p_token:token,p_challenge:{...c,bits:0},p_solution:'0'}),/Проверка истекла/);
});

test('pre-migration Auth orders and staff role remain readable and intact',async()=>{
 await role(A);const rows=(await db.query('select name,customer_id,guest_session_id from public.orders')).rows;assert.equal(rows.length,1);assert.equal(rows[0].customer_id,A);assert.equal(rows[0].guest_session_id,null);
 await role(S);assert.equal(await rpc('is_staff',{}),true);
});
test('global session limit applies across new tokens rather than trusting client IP headers',async()=>{
 await db.exec('reset role');await db.query("update missmaki_private.quotas set n=5,window_end=now()+interval '1 minute' where key='session-minute'");await role();
 const token=randomBytes(32).toString('hex');const valid=await proof(token,'session');await assert.rejects(rpc('guest_session',{p_token:token,...valid}),/много запросов/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from missmaki_private.guest_sessions')).rows[0].n,2);
});
