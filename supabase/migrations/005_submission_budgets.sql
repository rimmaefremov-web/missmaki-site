-- PREPARED ONLY: review the initial project budgets before applying to MissMaki-test.
-- Complements Auth rate limits; does NOT limit the /auth/v1/signup endpoint.
-- Independent of archived 003; preserves users, data, existing pricing/RLS/RPCs.
begin;
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
commit;
