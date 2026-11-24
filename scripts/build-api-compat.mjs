// Keep the classic API entry self-contained for HTML cached before compat.js was added.
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),file=new URL('shared/api.js',root);
const api=readFileSync(file,'utf8').replace(/^\/\* MM_COMPAT_BUNDLE_START \*\/[\s\S]*?\/\* MM_COMPAT_BUNDLE_END \*\/\s*/,'');
const source=readFileSync(new URL('shared/compat.js',root),'utf8');
writeFileSync(file,'/* MM_COMPAT_BUNDLE_START */\n'+source+'/* MM_COMPAT_BUNDLE_END */\n'+api);
