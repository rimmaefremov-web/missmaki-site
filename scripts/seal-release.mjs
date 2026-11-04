// Review/approval preparation only. No deployment, git push, SQL or network operations.
import {readFileSync,writeFileSync,existsSync,cpSync,rmSync,readdirSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
let confirmation=join(root,'release/backup-confirmation.json');if(args.length===8&&args[6]==='--confirmation'){confirmation=resolve(args[7]);args.splice(6,2);}
if(args.length!==6||args[0]!=='--package'||args[2]!=='--checks'||args[4]!=='--output')throw Error('node scripts/seal-release.mjs --package VERIFIED_PACKAGE --checks LIVE_CHECKS_JSON --output NEW_DIRECTORY');
const source=resolve(args[1]),out=resolve(args[5]);if(existsSync(out)||!relative(root,out).startsWith('..'))throw Error('Нужна новая папка вне репозитория');
const m=JSON.parse(readFileSync(join(source,'release-manifest.json'),'utf8')),checks=JSON.parse(readFileSync(resolve(args[3]),'utf8')),backup=JSON.parse(readFileSync(confirmation,'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
if(!/^[a-f0-9]{40}$/.test(m.head)||!m.serverVerification?.apiComplete)throw Error('Нет проверенной версии сервера');
const sql=execFileSync('git',['show',m.head+':supabase/INSTALL_FINAL.sql'],{cwd:root});if(hash(sql)!==m.serverVerification.installSha256)throw Error('SQL не совпадает с проверенной версией');
const configText=readFileSync(join(source,'candidate/shared/config.js'),'utf8'),config=JSON.parse(configText.match(/Object\.freeze\((\{[^]*\})\)/)?.[1]||'null');
if(!config?.enabled||config.deploymentMode!=='production'||config.guestMode!=='supabase-anonymous'||!config.authProofRequired||config.supabaseUrl!==m.serverVerification.projectUrl||config.supabaseUrl!==backup.projectUrl)throw Error('Конфигурация не соответствует проверенному проекту');
if(readFileSync(join(source,'candidate/shared/api.js'),'utf8').includes('pickup_number'))throw Error('008 не входит в этот проверенный выпуск');
const required=['anonymousEnabled','authChallengeAvailable','ordersWithoutSessionDenied','publicReviewsAvailable','noClearlySyntheticPublicReviews','shared/api.jsMatchesVerifiedRelease','shared/customer.jsMatchesVerifiedRelease','kitchen/kitchen.jsMatchesVerifiedRelease','kitchen/backup.jsMatchesVerifiedRelease','menuPreserved','photosPreserved'];
if(!checks.readOnly||!checks.allPassed||!required.every(k=>checks.checks?.[k]===true)||!Number.isFinite(Date.parse(checks.checkedAt))||Date.now()-Date.parse(checks.checkedAt)>86400000||Date.parse(checks.checkedAt)>Date.now()+60000)throw Error('Нужна свежая успешная проверка');
if(!backup.downloadConfirmedByOwner||!backup.filename||!backup.reportedSize)throw Error('Нет подтверждения скачивания первой копии');
function files(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();}
for(const folder of ['candidate','safe-fallback']){
 const list=m[folder==='candidate'?'candidate':'fallback'];if(!Array.isArray(list)||JSON.stringify(files(join(source,folder)))!==JSON.stringify(list.map(x=>x.file).sort()))throw Error('Изменился состав '+folder);
 for(const item of list){if(item.file.split('/').includes('..')||item.file.startsWith('/')||hash(readFileSync(join(source,folder,item.file)))!==item.sha256)throw Error('Нарушена целостность '+item.file);}
}
if(hash(readFileSync(join(source,'site-before.zip')))!==m.baselineArchiveSha256)throw Error('Нарушена целостность исходной копии');
try{
 cpSync(source,out,{recursive:true});
 const updated={...m,sealedAt:new Date().toISOString(),notDeployed:true,approvalRequired:true,readiness:'ready_for_owner_approval',scope:'Verified order/review workflow without pickup cells 008',excludedFeatures:['008_pickup_cells.sql: not installed or live-tested'],backupEvidence:backup,latestReadOnlyChecks:checks,blockers:['Explicit owner approval is required before publication'],operationalLimits:['Backup download is owner-confirmed; file contents were not inspected by the agent','Backup covers business records, not all Auth/infrastructure; no live restore performed','Tatnet Free size/traffic/sleep limits remain; actual quota usage is not exposed by public key','Old cached pages may still call the legacy endpoint; new code contains only the new order transport']};
 writeFileSync(join(out,'release-manifest.json'),JSON.stringify(updated,null,2));
 writeFileSync(join(out,'READ-ME.txt'),'НЕ ОПУБЛИКОВАНО. Подготовлена проверенная версия без ячеек 008. candidate/ — готовый статический выпуск; safe-fallback/ — аварийная остановка новых отправок с сохранением меню/корзины и обработки записанных заказов. site-before.zip — архив прежнего main, не включать старый транспорт автоматически. Первая копия подтверждена владельцем; полный Auth backup не заявляется. Только отдельное согласие владельца разрешает публикацию. После разрешения применить payload отдельным релизом; merge всей текущей ветки с 008 не равен этому выпуску.\n');
 console.log('Пакет проверен и подготовлен к отдельному разрешению владельца. Не опубликован.');
}catch(error){rmSync(out,{recursive:true,force:true});throw error;}
