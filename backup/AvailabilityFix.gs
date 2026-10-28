// Replace ONLY AvailabilityFix.gs. Keep existing doPost and Script Properties.
// The owner confirmed that mmAvailability_ is absent from this project.
// Uses the same ORDER_<id> schema and preorder rules as the recovered full code.
function doGet(e) {
  const p = e && e.parameter || {};
  let result;
  try {
    if (p.action === 'availability') {
      result = mmAvailability_(String(p.date || ''), String(p.time || ''));
    } else {
      const id = String(p.orderId || '');
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
        result = {ok:false, error:'Некорректный номер заказа'};
      } else {
        const order = typeof mmLoad_ === 'function' ? mmLoad_(id) : mmavfix_load_(id);
        result = order ? {
          ok:true, status:order.status, minutes:order.minutes,
          fulfillment:order.fulfillment, timing:order.timing || 'asap',
          requestedDate:order.requestedDate, requestedTime:order.requestedTime
        } : {ok:false, status:'unknown'};
      }
    }
  } catch (error) {
    console.error('MissMaki: availability/status read failed; no order data changed');
    result = {ok:false, error:'Сервис проверки временно недоступен'};
  }
  const callback = String(p.callback || '');
  if (/^mmStatus_[a-zA-Z0-9_]{1,40}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Available to the existing preorder doPost as well as doGet.
function mmAvailability_(date, time) {
  const now = new Date();
  if (!mmavfix_valid_(date, time, now)) {
    return {ok:false, error:'Недоступная дата или время'};
  }
  // Read once per request. Never clear, overwrite or migrate stored orders.
  const props = PropertiesService.getScriptProperties().getProperties();
  const records = Object.keys(props).filter(key => key.indexOf('ORDER_') === 0)
    .map(key => {try {return JSON.parse(props[key]);} catch (error) {return null;}});
  const taken = value => records.some(order => order &&
    order.timing === 'preorder' && order.requestedDate === date &&
    order.requestedTime === value &&
    ['pending','awaiting_customer','accepted'].includes(order.status));
  const available = !taken(time), alternatives = [];
  const minutes = Number(time.slice(0,2)) * 60 + Number(time.slice(3));
  for (let offset = 30; offset <= 600 && alternatives.length < 2; offset += 30) {
    for (const value of [minutes + offset, minutes - offset]) {
      if (value < 810 || value > 1380) continue;
      const choice = String(Math.floor(value / 60)).padStart(2,'0') + ':' +
        String(value % 60).padStart(2,'0');
      if (mmavfix_valid_(date, choice, now) && !taken(choice)) {
        alternatives.push(choice);
        if (alternatives.length === 2) break;
      }
    }
  }
  return {ok:true, available:available, alternatives:alternatives};
}

function mmavfix_valid_(date, time, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  const parts = date.split('-').map(Number);
  const check = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]));
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth()+1 !== parts[1] ||
      check.getUTCDate() !== parts[2]) return false;
  const minutes = Number(time.slice(0,2)) * 60 + Number(time.slice(3));
  if (minutes < 810 || minutes > 1380 || (minutes-810) % 30 !== 0) return false;
  const today = Utilities.formatDate(now,'Europe/Moscow','yyyy-MM-dd');
  const last = Utilities.formatDate(new Date(now.getTime()+30*86400000),
    'Europe/Moscow','yyyy-MM-dd');
  if (date < today || date > last) return false;
  const current = Number(Utilities.formatDate(now,'Europe/Moscow','HH')) * 60 +
    Number(Utilities.formatDate(now,'Europe/Moscow','mm'));
  return date !== today || minutes > current + 30;
}

function mmavfix_load_(id) {
  const raw = PropertiesService.getScriptProperties().getProperty('ORDER_' + id);
  return raw ? JSON.parse(raw) : null;
}

// Owner-only read-only check in the editor. No Telegram requests or order writes.
function mmavfix_checkInstallation() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.keys(props).filter(key => key.indexOf('ORDER_') === 0);
  const writer = typeof mmSave_ === 'function' ? String(mmSave_) : '';
  const handler = (typeof doPost === 'function' ? String(doPost) : '') +
    (typeof mmHandleOrder_ === 'function' ? String(mmHandleOrder_) : '');
  const result = {ok:true, hasDoPost:typeof doPost === 'function',
    helperReady:typeof mmAvailability_ === 'function',
    storedOrderRecords:keys.length, knownOrderWriterDetected:writer.includes('ORDER_') || handler.includes('ORDER_'),
    preorderValidationReferenced:handler.includes('mmAvailability_'),
    changedOrders:false, changedWebhook:false};
  console.log(JSON.stringify(result));
  return result;
}
