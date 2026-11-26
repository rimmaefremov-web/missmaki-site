/* Optional Yandex RTB. Never run in the kiosk's embedded menu. */
(()=>{
 'use strict';
 if(window.top!==window.self||window.MMAds)return;
 const key='mm-ad-consent-v1',maxAge=180*86400000;
 let choice=null,started=false,timer,slot,panel,note,settings;
 try{const saved=JSON.parse(localStorage.getItem(key));if(['accepted','rejected'].includes(saved?.value)&&Date.now()-saved.at>=0&&Date.now()-saved.at<maxAge)choice=saved.value;}catch(e){}
 window.yaContextCb=window.yaContextCb||[];
 function collapse(){clearTimeout(timer);if(slot){slot.replaceChildren();slot.classList.remove('ad-filled','ad-loading');}}
 function load(){
  if(choice!=='accepted'||started||!slot)return;
  started=true;slot.classList.add('ad-loading');timer=setTimeout(collapse,20000);
  window.yaContextCb.push(()=>{
   if(choice!=='accepted')return;
   try{window.Ya.Context.AdvManager.render({
    blockId:'R-A-20513421-1',renderTo:'yandex_rtb_R-A-20513421-1',disableGrab:true,
    onError:data=>{if(data?.type!=='warning')collapse();},onClose:collapse,
    onRender:()=>{if(choice!=='accepted'){collapse();return;}clearTimeout(timer);slot.classList.remove('ad-loading');requestAnimationFrame(()=>{if(choice==='accepted'&&slot.childElementCount&&slot.getBoundingClientRect().height>1)slot.classList.add('ad-filled');});}
   },collapse);}catch(e){collapse();}
  });
  if(!document.querySelector('script[src="https://yandex.ru/ads/system/context.js"]')){
   // Yandex.RTB: the supplied async loader is placed in head only after consent.
   const script=document.createElement('script');script.src='https://yandex.ru/ads/system/context.js';script.async=true;script.onerror=collapse;document.head.append(script);
  }
 }
 function decide(value){
  choice=value;try{localStorage.setItem(key,JSON.stringify({value,at:Date.now()}));}catch(e){}
  panel.hidden=true;settings.textContent='Настроить рекламные cookies';
  if(value==='accepted'){note.textContent='Рекламные cookies разрешены.';load();}
  else{try{Promise.resolve(window.Ya?.Context?.AdvManager.destroy?.({blockId:'R-A-20513421-1'})).catch(()=>{});}catch(e){}collapse();note.textContent=started?'Реклама отключена для следующих загрузок. Уже загруженный код Яндекса завершит работу после закрытия или обновления страницы. Сначала завершите заказ.':'Рекламные cookies отключены. Заказ доступен без рекламы.';}
 }
 window.MMAds={load};
 function init(){
  slot=document.getElementById('yandex_rtb_R-A-20513421-1');if(!slot)return;
  const footer=document.getElementById('missmaki-footer');if(!footer)return;
  const style=document.createElement('style');style.textContent=`
  #yandex_rtb_R-A-20513421-1{width:100%;max-width:100%;min-width:0;margin:0;position:relative;isolation:isolate;contain:layout paint;overflow:clip;display:flow-root}
  #yandex_rtb_R-A-20513421-1.ad-filled{margin:24px 0}
  #mm-ad-preferences{font-size:13px;line-height:1.5;margin:18px 0;text-align:center}
  #mm-ad-preferences button{font:inherit;padding:10px 14px;margin:5px;border:1px solid #bbb;border-radius:10px;background:#fff;color:#222;cursor:pointer}
  #mm-ad-preferences p{margin:8px 0}
  `;document.head.append(style);
  const area=document.createElement('div');area.id='mm-ad-preferences';
  panel=document.createElement('div');panel.hidden=choice!==null;
  const text=document.createElement('p');text.textContent='Разрешить Яндексу рекламные cookies и обработку технических данных (IP-адрес, браузер, страница, идентификаторы) для показа и измерения рекламы? Отказ не влияет на заказ. ';
  const link=document.createElement('a');link.href='cookies.html';link.textContent='Подробнее и отзыв согласия';text.append(link);panel.append(text);
  for(const [value,title] of [['accepted','Разрешить рекламные cookies'],['rejected','Без рекламных cookies']]){const button=document.createElement('button');button.type='button';button.textContent=title;button.onclick=()=>decide(value);panel.append(button);}
  settings=document.createElement('button');settings.type='button';settings.textContent='Настроить рекламные cookies';settings.onclick=()=>{panel.hidden=!panel.hidden;};
  note=document.createElement('p');note.setAttribute('role','status');area.append(panel,settings,note);footer.append(area);
  window.addEventListener('storage',event=>{if(event.key===key){let saved;try{saved=JSON.parse(event.newValue);}catch(e){}if(saved?.value==='accepted'){choice='accepted';panel.hidden=true;load();}else{choice='rejected';collapse();panel.hidden=true;note.textContent='Рекламные cookies отключены в другой вкладке. Для завершения уже загруженного кода закройте эту страницу после заказа.';}}});
  load();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
