// Prepare one atomic owner installation; never connects to a database.
import {readFileSync,writeFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/009_optional_pickup_contacts.sql',import.meta.url),'utf8').replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'');
const check=readFileSync(new URL('../supabase/checks/optional_pickup_009.sql',import.meta.url),'utf8');
writeFileSync(new URL('../supabase/INSTALL_OPTIONAL_PICKUP_009.sql',import.meta.url),'-- Existing MissMaki-test with 001/002 and 004-008 installed. Run this entire file once.\n-- No users, real orders, prices, RLS or quotas are deleted/reset. Test rows roll back.\n-- Identity/audit sequences may have normal rollback gaps; they are never rewound.\nbegin;\n'+migration+'\n'+check+"\nselect jsonb_build_object('migration','009','installed',true,'selfChecks','passed','testRecordsPersisted',false,'businessHoursOpen',(now() at time zone 'Europe/Moscow')::time>=time '13:00' and (now() at time zone 'Europe/Moscow')::time<time '23:00') as result;\ncommit;\n");
console.log('INSTALL_OPTIONAL_PICKUP_009.sql prepared; NOT applied.');
