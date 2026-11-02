import {encryptBackup,decryptBackup,restoreSql} from './backup-crypto.mjs';
const $=id=>document.getElementById(id),config=window.MISSMAKI_CONFIG;
function download(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function busy(fn){$('export').disabled=true;$('restore').disabled=true;try{await fn();}catch(e){$('message').textContent=e.message||'Операция не подтверждена';}finally{$('secret').value='';$('confirm').value='';$('export').disabled=false;$('restore').disabled=false;}}
$('export').onclick=()=>busy(async()=>{
 if($('secret').value.length<12)throw Error('Введите пароль копии не короче 12 символов');
 if($('secret').value!==$('confirm').value)throw Error('Пароли копии не совпадают');
 let data;try{data=await MM.rpc('business_backup');}catch(e){if(e.code==='PGRST202')throw Error('Модуль копирования ещё не установлен. Нужен INSTALL_FINAL.sql.');throw e;}
 const encrypted=await encryptBackup({...data,project:config.supabaseUrl},$('secret').value);
 download(encrypted,'MissMaki-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');
 $('message').textContent=`Файл подготовлен: заказов ${data.orders.length}, отзывов ${data.reviews.length}, событий ${data.audit.length}. Убедитесь, что сохранили его в «Файлы». Сам браузер не подтверждает запись файла на диск. Проверьте его кнопкой ниже.`;
});
$('restore').onclick=()=>busy(async()=>{
 const file=$('file').files[0];if(!file)throw Error('Выберите файл копии');if(file.size>100*1024*1024)throw Error('Слишком большой файл');
 const data=await decryptBackup(await file.text(),$('secret').value,config?.supabaseUrl);
 download(restoreSql(data,config?.supabaseUrl),'MissMaki-restore.sql','text/plain');
 $('message').textContent=`Файл расшифрован и проверен. Заказов ${data.orders.length}, отзывов ${data.reviews.length}. Подготовлен SQL для восстановления в прежней базе; он не выполнялся. Перед запуском сохраните текущую копию. При конфликте или отсутствии Auth UID операция отменится.`;
});
