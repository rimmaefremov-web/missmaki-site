// Owner-only service. No doGet/doPost/triggers. Run functions manually in the editor.
// Diagnostics return booleans only. Never log the backup, URL, or Script Properties.
function mmwsConfig_(){return {
 script:'1cAkeAUqILLxP07lx6Zic3SbOPuw7sibFAzvv65SKyC4hnLPGwq7TpY7V',
 base:'https://script.google.com/macros/s/AKfycbypTmSYACXKHqKUXoCpnpJZpkhgH5s1NMJM3vtpBqBorNM14k76A8UM3wa_Mmoi3_VC/exec',
 test:'AKfycbwRjE6qV2S5zJSsAxfTy12ltN1TP6LK-Q7agsJlv0-Fuo-kp5GerA_FGq0BjGWCcEmG0g',
 backup:'MMWS_BACKUP_V1',key:'MM_CONFIRM_HOOK_KEY'
}}
function mmwsReport_(value){console.log(JSON.stringify(value));return value}
function mmwsApi_(method,payload){
 try{
  const token=PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  if(!token)throw Error();
  const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'post',contentType:'application/json',payload:JSON.stringify(payload||{}),muteHttpExceptions:true});
  const d=JSON.parse(r.getContentText());if(r.getResponseCode()!==200||d.ok!==true)throw Error();return d.result;
 }catch(error){throw Error('MMWS_TELEGRAM_NOT_CONFIRMED')}
}
function mmwsEndpoint_(url){
 const match=/^(https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec)(?:\?([^#]*))?$/.exec(String(url||''));
 let hook=null,count=0;
 if(match)for(const part of (match[3]||'').split('&')){const pair=part.split('=');try{if(decodeURIComponent(pair[0])==='mmHook'){count++;hook=decodeURIComponent(pair.slice(1).join('='))}}catch(error){return {base:null,id:null,hook:null}}}
 return {base:match?match[1]:null,id:match?match[2]:null,hook:count===1?hook:null};
}
function mmwsContext_(){
 const c=mmwsConfig_();
 // ScriptApp.getService().getUrl() can resolve to a different deployment URL
 // than the explicitly selected production /exec. Verify the project ID here;
 // the configured production endpoint remains fixed and is checked before switching.
 if(ScriptApp.getScriptId()!==c.script)throw Error('MMWS_WRONG_PROJECT');
 const bot=mmwsApi_('getMe');
 if(String(bot.username||'').toLowerCase()!=='missmakibot'||!bot.id)throw Error('MMWS_WRONG_BOT');
 const info=mmwsApi_('getWebhookInfo');
 return {c:c,bot:bot,info:info,props:PropertiesService.getScriptProperties()};
}
function mmwsLoad_(x){const raw=x.props.getProperty(x.c.backup);return raw?JSON.parse(raw):null}
function mmwsTarget_(x){const key=x.props.getProperty(x.c.key);return key?x.c.base+'?mmHook='+encodeURIComponent(key):null}
function mmwsSame_(info,saved){return String(info.url||'')===saved.url&&JSON.stringify(info.allowed_updates||[])===JSON.stringify(saved.allowed_updates||[])&&Number(info.max_connections||40)===saved.max_connections&&!!info.has_custom_certificate===saved.has_custom_certificate}
function mmwsCheck(){
 try{
  const x=mmwsContext_(),e=mmwsEndpoint_(x.info.url),key=x.props.getProperty(x.c.key),b=mmwsLoad_(x);
  return mmwsReport_({ok:true,productionProject:true,productionBot:true,
   hasWebhook:!!x.info.url,webhookIsAppsScript:!!e.base,webhookUsesTestDeployment:e.id===x.c.test,
   sameDeploymentUrl:e.base===x.c.base,hookKeyConfigured:!!key,hookKeyPresent:!!e.hook,hookKeyMatches:!!key&&e.hook===key,
   fullWebhookMatches:!!mmwsTarget_(x)&&x.info.url===mmwsTarget_(x),
   callbackUpdatesEnabled:!x.info.allowed_updates||!x.info.allowed_updates.length||x.info.allowed_updates.includes('callback_query'),
   pendingUpdatesEmpty:Number(x.info.pending_update_count||0)===0,hasDeliveryErrorReported:!!x.info.last_error_date,
   hasCustomCertificate:!!x.info.has_custom_certificate,backupExists:!!b,
   backupMatchesCurrent:!!b&&mmwsSame_(x.info,b.old),
   previousHeaderSecretCannotBeRead:true});
 }catch(error){return mmwsReport_({ok:false,noSettingsChanged:true})}
}
// Creates a PRIVATE snapshot only. Does not change the webhook or its secret key.
function mmwsPrepareSwitch(){
 try{
  const x=mmwsContext_(),e=mmwsEndpoint_(x.info.url);
  if(x.info.has_custom_certificate||e.id===x.c.test|| (x.info.url&&!e.base))return mmwsReport_({prepared:false,unsupportedPreviousWebhook:true,webhookUnchanged:true});
  const lock=LockService.getUserLock();lock.waitLock(10000);
  try{
   const old=mmwsLoad_(x);
   if(old&&!old.rolledBack)return mmwsReport_({prepared:false,existingBackupPreserved:true,webhookUnchanged:true});
   if(old)x.props.setProperty('MMWS_HISTORY_'+Utilities.getUuid(),JSON.stringify(old));
   const snapshot={schema:1,project:x.c.script,bot:String(x.bot.id),at:Date.now(),stage:'prepared',
    old:{url:String(x.info.url||''),allowed_updates:x.info.allowed_updates||[],max_connections:Number(x.info.max_connections||40),has_custom_certificate:false},
    previousKey:x.props.getProperty(x.c.key),target:null,noPreviousHeaderSecretConfirmed:!x.info.url};
   x.props.setProperty(x.c.backup,JSON.stringify(snapshot));
   return mmwsReport_({prepared:true,backupSaved:true,webhookUnchanged:true,previousHeaderSecretReviewRequired:!!x.info.url});
  }finally{lock.releaseLock()}
 }catch(error){
  // Report the failing guard without exposing the deployment URL, token, or webhook secret.
  const reason=error&&error.message==='MMWS_WRONG_PROJECT'?'projectOrDeploymentMismatch':
   error&&error.message==='MMWS_WRONG_BOT'?'botMismatch':
   error&&error.message==='MMWS_TELEGRAM_NOT_CONFIRMED'?'telegramUnavailable':
   'otherPreparationError';
  return mmwsReport_({prepared:false,webhookUnchanged:true,reason:reason});
 }
}
// Run ONLY if the owner has verified that the OLD integration did not use the
// Telegram secret_token HEADER or a manually pinned IP address.
// getWebhookInfo does NOT expose the old header secret or whether IP was pinned.
function mmwsConfirmPreviousStandardSettings(){
 try{
  const x=mmwsContext_(),b=mmwsLoad_(x);
  if(!b||b.stage!=='prepared'||!mmwsSame_(x.info,b.old))throw Error();
  b.noPreviousHeaderSecretConfirmed=true;x.props.setProperty(x.c.backup,JSON.stringify(b));
  return mmwsReport_({confirmationSaved:true,webhookUnchanged:true});
 }catch(error){return mmwsReport_({confirmationSaved:false,webhookUnchanged:true})}
}
// Explicit separate manual action AFTER approval. Never called by diagnostics.
function mmwsSwitchWebhook(){
 let attempted=false,backupPreserved=false;
 try{
  const lock=LockService.getUserLock();lock.waitLock(10000);
  try{
   const x=mmwsContext_(),b=mmwsLoad_(x);backupPreserved=!!b;
   if(!b||b.stage!=='prepared'||b.project!==x.c.script||b.bot!==String(x.bot.id)||!b.noPreviousHeaderSecretConfirmed||Date.now()-b.at>86400000||!mmwsSame_(x.info,b.old)||Number(x.info.pending_update_count||0)!==0)throw Error();
   let key=x.props.getProperty(x.c.key);
   if(key!==(b.preparedKey||b.previousKey))throw Error();
   if(!key){key=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');x.props.setProperty(x.c.key,key)}
   b.preparedKey=key;b.target=x.c.base+'?mmHook='+encodeURIComponent(key);x.props.setProperty(x.c.backup,JSON.stringify(b));
   let response;
   try{response=UrlFetchApp.fetch(b.target,{method:'post',contentType:'application/json',payload:JSON.stringify({update_id:0}),followRedirects:true,muteHttpExceptions:true})}catch(error){throw Error()}
   if(response.getResponseCode()!==200||!response.getContentText().includes('data-mm-hook-ok="true"'))throw Error();
   b.stage='switch-attempted';x.props.setProperty(x.c.backup,JSON.stringify(b));attempted=true;
   // Keep all existing update types, add callback_query. Never drop pending updates.
   const allowed=b.old.allowed_updates.slice();
   if(allowed.length&&!allowed.includes('callback_query'))allowed.push('callback_query');
   mmwsApi_('setWebhook',{url:b.target,allowed_updates:allowed,max_connections:b.old.max_connections,drop_pending_updates:false});
   const info=mmwsApi_('getWebhookInfo'),verified=info.url===b.target&&(!info.allowed_updates||!info.allowed_updates.length||info.allowed_updates.includes('callback_query'));
   b.stage=verified?'switched':'switch-attempted';x.props.setProperty(x.c.backup,JSON.stringify(b));
   return mmwsReport_({switchConfirmed:verified,backupPreserved:true,needsVerification:!verified});
  }finally{lock.releaseLock()}
 }catch(error){return mmwsReport_({switchConfirmed:false,webhookChangeMayHaveOccurred:attempted,backupPreserved:backupPreserved})}
}
// Explicit rollback only. Refuses to overwrite a webhook changed by somebody else.
function mmwsRollbackWebhook(){
 let attempted=false,backupPreserved=false;
 try{
  const lock=LockService.getUserLock();lock.waitLock(10000);
  try{
   const x=mmwsContext_(),b=mmwsLoad_(x);backupPreserved=!!b;
   if(!b||!['switch-attempted','switched'].includes(b.stage)||b.project!==x.c.script||b.bot!==String(x.bot.id)||!b.noPreviousHeaderSecretConfirmed)throw Error();
   const alreadyRestored=mmwsSame_(x.info,b.old);
   if(!alreadyRestored&&x.info.url!==b.target)throw Error();
   if(!alreadyRestored){
    attempted=true;
    if(b.old.url)mmwsApi_('setWebhook',{url:b.old.url,allowed_updates:b.old.allowed_updates,max_connections:b.old.max_connections,drop_pending_updates:false});
    else mmwsApi_('deleteWebhook',{drop_pending_updates:false});
   }
   const info=mmwsApi_('getWebhookInfo'),verified=b.old.url?mmwsSame_(info,b.old):!info.url;
   if(verified){b.stage='rolled-back';b.rolledBack=true;x.props.setProperty(x.c.backup,JSON.stringify(b))}
   // Do not delete/rotate the active mmHook key: an in-flight callback may use it.
   return mmwsReport_({rollbackConfirmed:verified,backupPreserved:true,needsVerification:!verified});
  }finally{lock.releaseLock()}
 }catch(error){return mmwsReport_({rollbackConfirmed:false,webhookChangeMayHaveOccurred:attempted,backupPreserved:backupPreserved})}
}
