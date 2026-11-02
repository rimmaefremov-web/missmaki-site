-- READ ONLY. Run in SQL Editor as owner. No names, phones, passwords or tokens are returned.
begin read only;
select now() as checked_at,pg_database_size(current_database()) as database_bytes;
select relname as table_name,pg_total_relation_size(relid) as bytes from pg_stat_user_tables where schemaname in ('public','auth','missmaki_guard') order by bytes desc;
select 'orders' as entity,count(*) as records from public.orders union all select 'reviews',count(*) from public.reviews union all select 'audit',count(*) from public.audit union all select 'auth_users',count(*) from auth.users;
select is_anonymous,count(*) as users from auth.users group by is_anonymous;
select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('orders','reviews','staff','audit','catalog');
select tablename,policyname,roles,cmd,qual from pg_policies where schemaname='public' order by tablename,policyname;
select to_regprocedure('public.moderate_review(uuid,text,integer)') is not null as moderation_exists,position('if r.status=p_status then return' in pg_get_functiondef('public.moderate_review(uuid,text,integer)'::regprocedure))>0 as moderation_004_installed;
select tgname as trigger_name, tgenabled as enabled from pg_trigger where tgrelid in ('public.orders'::regclass,'public.reviews'::regclass) and not tgisinternal;
-- Limits for egress/Realtime/backups/Auth signup are provider-side, not proved by this SQL.
rollback;
