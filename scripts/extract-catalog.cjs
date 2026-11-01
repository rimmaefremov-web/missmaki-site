// Read the existing site's menu literals without executing the site or its photo data.
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const menu=html.match(/const groups=(\[.*?\]);\s*const esc=/s)?.[1];
const mapping=html.match(/const ORDER_SKUS=(\{.*?\});/s)?.[1];
if(!menu||!mapping)throw Error('Не удалось найти меню или таблицу SKU');
const rows=vm.runInNewContext(`const groups=${menu};const mapping=${mapping};let id=0;const rows=[];for(const g of groups)for(const p of g[2]){id++;for(const [i,o] of (p[3]||[[null,p[1]]]).entries()){const key=id+':'+(p[3]?i:'x');if(!mapping[key])throw Error('Missing SKU '+key);rows.push({sku:mapping[key],name:p[0]+(p[3]?' — '+o[0]:''),price:o[1]});}}rows;`,{},{timeout:1000});
process.stdout.write(JSON.stringify(rows));
