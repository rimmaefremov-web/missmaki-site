const {test,expect}=require('@playwright/test');
// Browser contract tests use an explicit fake API. These do not prove Supabase deployment.
async function mock(page,{staff=false,offline=false}={}){
 await page.addInitScript(({staff,offline})=>{
  window.__fake={staff,offline,status:'new',minutes:null,version:1,reviewStatus:'pending',calls:[]};
  const f=window.__fake;
  const order=()=>({id:f.orderId||'o1',is_test:!!f.orderIsTest,request_id:f.createdRequest||'r1',number:42,name:'Тест',phone:'+79530000000',address:'Адрес',area:'Южный',fulfillment:f.fulfillment||'delivery',timing:f.timing||'asap',pickup_number:f.pickupNumber??null,requested_date:f.requestedDate||null,requested_time:f.requestedTime||null,created_at:new Date().toISOString(),items:[{name:'Ролл',quantity:2,price:470}],delivery:200,total:1140,payment:'При получении',comment:'',status:f.status,minutes:f.minutes,version:f.version});
  const review=()=>({id:'rev1',is_test:!!f.reviewIsTest,name:'Автор',rating:5,body:'Вкусно <script>test</script>',created_at:new Date().toISOString(),status:f.reviewStatus,version:1});
  function result(table,filters){if(f.offline)return {data:null,error:{message:'Нет сети'}};if(table==='orders'){let a=f.orderStates?f.orderStates.map(x=>({...order(),...x})):[order()];for(const [k,v] of filters)a=a.filter(o=>o[k]===v);return {data:a,error:null};}if(table==='reviews')return {data:[review()],error:null};return {data:[],error:null};}
  const query=table=>{const filters=[];let single=false;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},range(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){const r=result(table,filters);if(single&&r.data)r.data=r.data[0]||null;if(f.deferFresh&&table==='orders'&&filters.some(([k,v])=>k==='status'&&v==='new')){f.deferFresh=false;return new Promise(done=>{window.__releaseFresh=()=>done(r);}).then(resolve,reject);}return Promise.resolve(r).then(resolve,reject);}};return q;};
  window.__client={auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signInAnonymously:async()=>({data:{}}),signInWithPassword:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){},signOut:async()=>({})},from:query,channel(){const c={on(){return c;},subscribe(fn){setTimeout(()=>fn('SUBSCRIBED'),0);return c;}};return c;},removeChannel(){},async rpc(name,args){f.calls.push({name,args});if(f.offline)return {error:{message:'Нет сети'}};let data=null;if(name==='is_staff')data=f.staff;if(name==='kitchen_capabilities')data=f.finalFeatures?{testRecords:true,businessBackup:true}:null;if(name==='set_test_record'){if(args.p_entity==='order')f.orderIsTest=args.p_test;else f.reviewIsTest=args.p_test;}if(name==='order_status'){if(f.failStatus)return {error:{message:'Сервер не принял изменение'}};if(f.orderStates){const row=f.orderStates.find(x=>x.id===args.p_id);row.status=args.p_status;row.minutes=args.p_minutes;row.version++;}else{f.status=args.p_status;f.minutes=args.p_minutes;f.version++;}if(f.failReadAfterStatus)f.offline=true;}if(name==='moderate_review')f.reviewStatus=args.p_status;if(name==='public_reviews')data=f.reviewStatus==='approved'?[review()]:[];if(name==='my_reviews')data=[{...review(),status:f.reviewStatus==='approved'?'approved':'pending'}];if(name==='availability')data={ok:true,available:true};if(name==='create_order'){if(f.rejectOrder)return {error:{message:'Сервер отклонил отправку'}};if(f.badOrderResponse)return {data:{ok:true},error:null};f.createdRequest=args.p_request;data={ok:true,number:42,id:'o1'};if(f.failOrderOnce){f.failOrderOnce=false;return {error:{message:'Ответ потерян'}};}}return {data,error:null};}};
 },{staff,offline});
 await page.route('**/shared/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.MISSMAKI_CONFIG={enabled:true,deploymentProfile:'ru',supabaseUrl:'https://orders.example.com',publishableKey:'test-only'};"}));
 await page.route('**/shared/vendor/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.__client};'}));
}
test('staff panel, every wait button, refusal and moderation',async({page})=>{
 page.on('dialog',dialog=>dialog.accept());await mock(page,{staff:true});await page.goto('/kitchen/');await expect(page.getByRole('heading',{name:/Заказ №42/})).toBeVisible();await page.locator('#sound').click();
 for(const m of [15,30,45,60,90,120,150,180]){
  await page.getByRole('button',{name:m+' минут',exact:true}).click();await page.getByRole('button',{name:'Принятые',exact:true}).click();await expect(page.getByText('Ожидание '+m+' минут',{exact:true})).toBeVisible();await expect(page.locator('#alarm-status')).toContainText('Ждём новые заказы');
 }
 await page.getByRole('button',{name:'ОТКАЗ',exact:true}).click();await page.getByRole('button',{name:'Отклонённые',exact:true}).click();await expect(page.getByRole('heading',{name:/Заказ №42 · Отклонён/})).toBeVisible();
 await page.getByRole('button',{name:'Отзывы',exact:true}).click();await page.getByRole('button',{name:'ПРИНЯТЬ',exact:true}).click();await expect(page.getByText('Опубликован',{exact:true})).toBeVisible();await page.getByRole('button',{name:'ОТКЛОНИТЬ',exact:true}).click();await expect(page.getByText('Отклонён',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('unauthorized visitor cannot see kitchen data',async({page})=>{await mock(page);await page.goto('/kitchen/');await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#error')).toContainText('Доступ только');});
test('connection failure warns and recovers',async({page})=>{await mock(page,{staff:true});await page.goto('/kitchen/');await expect(page.locator('#connection')).toContainText('Соединение есть');await page.evaluate(()=>window.__fake.offline=true);await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.locator('#connection')).toContainText('Нет соединения');await page.evaluate(()=>window.__fake.offline=false);await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.locator('#connection')).toContainText('Соединение есть');});
test('customer live acceptance, rejected review stays pending, no legacy requests',async({page})=>{
 await mock(page);let legacy=[];page.on('request',r=>{if(/script.google|telegram/.test(r.url()))legacy.push(r.url());});
 await page.addInitScript(()=>localStorage.setItem('missmaki-active-order','r1'));
 await page.goto('/');await expect(page.locator('#status')).toContainText('№42');
 await page.evaluate(()=>{window.__fake.status='accepted';window.__fake.minutes=15;});await expect(page.locator('#status')).toHaveText('Ваш заказ №42 принят! Время ожидания — 15 минут');
 await page.evaluate(()=>window.__fake.reviewStatus='rejected');await expect(page.locator('#review-status')).toHaveText('Ваш отзыв ожидает подтверждения');await expect(page.locator('#published-reviews')).toBeEmpty();
 await page.reload();await expect(page.locator('#review-status')).toHaveText('Ваш отзыв ожидает подтверждения');await expect(page.locator('#published-reviews')).toBeEmpty();expect(legacy).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('lost order response restores checkout after reload and reuses request ID',async({page})=>{
 await mock(page);await page.goto('/');await page.evaluate(()=>{isOpen=()=>true;add(1);document.querySelector('input[name="fulfillment"][value="pickup"]').checked=true;setMethod();updateHours();window.__fake.failOrderOnce=true;});
 await page.locator('#name').fill('Покупатель');await page.locator('#phone').fill('+79530000000');await page.locator('#send').focus();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>!!localStorage.getItem('mm-pending-submission'))).toBe(true);
 await expect(page.locator('#status')).toContainText('№42');
 const request=await page.evaluate(()=>JSON.parse(localStorage.getItem('mm-pending-submission')).requestId);
 await page.reload();await page.evaluate(()=>{isOpen=()=>true;updateHours();});await expect(page.locator('#name')).toHaveValue('Покупатель');await expect(page.locator('#cart')).toContainText('Филадельфия');await page.locator('#send').focus();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('mm-pending-submission'))).toBeNull();
 const calls=await page.evaluate(()=>window.__fake.calls.filter(c=>c.name==='create_order'));expect(calls[0].args.p_request).toBe(request);
});

test('bundled SDK loads locally without a foreign CDN',async({page})=>{
 const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173'))external.push(r.url());});
 await page.goto('/kitchen/');await expect(page.locator('#error')).toContainText('ещё не подключена');
 expect(await page.evaluate(()=>typeof window.supabase?.createClient)).toBe('function');expect(external).toEqual([]);
});

test('review current action is disabled; reversing a decision needs confirmation',async({page})=>{
 await mock(page,{staff:true});await page.goto('/kitchen/');await page.getByRole('button',{name:'Отзывы',exact:true}).click();
 await page.getByRole('button',{name:'ОТКЛОНИТЬ',exact:true}).click();await expect(page.getByRole('button',{name:'ОТКЛОНИТЬ',exact:true})).toBeDisabled();
 const count=()=>page.evaluate(()=>window.__fake.calls.filter(x=>x.name==='moderate_review').length);expect(await count()).toBe(1);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'ПРИНЯТЬ',exact:true}).click();await expect(page.getByRole('button',{name:'ПРИНЯТЬ',exact:true})).toBeEnabled();expect(await count()).toBe(1);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'ПРИНЯТЬ',exact:true}).click();await expect(page.getByRole('button',{name:'ПРИНЯТЬ',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'ОТКЛОНИТЬ',exact:true})).toBeEnabled();expect(await count()).toBe(2);
});
test('sound needs a gesture; signals, volume and permission recovery work',async({page})=>{
 await page.addInitScript(()=>{window.__beeps=0;const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){window.__audio=this;const oscillator=create.call(this),start=oscillator.start.bind(oscillator);oscillator.start=(...args)=>{window.__beeps++;return start(...args);};return oscillator;};});
 await mock(page,{staff:true});await page.goto('/kitchen/');await expect(page.locator('#connection')).toContainText('Соединение есть');expect(await page.evaluate(()=>window.__beeps)).toBe(0);
 await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__beeps)).toBe(1);
 await page.locator('#alarm-signal').selectOption('urgent');await page.locator('#alarm-volume').fill('65');await expect(page.locator('#alarm-volume-value')).toHaveText('65%');
 await page.locator('#refresh').click();expect(await page.evaluate(()=>window.__beeps)).toBe(1);
 await page.evaluate(()=>window.__audio.suspend());await expect(page.locator('#sound')).toHaveText('Включить звук');
 await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__audio?.state)).toBe('running');
 await page.reload();await expect(page.locator('#alarm-signal')).toHaveValue('urgent');await expect(page.locator('#alarm-volume')).toHaveValue('65');
 await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__audio?.state)).toBe('running');
 await expect(page.locator('#alarm-status')).toContainText('Необработанных заказов: 1');
 expect(await page.getByRole('button',{name:'Остановить звонок',exact:true}).count()).toBe(0);
});
test('orders reconnect automatically on online and returning to the foreground',async({page})=>{
 await mock(page,{staff:true});await page.goto('/kitchen/');await expect(page.locator('#connection')).toContainText('Соединение есть');
 await page.evaluate(()=>{window.__fake.offline=true;window.dispatchEvent(new Event('offline'));});await expect(page.locator('#connection')).toContainText('Нет соединения');
 await page.evaluate(()=>{window.__fake.offline=false;window.__fake.orderId='after-reconnect';window.dispatchEvent(new Event('online'));});await expect(page.locator('#connection')).toContainText('Соединение есть');
 await page.evaluate(()=>{window.__fake.status='accepted';window.__fake.minutes=45;document.dispatchEvent(new Event('visibilitychange'));});await page.getByRole('button',{name:'Принятые',exact:true}).click();await expect(page.getByText('Ожидание 45 минут',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.__fake.calls.filter(x=>x.name==='create_order').length)).toBe(0);
});

async function alarmClock(page){
 await page.clock.install();await page.addInitScript(()=>{
  window.__rings=0;window.__activeRings=0;window.__maxRings=0;
  const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  window.AudioContext=class {constructor(){this.state='suspended';}get currentTime(){return performance.now()/1000;}createGain(){return {gain:param(),connect(){},disconnect(){}};}resume(){this.state='running';this.onstatechange?.();return Promise.resolve();}createOscillator(){let stopped=false,timer;const oscillator={frequency:param(),connect(){},disconnect(){},start(){window.__rings++;window.__activeRings++;window.__maxRings=Math.max(window.__maxRings,window.__activeRings);},stop(at){const finish=()=>{if(stopped)return;stopped=true;clearTimeout(timer);window.__activeRings--;oscillator.onended?.();};if(at!==undefined)timer=setTimeout(finish,Math.max(0,(at-performance.now()/1000)*1000));else finish();}};return oscillator;}};
 });
}
test('alarm survives failed acceptance, repeats without overlap and stops only when every order is processed',async({page})=>{
 await alarmClock(page);await mock(page,{staff:true});await page.goto('/kitchen/');
 await page.evaluate(()=>window.__fake.orderStates=[{id:'a',number:1,status:'new',version:1},{id:'b',number:2,status:'new',version:1}]);await page.locator('#refresh').click();await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__rings)).toBe(1);
 await page.evaluate(()=>window.__fake.failStatus=true);await page.locator('.card').first().getByRole('button',{name:'15 минут',exact:true}).click();await expect(page.locator('#error')).toContainText('Сервер не принял');
 await page.clock.runFor(30000);expect(await page.evaluate(()=>window.__rings)).toBe(2);
 await page.evaluate(()=>window.__fake.failStatus=false);await page.locator('.card').first().getByRole('button',{name:'15 минут',exact:true}).click();await expect(page.locator('#alarm-status')).toContainText('Необработанных заказов: 1');
 await page.getByRole('button',{name:'Отзывы',exact:true}).click();await page.clock.runFor(30000);expect(await page.evaluate(()=>window.__rings)).toBe(3);
 await page.getByRole('button',{name:'Новые',exact:true}).click();await page.locator('.card').getByRole('button',{name:'ОТКАЗ',exact:true}).click();await expect(page.locator('#alarm-status')).toContainText('Ждём новые заказы');expect(await page.evaluate(()=>window.__activeRings)).toBe(0);
 await page.clock.runFor(60000);expect(await page.evaluate(()=>window.__rings)).toBe(3);expect(await page.evaluate(()=>window.__maxRings)).toBe(1);
});
test('successful server response silences an order even if the following refresh fails',async({page})=>{
 await alarmClock(page);await mock(page,{staff:true});await page.goto('/kitchen/');await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__rings)).toBe(1);
 await page.evaluate(()=>window.__fake.failReadAfterStatus=true);await page.getByRole('button',{name:'180 минут',exact:true}).click();await expect(page.locator('#error')).toContainText('Нет сети');
 expect(await page.evaluate(()=>window.__activeRings)).toBe(0);await page.clock.runFor(60000);expect(await page.evaluate(()=>window.__rings)).toBe(1);
 await page.evaluate(()=>{window.__fake.offline=false;window.dispatchEvent(new Event('online'));});await expect(page.locator('#connection')).toContainText('Соединение есть');await expect(page.locator('#alarm-status')).toContainText('Ждём новые заказы');
});
test('offline keeps known new orders ringing; a server update clears the alarm after reconnection',async({page})=>{
 await alarmClock(page);await mock(page,{staff:true});await page.goto('/kitchen/');await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__rings)).toBe(1);
 await page.evaluate(()=>{window.__fake.offline=true;window.dispatchEvent(new Event('offline'));});await page.clock.runFor(30000);expect(await page.evaluate(()=>window.__rings)).toBe(2);
 await page.evaluate(()=>{window.__fake.status='rejected';window.__fake.offline=false;window.dispatchEvent(new Event('online'));});await expect(page.locator('#alarm-status')).toContainText('Ждём новые заказы');
 await page.clock.runFor(60000);expect(await page.evaluate(()=>window.__rings)).toBe(2);
});

test('a delayed queue read cannot rearm an order already accepted by the server',async({page})=>{
 await alarmClock(page);await mock(page,{staff:true});await page.goto('/kitchen/');await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>window.__rings)).toBe(1);
 await page.evaluate(()=>window.__fake.deferFresh=true);await page.locator('#refresh').click();await expect.poll(()=>page.evaluate(()=>typeof window.__releaseFresh)).toBe('function');
 await page.getByRole('button',{name:'30 минут',exact:true}).click();await expect(page.locator('#alarm-status')).toContainText('Ждём новые заказы');
 await page.evaluate(()=>window.__releaseFresh());await expect(page.locator('#connection')).toContainText('Соединение есть');await page.clock.runFor(60000);
 expect(await page.evaluate(()=>window.__rings)).toBe(1);await expect(page.locator('#alarm-status')).toContainText('Ждём новые заказы');
});

test('failed or malformed order submission never claims success and retains the original request for retry',async({page})=>{
 await mock(page);await page.goto('/');await page.evaluate(()=>{isOpen=()=>true;add(1);document.querySelector('input[name="fulfillment"][value="pickup"]').checked=true;setMethod();updateHours();window.__fake.rejectOrder=true;});
 await page.locator('#name').fill('ТЕСТ НЕ ГОТОВИТЬ');await page.locator('#phone').fill('+70000000000');await page.locator('#send').focus();await page.keyboard.press('Enter');await expect(page.locator('#status')).toContainText('Не удалось подтвердить отправку');
 const request=await page.evaluate(()=>JSON.parse(localStorage.getItem('mm-pending-submission')).requestId);await page.evaluate(()=>{window.__fake.rejectOrder=false;window.__fake.badOrderResponse=true;});await page.locator('#send').focus();await page.keyboard.press('Enter');await expect(page.locator('#status')).toContainText('Сервер не подтвердил сохранение');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mm-pending-submission')).requestId)).toBe(request);
 await page.evaluate(()=>window.__fake.badOrderResponse=false);await page.locator('#send').focus();await page.keyboard.press('Enter');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('mm-pending-submission'))).toBeNull();const requests=await page.evaluate(()=>window.__fake.calls.filter(x=>x.name==='create_order').map(x=>x.args.p_request));expect(requests).toEqual([request,request,request]);
});

test('test orders leave operational queue without deletion and test reviews remain visible to staff',async({page})=>{
 await mock(page,{staff:true});page.on('dialog',d=>d.accept());await page.goto('/kitchen/');await page.evaluate(()=>window.__fake.finalFeatures=true);await page.locator('#logout').click();await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('fixture-password');await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.getByRole('heading',{name:/Заказ №42/})).toBeVisible();
 await page.getByRole('button',{name:'Пометить как тест',exact:true}).click();await expect(page.getByRole('heading',{name:/Заказ №42/})).toHaveCount(0);await expect(page.locator('#summary')).toContainText('Новых заказов: 0');
 await page.getByRole('button',{name:'История заказов',exact:true}).click();await expect(page.getByText('ТЕСТ — НЕ ГОТОВИТЬ',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Отзывы',exact:true}).click();await page.getByRole('button',{name:'Пометить как тест',exact:true}).click();await expect(page.getByRole('button',{name:'Снять отметку теста',exact:true})).toBeVisible();
});

test('pickup confirmation shows its permanent cell; scheduled pickup uses the chosen date and time after reload',async({page})=>{
 await mock(page);await page.addInitScript(()=>localStorage.setItem('missmaki-active-order','r1'));await page.goto('/');
 await page.evaluate(()=>{Object.assign(window.__fake,{fulfillment:'pickup',status:'accepted',minutes:15,pickupNumber:1});document.dispatchEvent(new Event('visibilitychange'));});
 const ordinary='Ваш заказ подтверждён! 🍣\n\n⏱ Время ожидания: 15 минут\n\n📦 Ячейка самовывоза: №1\n\nВаш заказ будет ждать вас в ячейке №1.\n\nОплата при получении на кассе.\n\nСпасибо, что выбираете MissMaki! ❤️';
 await expect(page.locator('#status')).toHaveText(ordinary);
 await page.evaluate(()=>{Object.assign(window.__fake,{timing:'preorder',pickupNumber:2,requestedDate:'2026-11-05',requestedTime:'18:30:00'});document.dispatchEvent(new Event('visibilitychange'));});
 const preorder='Ваш предзаказ подтверждён! 🍣\n\n📅 Дата получения: 05.11.2026\n\n🕒 Время получения: 18:30\n\n📦 Ячейка самовывоза: №2\n\nВаш заказ будет ждать вас в ячейке №2 к выбранному времени.\n\nОплата при получении на кассе.\n\nСпасибо, что планируете вкусные моменты вместе с MissMaki! ❤️';
 await expect(page.locator('#status')).toHaveText(preorder);await expect(page.locator('#status')).not.toContainText('Время ожидания');
 // Restore the server fixture after reload without relying on init-script ordering.
 await page.reload();await page.evaluate(()=>{Object.assign(window.__fake,{fulfillment:'pickup',status:'accepted',minutes:15,timing:'preorder',pickupNumber:2,requestedDate:'2026-11-05',requestedTime:'18:30:00'});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#status')).toHaveText(preorder);
 await page.evaluate(()=>{window.__fake.status='rejected';document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#status')).toHaveText('К сожалению, сейчас мы не можем принять ваш заказ');
});
test('kitchen shows the same cell and requested pickup time without release buttons',async({page})=>{
 await mock(page,{staff:true});await page.goto('/kitchen/');await page.evaluate(()=>Object.assign(window.__fake,{fulfillment:'pickup',status:'accepted',pickupNumber:6,timing:'preorder',requestedDate:'2026-11-05',requestedTime:'18:30:00'}));await page.locator('#refresh').click();await page.getByRole('button',{name:'Принятые',exact:true}).click();await expect(page.getByText('📦 Ячейка самовывоза: №6',{exact:true})).toBeVisible();await expect(page.getByText('Предзаказ: 2026-11-05 к 18:30:00',{exact:true})).toBeVisible();expect(await page.getByRole('button',{name:/освободить ячейку/i}).count()).toBe(0);
});
