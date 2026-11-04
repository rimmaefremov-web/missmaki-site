const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const {randomUUID}=require('node:crypto');const {pathToFileURL}=require('node:url');const path=require('node:path');
const db=new PGlite(),S='33333333-3333-4333-8333-333333333333',A='11111111-1111-4111-8111-111111111111';let date;
async function role(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(id?'set role authenticated':'set role anon');}
async function counter(){await db.exec('reset role');return (await db.query('select last_value,issued::int from missmaki_guard.pickup_counter')).rows[0];}
async function row(id){await role(S);return (await db.query('select * from public.orders where id=$1',[id])).rows[0];}
let index=0;
async function order(fulfillment='pickup',timing='asap'){
 // Direct owner fixture inserts avoid business-hour clock assumptions; the actual status RPC is tested.
 await db.exec('reset role');const id=randomUUID();const slot=String(14+Math.floor(index/2)).padStart(2,'0')+':'+(index++%2?'30':'00');
 await db.query(`insert into public.orders(id,customer_id,request_id,payload,name,phone,address,area,fulfillment,timing,requested_date,requested_time,items,subtotal,delivery,total,comment) values($1,$2,$3,'{}','Тест','+70000000000','Тест','Тест',$4,$5,$6,$7,'[]',470,0,470,'')`,[id,A,randomUUID(),fulfillment,timing,timing==='preorder'?date:null,timing==='preorder'?slot:null]);return id;
}
async function change(id,status='accepted',minutes=15){const r=await row(id);await db.query('select public.order_status($1,$2,$3,$4)',[id,status,minutes,r.version]);return row(id);}
before(async()=>{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;");
 for(const f of ['001_kitchen.sql','002_catalog.sql','004_review_moderation_idempotency.sql','007_backup_and_test_records.sql','008_pickup_cells.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users values($1),($2)',[S,A]);await db.query("insert into public.staff values($1,'admin')",[S]);date=(await db.query("select ((now() at time zone 'Europe/Moscow')::date+1)::text as d")).rows[0].d;
});after(()=>db.close());
test('ordinary pickup and scheduled pickup share exactly 1,2,3,4,5,6,1 with no occupancy check',async()=>{
 const cells=[];for(let i=0;i<7;i++){const id=await order('pickup',i%2?'preorder':'asap');assert.equal((await row(id)).pickup_number,null);const before=await row(id);const accepted=await change(id);cells.push(accepted.pickup_number);assert.deepEqual(accepted.requested_date,before.requested_date);assert.equal(accepted.requested_time,before.requested_time);}
 assert.deepEqual(cells,[1,2,3,4,5,6,1]);assert.deepEqual(await counter(),{last_value:1,issued:7});
});
test('delivery and refusal before acceptance do not consume a cell',async()=>{
 const before=await counter();for(const timing of ['asap','preorder']){const id=await order('delivery',timing);assert.equal((await change(id)).pickup_number,null);}
 const refused=await order();assert.equal((await change(refused,'rejected',null)).pickup_number,null);assert.deepEqual(await counter(),before);
});
test('every wait button works; repeated/reversed decisions preserve the first cell',async()=>{
 const id=await order(),first=await change(id),fixed=first.pickup_number,snapshot=await counter();
 for(const minutes of [15,30,45,60,90,120,150,180])assert.equal((await change(id,'accepted',minutes)).pickup_number,fixed);
 await change(id,'rejected',null);await change(id,'new',null);assert.equal((await change(id,'accepted',30)).pickup_number,fixed);assert.deepEqual(await counter(),snapshot);
 await role(S);await assert.rejects(db.query('select public.order_status($1,\'accepted\',15,$2)',[id,1]),/изменён/);await assert.rejects(db.query('select public.order_status($1,\'accepted\',15,null)',[id]),/изменён/);assert.deepEqual(await counter(),snapshot);
});
test('denied/invalid/rolled-back confirmations cannot advance the transactional counter',async()=>{
 const id=await order(),before=await counter();await role(A);await assert.rejects(db.query("select public.order_status($1,'accepted',15,1)",[id]),/Доступ запрещён/);await assert.rejects(db.query('select * from missmaki_guard.pickup_counter'),/permission denied/);await assert.rejects(db.query('update public.orders set pickup_number=1 where id=$1',[id]),/permission denied/);
 await role(S);await assert.rejects(db.query("select public.order_status($1,'accepted',20,1)",[id]),/Неверный/);
 await db.exec('begin');await db.query("select public.order_status($1,'accepted',15,1)",[id]);await db.exec('rollback');assert.equal((await row(id)).pickup_number,null);assert.deepEqual(await counter(),before);
});
test('already assigned cells are immutable even for direct owner updates, and migration reruns do not reset',async()=>{
 const id=await order(),accepted=await change(id);await db.exec('reset role');await assert.rejects(db.query('update public.orders set pickup_number=null where id=$1',[id]),/закреплён/);await assert.rejects(db.query('update public.orders set pickup_number=$1 where id=$2',[accepted.pickup_number%6+1,id]),/закреплён/);
 const snapshot=await counter();await db.exec(fs.readFileSync('supabase/migrations/008_pickup_cells.sql','utf8'));assert.deepEqual(await counter(),snapshot);assert.equal((await row(id)).pickup_number,accepted.pickup_number);
});
test('backups preserve cell numbers and counter; restore cannot rewind a more recent counter',async()=>{
 await role(S);const backup={...(await db.query('select public.business_backup() as r')).rows[0].r,project:'https://orders.example.com'};assert(backup.pickupCounter.issued>0);
 const {restoreSql}=await import(pathToFileURL(path.resolve('kitchen/backup-crypto.mjs')));const id=await order(),next=await change(id);const advanced=await counter();await db.exec(restoreSql(backup,backup.project));assert.deepEqual(await counter(),advanced);assert.equal((await row(id)).pickup_number,next.pickup_number);
 await db.exec('reset role');await db.exec('begin');await db.query('delete from public.orders');await db.query('update missmaki_guard.pickup_counter set issued=0,last_value=0');await db.exec(restoreSql(backup,backup.project).replace(/^begin;$/m,'').replace(/^commit;$/m,''));assert.deepEqual(await counter(),{last_value:backup.pickupCounter.lastValue,issued:backup.pickupCounter.issued});const restored=(await db.query('select pickup_number from public.orders where pickup_number is not null')).rows;assert.equal(restored.length,backup.orders.filter(o=>o.pickup_number!=null).length);await db.exec('rollback');
});
test('forged cell in checkout payload is ignored; only confirmation assigns the next server number',async()=>{
 const before=await counter(),buyer=randomUUID();await db.query('insert into auth.users values($1)',[buyer]);await role(buyer);
 const payload={name:'Тест',phone:'+70000000000',fulfillment:'pickup',area:'Самовывоз',timing:'preorder',requestedDate:date,requestedTime:'23:00',items:[{sku:'5:0',quantity:1}],subtotal:470,delivery:0,total:470,pickup_number:(before.last_value+2)%6+1};
 const created=(await db.query('select public.create_order($1,$2) as r',[randomUUID(),payload])).rows[0].r;assert.equal((await row(created.id)).pickup_number,null);assert.deepEqual(await counter(),before);assert.equal((await change(created.id)).pickup_number,before.last_value%6+1);
});
test('queued confirmations share the counter and duplicate stale confirmations cannot allocate twice',async()=>{
 // PGlite serializes these requests on one connection; independent network transactions require staging acceptance.
 const a=await order(),b=await order('pickup','preorder'),before=await counter();await role(S);
 await Promise.all([a,b].map(id=>db.query("select public.order_status($1,'accepted',15,1)",[id])));assert.equal((await row(a)).pickup_number,before.last_value%6+1);assert.equal((await row(b)).pickup_number,(before.last_value+1)%6+1);assert.equal((await counter()).issued,before.issued+2);
 const c=await order(),start=await counter();await role(S);const replies=await Promise.allSettled([0,1].map(()=>db.query("select public.order_status($1,'accepted',15,1)",[c])));assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal((await counter()).issued,start.issued+1);
});
