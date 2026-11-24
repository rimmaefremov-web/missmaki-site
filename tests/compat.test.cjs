const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('shared/compat.js','utf8');
function load(crypto,extra={}){const context={crypto,...extra};vm.createContext(context);vm.runInContext(source,context);return context.MMCompat;}
test('UUID fallback has correct v4/version/variant bits, uniqueness and cryptographic randomness without native randomUUID',()=>{
 let calls=0;const crypto={getRandomValues(bytes){calls++;return webcrypto.getRandomValues(bytes);}};const helper=load(crypto);const ids=Array.from({length:2000},()=>helper.uuid());assert.equal(new Set(ids).size,ids.length);assert.equal(calls,2000);for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('native UUID is used with its receiver and native failure falls back safely',()=>{
 const native={randomUUID(){assert.equal(this,native);return 'native-uuid';}};assert.equal(load(native).uuid(),'native-uuid');
 const fallback={randomUUID(){throw Error('Unavailable');},getRandomValues(b){assert.equal(this,fallback);b.fill(255);return b;}};assert.equal(load(fallback).uuid(),'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
test('no weak random fallback; unsupported or insecure environments produce Russian guidance',()=>{
 assert.throws(()=>load({}).uuid(),/Safari или Chrome/);assert.throws(()=>load(webcrypto,{isSecureContext:false}).ensureCheckoutCrypto(),/https:\/\/missmaki.ru/);assert.doesNotThrow(()=>load(webcrypto,{isSecureContext:true}).ensureCheckoutCrypto());
});
test('customer errors hide technical codes while preserving actionable Russian server errors',()=>{
 const c=load(webcrypto);for(const text of ['crypto.randomUUID is not a function','crypto.randomUUID is undefined','TypeError: undefined','Failed to fetch','Сбой crypto.randomUUID is undefined','PGRST204']){const message=c.message(Error(text));assert.match(message,/[А-Яа-я]/);assert(!/randomUUID|undefined|TypeError|PGRST/.test(message));}
 assert.equal(c.message(Error('Стоимость изменилась. Обновите меню')),'Стоимость изменилась. Обновите меню');
});

test('only production HTTP pages upgrade to HTTPS and preserve path/query/hash',()=>{
 let next;load(webcrypto,{location:{protocol:'http:',hostname:'missmaki.ru',host:'missmaki.ru',pathname:'/kiosk.html',search:'?a=1',hash:'#order',replace:url=>next=url}});assert.equal(next,'https://missmaki.ru/kiosk.html?a=1#order');
 next=undefined;load(webcrypto,{location:{protocol:'http:',hostname:'localhost',replace:()=>{throw Error('Must not redirect preview');}}});assert.equal(next,undefined);
});

test('classic API entry embeds the exact shared compatibility source for cached pages',()=>{
 const api=fs.readFileSync('shared/api.js','utf8');assert(api.startsWith('/* MM_COMPAT_BUNDLE_START */\n'+source+'/* MM_COMPAT_BUNDLE_END */'));
 const crypto={getRandomValues:bytes=>webcrypto.getRandomValues(bytes)},helper=load(crypto);assert.equal(typeof crypto.randomUUID,'function');assert.match(crypto.randomUUID(),/^[a-f0-9-]{36}$/);assert.match(helper.uuid(),/^[a-f0-9-]{36}$/);
});
