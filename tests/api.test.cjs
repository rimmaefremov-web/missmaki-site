const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function load(client,extra={}){
 let options;
 const window={MISSMAKI_CONFIG:{enabled:true,supabaseUrl:'https://fixture-only.supabase.co',publishableKey:'TEST_FIXTURE_ONLY'}};
 const context={window,location:{pathname:'/'},supabase:{createClient(_url,_key,opts){options=opts;return client;}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,fetch,Date,...extra};
 window.supabase=context.supabase;
 vm.runInNewContext(fs.readFileSync('shared/api.js','utf8'),context);return {api:window.MM,options:()=>options};
}
test('simultaneous first actions share one anonymous sign-in',async()=>{
 let signins=0,release;const gate=new Promise(resolve=>release=resolve);
 const client={auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>{signins++;await gate;return {data:{}};}}};
 const {api}=load(client);const a=api.customer(),b=api.customer();await new Promise(resolve=>setImmediate(resolve));assert.equal(signins,1);release();assert.equal(await a,client);assert.equal(await b,client);
});
test('hung API requests time out and external cancellation is forwarded',async()=>{
 const timers=new Map();let seq=0;
 const {api,options}=load({}, {setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},fetch(_url,init){return new Promise((_resolve,reject)=>{if(init.signal.aborted)return reject(Error('aborted'));init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});}});
 api.client();const f=options().global.fetch;
 const first=f('https://fixture-only.supabase.co');assert.equal(timers.size,1);[...timers.values()][0]();await assert.rejects(first,/aborted/);assert.equal(timers.size,0);
 const c=new AbortController();const second=f('https://fixture-only.supabase.co',{signal:c.signal});c.abort();await assert.rejects(second,/aborted/);assert.equal(timers.size,0);
});

test('disabled anonymous provider gives an explicit error without a false order confirmation',async()=>{
 for(const code of ['anonymous_provider_disabled',422]){const client={auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>({error:{code,message:'Anonymous sign-ins are disabled'}})}};
 const {api}=load(client);await assert.rejects(api.customer(),/отключён анонимный вход покупателей.*Заказ не отправлен/);}
});

test('admin guest diagnostics use isolated anonymous SDK clients and never staff credentials',async()=>{
 const staff={auth:{getSession:async()=>({data:{session:{user:{id:'STAFF_FIXTURE'}}}})}};const calls=[];
 const guest={rpc:async(name,args)=>{calls.push(name);if(name==='guest_challenge')return {data:{seal:'test',bits:18},error:null};if(name==='guest_session')return {data:{ok:true,expiresAt:new Date(Date.now()+86400000).toISOString()},error:null};return {data:[],error:null};}};
 const {api}=load(staff,{crypto:globalThis.crypto,navigator:{locks:null},supabase:{createClient(_u,_k,opts){return opts.auth.storageKey.startsWith('mm-guest-probe-')?guest:staff;}}});
 api.solve=async()=> 'fixture-proof';const a=await api.sandboxGuest(),b=await api.sandboxGuest();assert.notEqual(a.guestRecord().token,b.guestRecord().token);assert.equal(api.client(),staff);assert.equal(a.client(),guest);assert.equal(api.guestRecord(),null);assert.equal(await api.hasCustomer(),true);assert.deepEqual(calls,['guest_challenge','guest_session','guest_challenge','guest_session']);
});
