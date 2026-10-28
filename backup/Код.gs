// MissMaki: complete NEW project installer. Never paste into the working project.
// Reads BOT_TOKEN and CHAT_ID from this new project settings; contains no secrets.

// ===== apps-script/Catalog.gs =====
// Generated from index.html by tools/sync-catalog.cjs.
const MENU = {
  "1:0": {
    "name": "Калифорния — Снежный краб",
    "price": 320
  },
  "1:1": {
    "name": "Калифорния — Креветки",
    "price": 420
  },
  "1:2": {
    "name": "Калифорния — Лосось",
    "price": 420
  },
  "1:3": {
    "name": "Калифорния — Угорь",
    "price": 450
  },
  "2:0": {
    "name": "Хосомаки — Снежный краб",
    "price": 200
  },
  "2:1": {
    "name": "Хосомаки — Угорь",
    "price": 300
  },
  "2:2": {
    "name": "Хосомаки — Лосось",
    "price": 270
  },
  "2:3": {
    "name": "Хосомаки — Огурец",
    "price": 160
  },
  "2:4": {
    "name": "Хосомаки — Креветки",
    "price": 270
  },
  "2:5": {
    "name": "Хосомаки — Копчёная курица",
    "price": 250
  },
  "3:0": {
    "name": "Канада — Классическая",
    "price": 530
  },
  "3:1": {
    "name": "Канада — Лосось",
    "price": 570
  },
  "3:2": {
    "name": "Канада — Креветки",
    "price": 570
  },
  "4:0": {
    "name": "Сакура — Угорь",
    "price": 420
  },
  "4:1": {
    "name": "Сакура — Снежный краб",
    "price": 320
  },
  "4:2": {
    "name": "Сакура — Лосось",
    "price": 370
  },
  "4:3": {
    "name": "Сакура — Креветки",
    "price": 370
  },
  "5:0": {
    "name": "Филадельфия — Классическая",
    "price": 470
  },
  "5:1": {
    "name": "Филадельфия — Угорь",
    "price": 510
  },
  "5:2": {
    "name": "Филадельфия — Креветки",
    "price": 500
  },
  "6:0": {
    "name": "Цезарь — Копчёная курица",
    "price": 390
  },
  "6:1": {
    "name": "Цезарь — Лосось",
    "price": 430
  },
  "6:2": {
    "name": "Цезарь — Креветки",
    "price": 430
  },
  "7:x": {
    "name": "Дабл чизз",
    "price": 730
  },
  "8:x": {
    "name": "Тори маки",
    "price": 470
  },
  "9:x": {
    "name": "Рассвет",
    "price": 380
  },
  "10:x": {
    "name": "Дуэт",
    "price": 500
  },
  "11:x": {
    "name": "Премиум",
    "price": 900
  },
  "12:x": {
    "name": "Люкс ролл",
    "price": 460
  },
  "13:0": {
    "name": "Запечённые роллы с масаго — Креветки",
    "price": 460
  },
  "13:1": {
    "name": "Запечённые роллы с масаго — Лосось",
    "price": 460
  },
  "13:2": {
    "name": "Запечённые роллы с масаго — Снежный краб",
    "price": 400
  },
  "13:3": {
    "name": "Запечённые роллы с масаго — Тунец",
    "price": 470
  },
  "14:0": {
    "name": "Запечённые роллы с кунжутом — Копчёная курица",
    "price": 420
  },
  "14:1": {
    "name": "Запечённые роллы с кунжутом — Шиитаке",
    "price": 400
  },
  "14:2": {
    "name": "Запечённые роллы с кунжутом — Угорь",
    "price": 470
  },
  "14:3": {
    "name": "Запечённые роллы с кунжутом — Мидии",
    "price": 430
  },
  "15:0": {
    "name": "Мини-хот — Креветки",
    "price": 300
  },
  "15:1": {
    "name": "Мини-хот — Лосось",
    "price": 300
  },
  "15:2": {
    "name": "Мини-хот — Угорь",
    "price": 320
  },
  "15:3": {
    "name": "Мини-хот — Мидии",
    "price": 270
  },
  "15:4": {
    "name": "Мини-хот — Тунец",
    "price": 320
  },
  "15:5": {
    "name": "Мини-хот — Снежный краб",
    "price": 250
  },
  "15:6": {
    "name": "Мини-хот — Копчёная курица",
    "price": 280
  },
  "16:0": {
    "name": "Суши-пицца — Лосось",
    "price": 550
  },
  "16:1": {
    "name": "Суши-пицца — Угорь",
    "price": 560
  },
  "16:2": {
    "name": "Суши-пицца — Тунец",
    "price": 560
  },
  "16:3": {
    "name": "Суши-пицца — Курица",
    "price": 500
  },
  "16:4": {
    "name": "Суши-пицца — Креветки",
    "price": 550
  },
  "17:x": {
    "name": "Филадельфия хот",
    "price": 500
  },
  "18:0": {
    "name": "Спайси ролл — Угорь",
    "price": 520
  },
  "18:1": {
    "name": "Спайси ролл — Лосось",
    "price": 490
  },
  "18:2": {
    "name": "Спайси ролл — Тунец",
    "price": 520
  },
  "18:3": {
    "name": "Спайси ролл — Креветки",
    "price": 490
  },
  "19:x": {
    "name": "Мини сет",
    "price": 750
  },
  "20:x": {
    "name": "Сет Филадельфия",
    "price": 1650
  },
  "21:x": {
    "name": "Хот сет",
    "price": 1270
  },
  "22:x": {
    "name": "Сет Микс",
    "price": 1650
  },
  "23:x": {
    "name": "Мега сет",
    "price": 3900
  },
  "24:x": {
    "name": "Топ сет",
    "price": 1090
  },
  "25:x": {
    "name": "Сет Бестселлер",
    "price": 1850
  },
  "26:x": {
    "name": "Сет Хит",
    "price": 2750
  },
  "27:x": {
    "name": "Сет Унаги",
    "price": 1620
  },
  "28:x": {
    "name": "Набор MissMaki",
    "price": 5350
  },
  "29:x": {
    "name": "Суши сет",
    "price": 1550
  },
  "30:0": {
    "name": "Спайси гунканы — Сяке спайси · лосось",
    "price": 130
  },
  "30:1": {
    "name": "Спайси гунканы — Эби спайси · креветка",
    "price": 130
  },
  "30:2": {
    "name": "Спайси гунканы — Унаги спайси · угорь",
    "price": 130
  },
  "30:3": {
    "name": "Спайси гунканы — Кани спайси · краб",
    "price": 130
  },
  "31:0": {
    "name": "Суши — Лосось",
    "price": 130
  },
  "31:1": {
    "name": "Суши — Угорь",
    "price": 130
  },
  "31:2": {
    "name": "Суши — Масаго",
    "price": 130
  },
  "31:3": {
    "name": "Суши — Креветка",
    "price": 130
  },
  "32:0": {
    "name": "Запечённые мидии киви — Сырный соус",
    "price": 150
  },
  "32:1": {
    "name": "Запечённые мидии киви — Спайси соус",
    "price": 150
  },
  "33:0": {
    "name": "Соусы — Спайси",
    "price": 50
  },
  "33:1": {
    "name": "Соусы — Соевый",
    "price": 10
  },
  "33:2": {
    "name": "Соусы — Цезарь",
    "price": 50
  },
  "33:3": {
    "name": "Соусы — Унаги",
    "price": 50
  },
  "34:x": {
    "name": "Палочки",
    "price": 10
  },
  "35:x": {
    "name": "Имбирь",
    "price": 10
  },
  "36:x": {
    "name": "Васаби",
    "price": 10
  }
};

// ===== apps-script/Code.gs =====
// Install together with Catalog.gs. Reuses existing BOT_TOKEN and CHAT_ID.
// Preserve your existing testTelegram function; do not change Script Properties.
const ALLOWED_ORIGINS = ['https://missmaki.ru','https://www.missmaki.ru','https://rimmaefremov-web.github.io'];
const AREAS = ["Южный","мкр. Олимпийский","СНТ Ивушка","СТ Механизатор","ДНП Виктория","СТ Орбита","СТ Аэропорт","СТ Родник","СТ «2 АО ЮГТЕКС»","СТ «Аэропорт»","ДНО «Виктория»","СТ «Делюшес»","СТ «Дружба»","СНТ «Зиповчанка»","СТ «Ивушка»","СТ «КСК-2»","СТ «Кубаночка»","СНТ «Кубаночка»","СТ «Механизатор»","СТ «Мечта»","МКР «Олимпийский»","СТ «Орбита»","СТ «Родник»","СТ «Строитель»","КП «Южная Столица»","Поселок «Южный»","СТ «Янтарь»"];




// Safe account-side diagnostics: performs no sendMessage and logs no credentials.
function checkTelegramConfiguration() {
  const props=PropertiesService.getScriptProperties();
  const token=props.getProperty('BOT_TOKEN'),chatId=props.getProperty('CHAT_ID');
  if(!token||!chatId)throw Error('Задайте BOT_TOKEN и CHAT_ID в свойствах скрипта');
  function check(method,payload){
    try{
      const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'post',contentType:'application/json',payload:JSON.stringify(payload),muteHttpExceptions:true});
      const result=JSON.parse(response.getContentText());
      return {ok:response.getResponseCode()===200&&result.ok===true,result:result.result};
    }catch(error){return {ok:false}}
  }
  const bot=check('getMe',{}),chat=check('getChat',{chat_id:chatId});
  if(!bot.ok)throw Error('Telegram не подтвердил токен бота. Проверьте токен и доступ к Telegram API');
  if(!chat.ok)throw Error('Telegram не подтвердил чат. Проверьте CHAT_ID, добавление бота и права доступа');
  console.log('OK: токен бота и чат доступны. Сообщения не отправлялись. Право отправки проверяется отдельно тестовым заказом.');
  return {botAvailable:true,chatAvailable:true};
}

// Manual account-side test. Sends ONE clearly marked test order to the current chat.
// This exercises the same doPost parser and order validation as the prepared site.


// ===== apps-script/TestTelegram.gs =====
// Compatible testTelegram implementation; the original function's source was not provided.
// If you copy your existing testTelegram into the NEW project, omit this file.
// Keep exactly one function named testTelegram. Never edit the existing project.
function testTelegram() {
  const props=PropertiesService.getScriptProperties();
  const token=props.getProperty('BOT_TOKEN');
  const chatId=props.getProperty('CHAT_ID');
  if(!token||!chatId)throw Error('В новом проекте не заданы BOT_TOKEN и CHAT_ID');
  let confirmed=false;
  try {
    const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
      method:'post',contentType:'application/json',muteHttpExceptions:true,
      payload:JSON.stringify({chat_id:chatId,text:'ТЕСТ MissMaki — проверка связи с Telegram. НЕ ГОТОВИТЬ.'})
    });
    const result=JSON.parse(response.getContentText());
    confirmed=response.getResponseCode()===200&&result.ok===true&&result.result&&Number.isSafeInteger(result.result.message_id);
  }catch(error){ /* Do not expose Telegram URLs or credentials. */ }
  if(!confirmed)throw Error('Telegram не подтвердил отправку тестового сообщения');
  console.log('OK: тестовое сообщение отправлено в Telegram');
  return true;
}

// Safe setup check: no deployment, no Telegram messages, no property changes.
function setupMissMaki() {
  const props=PropertiesService.getScriptProperties();
  const missing=['BOT_TOKEN','CHAT_ID'].filter(key=>!props.getProperty(key));
  if(missing.length)throw Error('В НОВОМ проекте откройте Настройки проекта → Свойства скрипта и добавьте: '+missing.join(', ')+'. Код менять не нужно.');
  return checkTelegramConfiguration();
}

// Compatible order-path update for the existing project. Keep AvailabilityFix.gs.
function doPost(e) {
  let order, result = {ok:false,telegramConfirmed:false,code:'INVALID_REQUEST'};
  try {
    const payload = e && e.parameter && e.parameter.payload;
    if (typeof payload !== 'string') throw mmOrderError_('INVALID_REQUEST');
    order = JSON.parse(payload);
    if (!order || !ALLOWED_ORIGINS.includes(order.origin) || !/^[a-f0-9-]{36}$/.test(order.requestId)) throw mmOrderError_('INVALID_REQUEST');
    if (order.action) throw mmOrderError_('UNSUPPORTED_ACTION');
    result = processOrder(order);
    console.log(JSON.stringify({type:'order-receipt',requestId:order.requestId,telegramConfirmed:result.telegramConfirmed===true,code:result.code||'OK'}));
  } catch (error) {
    result = {ok:false,telegramConfirmed:false,code:error && error.mmCode || 'SERVICE_UNAVAILABLE'};
    console.log('MissMaki order rejected: ' + result.code);
  }
  return reply(order, result);
}
function reply(order, result) {
  const origin = order && ALLOWED_ORIGINS.includes(order.origin) ? order.origin : 'https://missmaki.ru';
  const message = JSON.stringify({type:'missmaki-order-result',requestId:order && order.requestId || '',ok:result.ok===true,telegramConfirmed:result.telegramConfirmed===true,code:result.code || '',messageId:result.messageId || null}).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+','+JSON.stringify(origin)+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function mmOrderError_(code) { const error = new Error(code); error.mmCode = code; return error; }
function processOrder(order) {
  for (const [key,max] of [['name',100],['phone',50],['address',300],['comment',1000]]) {
    if(typeof order[key]!=='string'||order[key].length>max||(key!=='comment'&&!order[key].trim()))throw mmOrderError_('INVALID_FIELD');
  }
  const fulfillment = order.fulfillment === undefined ? 'delivery' : order.fulfillment;
  if(!['pickup','delivery'].includes(fulfillment))throw mmOrderError_('INVALID_FULFILLMENT');
  if(fulfillment==='delivery'&&!AREAS.includes(order.area))throw mmOrderError_('INVALID_AREA');
  if(fulfillment==='pickup'&&order.area!=='Самовывоз')throw mmOrderError_('INVALID_AREA');
  if(!Array.isArray(order.items)||!order.items.length||order.items.length>100)throw mmOrderError_('INVALID_ITEMS');
  const timing=order.timing===undefined?'asap':order.timing;
  if(!['asap','preorder'].includes(timing))throw mmOrderError_('INVALID_TIMING');
  if(timing==='preorder'&&(typeof order.requestedDate!=='string'||typeof order.requestedTime!=='string'))throw mmOrderError_('INVALID_SLOT');
  let subtotal=0;const lines=[],seen={};
  for(const item of order.items){
    if(!item||!Object.prototype.hasOwnProperty.call(MENU,item.sku)||seen[item.sku]||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>100)throw mmOrderError_('INVALID_ITEM');
    seen[item.sku]=true;const product=MENU[item.sku];
    if(item.price!==product.price)throw mmOrderError_('MENU_CHANGED');
    subtotal+=product.price*item.quantity;
    lines.push(product.name+' × '+item.quantity+' — '+product.price*item.quantity+' ₽');
  }
  const delivery=fulfillment==='pickup'||subtotal>=3000?0:200;
  if(order.subtotal!==subtotal||order.delivery!==delivery||order.total!==subtotal+delivery)throw mmOrderError_('TOTAL_MISMATCH');
  const when=timing==='preorder'?'Предзаказ: '+order.requestedDate+' '+order.requestedTime+' (Москва)':'Как можно скорее';
  const text=['Новый заказ MissMaki','Номер: '+order.requestId,'Имя: '+order.name,'Телефон: '+order.phone,'Получение: '+(fulfillment==='pickup'?'Самовывоз':'Доставка'),when,'Адрес: '+order.area+', '+order.address,'',...lines,'','Стоимость блюд: '+subtotal+' ₽','Доставка: '+delivery+' ₽','Итого: '+(subtotal+delivery)+' ₽','Комментарий: '+(order.comment||'—')].join('\n');
  if(text.length>4000)throw mmOrderError_('MESSAGE_TOO_LONG');
  const props=PropertiesService.getScriptProperties();
  const token=props.getProperty('BOT_TOKEN'),chatId=props.getProperty('CHAT_ID');
  if(!token||!chatId)throw mmOrderError_('MISSING_CONFIGURATION');
  const digest=value=>Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)));
  const legacyFingerprint=digest([order.name,order.phone,order.address,order.area,order.comment,order.items.map(i=>[i.sku,i.quantity]),subtotal]);
  const fingerprint=digest([legacyFingerprint,fulfillment,timing,timing==='preorder'?order.requestedDate:'',timing==='preorder'?order.requestedTime:'']);
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const key='order:'+order.requestId,indexKey='ORDER_'+order.requestId,existing=props.getProperty(key);
    if(existing){
      const saved=JSON.parse(existing);
      const same=saved.fingerprintVersion===2?saved.fingerprint===fingerprint:saved.fingerprint===legacyFingerprint&&fulfillment==='delivery'&&timing==='asap';
      if(!same)return {ok:false,telegramConfirmed:false,code:'REQUEST_ID_CONFLICT'};
      const confirmed=saved.status==='sent';
      return {ok:confirmed,telegramConfirmed:confirmed,code:confirmed?'':'SEND_UNCONFIRMED',messageId:saved.messageId||null};
    }
    if(props.getProperty(indexKey))return {ok:false,telegramConfirmed:false,code:'EXISTING_ORDER_NEEDS_CHECK'};
    if(timing==='preorder'){
      if(typeof mmAvailability_!=='function')throw mmOrderError_('AVAILABILITY_NOT_CONFIGURED');
      const slot=mmAvailability_(order.requestedDate,order.requestedTime);
      if(!slot||slot.ok!==true)throw mmOrderError_('INVALID_SLOT');
      if(slot.available!==true)throw mmOrderError_('SLOT_TAKEN');
    }
    const now=Date.now(),records=props.getProperties();let count=0;
    // Keep unresolved receipts; retain the seven-day policy for confirmed ones.
    for(const k of Object.keys(records)){if(k.indexOf('order:')!==0)continue;let record;try{record=JSON.parse(records[k])}catch(error){throw mmOrderError_('ORDER_STORAGE_ERROR')}if(record.status==='sent'&&now-record.time>7*86400000)props.deleteProperty(k);else count++}
    for(const k of Object.keys(records)){
      if(k.indexOf('ORDER_')!==0)continue;let item;try{item=JSON.parse(records[k])}catch(error){continue}
      if(item&&item.schema==='missmaki-checkout-v2'&&item.telegramConfirmed===true&&now-item.createdAt>7*86400000&&(item.timing==='asap'||item.requestedDate<Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd')))props.deleteProperty(k);
    }
    if(count>=1000)throw mmOrderError_('STORAGE_CAPACITY');
    const record={time:now,fingerprint:fingerprint,fingerprintVersion:2,status:'pending'};
    const index={schema:'missmaki-checkout-v2',timing:timing,requestedDate:timing==='preorder'?order.requestedDate:null,requestedTime:timing==='preorder'?order.requestedTime:null,fulfillment:fulfillment,status:'pending',createdAt:now,telegramConfirmed:false};
    props.setProperty(key,JSON.stringify(record));
    props.setProperty(indexKey,JSON.stringify(index));
    let response,data;
    try{
      response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({chat_id:chatId,text:text})});
      data=JSON.parse(response.getContentText());
    }catch(error){return {ok:false,telegramConfirmed:false,code:'SEND_UNCONFIRMED'}}
    const confirmed=response.getResponseCode()===200&&data.ok===true&&data.result&&Number.isSafeInteger(data.result.message_id)&&data.result.message_id>0;
    if(confirmed){record.status='sent';record.messageId=data.result.message_id;props.setProperty(key,JSON.stringify(record));index.telegramConfirmed=true;props.setProperty(indexKey,JSON.stringify(index))}
    return {ok:Boolean(confirmed),telegramConfirmed:Boolean(confirmed),code:confirmed?'':'SEND_UNCONFIRMED',messageId:confirmed?data.result.message_id:null};
  } finally {lock.releaseLock()}
}

// Manual owner-only test: one stable request ID, exact live-site fields, no payment.
// Uses the PUBLISHED /exec, not an in-editor substitute for the deployed handler.
function testOrderThroughDoPost() {
  const endpoint='https://script.google.com/macros/s/AKfycbypTmSYACXKHqKUXoCpnpJZpkhgH5s1NMJM3vtpBqBorNM14k76A8UM3wa_Mmoi3_VC/exec';
  if(ScriptApp.getService().getUrl()!==endpoint)throw Error('Откройте проект, которому принадлежит рабочее развёртывание missmaki.ru. Ничего не отправлено.');
  const props=PropertiesService.getScriptProperties(),token=props.getProperty('BOT_TOKEN');
  if(!token||!props.getProperty('CHAT_ID'))throw Error('Не настроены существующие BOT_TOKEN / CHAT_ID.');
  let bot;
  try{const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getMe',{muteHttpExceptions:true});const data=JSON.parse(r.getContentText());if(r.getResponseCode()===200&&data.ok===true)bot=data.result}catch(error){}
  if(!bot||String(bot.username||'').toLowerCase()!=='missmakibot')throw Error('Настроен другой бот или нет доступа к Telegram. Тест не отправлен. Токен не меняйте.');
  let order;const initLock=LockService.getScriptLock();initLock.waitLock(30000);
  try{
  try{order=JSON.parse(props.getProperty('MM_WEBSITE_ORDER_TEST_V2')||'null')}catch(error){}
  if(!order){
    order={requestId:Utilities.getUuid(),origin:'https://missmaki.ru',name:'ТЕСТ — НЕ ГОТОВИТЬ',phone:'ТЕСТ — НЕ ЗВОНИТЬ',area:'СТ «2 АО ЮГТЕКС»',address:'ТЕСТ — НЕ ДОСТАВЛЯТЬ',comment:'Проверка сайта, не настоящий заказ покупателя. НЕ ГОТОВИТЬ, НЕ ДОСТАВЛЯТЬ.',fulfillment:'delivery',timing:'asap',requestedDate:'',requestedTime:'',items:[{sku:'1:0',name:'Калифорния — Краб',price:320,quantity:1}],subtotal:320,delivery:200,total:520};
    props.setProperty('MM_WEBSITE_ORDER_TEST_V2',JSON.stringify(order));
  }
  }finally{initLock.releaseLock()}
  const key='order:'+order.requestId;
  let receipt;try{receipt=JSON.parse(props.getProperty(key)||'null')}catch(error){}
  let httpStatus=null;
  if(!receipt){
    try{const response=UrlFetchApp.fetch(endpoint,{method:'post',payload:{payload:JSON.stringify(order)},followRedirects:true,muteHttpExceptions:true});httpStatus=response.getResponseCode()}catch(error){}
    try{receipt=JSON.parse(props.getProperty(key)||'null')}catch(error){}
  }
  const confirmed=!!(receipt&&receipt.fingerprintVersion===2&&receipt.status==='sent'&&Number.isSafeInteger(receipt.messageId)&&receipt.messageId>0);
  const result={requestId:order.requestId,telegramConfirmed:confirmed,messageId:confirmed?receipt.messageId:null,httpStatus:httpStatus};
  console.log(JSON.stringify(result));
  if(!confirmed)console.log('Тест не подтверждён. Не создавайте новый номер автоматически; проверьте опубликованную версию и журналы.');
  else console.log('Telegram подтвердил тест с этим номером. Повторный запуск не создаёт новый заказ. Найдите номер в группе.');
  return result;
}
