/* Preview-only recovery through supported Supabase Auth APIs. No SQL or admin key. */
(async()=>{
 const $=id=>document.getElementById(id),c=window.MISSMAKI_CONFIG;
 const fragment=new URLSearchParams(location.hash.slice(1));
 const recoveryLink=fragment.get('type')==='recovery';
 const linkError=fragment.has('error')||fragment.has('error_description')||new URLSearchParams(location.search).has('error');
 const valid=c?.enabled&&c.deploymentMode==='test'&&location.protocol==='https:'&&!['missmaki.ru','www.missmaki.ru'].includes(location.hostname)&&/^https:\/\/[a-z0-9.-]+$/.test(c.supabaseUrl)&&c.publishableKey;
 if(!valid){history.replaceState(null,'',location.pathname);$('request').hidden=true;$('status').textContent='Откройте отдельную HTTPS-тестовую копию и настройте публичные параметры базы. Пароль пока не вводите.';return;}
 let ready=false;
 const client=supabase.createClient(c.supabaseUrl,c.publishableKey,{auth:{detectSessionInUrl:true,persistSession:false,autoRefreshToken:false,flowType:'implicit',storageKey:'mm-password-recovery'}});
 client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')ready=true;});
 try{
  const {data,error}=await client.auth.getSession();
  history.replaceState(null,'',location.pathname);
  if(error||linkError)throw Error('Ссылка недействительна или устарела. Запросите новое письмо.');
  if(data.session&&(recoveryLink||ready)){
   const checked=await client.auth.getUser();if(checked.error||!checked.data.user)throw Error('Не удалось проверить ссылку. Запросите новое письмо.');
   ready=true;$('request').hidden=true;$('change').hidden=false;$('status').textContent='Ссылка проверена. Введите новый пароль (не менее 12 символов).';
  }
 }catch{$('status').textContent='Ссылка не проверена. Запросите новое письмо.';}
 $('request').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  try{const {error}=await client.auth.resetPasswordForEmail($('email').value.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;$('status').textContent='Запрос принят. Если адрес зарегистрирован и отправка писем настроена, придёт ссылка. Проверьте «Спам». Сам ответ не подтверждает доставку письма.';}
  catch{$('status').textContent='Не удалось запросить письмо. Проверьте настройки почты/Redirect URLs и ограничения Auth в Татнет. Не повторяйте запрос много раз подряд.';}
  finally{button.disabled=false;}
 };
 $('change').onsubmit=async e=>{
  e.preventDefault();if(!ready)return;
  if($('password').value!==$('confirm').value){$('status').textContent='Пароли не совпадают.';return;}
  const button=e.target.querySelector('button');button.disabled=true;
  try{
   const {error}=await client.auth.updateUser({password:$('password').value});if(error)throw error;
   $('password').value='';$('confirm').value='';ready=false;$('change').hidden=true;
   // Recovery uses an isolated, memory-only session. Attempt to revoke all sessions.
   const {error:logoutError}=await client.auth.signOut({scope:'global'});
   $('status').textContent=logoutError?'Пароль изменён. Не удалось подтвердить выход остальных сессий. Войдите в кухню новым паролем; при необходимости завершите другие сессии через поддержку.':'Пароль изменён. Теперь войдите в кухню новым паролем. Другие сессии получили запрос на выход; ранее выданные access-токены могут действовать до истечения срока.';
  }catch{$('password').value='';$('confirm').value='';$('status').textContent='Изменение пароля не подтверждено. Возможно, ссылка истекла или пароль не соответствует правилам Auth. Запросите новую ссылку при необходимости.';}
  finally{button.disabled=false;}
 };
})();
