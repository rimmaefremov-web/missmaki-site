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
