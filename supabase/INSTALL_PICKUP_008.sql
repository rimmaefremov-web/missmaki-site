-- Existing MissMaki-test with INSTALL_FINAL 004-007 already installed.
-- Apply this ONE file; do not recreate the database/users and do not repeat 001/002/003.
-- Includes migration 008 and rollback-only server checks in one atomic installation.
begin;
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

-- Owner-only installation self-check, deliberately rolled back inside a subtransaction.
-- No Auth users are created. Negative fixture order numbers avoid consuming customer order numbers.
do $$
declare actor uuid;before_counter record;after_counter record;ids uuid[]='{}';oid uuid;v integer;expected integer;cell integer;d date;t time;is_preorder boolean;stored_date date;stored_time time;i integer;wait_minutes integer;fixture_number bigint=-8000000000000;
begin
 select user_id into actor from public.staff where role='admin' order by user_id limit 1;
 if actor is null then raise exception 'Нет существующего администратора. Установка 008 отменена';end if;
 select * into before_counter from missmaki_guard.pickup_counter where singleton;
 begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  if exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_submission_budget') then
   alter table public.orders disable trigger orders_submission_budget;
  end if;
  for i in 1..7 loop
   oid=gen_random_uuid();ids=array_append(ids,oid);is_preorder=(i%2=0);d=null;t=null;
   if is_preorder then
    select days::date,slots::time into d,t
    from generate_series((now() at time zone 'Europe/Moscow')::date+1,(now() at time zone 'Europe/Moscow')::date+30,interval '1 day') days
    cross join generate_series(timestamp '2000-01-01 13:30',timestamp '2000-01-01 23:00',interval '30 minutes') slots
    where not exists(select 1 from public.orders o where o.requested_date=days::date and o.requested_time=slots::time and o.timing='preorder' and o.status in ('new','accepted'))
    order by days,slots limit 1;
    if d is null then raise exception 'Нет свободного слота для проверки. Установка 008 отменена';end if;
   end if;
   while exists(select 1 from public.orders where number=fixture_number) loop fixture_number=fixture_number-1;end loop;
   insert into public.orders(id,number,customer_id,request_id,payload,name,phone,address,area,fulfillment,timing,requested_date,requested_time,items,subtotal,delivery,total,comment,is_test) overriding system value
   values(oid,fixture_number,actor,gen_random_uuid(),'{}','СЛУЖЕБНАЯ ПРОВЕРКА 008','+70000000000','Тест','Самовывоз','pickup',case when is_preorder then 'preorder' else 'asap' end,d,t,'[]',470,0,470,'ROLLBACK',true);
   fixture_number=fixture_number-1;
   perform public.order_status(oid,'accepted',15,1);
   expected=(before_counter.last_value+i-1)%6+1;
   select pickup_number,requested_date,requested_time into cell,stored_date,stored_time from public.orders where id=oid;
   if cell is distinct from expected or stored_date is distinct from d or stored_time is distinct from t then raise exception 'Ошибка общего счётчика или даты предзаказа. Установка отменена';end if;
  end loop;
  foreach wait_minutes in array array[15,30,45,60,90,120,150,180] loop
   select version into v from public.orders where id=ids[1];perform public.order_status(ids[1],'accepted',wait_minutes,v);
   select pickup_number into cell from public.orders where id=ids[1];
   if cell is distinct from before_counter.last_value%6+1 then raise exception 'Повторное подтверждение изменило ячейку. Установка отменена';end if;
  end loop;
  for i in 1..2 loop
   oid=gen_random_uuid();ids=array_append(ids,oid);
   while exists(select 1 from public.orders where number=fixture_number) loop fixture_number=fixture_number-1;end loop;
   insert into public.orders(id,number,customer_id,request_id,payload,name,phone,address,area,fulfillment,timing,items,subtotal,delivery,total,comment,is_test) overriding system value
   values(oid,fixture_number,actor,gen_random_uuid(),'{}','СЛУЖЕБНАЯ ПРОВЕРКА 008','+70000000000','Тест','Тест',case when i=1 then 'delivery' else 'pickup' end,'asap','[]',470,0,470,'ROLLBACK',true);
   fixture_number=fixture_number-1;
   perform public.order_status(oid,case when i=1 then 'accepted' else 'rejected' end,case when i=1 then 15 else null end,1);
   select pickup_number into cell from public.orders where id=oid;
   if cell is not null then raise exception 'Доставка или отказ получили ячейку. Установка отменена';end if;
  end loop;
  select * into after_counter from missmaki_guard.pickup_counter where singleton;
  if after_counter.issued<>before_counter.issued+7 or after_counter.last_value<>(before_counter.last_value+6)%6+1 then raise exception 'Ошибка расхода счётчика. Установка отменена';end if;
  raise sqlstate 'P8008' using message='Rollback successful pickup self-check';
 exception when sqlstate 'P8008' then null;
 end;
 select * into after_counter from missmaki_guard.pickup_counter where singleton;
 if after_counter.last_value<>before_counter.last_value or after_counter.issued<>before_counter.issued or exists(select 1 from public.orders where id=any(ids)) then raise exception 'Служебная проверка не откатилась. Установка 008 отменена';end if;
 raise notice '008: все проверки прошли; служебные заказы, история и изменения счётчика отменены';
end $$;

select jsonb_build_object('migration','008','installed',true,'selfChecks','passed','testRecordsPersisted',false) as result;
commit;
