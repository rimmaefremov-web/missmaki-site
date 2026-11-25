/* Loaded after the existing site script. Only enabled configuration changes transport. */
if(window.MM?.enabled){
 const originalCheckout=checkout;
 const screen=document.getElementById('status'),paymentInfo=document.getElementById('payment-info');
 for(const n of paymentInfo.querySelectorAll(':scope > h3,:scope > p'))n.hidden=true;
 screen.after(paymentInfo);
 const screenStyle=document.createElement('style');screenStyle.textContent=`
 #status.order-screen{display:block;background:#DDF3D8;color:#000!important;font-size:clamp(21px,4.8vw,30px);font-weight:800;line-height:1.4;text-align:center;border-radius:20px;padding:22px 16px;margin:20px 0;scroll-margin-top:76px;scroll-margin-bottom:100px;white-space:pre-line;overflow-wrap:anywhere}
 #status.order-screen::after{content:none}
 #status.order-screen[data-waiting="true"]::after{content:"";display:block;width:38px;height:38px;margin:16px auto 0;border:5px solid #0003;border-top-color:#000;border-radius:50%;animation:mm-order-wait 1.2s linear infinite}
 @keyframes mm-order-wait{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){#status.order-screen[data-waiting="true"]::after{animation-duration:3s}}
 `;document.head.append(screenStyle);
 let waiting=false,wake,wakeRequest=false,lastOrder,watchVersion=0;
 async function keepAwake(){
  if(!waiting||document.hidden||wake||wakeRequest||!navigator.wakeLock?.request)return;
  wakeRequest=true;try{const lock=await navigator.wakeLock.request('screen');if(!waiting||document.hidden){await lock.release();return;}wake=lock;lock.addEventListener('release',()=>{if(wake===lock)wake=null;});}catch(e){}finally{wakeRequest=false;}
 }
 function waitState(value){waiting=value;screen.dataset.waiting=String(value);document.documentElement.dataset.mmOrderWaiting=String(value);if(value)keepAwake();else if(wake){const lock=wake;wake=null;lock.release().catch(()=>{});}}
 function showOrder(data){const changed=lastOrder?.status!==data.status;lastOrder=data;screen.classList.add('order-screen');const message=MM.orderMessage(data);if(screen.textContent!==message)screen.textContent=message;waitState(data.status==='new');paymentInfo.hidden=data.status==='rejected';document.getElementById('decision').style.display='none';if(changed)screen.scrollIntoView({behavior:'smooth',block:'start'});}
 window.MMOrderScreen={sent(){showOrder(lastOrder||{status:'new'});screen.scrollIntoView({behavior:'smooth',block:'start'});}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)keepAwake();});
 window.addEventListener('pageshow',()=>{keepAwake();document.dispatchEvent(new Event('visibilitychange'));});
 window.addEventListener('pointerdown',()=>{if(waiting)keepAwake();},{passive:true});

 let stopWatching,lastSubmissionError;
 submit=async order=>{
  lastSubmissionError=null;lastOrder=null;waitState(true);
  await MM.customer();
  const {requestId,origin,...payload}=order;
  localStorage.setItem('mm-pending-submission',JSON.stringify({requestId,payload}));
  localStorage.setItem('missmaki-active-order',requestId);
  watchOrder(requestId);
  try{
  const result=await MM.rpc('create_order',{p_request:requestId,p:payload});
  if(result?.ok!==true||typeof result.id!=='string'||!result.id||!Number.isSafeInteger(Number(result.number))||Number(result.number)<1)throw Error('Сервер не подтвердил сохранение заказа. Повторите отправку с прежней корзиной.');
  localStorage.removeItem('mm-pending-submission');
  return result;
  }catch(e){lastSubmissionError=MMCompat.message(e);if(!lastOrder)waitState(false);throw e;}
 };
 jsonpGet=async params=>{await MM.customer();return MM.rpc('availability',{p_date:params.date,p_time:params.time});};
 checkout=async()=>{try{MMCompat.ensureCheckoutCrypto();await MM.customer();await originalCheckout();}catch(e){document.getElementById('status').textContent=MMCompat.message(e);}};
 watchOrder=id=>{
  if(!id)return;
  try{localStorage.setItem('missmaki-active-order',id);}catch(e){}
  stopWatching?.();if(!lastOrder)waitState(true);const version=++watchVersion;
  stopWatching=MM.subscribe(async()=>{
   const data=await MM.order(id);if(version!==watchVersion)return;
   if(!data){if(!lastOrder)screen.textContent=lastSubmissionError?'Не удалось подтвердить отправку. '+lastSubmissionError+' Повторите с той же корзиной.':'Проверяем сохранение заказа. Не отправляйте новый заказ.';return;}
   showOrder(data);
  },ok=>{if(!ok&&version===watchVersion&&(!lastOrder||lastOrder.status==='new')){screen.textContent=(lastOrder?MM.orderMessage(lastOrder)+'\n\n':'')+'Нет связи с кухней. Сохранённый заказ проверим при восстановлении интернета. Не отправляйте новый заказ.';}});
 };

 const form=document.getElementById('review-form');
 const photo=document.getElementById('review-photos');photo.disabled=true;photo.closest('label').hidden=true;
 const consent=document.createElement('label');consent.style.cssText='display:flex;gap:10px;align-items:start;margin:16px 0';
 consent.innerHTML='<input type="checkbox" id="review-consent" required style="width:24px;height:24px;flex:none"><span>Согласен(на) на публикацию указанного имени, оценки и текста отзыва на missmaki.ru для всех посетителей до отзыва согласия. <a href="review-consent.html" target="_blank" rel="noopener">Условия согласия</a></span>';
 form.insertBefore(consent,document.getElementById('review-send'));
 let reviewBusy=false;
 submitReview=event=>{event.preventDefault();sendReview();return false;};
 async function sendReview(){
  if(reviewBusy||!form.reportValidity())return;
  reviewBusy=true;document.getElementById('review-send').disabled=true;
  const status=document.getElementById('review-status');
  try{
   await MM.customer();
   const values={p_name:document.getElementById('review-name').value.trim(),p_rating:Number(document.getElementById('review-rating').value),p_body:document.getElementById('review-text').value.trim(),p_consent:document.getElementById('review-consent').checked};
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(values)))),x=>x.toString(16).padStart(2,'0')).join('');
   const key='mm-review:'+hash;let request=localStorage.getItem(key);if(!request){request=MMCompat.uuid();localStorage.setItem(key,request);}
   await MM.rpc('submit_review',{...values,p_request:request});
   status.textContent='Ваш отзыв ожидает подтверждения';await refreshReviews();
  }catch(e){status.textContent=MMCompat.message(e,'Не удалось отправить отзыв. Проверьте интернет и повторите попытку.');}
  finally{reviewBusy=false;document.getElementById('review-send').disabled=false;}
 }
 async function refreshReviews(){
  const published=await MM.rpc('public_reviews');
  const mine=await MM.hasCustomer()?await MM.rpc('my_reviews'):[];
  const area=document.getElementById('published-reviews');area.replaceChildren();
  for(const r of published){const article=document.createElement('article');article.style.cssText='border:1px solid #ddd;border-radius:16px;padding:18px;margin:12px 0';const title=document.createElement('strong');title.textContent=r.name+' · '+'★'.repeat(r.rating);const text=document.createElement('p');text.textContent=r.body;const date=document.createElement('small');date.textContent=new Date(r.created_at).toLocaleString('ru-RU');article.append(title,text,date);area.append(article);}
  const last=mine[0];if(last)document.getElementById('review-status').textContent=last.status==='approved'?'Ваш отзыв опубликован':'Ваш отзыв ожидает подтверждения';
 }
 try{
  const draft=JSON.parse(localStorage.getItem('mm-pending-submission'));
  if(draft?.payload){const p=draft.payload;
   for(const [id,value] of [['name',p.name],['phone',p.phone],['area',p.area],['address',p.address],['comment',p.birthdayGift?(p.comment||'').split('\n').filter(line=>!line.startsWith('🎂 ПОДАРОЧНЫЙ РОЛЛ')).join('\n'):p.comment],['preorder-date',p.requestedDate],['preorder-time',p.requestedTime]]){const n=document.getElementById(id);if(n)n.value=value||'';}
   const methodInput=document.querySelector('input[name="fulfillment"][value="'+p.fulfillment+'"]');if(methodInput)methodInput.checked=true;
   const timingInput=document.querySelector('input[name="orderTiming"][value="'+p.timing+'"]');if(timingInput)timingInput.checked=true;
   document.getElementById('birthday-check').checked=!!p.birthdayGift;
   for(const item of p.items){const local=Object.keys(ORDER_SKUS).find(k=>ORDER_SKUS[k]===item.sku);if(local)cart[local]={...item,sku:local};}
   setMethod();updateTiming();if(p.requestedTime)document.getElementById('preorder-time').value=p.requestedTime;
  }
 }catch(e){document.getElementById('status').textContent='Не удалось восстановить черновик заказа. Свяжитесь с MissMaki перед новой отправкой.';}
 (async()=>{try{const hasSession=await MM.hasCustomer();const active=localStorage.getItem('missmaki-active-order');if(active&&hasSession)watchOrder(active);MM.subscribe(refreshReviews);}catch(e){document.getElementById('review-status').textContent=MMCompat.message(e,'Не удалось подключиться. Проверьте интернет и откройте сайт в Safari или Chrome.');}})();
}
