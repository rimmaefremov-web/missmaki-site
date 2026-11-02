// Run only AFTER acceptance tests on a separate staging copy; makes a reviewable diff.
import {readFileSync,writeFileSync} from 'node:fs';
import {configuration} from './kitchen-config.mjs';
const [url,key,flag]=process.argv.slice(2);
if(!['--verified','--preview','--preview-setup'].includes(flag)||process.argv.length!==5)throw Error('Для проверенной версии: node scripts/enable-kitchen.mjs HTTPS_API_URL PUBLIC_KEY --verified; тестовую копию собирайте через build-russian-preview.mjs');
if(flag==='--preview-setup'&&(url||key))throw Error('Пустая тестовая сборка не должна содержать настройки проекта');
const config=flag==='--preview-setup'?{enabled:false,deploymentProfile:'ru',deploymentMode:'test',supabaseUrl:'',publishableKey:'',captchaSiteKey:''}:configuration(url,key,flag==='--preview'?'test':'production');
const put=(p,s)=>writeFileSync(p,s),read=p=>readFileSync(p,'utf8');
let html=read('index.html');
if(!html.includes('const ENDPOINT='))throw Error('Уже переключено или исходный файл изменён. Проверьте diff');
html=html.replace(/const ENDPOINT=.*?\nfunction submit\(order\).*?\n(?=async function checkout\()/s,'let busy=false,pending=null;let submit,jsonpGet,watchOrder;\n');
html=html.replace(/function jsonpGet\(params\).*?\n/,'');
html=html.replace(/let statusTimer=null;.*?\n(?=setMethod\(\);)/s,'');
html=html.replace("if(result.ok!==true||(!window.MM?.enabled&&result.telegramConfirmed!==true))","if(result.ok!==true)");
html=html.replace("if(!window.MM?.enabled)try{const active=localStorage.getItem('missmaki-active-order');if(active)watchOrder(active)}catch(e){}",'');
if(/script\.google|telegramConfirmed|customerDecision\(/.test(html.replace(/onclick="customerDecision\('[^']*'\)"/g,'')))throw Error('Осталась старая интеграция: проверьте код');
// Existing hidden decision markup is obsolete.
html=html.replace(/<div id="decision".*?<p id="status"/s,'<div id="decision" hidden></div><p id="status"');
put('index.html',html);
put('shared/config.js','// Public configuration. Never put service_role or passwords here.\nwindow.MISSMAKI_CONFIG = Object.freeze('+JSON.stringify(config)+');\n');
put('test/index.html','<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/"><title>MissMaki</title><a href="/">Перейти на сайт MissMaki</a></html>\n');
let privacy=read('privacy.html').replace('В текущей технической схеме заявка направляется через Google Apps Script в рабочую Telegram-группу MissMaki. Хостинг сайта — GitHub Pages.', 'Содержание форм заказов и отзывов передаётся напрямую по HTTPS в базу и сервис авторизации Татнет (ИП Дмитричев А.Н., ИНН 165501024690). По официальной информации Татнет, обслуживаемые им базы и резервная инфраструктура размещаются в Российской Федерации: <a href="https://tatnet.ru/security" target="_blank" rel="noopener">информация провайдера</a>. Доступ сотрудников ограничен авторизацией и ролью. Предусмотрена ручная выгрузка зашифрованной копии заказов, отзывов и истории для восстановления в существующей базе; это не автоматическое резервирование всей инфраструктуры. Хостинг статических файлов сайта — GitHub Pages: технические обращения к файлам обрабатываются хостингом, содержание форм направляется непосредственно в Татнет.');
privacy=privacy.replace('Приём отзывов в текущей версии не подключён.','Отзывы публикуются после модерации и отдельного согласия автора.').replace('серверные записи и сообщения рабочей группы','серверные записи');put('privacy.html',privacy);
put('data-processing.html',read('data-processing.html').replace('Приём отзывов в текущей версии сайта не подключён. Перед запуском публикации персональных данных в отзывах требуется отдельное согласие на распространение.','Отзывы публикуются после модерации при отдельном согласии автора на распространение указанного имени, оценки и текста.'));
put('cookies.html',read('cookies.html').replace('</main>','<h2>Система кухни</h2><p>В браузере сохраняется сессия доступа к собственным заказам. При неподтверждённой отправке сохраняется черновик заказа, включая контактные данные, чтобы восстановить отправку после перезапуска; после подтверждения записи черновик удаляется. На общем устройстве очистите данные сайта после завершения заказа. Панель кухни сохраняет сессию сотрудника; на общем устройстве нажимайте «Выйти». API и персональные данные не кэшируются сервис-воркером.</p></main>'));
console.log('Подготовлен diff переключения. Проверьте его и выполните staging-тесты до публикации.');
