// Read-only owner diagnostics. No dependency on MMWebhookService.gs.
// No doGet/doPost, writes, probe POST, setWebhook, deleteWebhook, or raw errors.
function mmwdCheck(){
 const expectedScript='1cAkeAUqILLxP07lx6Zic3SbOPuw7sibFAzvv65SKyC4hnLPGwq7TpY7V';
 const expectedBase='https://script.google.com/macros/s/AKfycbypTmSYACXKHqKUXoCpnpJZpkhgH5s1NMJM3vtpBqBorNM14k76A8UM3wa_Mmoi3_VC/exec';
 const report={ok:false,noSettingsChanged:true,scriptIdRead:false,expectedScriptIdMatches:false,
  serviceUrlRead:false,serviceUrlPresent:false,serviceUrlMatchesExpected:false,serviceUrlUsesExec:false,serviceUrlUsesDev:false,
  propertiesReadable:false,botTokenConfigured:false,productionBotMatches:false,botIdPresent:false,
  webhookInfoValid:false,hasWebhook:false,sameDeploymentUrl:false,hookKeyConfigured:false,hookKeyPresent:false,hookKeyMatches:false,
  callbackUpdatesEnabled:false,pendingUpdatesEmpty:false,hasDeliveryErrorReported:false,
  backupExists:false,backupJsonValid:false,backupStructureValid:false,unexpectedReadFailure:false};
 for(const prefix of ['getMe','webhook'])for(const suffix of ['Attempted','TransportOk','HttpOk','HttpUnauthorized','HttpForbidden','JsonValid','ApiOk'])report[prefix+suffix]=false;
 try{
  let scriptId;try{scriptId=ScriptApp.getScriptId();report.scriptIdRead=true}catch(error){return mmwdPrint_(report)}
  report.expectedScriptIdMatches=scriptId===expectedScript;
  // Do not query a bot from another project, even if it has a BOT_TOKEN.
  if(!report.expectedScriptIdMatches)return mmwdPrint_(report);
  try{
   const base=ScriptApp.getService().getUrl();report.serviceUrlRead=true;report.serviceUrlPresent=!!base;
   report.serviceUrlMatchesExpected=base===expectedBase;
   report.serviceUrlUsesExec=typeof base==='string'&&/\/exec(?:\?|$)/.test(base);
   report.serviceUrlUsesDev=typeof base==='string'&&/\/dev(?:\?|$)/.test(base);
  }catch(error){/* Continue read-only diagnostics; never turn this into a write guard bypass. */}
  let props,token,key,raw;
  try{props=PropertiesService.getScriptProperties();token=props.getProperty('BOT_TOKEN');key=props.getProperty('MM_CONFIRM_HOOK_KEY');raw=props.getProperty('MMWS_BACKUP_V1');report.propertiesReadable=true}catch(error){return mmwdPrint_(report)}
  report.botTokenConfigured=!!token;report.hookKeyConfigured=!!key;report.backupExists=!!raw;
  if(raw)try{
   const backup=JSON.parse(raw);report.backupJsonValid=true;
   report.backupStructureValid=!!(backup&&backup.schema===1&&backup.old&&typeof backup.old.url==='string'&&Array.isArray(backup.old.allowed_updates)&&Number.isFinite(backup.old.max_connections));
  }catch(error){/* Expose a boolean, not the backup or parse error. */}
  if(!token)return mmwdPrint_(report);
  const bot=mmwdFetch_('getMe',token,report,'getMe');
  if(!bot||typeof bot!=='object')return mmwdPrint_(report);
  report.productionBotMatches=String(bot.username||'').toLowerCase()==='missmakibot';
  report.botIdPresent=Number.isSafeInteger(bot.id)&&bot.id>0;
  if(!report.productionBotMatches||!report.botIdPresent)return mmwdPrint_(report);
  const info=mmwdFetch_('getWebhookInfo',token,report,'webhook');
  report.webhookInfoValid=!!(info&&typeof info==='object'&&typeof info.url==='string'&&(!info.allowed_updates||Array.isArray(info.allowed_updates)));
  if(!report.webhookInfoValid)return mmwdPrint_(report);
  const endpoint=mmwdParse_(info.url);
  report.hasWebhook=!!info.url;report.sameDeploymentUrl=endpoint.base===expectedBase;
  report.hookKeyPresent=!!endpoint.hook;report.hookKeyMatches=!!key&&endpoint.hook===key;
  report.callbackUpdatesEnabled=!info.allowed_updates||!info.allowed_updates.length||info.allowed_updates.includes('callback_query');
  report.pendingUpdatesEmpty=Number(info.pending_update_count||0)===0;
  report.hasDeliveryErrorReported=!!info.last_error_date;
  report.ok=report.serviceUrlRead;
 }catch(error){report.unexpectedReadFailure=true}
 return mmwdPrint_(report);
}
function mmwdPrint_(report){console.log(JSON.stringify(report));return report}
function mmwdFetch_(method,token,report,prefix){
 report[prefix+'Attempted']=true;
 try{
  const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'post',contentType:'application/json',payload:'{}',muteHttpExceptions:true});
  report[prefix+'TransportOk']=true;
  const code=response.getResponseCode();report[prefix+'HttpOk']=code===200;
  report[prefix+'HttpUnauthorized']=code===401;report[prefix+'HttpForbidden']=code===403;
  let data;try{data=JSON.parse(response.getContentText());report[prefix+'JsonValid']=true}catch(error){return null}
  report[prefix+'ApiOk']=!!(code===200&&data&&data.ok===true);
  return report[prefix+'ApiOk']?data.result:null;
 }catch(error){return null}
}
function mmwdParse_(url){
 const m=/^(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)(?:\?([^#]*))?$/.exec(String(url||''));
 let hook=null,count=0;
 if(m)try{for(const pair of (m[2]||'').split('&')){const p=pair.split('=');if(decodeURIComponent(p[0])==='mmHook'){count++;hook=decodeURIComponent(p.slice(1).join('='))}}}catch(error){return {base:null,hook:null}}
 return {base:m?m[1]:null,hook:count===1?hook:null};
}
