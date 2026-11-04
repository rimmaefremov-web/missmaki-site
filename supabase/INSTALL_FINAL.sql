-- Existing MissMaki-test: 001/002 required; 004-008 are reapplicable; 003 must not be installed. Does not create a database or enable paid services.
-- One transaction: on an error do not continue by fragments. Original data/users/passwords are retained.
begin;
-- 004_review_moderation_idempotency.sql
-- Apply only to MissMaki-test after 001/002; independent of archived 003.
-- Preserves users, roles, data, RLS and external review status mapping. Safe to reapply.

create or replace function public.moderate_review(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.reviews;
begin
 if not public.is_staff() then raise exception 'Доступ запрещён'; end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception 'Неверный статус'; end if;
 select * into r from public.reviews where id=p_id for update;
 if not found then raise exception 'Отзыв не найден'; end if;
 -- Retries are no-ops even with the previous version; only real changes need a current version.
 if r.status=p_status then return; end if;
 if r.version is distinct from p_version then raise exception 'Отзыв уже изменён. Обновите список'; end if;
 update public.reviews set status=p_status,version=version+1 where id=p_id;
 insert into public.audit(entity,entity_id,actor,old_status,new_status) values('review',p_id,auth.uid(),r.status,p_status);
end $$;
revoke all on function public.moderate_review(uuid,text,integer) from public,anon;
grant execute on function public.moderate_review(uuid,text,integer) to authenticated;
notify pgrst, 'reload schema';

-- 005_submission_budgets.sql
-- PREPARED ONLY: review the initial project budgets before applying to MissMaki-test.
-- Complements Auth rate limits; does NOT limit the /auth/v1/signup endpoint.
-- Independent of archived 003; preserves users, data, existing pricing/RLS/RPCs.

create schema if not exists missmaki_guard;
revoke all on schema missmaki_guard from public,anon,authenticated;
create table if not exists missmaki_guard.submission_budgets(name text primary key,window_end timestamptz not null,n integer not null check(n>0));
alter table missmaki_guard.submission_budgets enable row level security;
revoke all on missmaki_guard.submission_budgets from public,anon,authenticated;
create or replace function missmaki_guard.consume(name text,cap integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare used integer;ending timestamptz;
begin
 ending=to_timestamp((floor(extract(epoch from now())/seconds)+1)*seconds);
 insert into missmaki_guard.submission_budgets as b(name,window_end,n) values(consume.name,ending,1)
 on conflict on constraint submission_budgets_pkey do update set window_end=excluded.window_end,n=case when b.window_end<=now() then 1 else b.n+1 end returning n into used;
 if used>cap then raise exception 'Слишком много заявок. Попробуйте позже или позвоните в MissMaki';end if;
end $$;
create or replace function missmaki_guard.check_submission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema<>'public' then raise exception 'Неверный источник';end if;
 if tg_table_name='orders' then
  perform missmaki_guard.consume('orders-minute',10,60);perform missmaki_guard.consume('orders-day',200,86400);
 elsif tg_table_name='reviews' then
  perform missmaki_guard.consume('reviews-minute',5,60);perform missmaki_guard.consume('reviews-day',100,86400);
 else raise exception 'Неверный источник';end if;
 return new;
end $$;
revoke all on all functions in schema missmaki_guard from public,anon,authenticated;
drop trigger if exists orders_submission_budget on public.orders;
create trigger orders_submission_budget before insert on public.orders for each row execute function missmaki_guard.check_submission();
drop trigger if exists reviews_submission_budget on public.reviews;
create trigger reviews_submission_budget before insert on public.reviews for each row execute function missmaki_guard.check_submission();

-- 006_auth_signup_guard.sql
-- Requires 005. Only Supabase Anonymous Auth remains; no database-token sessions.
-- Existing users/sessions/passwords are unchanged. New anonymous signups require a signed CPU proof.

create table if not exists missmaki_guard.auth_secret(singleton boolean primary key default true check(singleton),key bytea not null);
insert into missmaki_guard.auth_secret(key) values(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'))) on conflict(singleton) do nothing;
create table if not exists missmaki_guard.auth_challenges(nonce uuid primary key,expires_at timestamptz not null);
create index if not exists auth_challenge_expiry on missmaki_guard.auth_challenges(expires_at);
alter table missmaki_guard.auth_secret enable row level security;
alter table missmaki_guard.auth_challenges enable row level security;
revoke all on missmaki_guard.auth_secret,missmaki_guard.auth_challenges from public,anon,authenticated;
create or replace function missmaki_guard.auth_seal(message text) returns text language plpgsql stable security definer set search_path='' as $$
declare k bytea;ipad bytea=decode(repeat('36',64),'hex');opad bytea=decode(repeat('5c',64),'hex');i integer;
begin
 select key into k from missmaki_guard.auth_secret where singleton;
 for i in 0..31 loop ipad=set_byte(ipad,i,get_byte(k,i)#54);opad=set_byte(opad,i,get_byte(k,i)#92);end loop;
 return encode(sha256(opad||sha256(ipad||convert_to(message,'UTF8'))),'hex');
end $$;
create or replace function public.auth_signup_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare nonce uuid=gen_random_uuid();expires bigint=floor(extract(epoch from now()))::bigint+120;
begin
 perform missmaki_guard.consume('auth-challenge-minute',120,60);
 return jsonb_build_object('nonce',nonce,'expires',expires,'bits',18,'seal',missmaki_guard.auth_seal('mm-auth:'||nonce||':'||expires||':18'));
end $$;
create or replace function missmaki_guard.check_auth_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare proof jsonb;challenge jsonb;solution text;nonce uuid;expires bigint;signature text;h bytea;
begin
 if octet_length(new.raw_user_meta_data::text)>8192 then raise exception 'Слишком большой профиль';end if;
 if tg_op='UPDATE' then return new;end if;
 if new.is_anonymous is true then
  proof=new.raw_user_meta_data->'mm_proof';
  if proof is null or pg_column_size(proof)>2048 then raise exception 'Требуется проверка перед входом';end if;
  challenge=proof->'challenge';solution=proof->>'solution';
  if challenge is null or solution is null or pg_column_size(solution)>32 or solution!~'^[0-9]{1,10}$' then raise exception 'Неверная проверка входа';end if;
  nonce=(challenge->>'nonce')::uuid;expires=(challenge->>'expires')::bigint;
  if nonce is null or expires is null or expires<extract(epoch from now()) or expires>extract(epoch from now())+120 or challenge->>'bits' is distinct from '18' then raise exception 'Проверка входа истекла';end if;
  signature=missmaki_guard.auth_seal('mm-auth:'||nonce||':'||expires||':18');
  if challenge->>'seal' is distinct from signature then raise exception 'Неверная подпись входа';end if;
  h=sha256(convert_to(signature||':'||solution,'UTF8'));
  if get_byte(h,0)<>0 or get_byte(h,1)<>0 or get_byte(h,2)>=64 then raise exception 'Не пройдена проверка входа';end if;
  delete from missmaki_guard.auth_challenges where expires_at<now();
  begin insert into missmaki_guard.auth_challenges values(nonce,to_timestamp(expires));
  exception when unique_violation then raise exception 'Проверка входа уже использована';end;
  new.raw_user_meta_data=new.raw_user_meta_data-'mm_proof';
 end if;
 -- Includes regular email signup, so changing signup type cannot bypass the shared budget.
 perform missmaki_guard.consume('auth-signup-hour',60,3600);
 perform missmaki_guard.consume('auth-signup-day',300,86400);
 return new;
end $$;
revoke all on all functions in schema missmaki_guard from public,anon,authenticated;
revoke all on function public.auth_signup_challenge() from public,anon,authenticated;
grant execute on function public.auth_signup_challenge() to anon;
drop trigger if exists missmaki_auth_signup_guard on auth.users;
create trigger missmaki_auth_signup_guard before insert or update of raw_user_meta_data on auth.users for each row execute function missmaki_guard.check_auth_signup();
notify pgrst,'reload schema';

-- 007_backup_and_test_records.sql
-- Admin-only consistent business-data export. No Auth passwords/tokens are exposed.

alter table public.orders add column if not exists is_test boolean not null default false;
alter table public.reviews add column if not exists is_test boolean not null default false;
grant select(is_test) on public.reviews to authenticated;
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to authenticated using((status='approved' and not is_test) or public.is_staff());
create or replace function public.public_reviews() returns table(id uuid,name text,rating integer,body text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,name,rating,body,created_at from public.reviews where status='approved' and not is_test order by created_at desc limit 100
$$;
create or replace function public.my_reviews() returns table(id uuid,name text,rating integer,body text,created_at timestamptz,status text) language sql stable security definer set search_path='' as $$
 select id,name,rating,body,created_at,case when status='approved' and not is_test then 'approved' else 'pending' end from public.reviews where customer_id=auth.uid() order by created_at desc
$$;
create or replace function public.set_test_record(p_entity text,p_id uuid,p_test boolean) returns void language plpgsql security definer set search_path='' as $$
declare prior boolean;
begin
 if not public.is_staff() then raise exception 'Доступ запрещён';end if;
 if p_test is null then raise exception 'Укажите признак теста';end if;
 if p_entity='order' then
  select is_test into prior from public.orders where id=p_id for update;
  if not found then raise exception 'Запись не найдена';end if;
  if prior=p_test then return;end if;
  update public.orders set is_test=p_test,version=version+1 where id=p_id;
 elsif p_entity='review' then
  select is_test into prior from public.reviews where id=p_id for update;
  if not found then raise exception 'Запись не найдена';end if;
  if prior=p_test then return;end if;
  update public.reviews set is_test=p_test,version=version+1 where id=p_id;
 else raise exception 'Неверный вид записи';end if;
 insert into public.audit(entity,entity_id,actor,old_status,new_status) values(p_entity,p_id,auth.uid(),case when prior then 'test' else 'regular' end,case when p_test then 'test' else 'regular' end);
end $$;
-- Only these previously verified synthetic requests are marked; no pattern matching or deletion.
update public.orders set is_test=true where not is_test and
 ((request_id='6ba3da5d-4659-4151-8a3d-2f617d4a88c1' and name='АВТОТЕСТ ANONYMOUS — НЕ ГОТОВИТЬ') or
  (request_id='77120bff-c2ac-4bfc-901c-4bb9a6bad61d' and name='АВТОТЕСТ БРАУЗЕР — НЕ ГОТОВИТЬ'));
create or replace function public.business_backup() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid() and role='admin') then raise exception 'Резервная копия доступна администратору';end if;
 return jsonb_build_object('format','missmaki-business','version',1,'createdAt',now(),
 'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by o.number),'[]'::jsonb) from public.orders o),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]'::jsonb) from public.reviews r),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.audit a));
end $$;
create or replace function public.kitchen_capabilities() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_staff() then raise exception 'Доступ запрещён';end if;
 return jsonb_build_object('businessBackup',true,'testRecords',true,'version',1);
end $$;
revoke all on function public.kitchen_capabilities() from public,anon,authenticated;
grant execute on function public.kitchen_capabilities() to authenticated;
revoke all on function public.business_backup(),public.set_test_record(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.business_backup(),public.set_test_record(text,uuid,boolean) to authenticated;
notify pgrst,'reload schema';

-- 008_pickup_cells.sql
-- Prepared only. Shared transactional pickup numbering; no occupancy/reservation model.
-- Apply after the existing 004-007 installation. Does not backfill or renumber old orders.

alter table public.orders add column if not exists pickup_number integer;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_pickup_number') then
  alter table public.orders add constraint orders_pickup_number check(pickup_number is null or (fulfillment='pickup' and pickup_number between 1 and 6));
 end if;
end $$;
create schema if not exists missmaki_guard;
revoke all on schema missmaki_guard from public,anon,authenticated;
create table if not exists missmaki_guard.pickup_counter(singleton boolean primary key default true check(singleton),last_value integer not null default 0 check(last_value between 0 and 6),issued bigint not null default 0 check(issued>=0));
insert into missmaki_guard.pickup_counter(singleton) values(true) on conflict(singleton) do nothing;
alter table missmaki_guard.pickup_counter enable row level security;
revoke all on missmaki_guard.pickup_counter from public,anon,authenticated;
create or replace function missmaki_guard.keep_pickup_number() returns trigger language plpgsql set search_path='' as $$
begin
 if old.pickup_number is not null and new.pickup_number is distinct from old.pickup_number then raise exception 'Номер ячейки уже закреплён за заказом';end if;
 if old.pickup_number is null and new.pickup_number is not null and (new.fulfillment<>'pickup' or new.status<>'accepted') then raise exception 'Ячейка назначается при подтверждении самовывоза';end if;
 return new;
end $$;
revoke all on function missmaki_guard.keep_pickup_number() from public,anon,authenticated;
drop trigger if exists keep_pickup_number on public.orders;
create trigger keep_pickup_number before update on public.orders for each row execute function missmaki_guard.keep_pickup_number();
create or replace function public.order_status(p_id uuid,p_status text,p_minutes integer,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;cell integer;
begin
 if not public.is_staff() then raise exception 'Доступ запрещён';end if;
 select * into o from public.orders where id=p_id for update;
 if not found or o.version is distinct from p_version then raise exception 'Заказ изменён другим сотрудником. Обновите список';end if;
 if p_status is null or p_status not in ('new','accepted','rejected','completed') or (p_status='accepted' and (p_minutes is null or p_minutes not in (15,30,45,60,90,120,150,180))) then raise exception 'Неверный статус или время';end if;
 cell=o.pickup_number;
 if p_status='accepted' and o.fulfillment='pickup' and cell is null then
  -- One row lock serializes all pickup types. Counter and order roll back together.
  update missmaki_guard.pickup_counter set last_value=last_value%6+1,issued=issued+1 where singleton returning last_value into cell;
  if not found then raise exception 'Счётчик ячеек недоступен';end if;
 end if;
 update public.orders set status=p_status,minutes=case when p_status='accepted' then p_minutes else null end,pickup_number=cell,updated_at=now(),version=version+1 where id=p_id;
 insert into public.audit(entity,entity_id,actor,old_status,new_status,minutes) values('order',p_id,auth.uid(),o.status,p_status,p_minutes);
end $$;
revoke all on function public.order_status(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.order_status(uuid,text,integer,integer) to authenticated;
create or replace function public.business_backup() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid() and role='admin') then raise exception 'Резервная копия доступна администратору';end if;
 return jsonb_build_object('format','missmaki-business','version',1,'createdAt',now(),
 'pickupCounter',(select jsonb_build_object('lastValue',last_value,'issued',issued) from missmaki_guard.pickup_counter where singleton),
 'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by o.number),'[]'::jsonb) from public.orders o),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]'::jsonb) from public.reviews r),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.audit a));
end $$;
revoke all on function public.business_backup() from public,anon,authenticated;
grant execute on function public.business_backup() to authenticated;
notify pgrst,'reload schema';

commit;
