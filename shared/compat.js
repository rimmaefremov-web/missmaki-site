/* Secure browser compatibility. No Math.random fallback; no identifiers change on retry. */
(function(root){
 'use strict';
 // Upgrade only the production hosts; keep local and preview HTTP environments intact.
 if(root.location&&root.location.protocol==='http:'&&/^(www\.)?missmaki\.ru$/i.test(root.location.hostname)){root.location.replace('https://'+root.location.host+root.location.pathname+root.location.search+root.location.hash);}
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
