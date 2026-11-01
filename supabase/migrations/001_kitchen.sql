-- Apply once in Supabase SQL Editor. No service key is used by the browser.
begin;
create table public.staff(user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('admin','employee')));
create function public.is_staff() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.staff where user_id=auth.uid()) $$;
create table public.catalog(sku text primary key,name text not null,price integer not null check(price>=0),active boolean not null default true);
create table public.orders(
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 customer_id uuid not null references auth.users(id), request_id uuid not null, payload jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 status text not null default 'new' check(status in ('new','accepted','rejected','completed')),
 minutes integer check(minutes in (15,30,45,60,90,120,150,180)),
 name text not null,phone text not null,address text not null,area text not null,
 fulfillment text not null, timing text not null, requested_date date, requested_time time,
 items jsonb not null,subtotal integer not null,delivery integer not null,total integer not null,
 comment text not null,payment text not null default 'При получении: карта / СБП / наличные',
 version integer not null default 1, unique(customer_id,request_id),
 check((status='accepted' and minutes is not null) or status<>'accepted')
);
create unique index orders_preorder_slot on public.orders(requested_date,requested_time) where timing='preorder' and status in ('new','accepted');
create index orders_created on public.orders(created_at desc);
create table public.reviews(id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),request_id uuid not null,created_at timestamptz not null default now(),name text not null check(length(name) between 1 and 70),rating integer not null check(rating between 1 and 5),body text not null check(length(body) between 1 and 1500),status text not null default 'pending' check(status in ('pending','approved','rejected')),consent_at timestamptz not null default now(),version integer not null default 1,unique(customer_id,request_id));
create table public.audit(id bigint generated always as identity primary key,entity text not null,entity_id uuid not null,actor uuid not null,created_at timestamptz not null default now(),old_status text,new_status text,minutes integer);
alter table public.staff enable row level security;
alter table public.catalog enable row level security;
alter table public.orders enable row level security;
alter table public.reviews enable row level security;
alter table public.audit enable row level security;
create policy staff_read on public.staff for select to authenticated using(public.is_staff());
create policy orders_read on public.orders for select to authenticated using(customer_id=auth.uid() or public.is_staff());
-- Rejected and pending reviews are NEVER readable through the public API.
create policy reviews_read on public.reviews for select to authenticated using(status='approved' or public.is_staff());
create policy audit_read on public.audit for select to authenticated using(public.is_staff());
revoke all on public.staff,public.catalog,public.orders,public.reviews,public.audit from anon,authenticated;
grant select on public.staff,public.orders,public.audit to authenticated;
grant select(id,name,rating,body,created_at,status,version) on public.reviews to authenticated;

create function public.create_order(p_request uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders; result public.orders; it jsonb; product public.catalog; cooked jsonb='[]'; amount integer=0; fee integer; q integer; tm timestamp; gift boolean; d date; t time;
begin
 if auth.uid() is null then raise exception 'Войдите в систему'; end if;
 if p is null or pg_column_size(p)>65536 then raise exception 'Слишком большой заказ'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into existing from public.orders where customer_id=auth.uid() and request_id=p_request;
 if found then
  if existing.payload<>p then raise exception 'Этот номер запроса уже использован'; end if;
  return jsonb_build_object('ok',true,'id',existing.id,'number',existing.number);
 end if;
 if (select count(*) from public.orders where customer_id=auth.uid() and created_at>now()-interval '10 minutes')>=5 then raise exception 'Слишком много заказов. Позвоните в MissMaki'; end if;
 if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 100 then raise exception 'Проверьте корзину'; end if;
 if length(trim(coalesce(p->>'name',''))) not between 1 and 100 or length(coalesce(p->>'phone','')) not between 10 and 50 or (p->>'phone')!~'^\+?[0-9 ()-]+$' or length(coalesce(p->>'comment',''))>1000 then raise exception 'Проверьте имя, телефон и комментарий'; end if;
 if coalesce(p->>'fulfillment','') not in ('pickup','delivery') or coalesce(p->>'timing','') not in ('asap','preorder') then raise exception 'Проверьте способ получения'; end if;
 if p->>'fulfillment'='delivery' and (length(trim(coalesce(p->>'address',''))) not between 1 and 300 or length(trim(coalesce(p->>'area',''))) not between 1 and 100) then raise exception 'Укажите адрес и район'; end if;
 for it in select value from jsonb_array_elements(p->'items') loop
  select * into product from public.catalog where sku=it->>'sku' and active;
  if not found then raise exception 'Блюдо недоступно'; end if;
  if coalesce(it->>'quantity','')!~'^[0-9]{1,2}$' then raise exception 'Проверьте количество'; end if;
  q=(it->>'quantity')::integer;
  if q not between 1 and 99 then raise exception 'Проверьте количество'; end if;
  amount=amount+product.price*q;
  cooked=cooked||jsonb_build_array(jsonb_build_object('sku',product.sku,'name',product.name,'price',product.price,'quantity',q));
 end loop;
 fee=case when p->>'fulfillment'='pickup' or amount>=3000 then 0 else 200 end;
 if (p->>'subtotal')::integer is distinct from amount or (p->>'delivery')::integer is distinct from fee or (p->>'total')::integer is distinct from amount+fee then raise exception 'Стоимость изменилась. Обновите меню'; end if;
 gift=coalesce((p->>'birthdayGift')::boolean,false);
 if gift and amount<1000 then raise exception 'Подарок доступен от 1000 рублей'; end if;
 if gift then cooked=cooked||jsonb_build_array(jsonb_build_object('name','Подарочный ролл: проверить оригинал документа; без подтверждения 500 ₽','price',0,'quantity',1)); end if;
 tm=now() at time zone 'Europe/Moscow';
 if p->>'timing'='preorder' then
  d=(p->>'requestedDate')::date; t=(p->>'requestedTime')::time;
  if d is null or t is null or d<tm::date or d>tm::date+30 or t<time '13:30' or t>time '23:00' or extract(minute from t) not in (0,30) or extract(second from t)<>0 or d+t<=tm+interval '30 minutes' then raise exception 'Выберите другое время предзаказа'; end if;
 elsif tm::time<time '13:00' or tm::time>=time '23:00' then raise exception 'Принимаем заказы с 13:00 до 23:00'; end if;
 insert into public.orders(customer_id,request_id,payload,name,phone,address,area,fulfillment,timing,requested_date,requested_time,items,subtotal,delivery,total,comment)
 values(auth.uid(),p_request,p,p->>'name',p->>'phone',case when p->>'fulfillment'='pickup' then 'п. Южный, ул. Северная, 16/1' else p->>'address' end,coalesce(p->>'area',''),p->>'fulfillment',p->>'timing',d,t,cooked,amount,fee,amount+fee,coalesce(p->>'comment','')) returning * into result;
 insert into public.audit(entity,entity_id,actor,new_status) values('order',result.id,auth.uid(),'new');
 return jsonb_build_object('ok',true,'id',result.id,'number',result.number);
exception when unique_violation then raise exception 'Время предзаказа уже занято. Выберите другое';
end $$;

create function public.order_status(p_id uuid,p_status text,p_minutes integer,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if not public.is_staff() then raise exception 'Доступ запрещён'; end if;
 select * into o from public.orders where id=p_id for update;
 if not found or o.version<>p_version then raise exception 'Заказ изменён другим сотрудником. Обновите список'; end if;
 if p_status not in ('new','accepted','rejected','completed') or p_status is null or (p_status='accepted' and (p_minutes is null or p_minutes not in (15,30,45,60,90,120,150,180))) then raise exception 'Неверный статус или время'; end if;
 update public.orders set status=p_status,minutes=case when p_status='accepted' then p_minutes else null end,updated_at=now(),version=version+1 where id=p_id;
 insert into public.audit(entity,entity_id,actor,old_status,new_status,minutes) values('order',p_id,auth.uid(),o.status,p_status,p_minutes);
end $$;
create function public.availability(p_date date,p_time time) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'available',p_date is not null and p_time is not null and p_date between (now() at time zone 'Europe/Moscow')::date and (now() at time zone 'Europe/Moscow')::date+30 and p_time between time '13:30' and time '23:00' and extract(minute from p_time) in (0,30) and extract(second from p_time)=0 and p_date+p_time>(now() at time zone 'Europe/Moscow')+interval '30 minutes' and not exists(select 1 from public.orders where requested_date=p_date and requested_time=p_time and status in ('new','accepted')))
$$;
create function public.submit_review(p_request uuid,p_name text,p_rating integer,p_body text,p_consent boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if auth.uid() is null or p_consent is distinct from true then raise exception 'Подтвердите согласие на публикацию'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 select id into rid from public.reviews where customer_id=auth.uid() and request_id=p_request;
 if found then return rid; end if;
 if (select count(*) from public.reviews where customer_id=auth.uid() and created_at>now()-interval '1 hour')>=3 then raise exception 'Попробуйте позже'; end if;
 insert into public.reviews(customer_id,request_id,name,rating,body) values(auth.uid(),p_request,trim(p_name),p_rating,trim(p_body)) returning id into rid;
 insert into public.audit(entity,entity_id,actor,new_status) values('review',rid,auth.uid(),'pending');
 return rid;
end $$;
create function public.moderate_review(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.reviews;
begin
 if not public.is_staff() then raise exception 'Доступ запрещён'; end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception 'Неверный статус'; end if;
 select * into r from public.reviews where id=p_id for update;
 if not found or r.version<>p_version then raise exception 'Отзыв уже изменён. Обновите список'; end if;
 update public.reviews set status=p_status,version=version+1 where id=p_id;
 insert into public.audit(entity,entity_id,actor,old_status,new_status) values('review',p_id,auth.uid(),r.status,p_status);
end $$;
create function public.my_reviews() returns table(id uuid,name text,rating integer,body text,created_at timestamptz,status text) language sql stable security definer set search_path='' as $$ select id,name,rating,body,created_at,case when status='approved' then 'approved' else 'pending' end from public.reviews where customer_id=auth.uid() order by created_at desc $$;
create function public.public_reviews() returns table(id uuid,name text,rating integer,body text,created_at timestamptz) language sql stable security definer set search_path='' as $$ select id,name,rating,body,created_at from public.reviews where status='approved' order by created_at desc limit 100 $$;
-- PostgreSQL functions default to PUBLIC execute: explicitly close that default.
revoke all on function public.is_staff(),public.create_order(uuid,jsonb),public.order_status(uuid,text,integer,integer),public.availability(date,time),public.submit_review(uuid,text,integer,text,boolean),public.moderate_review(uuid,text,integer),public.my_reviews(),public.public_reviews() from public,anon,authenticated;
grant execute on function public.is_staff(),public.create_order(uuid,jsonb),public.order_status(uuid,text,integer,integer),public.availability(date,time),public.submit_review(uuid,text,integer,text,boolean),public.moderate_review(uuid,text,integer),public.my_reviews(),public.public_reviews() to authenticated;
grant execute on function public.public_reviews() to anon;
alter publication supabase_realtime add table public.orders,public.reviews;
commit;
