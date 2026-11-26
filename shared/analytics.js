/* Optional storefront analytics. No customer/contact fields enter this module. */
(()=>{
 'use strict';
 const hostOK=['missmaki.ru','www.missmaki.ru'].includes(location.hostname)||(window.MM_ANALYTICS_TEST===true&&['127.0.0.1','localhost'].includes(location.hostname));
 if(!hostOK||window.top!==window.self||!['/','/index.html'].includes(location.pathname)||window.MMAnalytics)return;
 const counter=114705499,key='mm-analytics-consent-v1',age=180*86400000;
 let allowed=false,started=false,active=false,dbPromise,observer,panel,note;
 const safe=fn=>{try{return fn();}catch(e){return undefined;}};
 const catalogue=new Map(),display=new Map();
 for(const [local,sku] of Object.entries(ORDER_SKUS)){
  const [id,variant]=local.split(':'),p=products.find(p=>p.id===Number(id));if(!p)continue;
  const opt=variant==='x'?null:p.opts?.[Number(variant)];
  const product={id:sku,name:p.name+(opt?' — '+opt[0]:''),category:groups.find(g=>g[0]===p.group)?.[1]||'',price:opt?opt[1]:p.price};
  catalogue.set(sku,product);display.set(local,sku);
 }
 const type=(fulfillment,timing)=>['pickup','delivery'].includes(fulfillment)?(timing==='preorder'?'preorder_':'')+fulfillment:null;
 function items(list,local=false){return (Array.isArray(list)?list:[]).flatMap(x=>{const p=catalogue.get(local?display.get(x.sku):x.sku),q=Number(x.quantity);return p&&Number.isInteger(q)&&q>0&&q<=100? [{...p,quantity:q}]:[];});}
 function call(...args){if(allowed&&active)safe(()=>window.ym?.(counter,...args));}
 function layer(value){if(allowed&&active)safe(()=>window.dataLayer.push(value));}
 function goal(name,params){layer({event:name,...params});call('reachGoal',name,params);}
 function ecommerce(action,list){if(list.length)layer({ecommerce:{currencyCode:'RUB',[action]:{products:list}}});}
 function database(){
  return dbPromise||=(new Promise((resolve,reject)=>{const r=indexedDB.open('mm-analytics-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('events');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('blocked'));r.onsuccess=()=>{const db=r.result;const tx=db.transaction('events','readwrite'),c=tx.objectStore('events').openCursor();c.onsuccess=()=>{const row=c.result;if(!row)return;if(Date.now()-row.value.at>age)row.delete();row.continue();};tx.oncomplete=()=>resolve(db);tx.onerror=()=>reject(tx.error);};}));
 }
 // One read/write transaction serializes tabs. If durable storage fails, skip order analytics.
 async function once(id,phase,fn,requireOrder=false,orderType){
  if(!allowed||!active||typeof id!=='string'||id.length>100)return;
  try{const db=await database();if(!allowed||!active)return;await new Promise((resolve,reject)=>{
   const tx=db.transaction('events','readwrite'),store=tx.objectStore('events');let send=false,record;
   const root=store.get('order:'+id);root.onsuccess=()=>{record=root.result;
    if(requireOrder&&(!record||Date.now()-record.at>age))return;
    const r=store.get(phase+':'+id);r.onsuccess=()=>{if(r.result)return;
     if(['submitted','attempt'].includes(phase)&&!record)store.put({type:orderType,at:Date.now()},'order:'+id);
     store.put({at:Date.now()},phase+':'+id);send=true;
    };
   };tx.oncomplete=()=>{if(send&&allowed&&active)safe(()=>fn(record));resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}catch(e){}
 }
 function begin(id,kind,list){if(kind&&list.length)once(id,'checkout',()=>goal('mm_checkout_started',{order_type:kind,products:list}));}
 function formBegin(){safe(()=>{if(!allowed||!Object.keys(cart).length)return;let id=sessionStorage.getItem('mm-analytics-checkout');if(!id){id=MMCompat.uuid();sessionStorage.setItem('mm-analytics-checkout',id);}begin(id,type(method(),isPreorder()?'preorder':'asap'),items(Object.values(cart),true));});}
 function submitted(id,fulfillment,timing,requireOrder=false){const kind=type(fulfillment,timing);if(!kind)return;once(id,'submitted',()=>{
  goal('mm_order_submitted',{order_type:kind});goal('mm_'+kind+'_order',{order_type:kind});safe(()=>sessionStorage.removeItem('mm-analytics-checkout'));
 },requireOrder,kind);}
 function status(id,data){
  if(!data||data.is_test)return;submitted(id,data.fulfillment,data.timing,true);
  if(!['accepted','rejected'].includes(data.status))return;
  const accepted=data.status==='accepted';once(id,data.status,record=>{
   const params={order_type:record.type,payment_status:'not_verified',currency:'RUB'};
   if(accepted){
    const total=Number(data.total);if(Number.isFinite(total)&&total>=0&&total<10000000){params.confirmed_total=total;params.order_price=total;}
    goal('mm_order_confirmed',params);
    for(const p of items(data.items))goal('mm_confirmed_item',{order_type:record.type,product_id:p.id,product_name:p.name,category:p.category,price:p.price,quantity:p.quantity,payment_status:'not_verified'});
   }else goal('mm_order_rejected',params);
  },true);
 }
 function shownProduct(id){
  let p=products.find(p=>p.id===Number(id)),variant=selected[p?.id]||0;
  if(p?.group==='extras'){
   const map=[['Васаби','x'],['Имбирь','x'],['Соус',1],['Соус',3],['Соус',0],['Соус',2],['Палочки','x']];const [name,v]=map[extraChoice];p=products.find(x=>x.group==='extras'&&x.name===name);variant=v;
  }else if(p?.name==='Спайси гункан'){
   const map=[['Спайси гункан',0],['Спайси гункан',1],['Спайси гункан',2],['Спайси гункан',3],['Суши',2],['Суши',0],['Суши',3],['Суши',1]];const [name,v]=map[sushiChoice];p=products.find(x=>x.group==='sushi'&&x.name===name);variant=v;
  }else if(!p?.opts)variant='x';
  return catalogue.get(display.get(p?.id+':'+variant));
 }
 function observe(){safe(()=>{
  observer?.disconnect();if(!allowed||!window.IntersectionObserver)return;
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&entry.intersectionRatio>=.5)safe(()=>{
   const p=shownProduct(entry.target.dataset.analyticsProduct);if(!p)return;
   const seen=JSON.parse(sessionStorage.getItem('mm-analytics-views')||'[]');if(seen.includes(p.id))return;
   sessionStorage.setItem('mm-analytics-views',JSON.stringify([...seen,p.id]));ecommerce('detail',[{...p,quantity:1}]);
  });},{threshold:[.5]});document.querySelectorAll('[data-analytics-product]').forEach(n=>observer.observe(n));
 });}
 function diff(before,after){if(!allowed)return;for(const sku of new Set([...Object.keys(before),...Object.keys(after)])){
  const delta=(after[sku]?.quantity||0)-(before[sku]?.quantity||0);if(delta)ecommerce(delta>0?'add':'remove',items([{sku,quantity:Math.abs(delta)}],true));
 }}
 for(const name of ['add','change']){const original=name==='add'?add:change;const wrapped=function(...args){const before=safe(()=>structuredClone(cart))||safe(()=>JSON.parse(JSON.stringify(cart)));const result=original.apply(this,args);safe(()=>{if(before)diff(before,cart);});return result;};if(name==='add')add=wrapped;else change=wrapped;}
 const originalRender=render;render=function(...args){const result=originalRender.apply(this,args);observe();return result;};
 function enable(){
  if(started)return;started=true;active=true;
  // Remove arbitrary query/fragment data before the library can inspect the URL.
  if(location.search||location.hash){try{history.replaceState(history.state,'',location.pathname);}catch(e){allowed=false;active=false;return;}}
  window.dataLayer=window.dataLayer||[];
  const url=location.origin+location.pathname;let referrer='';safe(()=>{referrer=document.referrer?new URL(document.referrer).origin+'/':'';});
  (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments);};m[i].l=1*new Date();for(let j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}k=e.createElement(t);a=e.getElementsByTagName(t)[0];k.async=true;k.src=r;k.referrerPolicy='origin';a.parentNode.insertBefore(k,a);})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=114705499','ym');
  call('init',{ssr:true,clickmap:true,ecommerce:'dataLayer',referrer,url,accurateTrackBounce:true,trackLinks:true,webvisor:false,trackHash:false,defer:true});
  call('hit',url,{referer:referrer,title:'MissMaki — доставка роллов'});observe();
 }
 function decide(value){safe(()=>localStorage.setItem(key,JSON.stringify({value,at:Date.now()})));allowed=value==='accepted';panel.hidden=true;
  if(allowed){safe(enable);note.textContent=active?'Аналитика разрешена.':'Согласие сохранено. Чтобы возобновить аналитику, откройте сайт заново после завершения заказа.';}
  else{active=false;observer?.disconnect();safe(()=>window.ym?.(counter,'destruct'));note.textContent='Аналитика отключена. Заказ доступен без неё.';}
 }
 window.MMAnalytics={attempt:(id,fulfillment,timing)=>safe(()=>{const kind=type(fulfillment,timing);if(kind)once(id,'attempt',()=>{},false,kind);}),submitted:(...args)=>safe(()=>submitted(...args)),status:(...args)=>safe(()=>status(...args)),begin:()=>formBegin()};
 const footer=document.getElementById('missmaki-footer');if(!footer)return;
 const area=document.createElement('div');area.id='mm-analytics-preferences';area.style.cssText='font-size:13px;line-height:1.5;margin:18px 0;text-align:center';
 panel=document.createElement('div');panel.hidden=false;
 const text=document.createElement('p');text.textContent='Разрешить Яндекс Метрике аналитические cookies для статистики посещений, товаров и заказов? Вебвизор выключен. Отказ не влияет на заказ. ';
 const link=document.createElement('a');link.href='cookies.html';link.textContent='Подробнее';text.append(link);panel.append(text);
 function button(label,fn){const n=document.createElement('button');n.type='button';n.textContent=label;n.style.cssText='font:inherit;padding:10px 14px;margin:5px;border:1px solid #bbb;border-radius:10px;background:#fff;color:#222';n.onclick=()=>safe(fn);return n;}
 panel.append(button('Разрешить аналитику',()=>decide('accepted')),button('Без аналитики',()=>decide('rejected')));
 note=document.createElement('p');note.setAttribute('role','status');area.append(panel,button('Настроить аналитические cookies',()=>panel.hidden=!panel.hidden),note);footer.append(area);
 document.getElementById('order')?.addEventListener('focusin',formBegin);document.getElementById('send')?.addEventListener('click',formBegin);
 window.addEventListener('storage',event=>{if(event.key!==key)return;safe(()=>{const s=JSON.parse(event.newValue||'null');allowed=s?.value==='accepted'&&Date.now()-s.at<age;panel.hidden=true;if(allowed)enable();else{active=false;observer?.disconnect();window.ym?.(counter,'destruct');}});});
 safe(()=>{const s=JSON.parse(localStorage.getItem(key));if(s&&Date.now()-s.at>=0&&Date.now()-s.at<age){allowed=s.value==='accepted';panel.hidden=true;if(allowed)enable();}});
})();
