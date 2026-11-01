/* global supabase */
(()=>{
 const c=window.MISSMAKI_CONFIG;
 let client,signing;
 async function timedFetch(url,init={}){
  const controller=new AbortController();const abort=()=>controller.abort();
  if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,15000);
  try{return await fetch(url,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
 }
 window.MM={
  enabled:!!c?.enabled,
  client(){
   if(!c?.enabled||!/^https:\/\/[a-z0-9.-]+$/.test(c.supabaseUrl)||!c.publishableKey)throw Error('Система кухни ещё не подключена');
   if(!window.supabase)throw Error('Не удалось загрузить систему. Проверьте интернет');
   return client??=supabase.createClient(c.supabaseUrl,c.publishableKey,{global:{fetch:timedFetch},auth:{storageKey:location.pathname.startsWith('/kitchen')?'mm-staff':'mm-customer',persistSession:true,autoRefreshToken:true}});
  },
  async captcha(){
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
  async customer(){if(signing)return signing;signing=(async()=>{const s=this.client();const {data,error}=await s.auth.getSession();if(error)throw error;if(!data.session){const r=await s.auth.signInAnonymously({options:{captchaToken:await this.captcha()}});if(r.error)throw r.error;}return s;})();try{return await signing;}finally{signing=null;}},
  async rpc(name,args={}){const {data,error}=await this.client().rpc(name,args);if(error)throw error;return data;},
  subscribe(refresh,health){
   let running=false,stopped=false,last=Date.now();
   const tick=async()=>{if(running||stopped)return;running=true;try{await refresh();last=Date.now();health?.(true);}catch(e){health?.(false,e);}finally{running=false;}};
   const ch=this.client().channel('mm-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'orders'},tick).on('postgres_changes',{event:'*',schema:'public',table:'reviews'},tick).subscribe(state=>{if(state==='SUBSCRIBED')tick();});
   const timer=setInterval(()=>{if(Date.now()-last>15000)health?.(false,Error('Давно нет ответа сервера'));tick();},3000);const online=()=>tick();const visible=()=>{if(!document.hidden)tick();};window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);tick();
   return ()=>{stopped=true;clearInterval(timer);this.client().removeChannel(ch);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);};
  }
 };
})();
