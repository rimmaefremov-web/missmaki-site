const {test,before,after,beforeEach}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite(),S='33333333-3333-4333-8333-333333333333';let date;
const migration=fs.readFileSync('supabase/migrations/009_optional_pickup_contacts.sql','utf8');
async function who(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function buyer(){await db.exec('reset role');const id=randomUUID();await db.query('insert into auth.users values($1)',[id]);await who(id);return id;}
function payload(fulfillment,timing){return {name:fulfillment==='pickup'?'':'Тест',phone:fulfillment==='pickup'?'':'+70000000000',address:'Тестовый адрес',area:'Тест',fulfillment,timing,requestedDate:date,requestedTime:'18:30',items:[{sku:'5:0',quantity:1}],subtotal:470,delivery:fulfillment==='pickup'?0:200,total:fulfillment==='pickup'?470:670,comment:'Тест'};}
async function create(p,request=randomUUID()){return (await db.query('select public.create_order($1,$2) as r',[request,p])).rows[0].r;}
before(async()=>{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;");
 for(const name of ['001_kitchen.sql','002_catalog.sql','004_review_moderation_idempotency.sql','005_submission_budgets.sql','007_backup_and_test_records.sql','008_pickup_cells.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 // A deterministic local test clock exercises ordinary orders even when CI runs at night.
 await db.exec(migration.replace("tm=now() at time zone 'Europe/Moscow';","tm=date_trunc('day',now() at time zone 'Europe/Moscow')+interval '15 hours';"));
 await db.query('insert into auth.users values($1)',[S]);await db.query("insert into public.staff values($1,'admin')",[S]);date=(await db.query("select ((now() at time zone 'Europe/Moscow')::date+1)::text d")).rows[0].d;
});beforeEach(async()=>{await db.exec('reset role');await db.exec('delete from missmaki_guard.submission_budgets');});after(()=>db.close());
for(const kind of ['pickup','delivery'])for(const timing of ['asap','preorder'])test(`${kind}/${timing} persists, reaches staff, keeps schedule, confirms/rejects and remains private`,async()=>{
 const customer=await buyer(),p=payload(kind,timing),o=await create(p);
 const own=(await db.query('select * from public.orders where id=$1',[o.id])).rows[0];assert.equal(own.name,p.name);assert.equal(own.phone,p.phone);assert.equal(own.total,p.total);if(timing==='preorder'){assert.equal(own.requested_date.toISOString().slice(0,10),date);assert.equal(own.requested_time,'18:30:00');}
 const requestId=own.request_id;assert.deepEqual(await create(p,requestId),o);
 await buyer();assert.equal((await db.query('select * from public.orders where id=$1',[o.id])).rows.length,0);await assert.rejects(db.query("select public.order_status($1,'accepted',15,1)",[o.id]),/Доступ запрещён/);
 await who(S);assert.equal((await db.query('select * from public.orders where id=$1',[o.id])).rows.length,1);await db.query("select public.order_status($1,'accepted',15,1)",[o.id]);
 await who(customer);const accepted=(await db.query('select * from public.orders where id=$1',[o.id])).rows[0];assert.equal(accepted.status,'accepted');assert.equal(accepted.requested_time,own.requested_time);assert.deepEqual(accepted.requested_date,own.requested_date);assert.equal(accepted.pickup_number!=null,kind==='pickup');
 await who(S);await db.query("select public.order_status($1,'rejected',null,2)",[o.id]);await who(customer);assert.equal((await db.query('select status from public.orders where id=$1',[o.id])).rows[0].status,'rejected');
});
test('pickup accepts omitted/null/whitespace/partial contacts; provided bad values and client prices remain rejected',async()=>{
 for(const contacts of [{name:null,phone:null},{name:'   ',phone:' '},{name:'Тест',phone:''},{name:'',phone:'+70000000000'},{}]){await buyer();let p=payload('pickup','asap');delete p.name;delete p.phone;Object.assign(p,contacts);const o=await create(p);const saved=(await db.query('select name,phone from public.orders where id=$1',[o.id])).rows[0];assert.equal(saved.name,(contacts.name||'').trim());assert.equal(saved.phone,(contacts.phone||'').trim());}
 for(const extra of [{name:'x'.repeat(101)},{phone:'abc'},{phone:'123'},{total:1}]){await buyer();await assert.rejects(create({...payload('pickup','asap'),...extra}));}
});
test('both delivery types still require name, phone, district and address on server',async()=>{
 for(const timing of ['asap','preorder'])for(const field of ['name','phone','area','address'])for(const value of ['',null,'            ']){await buyer();await assert.rejects(create({...payload('delivery',timing),[field]:value}));}
});
test('contact-optional checkout does not remove project-wide anti-spam budget',async()=>{
 for(let i=0;i<10;i++){await buyer();await create({...payload('pickup','asap'),comment:String(i)});}await buyer();await assert.rejects(create(payload('pickup','asap')),/Слишком много заявок/);
});
test('capability probe is public and contains no customer data',async()=>{await db.exec('reset role');await db.exec('set role anon');const c=(await db.query('select public.checkout_capabilities() as r')).rows[0].r;assert.deepEqual(c,{version:9,pickupContactOptional:true,deliveryContactRequired:true});});
test('atomic owner installer is reapplicable and rolls back all fixture orders/audit/cells',async()=>{
 await db.exec('reset role');const before={orders:(await db.query('select count(*)::int n from public.orders')).rows[0].n,audit:(await db.query('select count(*)::int n from public.audit')).rows[0].n,counter:(await db.query('select * from missmaki_guard.pickup_counter')).rows};
 const sql=fs.readFileSync('supabase/INSTALL_OPTIONAL_PICKUP_009.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n,before.orders);assert.equal((await db.query('select count(*)::int n from public.audit')).rows[0].n,before.audit);assert.deepEqual((await db.query('select * from missmaki_guard.pickup_counter')).rows,before.counter);assert.equal((await db.query("select tgenabled from pg_trigger where tgname='orders_submission_budget'")).rows[0].tgenabled,'O');
});

test('successive anonymous kiosk intentions are distinct while retries retain one order',async()=>{
 await buyer();const firstPayload={...payload('pickup','asap'),clientIntent:randomUUID()},request=randomUUID();const first=await create(firstPayload,request);assert.deepEqual(await create(firstPayload,request),first);const second=await create({...firstPayload,clientIntent:randomUUID()});assert.notEqual(second.id,first.id);assert.equal((await db.query('select count(*)::int n from public.orders')).rows[0].n,2);
});
test('failed owner self-check rolls back the migration rather than leaving a false capability marker',async()=>{
 const isolated=new PGlite();try{
  await isolated.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;create publication supabase_realtime;");
  for(const f of ['001_kitchen.sql','002_catalog.sql','007_backup_and_test_records.sql','008_pickup_cells.sql'])await isolated.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  const before=(await isolated.query("select pg_get_functiondef('public.create_order(uuid,jsonb)'::regprocedure) as body")).rows[0].body;
  await assert.rejects(isolated.exec(fs.readFileSync('supabase/INSTALL_OPTIONAL_PICKUP_009.sql','utf8')),/нет существующего администратора/);await isolated.exec('rollback');
  assert.equal((await isolated.query("select to_regprocedure('public.checkout_capabilities()') as f")).rows[0].f,null);assert.equal((await isolated.query("select pg_get_functiondef('public.create_order(uuid,jsonb)'::regprocedure) as body")).rows[0].body,before);
 }finally{await isolated.close();}
});
