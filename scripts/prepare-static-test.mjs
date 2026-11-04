// Static hosting build. Only creates ignored dist-preview/, never rewrites the live site.
import {mkdtempSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const temporary=mkdtempSync(join(tmpdir(),'mm-static-'));
try{
 const output=join(temporary,'site');
 execFileSync(process.execPath,[join(root,'scripts/build-russian-preview.mjs'),'--setup','--output',output],{cwd:root,stdio:'pipe'});
 const destination=join(root,'dist-preview');rmSync(destination,{recursive:true,force:true});cpSync(output,destination,{recursive:true});
 console.log('Готова только статическая тестовая копия: dist-preview. Настройки базы вводятся на /setup/. Публикация и DNS не изменены.');
}finally{rmSync(temporary,{recursive:true,force:true});}
