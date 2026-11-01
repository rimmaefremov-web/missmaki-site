const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {PGlite}=require('@electric-sql/pglite');
function settings(host='preview.example.com'){
 const values=new Map();const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const window={MISSMAKI_CONFIG:{enabled:false,deploymentMode:'test',deploymentProfile:'ru'}};
 vm.runInNewContext(fs.readFileSync('preview-tools/settings.js','utf8'),{window,location:{hostname:host,protocol:'https:'},localStorage,URL,atob});return {settings:window.MMPreviewSettings,values};
}
test('public settings remain local, reject service keys and cannot change the live domain',()=>{
 const {settings:s,values}=settings();values.set('mm-staff','OLD_SESSION');s.save('https://orders.example.com','sb_publishable_TEST_FIXTURE_ONLY');assert.equal(values.has('mm-staff'),false);assert.equal(JSON.parse(values.get('mm-preview-public-settings')).deploymentMode,'test');
 assert.throws(()=>s.save('https://orders.example.com','sb_secret_NOT_ALLOWED'));
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.TEST_SIGNATURE';assert.throws(()=>s.save('https://orders.example.com',jwt));
 assert.throws(()=>settings('missmaki.ru').settings.save('https://orders.example.com','sb_publishable_TEST_FIXTURE_ONLY'));
});
test('browser diagnostic suite exercises all wait times and actual SQL permissions on a synthetic order',async()=>{
 const db=new PGlite(),staffId='33333333-3333-4333-8333-333333333333',a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`);
  for(const f of ['001_kitchen.sql','002_catalog.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users values($1),($2),($3)',[staffId,a,b]);await db.query("insert into public.staff values($1,'admin')",[staffId]);
  async function request(uid,sql,params=[]){try{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');const r=await db.query(sql,params);return {data:r.rows,error:null};}catch(error){return {data:null,error:{code:error.code,message:error.message}};}}
  function client(uid){return {auth:{signOut:async()=>({})},async rpc(name,p={}){
   const functions={is_staff:[],availability:['p_date','p_time'],create_order:['p_request','p'],order_status:['p_id','p_status','p_minutes','p_version']};const keys=functions[name];assert(keys);const r=await request(uid,'select public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') as value',keys.map(k=>p[k]));return r.error?r:{data:r.data[0].value,error:null};
  },from(table){assert(['orders','audit'].includes(table));let columns='id',update,filter;const q={select(c){assert(/^[a-z_,]+$/.test(c));columns=c;return q;},eq(k,v){assert(['id','request_id','entity_id'].includes(k));filter=[k,v];return q;},update(p){update=p;return q;},then(resolve,reject){let sql,params;if(update){assert.deepEqual(Object.keys(update),['comment']);sql='update public.'+table+' set comment=$1 where '+filter[0]+'=$2';params=[update.comment,filter[1]];}else{sql='select '+columns+' from public.'+table+' where '+filter[0]+'=$1';params=[filter[1]];}return request(uid,sql,params).then(resolve,reject);}};return q;}};}
  const window={};vm.runInNewContext(fs.readFileSync('preview-tools/diagnostics-suite.js','utf8'),{window,Intl,Date,crypto:globalThis.crypto});let i=0;
  const report=await window.MMTestSuite({staff:client(staffId),makeCustomer:async()=>{const id=[a,b][i++];return {id,client:client(id)};}});
  assert.equal(report.complete,true,JSON.stringify(report));assert.equal(report.steps.length,18);for(const m of [15,30,45,60,90,120,150,180])assert(report.steps.some(s=>s.result==='ok'&&s.name.startsWith(m+' минут')));
  await db.exec('reset role');const rows=(await db.query('select name,phone,status from public.orders')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'rejected');assert(rows[0].name.startsWith('АВТОТЕСТ'));assert(!JSON.stringify(report).includes('33333333'));
 }finally{await db.close();}
});
