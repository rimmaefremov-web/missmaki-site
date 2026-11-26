/* MM_COMPAT_BUNDLE_START */
/* Secure browser compatibility. No Math.random fallback; no identifiers change on retry. */
(function(root){
 'use strict';
 // Upgrade only the production hosts; keep local and preview HTTP environments intact.
 if(root.location&&root.location.protocol==='http:'&&/^(www\.)?missmaki\.ru$/i.test(root.location.hostname)){
  let target=root;
  // Upgrade the same-origin kiosk wrapper as well, including an older cached wrapper.
  try{if(root.top&&root.top!==root&&root.top.location.origin===root.location.origin)target=root.top;}catch(e){}
  const loc=target.location;loc.replace('https://'+loc.host+loc.pathname+loc.search+loc.hash);
 }
 function uuid(){
  const c=root.crypto;
  if(c&&typeof c.randomUUID==='function'&&c.randomUUID!==uuid){try{return c.randomUUID();}catch(e){/* CSPRNG fallback below. */}}
  if(!c||typeof c.getRandomValues!=='function')throw Error('Для безопасного оформления откройте сайт в обновлённом Safari или Chrome по HTTPS.');
  const b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 }
 function message(error,fallback){
  const text=typeof error==='string'?error:error&&error.message;
  if(typeof text==='string'&&/[А-Яа-яЁё]/.test(text)&&!/(randomUUID|crypto\.|TypeError|ReferenceError|SyntaxError|undefined|not a function|PGRST|SQLSTATE|JWT|\bat\s+https?:\/\/)/i.test(text))return text.slice(0,500);
  return fallback||'Не удалось подтвердить отправку. Проверьте интернет и повторите с той же корзиной — повторный заказ не создастся.';
 }
 function ensureCheckoutCrypto(){
  if(root.isSecureContext===false||!root.crypto||!root.crypto.subtle||typeof root.crypto.subtle.digest!=='function')throw Error('Для безопасного оформления откройте https://missmaki.ru в Safari или Chrome. Во встроенном браузере выберите «Открыть в браузере».');
 }
 // Also support older cached inline scripts that still call the missing native API.
 if(root.crypto&&typeof root.crypto.randomUUID!=='function'){try{Object.defineProperty(root.crypto,'randomUUID',{value:uuid,writable:true,configurable:true});}catch(e){/* Direct MMCompat.uuid remains available on sealed Crypto objects. */}}
 root.MMCompat=Object.freeze({uuid,message,ensureCheckoutCrypto});
})(typeof globalThis!=='undefined'?globalThis:window);
/* MM_COMPAT_BUNDLE_END */
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
   const sdk=supabase.createClient(c.supabaseUrl,c.publishableKey,{global:{fetch:timedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'mm-guest-probe-'+MMCompat.uuid()}});
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
   let result=await this.client().from('orders').select('number,status,minutes,fulfillment,timing,requested_date,requested_time,pickup_number,total,items,is_test').eq('request_id',request).maybeSingle();
   // Backward compatibility before migration 008 is approved and installed.
   if(['42703','PGRST204'].includes(result.error?.code))result=await this.client().from('orders').select('number,status,minutes').eq('request_id',request).maybeSingle();
   if(result.error)throw result.error;return result.data;
  },
  orderMessage(data,now=new Date()){
   const pickup=data.fulfillment==='pickup',preorder=data.timing==='preorder';
   if(data.status==='rejected')return 'ВАШ ЗАКАЗ НЕ ПРИНЯТ.\nК сожалению, сейчас мы не можем выполнить Ваш заказ. Приносим свои извинения.';
   if(data.status==='completed')return `ЗАКАЗ №${data.number} ВЫПОЛНЕН.`;
   if(data.status!=='accepted')return 'ВАШ ЗАКАЗ ОТПРАВЛЕН!\n\nСпасибо, что выбрали MissMaki!\n\nОЖИДАЙТЕ ПОДТВЕРЖДЕНИЯ ЗАКАЗА.\n\nНе закрывайте и не обновляйте страницу, не блокируйте экран телефона. Подтверждение заказа и время готовности появятся здесь автоматически.';
   let message;
   if(preorder){
    const date=data.requested_date||'',time=(data.requested_time||'').slice(0,5);
    const when=time+(date?' '+date.split('-').reverse().join('.'):'');
    message='ВАШ ПРЕДЗАКАЗ ПРИНЯТ!\n'+(pickup?`Будет готов к ${when}.\nБудем Вас ждать!`:`Доставим к ${when}.`);
   }else message='ВАШ ЗАКАЗ ПРИНЯТ!\n'+(pickup?`Будет готов через ${data.minutes} минут.\nБудем Вас ждать!`:`Доставим в течение ${data.minutes} минут.`);
   if(pickup&&Number.isInteger(data.pickup_number)&&data.pickup_number>=1&&data.pickup_number<=6)message+=`\n\nЯчейка самовывоза: №${data.pickup_number}\nОплата при получении на кассе.`;
   return message;
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
   const ch=this.databaseGuest()?null:this.client().channel('mm-'+MMCompat.uuid()).on('postgres_changes',{event:'*',schema:'public',table:'orders'},tick).on('postgres_changes',{event:'*',schema:'public',table:'reviews'},tick).subscribe(state=>{if(state==='SUBSCRIBED')tick();});
   const timer=setInterval(()=>{if(Date.now()-last>15000)health?.(false,Error('Давно нет ответа сервера'));tick();},3000);const online=()=>tick();const visible=()=>{if(!document.hidden)tick();};window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);tick();
   return ()=>{stopped=true;clearInterval(timer);if(ch)this.client().removeChannel(ch);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);};
  }
 };
})();
