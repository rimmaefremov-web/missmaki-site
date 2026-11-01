/* Loaded after the existing site script. Only enabled configuration changes transport. */
if(window.MM?.enabled){
 const originalCheckout=checkout;
 let stopWatching;
 submit=async order=>{
  await MM.customer();
  const {requestId,origin,...payload}=order;
  localStorage.setItem('mm-pending-submission',JSON.stringify({requestId,payload}));
  localStorage.setItem('missmaki-active-order',requestId);
  watchOrder(requestId);
  const result=await MM.rpc('create_order',{p_request:requestId,p:payload});
  localStorage.removeItem('mm-pending-submission');
  return result;
 };
 jsonpGet=async params=>{await MM.customer();return MM.rpc('availability',{p_date:params.date,p_time:params.time});};
 checkout=async()=>{try{await MM.customer();await originalCheckout();}catch(e){document.getElementById('status').textContent=e.message||'Нет соединения. Повторите отправку с тем же заказом.';}};
 watchOrder=id=>{
  if(!id)return;
  try{localStorage.setItem('missmaki-active-order',id);}catch(e){}
  stopWatching?.();
  stopWatching=MM.subscribe(async()=>{
   const s=await MM.customer();
   const {data,error}=await s.from('orders').select('number,status,minutes').eq('request_id',id).maybeSingle();
   if(error)throw error;
   if(!data){document.getElementById('status').textContent='Заказ пока не найден в базе. Если отправка завершилась ошибкой, повторите с той же корзиной.';return;}
   const msg=data.status==='accepted'?`Ваш заказ №${data.number} принят! Время ожидания — ${data.minutes} минут`:data.status==='rejected'?'К сожалению, сейчас мы не можем принять ваш заказ':data.status==='completed'?`Заказ №${data.number} выполнен`:`Заказ №${data.number} отправлен. Ожидаем подтверждения MissMaki…`;
   document.getElementById('status').textContent=msg;
   document.getElementById('payment-info').hidden=false;
   document.getElementById('decision').style.display='none';
  },ok=>{if(!ok)document.getElementById('status').textContent='Нет связи с кухней. Сохранённый заказ проверим при восстановлении интернета. Не отправляйте новый заказ.';});
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
   const key='mm-review:'+hash;let request=localStorage.getItem(key);if(!request){request=crypto.randomUUID();localStorage.setItem(key,request);}
   await MM.rpc('submit_review',{...values,p_request:request});
   status.textContent='Ваш отзыв ожидает подтверждения';await refreshReviews();
  }catch(e){status.textContent='Не удалось подтвердить отправку отзыва. Повторите попытку: '+e.message;}
  finally{reviewBusy=false;document.getElementById('review-send').disabled=false;}
 }
 async function refreshReviews(){
  const published=await MM.rpc('public_reviews');
  const {data:sessionData,error:sessionError}=await MM.client().auth.getSession();if(sessionError)throw sessionError;
  const mine=sessionData.session?await MM.rpc('my_reviews'):[];
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
 (async()=>{try{const {data,error}=await MM.client().auth.getSession();if(error)throw error;const active=localStorage.getItem('missmaki-active-order');if(active&&data.session)watchOrder(active);MM.subscribe(refreshReviews);}catch(e){document.getElementById('review-status').textContent='Не удалось подключиться: '+e.message;}})();
}
