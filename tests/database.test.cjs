const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333';
const uuid=()=>require('node:crypto').randomUUID();
const query=(q,p=[])=>db.query(q,p);
async function who(id){await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function rpc(sql,args){return (await query(sql,args)).rows[0];}
let order,review;
let payload;
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`);
 await db.exec(fs.readFileSync('supabase/migrations/001_kitchen.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/002_catalog.sql','utf8'));
 await query('insert into auth.users values($1),($2),($3)',[A,B,S]);await query("insert into public.staff values($1,'admin')",[S]);
 const d=(await query("select ((now() at time zone 'Europe/Moscow')::date+1)::text as d")).rows[0].d;
 payload={name:'Тест',phone:'+7 (953) 000-00-00',address:'Тестовый адрес',area:'Южный',fulfillment:'delivery',timing:'preorder',requestedDate:d,requestedTime:'14:00',items:[{sku:'5:0',quantity:2,price:470}],subtotal:940,delivery:200,total:1140,comment:'Тест'};
});
after(()=>db.close());
test('persist order and reuse request after lost response; reject altered request',async()=>{
 await who(A);const request=uuid();const first=await rpc('select public.create_order($1,$2) as r',[request,payload]);order=first.r;
 const again=await rpc('select public.create_order($1,$2) as r',[request,payload]);assert.deepEqual(again.r,order);
 const otherTab=await rpc('select public.create_order($1,$2) as r',[uuid(),payload]);assert.deepEqual(otherTab.r,order);
 await assert.rejects(query('select public.create_order($1,$2)',[request,{...payload,name:'Другой'}]),/уже использован/);
 assert.equal((await query('select count(*)::int as n from public.orders')).rows[0].n,1);
});
test('server rejects client prices, illegal quantities, unknown SKU and occupied preorder slot',async()=>{
 await who(A);
 for(const p of [{...payload,total:1},{...payload,items:[{sku:'5:0',quantity:-1}]},{...payload,items:[{sku:'fake',quantity:1}]}])await assert.rejects(query('select public.create_order($1,$2)',[uuid(),p]));
 await who(B);const slots=(await query('select public.availability($1,$2) as r',[payload.requestedDate,payload.requestedTime])).rows[0].r;assert.equal(slots.available,false);assert.equal(slots.alternatives.length,3);assert(!slots.alternatives.includes('14:00'));
 await assert.rejects(query('select public.create_order($1,$2)',[uuid(),payload]),/занято/);
});
test('customer cannot view another order or change state directly or through RPC',async()=>{
 await who(B);assert.equal((await query('select * from public.orders')).rows.length,0);
 await assert.rejects(query("update public.orders set status='accepted'"),/permission denied/);
 await assert.rejects(query("select public.order_status($1,'accepted',15,1)",[order.id]),/Доступ запрещён/);
 await assert.rejects(query("insert into public.staff values($1,'admin')",[B]),/permission denied/);
});
test('all eight wait times and refusal persist, stale employee actions fail',async()=>{
 await who(S);let v=1;
 for(const m of [15,30,45,60,90,120,150,180]){
  await query("select public.order_status($1,'accepted',$2,$3)",[order.id,m,v++]);
  const o=(await query('select status,minutes from public.orders where id=$1',[order.id])).rows[0];assert.deepEqual(o,{status:'accepted',minutes:m});
 }
 await assert.rejects(query("select public.order_status($1,'accepted',20,$2)",[order.id,v]),/Неверный/);
 await assert.rejects(query("select public.order_status($1,'accepted',null,$2)",[order.id,v]),/Неверный/);
 await assert.rejects(query("select public.order_status($1,'rejected',null,1)",[order.id]),/другим сотрудником/);
 await query("select public.order_status($1,'rejected',null,$2)",[order.id,v]);
 await who(A);assert.equal((await query('select status from public.orders where id=$1',[order.id])).rows[0].status,'rejected');
});
test('simultaneous independent orders and duplicate retries',async()=>{
 await who(B);
 const requests=[uuid(),uuid()];
 const results=await Promise.all(requests.map((r,i)=>rpc('select public.create_order($1,$2) as r',[r,{...payload,requestedTime:i?'16:00':'15:00'}])));
 assert.notEqual(results[0].r.number,results[1].r.number);
 const same=uuid(),p={...payload,requestedTime:'17:00'};
 const retry=await Promise.all([rpc('select public.create_order($1,$2) as r',[same,p]),rpc('select public.create_order($1,$2) as r',[same,p])]);assert.equal(retry[0].r.id,retry[1].r.id);
});
test('reviews require separate consent and cannot self-publish',async()=>{
 await who(A);await assert.rejects(query('select public.submit_review($1,$2,5,$3,false)',[uuid(),'Автор','Отлично']),/согласие/);
 const request=uuid();review=(await query('select public.submit_review($1,$2,5,$3,true) as id',[request,'Автор','Отлично'])).rows[0].id;
 assert.equal((await query('select public.submit_review($1,$2,5,$3,true) as id',[request,'Автор','Отлично'])).rows[0].id,review);
 assert.equal((await query('select * from public.public_reviews()')).rows.length,0);
 await assert.rejects(query("select public.moderate_review($1,'approved',1)",[review]),/Доступ запрещён/);
 await assert.rejects(query("update public.reviews set status='approved'"),/permission denied/);
});
test('approved review public, rejected review private; external status remains pending after reload',async()=>{
 await who(S);await query("select public.moderate_review($1,'approved',1)",[review]);
 await who(B);assert.equal((await query('select * from public.public_reviews()')).rows.length,1);
 await who(A);assert.equal((await query('select * from public.my_reviews()')).rows[0].status,'approved');
 await who(S);await query("select public.moderate_review($1,'rejected',2)",[review]);
 await who(B);assert.equal((await query('select * from public.public_reviews()')).rows.length,0);assert.equal((await query('select id,status from public.reviews')).rows.length,0);
 await who(A);assert.equal((await query('select * from public.my_reviews()')).rows[0].status,'pending');
 await who(B);await who(A);assert.equal((await query('select * from public.my_reviews()')).rows[0].status,'pending');
 await who(S);assert.equal((await query('select status from public.reviews where id=$1',[review])).rows[0].status,'rejected');assert.equal((await query("select * from public.audit where entity='review'")).rows.length,3);
});
test('anon has no personal data access; PUBLIC cannot invoke privileged functions',async()=>{
 await db.exec('reset role;set role anon');
 await assert.rejects(query('select * from public.orders'),/permission denied/);
 await assert.rejects(query('select id,status from public.reviews'),/permission denied/);
 await assert.rejects(query("select public.order_status($1,'accepted',15,1)",[order.id]),/permission denied/);
 assert.equal((await query('select * from public.public_reviews()')).rows.length,0);
});
test('catalog stays exactly aligned with existing website',()=>{
 const actual=JSON.parse(require('node:child_process').execFileSync(process.execPath,['scripts/extract-catalog.cjs'],{encoding:'utf8'}));assert.deepEqual(actual,JSON.parse(fs.readFileSync('supabase/catalog.json','utf8')));
});
