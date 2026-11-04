/* global supabase */
(()=>{
 const c=window.MISSMAKI_CONFIG;
 let client;
 async function timedFetch(url,init={}){
  const controller=new AbortController();const abort=()=>controller.abort();
  if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,15000);
  try{return await fetch(url,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
 }
 if(c?.enabled&&c.deploymentMode==='test'){document.addEventListener('DOMContentLoaded',()=>{const note=document.createElement('p');note.id='mm-test-banner';note.textContent='ТЕСТОВАЯ ВЕРСИЯ. Только вымышленные данные. Рабочий сайт не переключён.';note.style.cssText='background:#fff1b8;color:#382700;padding:12px;margin:0;font:16px/1.5 system-ui;text-align:center';document.body.prepend(note);});}
 window.MM={
  enabled:!!c?.enabled,
  client(){
   if(!c?.enabled||!/^https:\/\/[a-z0-9.-]+$/.test(c.supabaseUrl)||!c.publishableKey)throw Error('Система кухни ещё не подключена');
   if(c.deploymentProfile==='ru'&&(/(^|\.)supabase\.co$/i.test(new URL(c.supabaseUrl).hostname)||c.captchaSiteKey))throw Error('Российский профиль: зарубежное облако и Cloudflare CAPTCHA не подключаются');
   if(!window.supabase)throw Error('Не удалось загрузить систему. Проверьте интернет');
   return client??=supabase.createClient(c.supabaseUrl,c.publishableKey,{global:{fetch:timedFetch},auth:{detectSessionInUrl:false,...(this.databaseGuest()?{persistSession:false,autoRefreshToken:false,storageKey:'mm-capability-sdk'}:{persistSession:true,autoRefreshToken:true,storageKey:location.pathname.startsWith('/kitchen')?'mm-staff':'mm-customer'})}});
  },
  async captcha(){
   if(c.deploymentProfile==='ru'){if(c.captchaSiteKey)throw Error('Для российского профиля настройте защиту на российском сервере');return undefined;}
   if(!c.captchaSiteKey)return undefined;
   if(!window.turnstile){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>reject(Error('Не удалось загрузить проверку. Повторите попытку'));document.head.append(script);});}
   return new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog');const title=document.createElement('p');title.textContent='Подтвердите, что вы человек';const target=document.createElement('div');const close=document.createElement('button');close.textContent='Отмена';dialog.append(title,target,close);document.body.append(dialog);dialog.showModal();
    let widget;let ended=false;const finish=(error,token)=>{if(ended)return;ended=true;clearTimeout(timer);if(widget!==undefined)turnstile.remove(widget);dialog.close();dialog.remove();error?reject(error):resolve(token);};
    const timer=setTimeout(()=>finish(Error('Проверка не завершена. Повторите попытку')),120000);
    close.onclick=()=>finish(Error('Проверка отменена'));dialog.oncancel=e=>{e.preventDefault();finish(Error('Проверка отменена'));};
    widget=turnstile.render(target,{sitekey:c.captchaSiteKey,callback:token=>finish(null,token),'error-callback':()=>finish(Error('Не удалось пройти проверку')),'expired-callback':()=>finish(Error('Проверка истекла. Повторите попытку'))});
   });
  },
  async customer(){if(this._signing)return this._signing;this._signing=(async()=>{const s=this.client();if(this.databaseGuest()){if(navigator.locks)await navigator.locks.request('mm-guest-session',()=>this.ensureGuest());else await this.ensureGuest();return s;}const {data,error}=await s.auth.getSession();if(error)throw error;if(!data.session){const r=await this.signInAnonymous(s);if(r.error){if((r.error.code==='anonymous_provider_disabled'||/anonymous sign-ins are disabled/i.test(r.error.message||'')))throw Error('Приём тестовых заказов пока недоступен: в базе отключён анонимный вход покупателей. Заказ не отправлен.');throw r.error;}}return s;})();try{return await this._signing;}finally{this._signing=null;}},
  async signInAnonymous(s){
   const r=typeof s.rpc==='function'?await s.rpc('auth_signup_challenge',{}):{data:null,error:{code:'PGRST202'}};
   if(r.error&&r.error.code!=='PGRST202')throw Error('Не удалось проверить вход. Попробуйте позже.');
   if(!r.data){if(c.authProofRequired)throw Error('Серверная защита ещё не установлена. Заказ не отправлен.');return s.auth.signInAnonymously({options:{captchaToken:await this.captcha()}});}
   const solution=await this.solve(r.data);
   return s.auth.signInAnonymously({options:{data:{mm_proof:{challenge:r.data,solution}}}});
  },
    databaseGuest(){return c?.guestMode==='database-token'&&!location.pathname.startsWith('/kitchen');},
  guestRecord(){try{const r=JSON.parse(localStorage.getItem('mm-guest-session'));return r?.project===c.supabaseUrl&&/^[a-f0-9]{64}$/.test(r?.token)?r:null;}catch{return null;}},
  storeGuest(record){localStorage.setItem('mm-guest-session',JSON.stringify({...record,project:c.supabaseUrl}));},
  async sandboxGuest(){
   const sandbox=Object.create(this);let record=null;sandbox._signing=null;
   const sdk=supabase.createClient(c.supabaseUrl,c.publishableKey,{global:{fetch:timedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'mm-guest-probe-'+crypto.randomUUID()}});
   sandbox.client=()=>sdk;sandbox.databaseGuest=()=>true;sandbox.guestRecord=()=>record;sandbox.storeGuest=r=>{record=r;};
   await sandbox.ensureGuest();return sandbox;
  },
  async solve(challenge){
   return new Promise((resolve,reject)=>{
    const worker=new Worker('/shared/guest-pow-worker.mjs',{type:'module'});
    const finish=(err,value)=>{clearTimeout(timer);worker.terminate();err?reject(err):resolve(value);};
    const timer=setTimeout(()=>finish(Error('Проверка отправки заняла слишком долго. Повторите попытку')),90000);
    worker.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(null,e.data.solution);
    worker.onerror=()=>finish(Error('Не удалось проверить отправку. Откройте тестовую HTTPS-версию и повторите'));
    worker.postMessage(challenge);
   });
  },
  async rawRpc(name,args={}){const {data,error}=await this.client().rpc(name,args);if(error){if(error.code==='PGRST202'&&name.startsWith('guest_'))throw Error('В тестовой базе ещё не подключён модуль гостевых заказов (миграция 003). Заказ не отправлен.');throw error;}return data;},
  async guestProof(token,scope,request=null,payload={}){
   const challenge=await this.rawRpc('guest_challenge',{p_token:token,p_scope:scope,p_request:request,p_payload:payload});
   return {p_challenge:challenge,p_solution:await this.solve(challenge)};
  },
  async ensureGuest(){
   let record=this.guestRecord();
   if(record?.expiresAt&&new Date(record.expiresAt).getTime()>Date.now()+60000)return;
   if(record?.expiresAt)record=null;
   if(!record){record={token:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),expiresAt:null};this.storeGuest(record);}
   const proof=await this.guestProof(record.token,'session');
   const result=await this.rawRpc('guest_session',{p_token:record.token,...proof});
   if(!result?.ok)throw Error('Не удалось создать защищённую гостевую сессию');
   if(this.guestRecord()?.token!==record.token)throw Error('Сессия обновилась в другой вкладке. Повторите отправку');
   this.storeGuest({token:record.token,expiresAt:result.expiresAt});
  },
  async hasCustomer(){if(this.databaseGuest())return !!this.guestRecord();const {data,error}=await this.client().auth.getSession();if(error)throw error;return !!data.session;},
  async order(request){
   await this.customer();
   if(this.databaseGuest())return this.rawRpc('guest_order',{p_token:this.guestRecord().token,p_request:request});
   let result=await this.client().from('orders').select('number,status,minutes,fulfillment,timing,requested_date,requested_time,pickup_number').eq('request_id',request).maybeSingle();
   // Backward compatibility before migration 008 is approved and installed.
   if(['42703','PGRST204'].includes(result.error?.code))result=await this.client().from('orders').select('number,status,minutes').eq('request_id',request).maybeSingle();
   if(result.error)throw result.error;return result.data;
  },
  orderMessage(data){
   if(data.status==='accepted'&&data.fulfillment==='pickup'&&Number.isInteger(data.pickup_number)&&data.pickup_number>=1&&data.pickup_number<=6){
    const n=data.pickup_number;
    if(data.timing==='preorder'){
     const date=/^\d{4}-\d{2}-\d{2}$/.test(data.requested_date||'')?data.requested_date.split('-').reverse().join('.'):null;
     const time=/^\d{2}:\d{2}/.test(data.requested_time||'')?data.requested_time.slice(0,5):null;
     if(date&&time)return `Ваш предзаказ подтверждён! 🍣\n\n📅 Дата получения: ${date}\n\n🕒 Время получения: ${time}\n\n📦 Ячейка самовывоза: №${n}\n\nВаш заказ будет ждать вас в ячейке №${n} к выбранному времени.\n\nОплата при получении на кассе.\n\nСпасибо, что планируете вкусные моменты вместе с MissMaki! ❤️`;
    }else return `Ваш заказ подтверждён! 🍣\n\n⏱ Время ожидания: ${data.minutes} минут\n\n📦 Ячейка самовывоза: №${n}\n\nВаш заказ будет ждать вас в ячейке №${n}.\n\nОплата при получении на кассе.\n\nСпасибо, что выбираете MissMaki! ❤️`;
   }
   return data.status==='accepted'?`Ваш заказ №${data.number} принят! Время ожидания — ${data.minutes} минут`:data.status==='rejected'?'К сожалению, сейчас мы не можем принять ваш заказ':data.status==='completed'?`Заказ №${data.number} выполнен`:`Заказ №${data.number} отправлен. Ожидаем подтверждения MissMaki…`;
  },
  async rpc(name,args={}){
   if(!this.databaseGuest()||name==='public_reviews')return this.rawRpc(name,args);
   if(name==='availability')return this.rawRpc('guest_availability',args);
   if(name==='my_reviews'){if(!this.guestRecord())return [];return this.rawRpc('guest_my_reviews',{p_token:this.guestRecord().token});}
   if(name==='create_order'||name==='submit_review'){
    await this.customer();const token=this.guestRecord().token;const review=name==='submit_review';
    const payload=review?{name:args.p_name,rating:args.p_rating,body:args.p_body,consent:args.p_consent}:args.p;
    const proof=await this.guestProof(token,review?'review':'order',args.p_request,payload);
    const result=await this.rawRpc(review?'guest_submit_review':'guest_create_order',{...args,p_token:token,...proof});
    if(result?.ok===false)throw Error(result.message||'Не удалось сохранить данные');
    return review?result.id:result;
   }
   return this.rawRpc(name,args);
  },
  subscribe(refresh,health){
   let running=false,stopped=false,last=Date.now();
   const tick=async()=>{if(running||stopped)return;running=true;try{await refresh();last=Date.now();health?.(true);}catch(e){health?.(false,e);}finally{running=false;}};
   const ch=this.databaseGuest()?null:this.client().channel('mm-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'orders'},tick).on('postgres_changes',{event:'*',schema:'public',table:'reviews'},tick).subscribe(state=>{if(state==='SUBSCRIBED')tick();});
   const timer=setInterval(()=>{if(Date.now()-last>15000)health?.(false,Error('Давно нет ответа сервера'));tick();},3000);const online=()=>tick();const visible=()=>{if(!document.hidden)tick();};window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);tick();
   return ()=>{stopped=true;clearInterval(timer);if(ch)this.client().removeChannel(ch);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);};
  }
 };
})();
