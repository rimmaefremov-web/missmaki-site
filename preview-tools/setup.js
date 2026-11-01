(()=>{
 const $=id=>document.getElementById(id),message=$('message');
 if(!MMPreviewSettings.allowed()){$('settings').hidden=true;message.textContent='Откройте отдельную тестовую HTTPS-версию. Настройка на рабочем домене запрещена.';return;}
 const c=window.MISSMAKI_CONFIG;if(c?.supabaseUrl){$('url').value=c.supabaseUrl;$('key').value=c.publishableKey;}
 $('settings').onsubmit=e=>{e.preventDefault();try{MMPreviewSettings.save($('url').value,$('key').value);message.textContent='Настройки сохранены в этом браузере. Теперь откройте «Войти в кухню». Соединение с базой ещё не проверено.';}catch(e){message.textContent=e.message;}};
 $('clear').onclick=()=>{MMPreviewSettings.clear();$('settings').reset();message.textContent='Локальные настройки удалены. Ранее созданные сессии завершаются кнопкой «Выйти» в кухне.';};
})();
