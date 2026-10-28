const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{chromium,webkit}=require('playwright'),{harness}=require('./harness.cjs'),path=require('path');
process.chdir(path.resolve(__dirname,'..'));
(async()=>{const kind=process.env.MM_BROWSER||'chromium',browser=await(kind==='webkit'?webkit.launch():chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}));const results=[];try{
const html=fs.readFileSync('site/index.html','utf8'),endpoint=html.match(/const ENDPOINT='([^']+)'/)[1];
for(const variant of ['asap-60','preorder-accept','reject','pickup','uncertain','status-error','two-orders']){
 const b=harness('apps-script/Код.gs');b.state.now=Date.parse('2026-10-28T12:00:00Z');b.state.props.MM_CONFIRM_HOOK_KEY='fixture-hook-secret';vm.runInContext(fs.readFileSync('apps-script/AvailabilityFix.gs','utf8'),b.ctx);
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),orders=[],errors=[];let failStatus=false,statusGets=0;
 await ctx.route('**/*',async route=>{const r=route.request(),u=r.url();if(u==='https://missmaki.ru/')return route.fulfill({body:html,contentType:'text/html'});
 if(u.startsWith(endpoint)){
  if(r.method()==='GET'){const params=Object.fromEntries(new URL(u).searchParams);if(params.orderId){statusGets++;if(failStatus)return route.fulfill({body:params.callback+'({ok:false});',contentType:'application/javascript'})}const out=b.run('doGet',[{parameter:params}]);return route.fulfill({body:out.content,contentType:out.mimeType==='JS'?'application/javascript':'application/json'})}
  const params=Object.fromEntries(new URLSearchParams(r.postData())),order=JSON.parse(params.payload);orders.push(order);const out=b.run('doPost',[{parameter:params}]);assert.equal(out.xFrame,'ALLOWALL');return route.fulfill({body:out.content,contentType:'text/html'});
 }
 return route.abort();});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());await p.clock.install({time:new Date('2026-10-28T12:00:00Z')});await p.goto('https://missmaki.ru/');assert.equal(await p.locator('#order-consent').isChecked(),false);assert.equal(await p.locator('#review-publication-consent').isChecked(),false);assert.equal(await p.locator('.mm-call').getAttribute('href'),'tel:+79530912871');assert.equal(await p.locator('.mm-footer nav a').count(),4);
 await p.evaluate(()=>add(2));await p.locator('#name').fill('ТЕСТ');await p.locator('#phone').fill('НЕ ЗВОНИТЬ');await p.locator('#area').selectOption({index:1});await p.locator('#address').fill('НЕ ДОСТАВЛЯТЬ');await p.evaluate(()=>checkout());assert.equal(orders.length,0);assert.equal(await p.evaluate(()=>Object.keys(cart).length),1);await p.locator('#order-consent').check();
 if(variant==='pickup')await p.locator('[name=fulfillment][value=pickup]').check();
 if(variant==='preorder-accept'){await p.locator('[name=orderTiming][value=preorder]').check();await p.locator('#preorder-date').fill('2026-10-29');await p.locator('#preorder-date').dispatchEvent('change');await p.locator('#preorder-time').selectOption('18:00');await p.locator('#preorder-time').dispatchEvent('change');await p.waitForFunction(()=>document.getElementById('slot-message').textContent.includes('свободно'))}
 if(variant==='uncertain')b.state.failure='network';
 await p.evaluate(()=>checkout());assert.equal(orders.length,1);assert.equal(orders[0].consent.accepted,true);const id=orders[0].requestId;
 if(variant==='uncertain'){assert.equal(await p.evaluate(()=>Object.keys(cart).length),1);await p.evaluate(()=>checkout());assert.equal(orders[0].requestId,orders[1].requestId);assert.equal(b.state.sent.filter(x=>x.method==='sendMessage').length,1)}
 else{
  assert.equal(await p.evaluate(()=>Object.keys(cart).length),0);await p.waitForFunction(()=>!statusInFlight);assert.match(await p.locator('#status').textContent(),/Ожидаем ответ/);assert.equal(b.state.sent.filter(x=>x.method==='sendMessage').length,1);
  const cb=(orderId,action)=>b.run('doPost',[{parameter:{mmHook:'fixture-hook-secret'},postData:{type:'application/json',contents:JSON.stringify({update_id:12,callback_query:{id:'cb',from:{id:42,is_bot:false},message:{message_id:b.order(orderId).messageId,chat:{id:-1001}},data:'mc:'+action+':'+orderId}})}}]);
  if(variant==='status-error'){failStatus=true;await p.clock.runFor(12010);await p.waitForFunction(()=>!statusInFlight);assert.match(await p.locator('#status').textContent(),/Ожидаем ответ/);assert.equal(b.state.sent.filter(x=>x.method==='sendMessage').length,1);failStatus=false}
  if(variant==='two-orders'){
   await p.evaluate(()=>add(3));await p.evaluate(()=>checkout());assert.equal(orders.length,2);await p.waitForFunction(()=>!statusInFlight);cb(id,'30');await p.clock.runFor(12010);await p.waitForFunction(()=>!statusInFlight);assert.match(await p.locator('#status').textContent(),/Ожидаем ответ/);cb(orders[1].requestId,'90');
  }else cb(id,variant==='preorder-accept'?'pre':variant==='reject'?'no':'60');
  await p.clock.runFor(12010);await p.waitForFunction(()=>activeOrder.status==='accepted'||activeOrder.status==='rejected');const text=await p.locator('#status').textContent();assert.match(text,variant==='preorder-accept'?/Ваш предзаказ принят/:variant==='reject'?/не можем принять/:/Ваш заказ принят/);
  const getCount=statusGets;await p.clock.runFor(30000);assert.equal(statusGets,getCount);await p.reload();assert.equal(await p.locator('#status').textContent(),text);assert.equal(statusGets,getCount);assert.equal(await p.locator('#decision').isVisible(),false);
  if(variant==='pickup')assert.equal(orders[0].delivery,0);
 }
 assert.deepEqual(errors,[]);results.push({variant,passed:true,postCount:orders.length,statusGets});console.log('PASS '+kind+' '+variant);await ctx.close();
}
fs.writeFileSync('tests/BROWSER-'+kind+'-RESULTS.json',JSON.stringify({passed:true,engine:kind,viewport:'390x844 touch',allNetworkMutationsMocked:true,actualIphoneTested:false,results},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
