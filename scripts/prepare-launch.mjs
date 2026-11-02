// Offline release preparation only: never deploys, merges, changes source config or contacts Tatnet.
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync,cpSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {configuration} from './kitchen-config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--config'||args[2]!=='--output')throw Error('node scripts/prepare-launch.mjs --config PUBLIC_CONFIG_JSON --output NEW_DIRECTORY_OUTSIDE_REPO');
const declared=JSON.parse(readFileSync(resolve(args[1]),'utf8'));const config={...configuration(declared.url,declared.key,'production'),guestMode:'supabase-anonymous',authProofRequired:true};
const out=resolve(args[3]);if(existsSync(out)||!relative(root,out).startsWith('..'))throw Error('Выберите новую папку вне репозитория');
const hash=text=>createHash('sha256').update(text).digest('hex');const git=(...params)=>execFileSync('git',params,{cwd:root,encoding:'utf8'}).trim();
const baseline=git('rev-parse','origin/main');const head=git('rev-parse','HEAD');mkdirSync(out,{recursive:true});
try{
 const candidate=join(out,'candidate');execFileSync(process.execPath,[join(root,'scripts/build-russian-preview.mjs'),config.supabaseUrl,config.publishableKey,'--output',candidate],{cwd:root,stdio:'pipe'});
 for(const file of ['index.html','kitchen/index.html','kitchen/backup.html']){const p=join(candidate,file);let html=readFileSync(p,'utf8').replace(/<script src="(?:\.\.\/)?shared\/preview-settings\.js"(?: defer)?><\/script>/g,'');html=html.replace('<p><a href="../setup/">Настройки тестовой базы</a> · <a href="diagnostics.html">Проверка прав и времени</a></p>','');writeFileSync(p,html);}
 for(const path of ['setup','robots.txt','shared/preview-settings.js','kitchen/diagnostics.html','kitchen/diagnostics.js','kitchen/diagnostics-suite.js','kitchen/guest-diagnostics-suite.js','kitchen/access.html','kitchen/access.js'])rmSync(join(candidate,path),{recursive:true,force:true});
 writeFileSync(join(candidate,'shared/config.js'),'// Public settings only. Prepared candidate, not deployed.\nwindow.MISSMAKI_CONFIG=Object.freeze('+JSON.stringify(config)+');\n');
 // Retain the production domain declaration; copying files never changes DNS.
 if(existsSync(join(root,'CNAME')))cpSync(join(root,'CNAME'),join(candidate,'CNAME'));
 const before=readFileSync(join(root,'index.html'),'utf8'),after=readFileSync(join(candidate,'index.html'),'utf8');
 const invariants={};for(const [name,re] of [['menu',/const groups=(\[.*?\]);\s*const esc=/s],['photos',/const approvedPhotos=(.*?);\n/s]]){const a=before.match(re)?.[1],b=after.match(re)?.[1];if(!a||a!==b)throw Error('Изменились '+name);invariants[name]=hash(a);}
 if(/script\.google|telegramConfirmed|customerDecision\(/.test(after))throw Error('Старый транспорт не удалён');
 const fallback=join(out,'safe-fallback');cpSync(candidate,fallback,{recursive:true});
 // Existing saved orders still receive statuses, staff can keep processing them. Only new UI submissions stop.
 writeFileSync(join(fallback,'shared/maintenance.js'),`(()=>{const text='Онлайн-приём временно приостановлен. Если заказ уже отправлялся, не оформляйте его повторно — свяжитесь с MissMaki по телефону на сайте.';const button=document.getElementById('send');if(button)button.disabled=true;const review=document.getElementById('review-send');if(review)review.disabled=true;const note=document.createElement('p');note.textContent=text;note.setAttribute('role','alert');note.style.cssText='background:#fff1b8;padding:16px;font:18px/1.5 system-ui';document.querySelector('main').prepend(note);checkout=async()=>{document.getElementById('status').textContent=text;};submit=async()=>{throw Error(text);};submitReview=event=>{event.preventDefault();document.getElementById('review-status').textContent='Приём новых отзывов временно приостановлен';return false;};})();\n`);
 const fallbackHtml=readFileSync(join(fallback,'index.html'),'utf8').replace('</body>','<script src="shared/maintenance.js"></script></body>');writeFileSync(join(fallback,'index.html'),fallbackHtml);
 execFileSync('git',['archive','--format=zip','--output='+join(out,'site-before.zip'),baseline],{cwd:root});
 function inventory(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?inventory(join(dir,e.name),prefix+e.name+'/'):[{file:prefix+e.name,sha256:hash(readFileSync(join(dir,e.name)))}]);}
 let verification=null;try{const observed=JSON.parse(readFileSync(join(root,'supabase/verification.json'),'utf8'));if(observed.projectUrl===config.supabaseUrl&&observed.installSha256===hash(readFileSync(join(root,'supabase/INSTALL_FINAL.sql')))&&observed.apiComplete)verification=observed;}catch{}
 const manifest={serverVerification:verification,preparedAt:new Date().toISOString(),head,baseline,notDeployed:true,approvalRequired:true,menuAndPhotos:invariants,blockers:[...(!verification?['INSTALL_FINAL SQL not applied and tested on this project']:[]),'Encrypted business backup not yet exported on real service','Full Auth backup and Free usage/alerts not confirmed','Owner approval for production release is required'],candidate:inventory(candidate),fallback:inventory(fallback),baselineArchiveSha256:hash(readFileSync(join(out,'site-before.zip')))};
 writeFileSync(join(out,'release-manifest.json'),JSON.stringify(manifest,null,2));
 writeFileSync(join(out,'READ-ME.txt'),'НЕ ОПУБЛИКОВАНО. candidate — подготовленный релиз, блокеры в release-manifest.json. safe-fallback — прекращает новые отправки, сохраняет меню/корзину и обработку ранее записанных заказов. site-before.zip — точная копия origin/main для сохранности, НЕ готовый откат: содержит прежние интеграции. Публикация только после отдельного согласия владельца. Копия сайта не является резервной копией базы.\n');
 console.log('Подготовлены candidate, safe-fallback, архив прежнего сайта и manifest. Публикации/SQL/DNS не было.');
}catch(error){rmSync(out,{recursive:true,force:true});throw error;}
