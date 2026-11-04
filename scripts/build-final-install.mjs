// Produces one atomic installation file; does not execute SQL or contact any provider.
import {readFileSync,writeFileSync} from 'node:fs';
const files=['004_review_moderation_idempotency.sql','005_submission_budgets.sql','006_auth_signup_guard.sql','007_backup_and_test_records.sql','008_pickup_cells.sql'];
const text=files.map(file=>'-- '+file+'\n'+readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8').replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'')).join('\n');
writeFileSync(new URL('../supabase/INSTALL_FINAL.sql',import.meta.url),'-- Existing MissMaki-test: 001/002 required; 004-008 are reapplicable; 003 must not be installed. Does not create a database or enable paid services.\n-- One transaction: on an error do not continue by fragments. Original data/users/passwords are retained.\nbegin;\n'+text+'\ncommit;\n');
console.log('INSTALL_FINAL.sql prepared; NOT applied.');
