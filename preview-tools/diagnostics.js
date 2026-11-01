(()=>{
 const $=id=>document.getElementById(id);let running=false;
 if(window.MISSMAKI_CONFIG?.deploymentMode!=='test'||!MMPreviewSettings.allowed()){$('auth').hidden=true;$('error').textContent='Проверка доступна только в отдельной тестовой копии';return;}
 async function ready(){const s=MM.client();const {data,error}=await s.auth.getSession();if(error)throw error;const r=data.session?await s.rpc('is_staff'):{data:false};if(r.error)throw r.error;const yes=r.data===true;$('run').disabled=!yes;$('auth').hidden=yes;$('logout').hidden=!yes;$('auth-status').textContent=yes?'Вход сотрудника и доступ к тестовой кухне подтверждены.':'Войдите тестовым сотрудником. Наличие пользователя без роли staff недостаточно.';}
 $('auth').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const {error}=await MM.client().auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('password').value='';if(error)throw error;await ready();}catch(e){$('error').textContent=e.message;}finally{b.disabled=false;}};
 $('logout').onclick=async()=>{const {error}=await MM.client().auth.signOut();if(error)$('error').textContent=error.message;else await ready();};
 $('run').onclick=async()=>{
  if(running)return;running=true;$('run').disabled=true;$('logout').disabled=true;$('results').replaceChildren();$('error').textContent='';
  try{
   const c=window.MISSMAKI_CONFIG;
   const report=await MMTestSuite({staff:MM.client(),makeCustomer:async()=>{const client=supabase.createClient(c.supabaseUrl,c.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init={})=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{...init,signal:controller.signal});}finally{clearTimeout(timer);}}}});const {data,error}=await client.auth.signInAnonymously();if(error)throw error;return {client,id:data.user.id};},onStep:(name,ok)=>{const item=document.createElement('li');item.textContent=(ok?'✓ ':'✗ ')+name;$('results').append(item);}});
   $('report').textContent=JSON.stringify(report,null,2);$('copy').hidden=false;
   if(!report.complete)$('error').textContent='Проверка остановлена. Не отключайте защиту базы; передайте отчёт без паролей и ключей.';
  }catch(e){$('error').textContent=e.message;}
  finally{running=false;$('run').disabled=false;$('logout').disabled=false;}
 };
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('report').textContent);}catch{$('error').textContent='Выделите и скопируйте текст отчёта вручную';}};
 ready().catch(e=>{$('error').textContent=e.message;});
})();
