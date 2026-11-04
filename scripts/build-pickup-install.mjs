// Generates one owner-run SQL file; never applies it or contacts Tatnet.
import {readFileSync,writeFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/008_pickup_cells.sql',import.meta.url),'utf8').replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'');
const check=readFileSync(new URL('../supabase/checks/pickup_008.sql',import.meta.url),'utf8');
writeFileSync(new URL('../supabase/INSTALL_PICKUP_008.sql',import.meta.url),'-- Existing MissMaki-test with INSTALL_FINAL 004-007 already installed.\n-- Apply this ONE file; do not recreate the database/users and do not repeat 001/002/003.\n-- Includes migration 008 and rollback-only server checks in one atomic installation.\nbegin;\n'+migration+'\n'+check+"\nselect jsonb_build_object('migration','008','installed',true,'selfChecks','passed','testRecordsPersisted',false) as result;\ncommit;\n");
console.log('INSTALL_PICKUP_008.sql prepared, NOT applied.');
