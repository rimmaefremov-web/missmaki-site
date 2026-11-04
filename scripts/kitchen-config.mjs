// Validation of a declared Russian deployment, NOT a geolocation/compliance certificate.
import {isIP} from 'node:net';
export function apiOrigin(input){
 let u;try{u=new URL(input);}catch{throw Error('Укажите настоящий HTTPS-адрес API из карточки базы');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||u.port||isIP(u.hostname)||!u.hostname.includes('.')||/(^|\.)(localhost|local|internal)$/.test(u.hostname))throw Error('Нужен HTTPS-адрес API без пароля, пути, IP, порта и параметров');
 if(/(^|\.)supabase\.co$/i.test(u.hostname))throw Error('Supabase Cloud не выбран: нужен API российского размещения');
 return u.origin;
}
export function publicKey(key){
 if(typeof key!=='string'||key.length>8192||/[\s<>]/.test(key))throw Error('Нужен публичный ключ anon');
 if(key.startsWith('sb_publishable_')&&key.length>20)return key;
 if(key.startsWith('eyJ')){
  try{const parts=key.split('.');const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());if(parts.length===3&&claims.role==='anon'&&parts.every(Boolean))return key;}catch{}
 }
 throw Error('Допустим только anon / publishable key; service_role, secret key и пароли запрещены');
}
export function configuration(url,key,mode){return {enabled:true,deploymentProfile:'ru',deploymentMode:mode,supabaseUrl:apiOrigin(url),publishableKey:publicKey(key),captchaSiteKey:''};}
