/* Test-only: real guest RPCs and a separately logged-in staff session. */
(()=>{
 window.MMGuestTestSuite=async({staff,makeGuest,onStep})=>{
  const report={kind:'MissMaki-test',customerAuthMode:'database-token',steps:[],complete:false,guestCheckoutVerified:false};let a,b,order,request;
  const ok=r=>{if(r.error)throw r.error;return r.data;};const check=(v,m)=>{if(!v)throw Error(m);};
  const step=async(name,fn)=>{try{await fn();report.steps.push({name,result:'ok'});onStep?.(name,true);}catch{report.steps.push({name,result:'failed'});onStep?.(name,false);throw Error(name);}};
  const row=async()=>{const r=ok(await staff.from('orders').select('status,minutes,version').eq('id',order.id));check(r.length===1,'Заказ не найден');return r[0];};
  const change=async(status,minutes)=>{const r=await row();ok(await staff.rpc('order_status',{p_id:order.id,p_status:status,p_minutes:minutes,p_version:r.version}));};
  try{
   await step('Авторизованный сотрудник',async()=>check(ok(await staff.rpc('is_staff'))===true,'Нет роли сотрудника'));
   await step('Две гостевые сессии без регистрации в Auth',async()=>{a=await makeGuest();b=await makeGuest();check(a.guestRecord().token!==b.guestRecord().token,'Одинаковые сессии');});
   let payload;
   await step('Вымышленный предзаказ через защищённую гостевую функцию',async()=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));const d=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day+1)).toISOString().slice(0,10);let time;
    for(let n=810;n<=1380;n+=30){const t=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');if((await a.rpc('availability',{p_date:d,p_time:t})).available){time=t;break;}}
    check(time,'Нет свободного времени');request=crypto.randomUUID();payload={name:'АВТОТЕСТ ГОСТЬ — НЕ ГОТОВИТЬ',phone:'+70000000000',address:'Тест',area:'Самовывоз',fulfillment:'pickup',timing:'preorder',requestedDate:d,requestedTime:time,items:[{sku:'5:0',quantity:1}],subtotal:470,delivery:0,total:470,comment:'АВТОТЕСТ '+request};order=await a.rpc('create_order',{p_request:request,p:payload});check(order.ok,'Не сохранено');await row();
   });
   await step('Повтор не создаёт дубликат',async()=>check((await a.rpc('create_order',{p_request:request,p:payload})).id===order.id,'Дубликат'));
   await step('Чужой гостевой токен не читает заказ',async()=>check(await b.order(request)===null,'Чужой доступ'));
   await step('Прямой доступ к таблице запрещён',async()=>{const r=await a.client().from('orders').select('id').eq('id',order.id);check(r.error?.code==='42501','Таблица доступна гостю');});
   await step('Поддельная цена отклоняется',async()=>{let denied=false;try{await a.rpc('create_order',{p_request:crypto.randomUUID(),p:{...payload,total:1}});}catch(e){denied=/Стоимость/.test(e.message);}check(denied,'Цена не проверена');});
   for(const m of [15,30,45,60,90,120,150,180])await step(m+' минут: кухня → покупатель',async()=>{await change('accepted',m);const r=await a.order(request);check(r.status==='accepted'&&r.minutes===m,'Статус не передан');});
   await step('Отказ: кухня → покупатель',async()=>{await change('rejected',null);check((await a.order(request)).status==='rejected','Отказ не сохранён');});
   report.complete=true;report.guestCheckoutVerified=true;
  }catch{}
  finally{if(order)try{await change('rejected',null);report.cleanup='Тестовый заказ оставлен отклонённым';}catch{report.complete=false;report.guestCheckoutVerified=false;report.cleanup='Отклоните АВТОТЕСТ вручную';}}
  return report;
 };
})();
