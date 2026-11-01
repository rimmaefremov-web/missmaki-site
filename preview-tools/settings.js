/* Preview-only public settings. No credentials, service_role or production overrides. */
(()=>{
 const key='mm-preview-public-settings';
 const allowed=()=>window.MISSMAKI_CONFIG?.deploymentMode==='test'&&!['missmaki.ru','www.missmaki.ru'].includes(location.hostname)&&['https:','http:'].includes(location.protocol)&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname));
 function validate(url,key){
  const u=new URL(url.trim());
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||/(^|\.)(supabase\.co|local|localhost|internal)$/.test(u.hostname))throw Error('Вставьте HTTPS Project URL российского тестового проекта без пути и параметров');
  key=key.trim();let valid=/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key);
  if(key.startsWith('eyJ')){try{const parts=key.split('.');const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));valid=parts.length===3&&parts.every(Boolean)&&claims.role==='anon';}catch{valid=false;}}
  if(!valid||key.length>8192)throw Error('Допустим только публичный anon / publishable key. Пароль и service_role сюда не вставляют');
  return {enabled:true,deploymentProfile:'ru',deploymentMode:'test',supabaseUrl:u.origin,publishableKey:key,captchaSiteKey:'',...(window.MISSMAKI_CONFIG?.guestMode==='database-token'?{guestMode:'database-token'}:{})};
 }
 window.MMPreviewSettings={allowed,validate,save(url,value){if(!allowed())throw Error('Настройка разрешена только в отдельной HTTPS тестовой копии');const c=validate(url,value);const old=window.MISSMAKI_CONFIG;if(old?.supabaseUrl!==c.supabaseUrl||old?.publishableKey!==c.publishableKey){for(const k of ['mm-staff','mm-customer','mm-staff-code-verifier','mm-customer-code-verifier','missmaki-active-order','mm-pending-submission','mm-guest-session'])localStorage.removeItem(k);}
 localStorage.setItem(key,JSON.stringify(c));return c;},clear(){localStorage.removeItem(key);}};
 if(allowed())try{const raw=localStorage.getItem(key);if(raw){const c=JSON.parse(raw);window.MISSMAKI_CONFIG=Object.freeze(validate(c.supabaseUrl,c.publishableKey));}}catch{localStorage.removeItem(key);}
})();
