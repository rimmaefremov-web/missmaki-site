/* global MM */
(()=>{
 const $=id=>document.getElementById(id),times=[15,30,45,60,90,120,150,180];
 const labels={new:'Новый',accepted:'Принят',rejected:'Отклонён',completed:'Выполнен',pending:'Ожидает модерации',approved:'Опубликован',test:'Тестовая запись',regular:'Обычная запись'};
 let tab='new',limit=100,orders=[],reviews=[],stop,sessionId,refreshing=false,pendingRefresh=false,queueVersion=0,authorized=false,mutation=false,renderedKey='',sessionEpoch=0,finalFeatures=false;
 const error=e=>{$('error').textContent=e?.message||String(e);};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const health=ok=>{const n=$('connection');n.textContent=ok?'Соединение есть · '+new Date().toLocaleTimeString('ru-RU'):'Нет соединения. Новые заказы невозможно получить. Проверяем повторно…';n.className=ok?'online':'warning';};
 const alarm=new window.MMKitchenAlarm({button:$('sound'),signal:$('alarm-signal'),volume:$('alarm-volume'),output:$('alarm-volume-value'),status:$('alarm-status')});
 async function changeOrder(r,status,minutes){
  await MM.rpc('order_status',{p_id:r.id,p_status:status,p_minutes:minutes,p_version:r.version});
  // Only a successful server response clears this order, even if the subsequent read fails.
  queueVersion++;orders=orders.map(o=>o.id===r.id?{...o,status,minutes,version:o.version+1}:o);
  if(status!=='new')alarm.resolved(r.id);
 }
 async function refresh(){
  if(refreshing){pendingRefresh=true;return;}refreshing=true;const epoch=sessionEpoch,version=queueVersion;
  try{
   const s=MM.client();const staff=await MM.rpc('is_staff');if(!staff){authorized=false;orders=[];reviews=[];alarm.setPending([]);$('cards').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;throw Error('Нет прав сотрудника. Обратитесь к владельцу');}
   async function pages(make,n){const data=[];for(let start=0;start<n;start+=500){const part=await make().range(start,Math.min(start+499,n-1));if(part.error)return part;data.push(...part.data);if(part.data.length<Math.min(500,n-start))break;}return {data,error:null};}
   const [o,r]=await Promise.all([pages(()=>{let q=s.from('orders').select('*').order('created_at',{ascending:false}).order('id');if(['accepted','rejected'].includes(tab))q=q.eq('status',tab);if(finalFeatures&&tab!=='history')q=q.eq('is_test',false);return q;},tab==='new'?100:limit),pages(()=>s.from('reviews').select('id,name,rating,body,created_at,status,version'+(finalFeatures?',is_test':'')).order('created_at',{ascending:false}).order('id'),tab==='reviews'?limit:100)]);
   if(o.error)throw o.error;if(r.error)throw r.error;
   // Always query new orders separately: old unconfirmed orders must not disappear behind history.
   const fresh={data:[]};let offset=0;while(true){let query=s.from('orders').select('*').eq('status','new');if(finalFeatures)query=query.eq('is_test',false);const part=await query.order('created_at').order('id').range(offset,offset+499);if(part.error)throw part.error;fresh.data.push(...part.data);if(part.data.length<500)break;offset+=500;}
   if(!authorized||epoch!==sessionEpoch)return;
   if(version!==queueVersion){pendingRefresh=true;return;}
   const map=new Map(o.data.map(x=>[x.id,x]));for(const x of fresh.data)map.set(x.id,x);
   orders=[...map.values()];reviews=r.data;
   alarm.setPending(fresh.data.map(x=>x.id));
   render();health(true);$('error').textContent='';
  }finally{refreshing=false;if(pendingRefresh){pendingRefresh=false;queueMicrotask(()=>refresh().catch(e=>{health(false);error(e);}));}}
 }
 function button(text,fn,cls,disabled=false){const b=el('button',text,cls);b.disabled=mutation||disabled;b.onclick=()=>act(fn);return b;}
 async function act(fn){if(mutation)return;mutation=true;render();try{await fn();await refresh();}catch(e){error(e);}finally{mutation=false;render();}}
 function render(){
  const key=JSON.stringify({tab,limit,orders,reviews,mutation});if(key===renderedKey)return;renderedKey=key;
  const cards=$('cards');cards.replaceChildren();document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.tab===tab)));
  const rows=tab==='reviews'?reviews:tab==='history'?orders:orders.filter(x=>x.status===tab&&!x.is_test);
  $('summary').textContent=`Новых заказов: ${orders.filter(x=>x.status==='new'&&!x.is_test).length}. Показано: ${rows.length}.`;
  $('more').hidden=!['history','reviews','accepted','rejected'].includes(tab)||rows.length<limit;
  for(const r of rows){
   const review=tab==='reviews',card=el('article',undefined,'card '+r.status);
   card.append(el('h2',review?`${r.name} · ${'★'.repeat(r.rating)}`:`Заказ №${r.number} · ${labels[r.status]}`));
   if(r.is_test)card.append(el('strong',review?'Тестовый отзыв — скрыт от посетителей':'ТЕСТ — НЕ ГОТОВИТЬ'));
   card.append(el('p',new Date(r.created_at).toLocaleString('ru-RU')));
   if(review){card.append(el('p',r.body),el('p',labels[r.status]));}
   else{
    card.append(el('p',r.name));const tel=el('a',r.phone);tel.href='tel:'+r.phone.replace(/[^+\d]/g,'');card.append(tel);
    card.append(el('p',(r.fulfillment==='pickup'?'Самовывоз':'Доставка: '+r.area)+' · '+r.address));
    if(r.timing==='preorder')card.append(el('p',`Предзаказ: ${r.requested_date} к ${r.requested_time}`));
    for(const i of r.items)card.append(el('p',`${i.name} × ${i.quantity} · ${i.price} ₽`));
    card.append(el('p',`Доставка: ${r.delivery} ₽ · Итого: ${r.total} ₽`),el('p',r.payment),el('p',r.comment));
    if(r.minutes)card.append(el('strong',`Ожидание ${r.minutes} минут`));
   }
   const actions=el('div',undefined,'actions');
   if(review){for(const [status,label] of [['approved','ПРИНЯТЬ'],['rejected','ОТКЛОНИТЬ']])actions.append(button(label,async()=>{if(r.status===status)return;if(r.status!=='pending'&&!window.confirm(`Изменить решение: ${labels[r.status]} → ${labels[status]}?`))return;await MM.rpc('moderate_review',{p_id:r.id,p_status:status,p_version:r.version});},status==='rejected'?'reject':'',r.status===status));}
   else{
    for(const m of times)actions.append(button(m+' минут',()=>changeOrder(r,'accepted',m)));
    actions.append(button('ОТКАЗ',()=>changeOrder(r,'rejected',null),'reject'));
    for(const [status,label] of [['completed','Выполнен'],['new','Вернуть в новые']])actions.append(button(label,()=>changeOrder(r,status,null)));
   }
   if(finalFeatures)actions.append(button(r.is_test?'Снять отметку теста':'Пометить как тест',async()=>{if(!window.confirm(r.is_test?'Вернуть запись в обычные?':'Пометить запись как тестовую? Отзыв будет скрыт от посетителей, данные сохранятся.'))return;await MM.rpc('set_test_record',{p_entity:review?'review':'order',p_id:r.id,p_test:!r.is_test});}));
   card.append(actions);
   const audit=el('details');audit.append(el('summary','История изменений'));const log=el('p','Нажмите, чтобы загрузить','audit');audit.append(log);audit.addEventListener('toggle',async()=>{if(!audit.open)return;try{const {data,error:e}=await MM.client().from('audit').select('created_at,old_status,new_status,minutes').eq('entity_id',r.id).order('created_at');if(e)throw e;log.textContent=data.map(x=>`${new Date(x.created_at).toLocaleString('ru-RU')}: ${labels[x.old_status]||'Создан'} → ${labels[x.new_status]||x.new_status}${x.minutes?' · '+x.minutes+' мин':''}`).join('\n');}catch(e){log.textContent=e.message;}});card.append(audit);cards.append(card);
  }
 }
 async function session(session){
  const id=session?.user.id;if(id&&id===sessionId&&authorized)return;const epoch=++sessionEpoch;sessionId=id;stop?.();authorized=false;orders=[];reviews=[];alarm.setPending([]);$('cards').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;
  if(!session){health(false);return;}
  try{const member=await MM.rpc('is_staff');if(epoch!==sessionEpoch)return;if(!member)throw Error('Доступ только для сотрудников. Обратитесь к владельцу');try{const capabilities=await MM.rpc('kitchen_capabilities');finalFeatures=capabilities?.testRecords===true;}catch(e){if(e.code!=='PGRST202')throw e;}if(epoch!==sessionEpoch)return;authorized=true;$('workspace').hidden=false;$('login').hidden=true;stop=MM.subscribe(refresh,(ok,e)=>{health(ok);if(e)error(e);});}catch(e){error(e);}
 }
 $('login-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const {data,error:e}=await MM.client().auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(e)throw e;$('password').value='';await session(data.session);}catch(e){error(e);}finally{b.disabled=false;}};
 $('logout').onclick=async()=>{try{const {error:e}=await MM.client().auth.signOut();if(e)throw e;sessionId=undefined;await session(null);}catch(e){error(e);}};
 $('refresh').onclick=()=>refresh().catch(e=>{health(false);error(e);});
 $('more').onclick=()=>{limit+=100;refresh().catch(error);};
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;limit=100;render();refresh().catch(error);});
 window.addEventListener('offline',()=>health(false));
 window.addEventListener('online',async()=>{alarm.recover();try{const {data}=await MM.client().auth.getSession();await session(data.session);}catch(e){error(e);}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)alarm.recover();if(document.hidden){$('connection').className='warning';$('connection').textContent='Панель свёрнута: получение заказов и звук могут приостановиться.';}});
 (async()=>{try{const s=MM.client();s.auth.onAuthStateChange((_event,sess)=>{setTimeout(()=>session(sess),0);});const {data,error:e}=await s.auth.getSession();if(e)throw e;await session(data.session);}catch(e){error(e);}if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js',{scope:'/kitchen/'}).catch(()=>{});})();
})();
