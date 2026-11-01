/* Browser-only integration checks; never use a service key or fetch existing orders. */
(()=>{
 const times=[15,30,45,60,90,120,150,180];
 const must=(condition,message)=>{if(!condition)throw Error(message);};
 const ok=result=>{if(result.error)throw result.error;return result.data;};
 const denied=result=>{must(!!result.error&&(['42501','403'].includes(String(result.error.code))||(result.error.code==='P0001'&&/Доступ запрещён/.test(result.error.message))),'Операция не подтверждена как запрещённая правами');};
 window.MMTestSuite=async({staff,makeCustomer,onStep,customerAuthMode='anonymous'})=>{
  const report={kind:'MissMaki-test',startedAt:new Date().toISOString(),steps:[],complete:false,customerAuthMode,guestCheckoutVerified:false};let a,b,orderId;
  const step=async(name,fn)=>{try{await fn();report.steps.push({name,result:'ok'});onStep?.(name,true);}catch(e){report.steps.push({name,result:'failed',code:/^[\w-]{1,40}$/.test(String(e.code))?String(e.code):'check_failed'});onStep?.(name,false);throw e;}};
  const read=async()=>{const rows=ok(await staff.from('orders').select('id,number,status,minutes,version').eq('id',orderId));must(rows?.length===1,'Тестовый заказ не найден');return rows[0];};
  const change=async(status,minutes)=>{const row=await read();ok(await staff.rpc('order_status',{p_id:orderId,p_status:status,p_minutes:minutes,p_version:row.version}));};
  try{
   await step('Вход сотрудника и роль',async()=>{must(ok(await staff.rpc('is_staff'))===true,'Нет роли сотрудника');});
   await step(customerAuthMode==='synthetic-email'?'Две независимые вымышленные учётные записи':'Анонимные сессии двух покупателей',async()=>{a=await makeCustomer();b=await makeCustomer();must(a.id&&b.id&&a.id!==b.id,'Нужны две независимые сессии');must(ok(await a.client.rpc('is_staff'))===false,'Покупатель получил роль сотрудника');});
   let payload,request;
   await step('Создание вымышленного предзаказа',async()=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
    const d=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)+1));const date=d.toISOString().slice(0,10);let time;
    for(let n=810;n<=1380;n+=30){const candidate=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');if(ok(await a.client.rpc('availability',{p_date:date,p_time:candidate})).available){time=candidate;break;}}
    must(time,'Завтра нет свободного тестового слота');request=crypto.randomUUID();
    payload={name:'АВТОТЕСТ MissMaki',phone:'+70000000000',address:'ТЕСТ: самовывоз',area:'Самовывоз',fulfillment:'pickup',timing:'preorder',requestedDate:date,requestedTime:time,items:[{sku:'5:0',name:'Филадельфия — Классическая',quantity:1,price:470}],subtotal:470,delivery:0,total:470,comment:'АВТОТЕСТ '+request+' — НЕ ГОТОВИТЬ',birthdayGift:false};
    const r=ok(await a.client.rpc('create_order',{p_request:request,p:payload}));must(r?.ok&&r.id,'Создание не подтверждено');orderId=r.id;await read();
   });
   await step('Повтор запроса не создаёт дубликат',async()=>{const r=ok(await a.client.rpc('create_order',{p_request:request,p:payload}));must(r.id===orderId,'Повтор создал другую запись');const rows=ok(await a.client.from('orders').select('id').eq('request_id',request));must(rows.length===1,'Неверное количество записей');});
   await step('Чужой покупатель не читает заказ',async()=>{const rows=ok(await b.client.from('orders').select('id').eq('id',orderId));must(rows.length===0,'Чужой заказ доступен');});
   await step('Покупатель не меняет статус через RPC',async()=>{denied(await a.client.rpc('order_status',{p_id:orderId,p_status:'accepted',p_minutes:15,p_version:1}));});
   await step('Прямая запись в таблицу запрещена',async()=>{denied(await a.client.from('orders').update({comment:'НЕДОПУСТИМАЯ ПРАВКА АВТОТЕСТА'}).eq('id',orderId));});
   await step('Поддельная цена отклоняется сервером',async()=>{const r=await a.client.rpc('create_order',{p_request:crypto.randomUUID(),p:{...payload,total:1}});must(r.error?.code==='P0001'&&/Стоимость/.test(r.error.message),'Не подтверждена проверка цены');});
   for(const m of times)await step(m+' минут: запись сотрудником и чтение покупателем',async()=>{await change('accepted',m);const row=await read();must(row.status==='accepted'&&row.minutes===m,'Время не сохранено');const rows=ok(await a.client.from('orders').select('status,minutes').eq('id',orderId));must(rows.length===1&&rows[0].status==='accepted'&&rows[0].minutes===m,'Покупатель не получил статус');});
   await step('ОТКАЗ сохраняется и доступен покупателю',async()=>{await change('rejected',null);const rows=ok(await a.client.from('orders').select('status').eq('id',orderId));must(rows[0]?.status==='rejected','Отказ не сохранён');});
   await step('История тестового заказа сохранена',async()=>{const rows=ok(await staff.from('audit').select('new_status,minutes').eq('entity_id',orderId));must(rows.some(x=>x.new_status==='new')&&rows.some(x=>x.new_status==='rejected')&&times.every(m=>rows.some(x=>x.new_status==='accepted'&&x.minutes===m)),'Не найдена полная история');});
   report.complete=true;
  }catch{report.complete=false;}
  finally{
   if(orderId)try{await change('rejected',null);report.cleanup='Тестовый заказ оставлен отклонённым';}catch{report.complete=false;report.cleanup='Проверьте АВТОТЕСТ в кухне: не удалось завершить отказом';}
   for(const c of [a,b])if(c)try{await c.client.auth.signOut({scope:'local'});}catch{}
   report.guestCheckoutVerified=report.complete&&customerAuthMode==='anonymous';
   report.finishedAt=new Date().toISOString();
  }
  return report;
 };
})();
