// Exports a TEST-only static copy. Does not contact a provider, change DNS or deploy.
import {writeFileSync,copyFileSync,cpSync,mkdtempSync,mkdirSync,renameSync,rmSync,existsSync} from 'node:fs';
import {dirname,resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {configuration} from './kitchen-config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),pos=args.indexOf('--output');
if(args.length!==4||pos!==2)throw Error('node scripts/build-russian-preview.mjs HTTPS_API_URL PUBLIC_ANON_KEY --output NEW_OUTPUT_DIRECTORY');
const [url,key]=args;configuration(url,key,'test');
const out=resolve(args[3]);
if(!relative(root,out).startsWith('..')||out===root||existsSync(out))throw Error('Выберите новую папку вне репозитория: исходный сайт не изменяется');
mkdirSync(dirname(out),{recursive:true});
const temp=mkdtempSync(join(dirname(out),'.mm-preview-'));
try{
 for(const name of ['index.html','contacts.html','cookies.html','privacy.html','terms.html','delivery.html','data-processing.html','review-consent.html'])copyFileSync(join(root,name),join(temp,name));
 for(const name of ['assets','kitchen','shared'])cpSync(join(root,name),join(temp,name),{recursive:true});
 mkdirSync(join(temp,'test'));copyFileSync(join(root,'test/index.html'),join(temp,'test/index.html'));
 mkdirSync(join(temp,'scripts'));for(const name of ['enable-kitchen.mjs','kitchen-config.mjs'])copyFileSync(join(root,'scripts',name),join(temp,'scripts',name));
 execFileSync(process.execPath,['scripts/enable-kitchen.mjs',url,key,'--preview'],{cwd:temp,stdio:'pipe'});
 rmSync(join(temp,'scripts'),{recursive:true});
 writeFileSync(join(temp,'robots.txt'),'User-agent: *\nDisallow: /\n');
 // No CNAME, repository metadata, tests, secrets or live provider credentials are exported.
 renameSync(temp,out);
 console.log('Тестовая статическая копия подготовлена: '+out+'. Не опубликована; DNS не изменён.');
}finally{if(existsSync(temp))rmSync(temp,{recursive:true,force:true});}
