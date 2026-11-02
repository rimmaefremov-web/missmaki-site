// Exports a TEST-only static copy. Does not contact a provider, change DNS or deploy.
import {readFileSync,writeFileSync,copyFileSync,cpSync,mkdtempSync,mkdirSync,renameSync,rmSync,existsSync} from 'node:fs';
import {dirname,resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {configuration} from './kitchen-config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const rawArgs=process.argv.slice(2);const databaseGuest=rawArgs.includes('--database-guests');const args=rawArgs.filter(a=>a!=='--database-guests'),setup=args[0]==='--setup';
if(setup?(args.length!==3||args[1]!=='--output'):(args.length!==4||args[2]!=='--output'))throw Error('node scripts/build-russian-preview.mjs --setup --output NEW_OUTPUT_DIRECTORY; либо HTTPS_API_URL PUBLIC_ANON_KEY --output NEW_OUTPUT_DIRECTORY');
const [url,key]=args;if(!setup)configuration(url,key,'test');
const out=resolve(args[setup?2:3]);
if(!relative(root,out).startsWith('..')||out===root||existsSync(out))throw Error('Выберите новую папку вне репозитория: исходный сайт не изменяется');
mkdirSync(dirname(out),{recursive:true});
const temp=mkdtempSync(join(dirname(out),'.mm-preview-'));
try{
 for(const name of ['index.html','contacts.html','cookies.html','privacy.html','terms.html','delivery.html','data-processing.html','review-consent.html'])copyFileSync(join(root,name),join(temp,name));
 for(const name of ['assets','kitchen','shared'])cpSync(join(root,name),join(temp,name),{recursive:true});
 mkdirSync(join(temp,'test'));copyFileSync(join(root,'test/index.html'),join(temp,'test/index.html'));
 mkdirSync(join(temp,'scripts'));for(const name of ['enable-kitchen.mjs','kitchen-config.mjs'])copyFileSync(join(root,'scripts',name),join(temp,'scripts',name));
 execFileSync(process.execPath,['scripts/enable-kitchen.mjs',setup?'':url,setup?'':key,setup?'--preview-setup':'--preview'],{cwd:temp,stdio:'pipe'});
 if(databaseGuest){const file=join(temp,'shared/config.js');let text=readFileSync(file,'utf8');if(!text.includes('"deploymentMode":"test"'))throw Error('Ожидалась тестовая конфигурация');text=text.replace('"deploymentMode":"test"','"deploymentMode":"test","guestMode":"database-token"');writeFileSync(file,text);}
 mkdirSync(join(temp,'setup'));
 for(const name of ['setup.html','setup.js'])copyFileSync(join(root,'preview-tools',name),join(temp,'setup',name==='setup.html'?'index.html':name));
 copyFileSync(join(root,'preview-tools/settings.js'),join(temp,'shared/preview-settings.js'));
 for(const name of ['diagnostics.html','diagnostics.js','diagnostics-suite.js','guest-diagnostics-suite.js','access.html','access.js'])copyFileSync(join(root,'preview-tools',name),join(temp,'kitchen',name));
 for(const [name,prefix] of [['index.html','shared/'],['kitchen/index.html','../shared/']]){
  const file=join(temp,name);let html=readFileSync(file,'utf8');
  const configTag='<script src="'+prefix+'config.js"'+(name.startsWith('kitchen')?' defer':'')+'></script>';
  if(!html.includes(configTag))throw Error('Не найдено подключение конфигурации в '+name);
  html=html.replace(configTag,configTag+'<script src="'+prefix+'preview-settings.js"'+(name.startsWith('kitchen')?' defer':'')+'></script>');
  if(name.startsWith('kitchen'))html=html.replace('<main>', '<main><p><a href="../setup/">Настройки тестовой базы</a> · <a href="diagnostics.html">Проверка прав и времени</a></p>');
  writeFileSync(file,html);
 }
 rmSync(join(temp,'scripts'),{recursive:true});
 writeFileSync(join(temp,'robots.txt'),'User-agent: *\nDisallow: /\n');
 // No CNAME, repository metadata, tests, secrets or live provider credentials are exported.
 renameSync(temp,out);
 console.log('Тестовая статическая копия подготовлена: '+out+'. Не опубликована; DNS не изменён.');
}finally{if(existsSync(temp))rmSync(temp,{recursive:true,force:true});}
