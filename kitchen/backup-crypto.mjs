// Local encryption/decryption only. Never sends a file or passphrase to a server.
const FORMAT='missmaki-encrypted-backup',ITERATIONS=310000;
const b64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function key(passphrase,salt){const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export function validate(data,project){
 if(data?.format!=='missmaki-business'||data.version!==1||!Array.isArray(data.orders)||!Array.isArray(data.reviews)||!Array.isArray(data.audit)||!Number.isFinite(Date.parse(data.createdAt)))throw Error('Неизвестный формат копии');
 if(project&&data.project!==project)throw Error('Копия относится к другой базе');
 for(const table of ['orders','reviews','audit'])if(data[table].some(r=>!r||typeof r!=='object'||r.id===undefined))throw Error('Неполные данные в копии');
 return data;
}
export async function encryptBackup(data,passphrase){
 validate(data);if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Нужен пароль не короче 12 символов');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const plain=new TextEncoder().encode(JSON.stringify(data));
 if(plain.byteLength>64*1024*1024)throw Error('Копия слишком велика для этого инструмента');
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(passphrase,salt),plain);
 return JSON.stringify({format:FORMAT,version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))});
}
export async function decryptBackup(text,passphrase,project){
 if(text.length>100*1024*1024)throw Error('Слишком большой файл');
 const e=JSON.parse(text);if(e.format!==FORMAT||e.version!==1||e.kdf!=='PBKDF2-SHA256'||e.iterations!==ITERATIONS)throw Error('Неизвестный формат шифрования');
 const salt=bytes(e.salt),iv=bytes(e.iv);if(salt.length!==16||iv.length!==12)throw Error('Повреждённый файл');
 let plain;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(passphrase,salt),bytes(e.ciphertext));}catch{throw Error('Неверный пароль или повреждённая копия');}
 return validate(JSON.parse(new TextDecoder().decode(plain)),project);
}
export function restoreSql(data,project){
 validate(data,project);let tag;const json=JSON.stringify(data);do{tag='$mm_'+crypto.randomUUID().replaceAll('-','')+'$';}while(json.includes(tag));
 return `-- Business records only; same existing database and existing Auth users required.
-- No deletion or overwriting of existing IDs. Keep a current copy before running.
begin;
create temporary table mm_restore_data(data jsonb) on commit drop;
insert into mm_restore_data values(${tag}${json}${tag}::jsonb);
do $$ begin
 if exists(select 1 from mm_restore_data d,cross lateral jsonb_array_elements(d.data->'orders') o where not exists(select 1 from auth.users u where u.id=(o->>'customer_id')::uuid)) then raise exception 'Missing Auth users: restore provider Auth backup first';end if;
 if exists(select 1 from mm_restore_data d,cross lateral jsonb_array_elements(d.data->'reviews') r where not exists(select 1 from auth.users u where u.id=(r->>'customer_id')::uuid)) then raise exception 'Missing Auth users: restore provider Auth backup first';end if;
end $$;
do $$ begin
 if exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_submission_budget') then alter table public.orders disable trigger orders_submission_budget;end if;
 if exists(select 1 from pg_trigger where tgrelid='public.reviews'::regclass and tgname='reviews_submission_budget') then alter table public.reviews disable trigger reviews_submission_budget;end if;
end $$;
insert into public.orders overriding system value select r.* from mm_restore_data d cross join lateral jsonb_populate_recordset(null::public.orders,d.data->'orders') r on conflict(id) do nothing;
insert into public.reviews select r.* from mm_restore_data d cross join lateral jsonb_populate_recordset(null::public.reviews,d.data->'reviews') r on conflict(id) do nothing;
insert into public.audit overriding system value select r.* from mm_restore_data d cross join lateral jsonb_populate_recordset(null::public.audit,d.data->'audit') r on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_submission_budget') then alter table public.orders enable trigger orders_submission_budget;end if;
 if exists(select 1 from pg_trigger where tgrelid='public.reviews'::regclass and tgname='reviews_submission_budget') then alter table public.reviews enable trigger reviews_submission_budget;end if;
end $$;
select setval(pg_get_serial_sequence('public.orders','number'),greatest(coalesce((select max(number) from public.orders),1),(select last_value from public.orders_number_seq)),true);
select setval(pg_get_serial_sequence('public.audit','id'),greatest(coalesce((select max(id) from public.audit),1),(select last_value from public.audit_id_seq)),true);
commit;
` .replaceAll(',cross lateral', ' cross join lateral');
}
