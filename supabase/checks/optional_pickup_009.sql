-- Owner-run checks. Each scenario is rolled back; no real records are removed.
-- PostgreSQL identity sequences can have harmless gaps after rollback; never rewind them.
do $$
declare actor uuid;buyer uuid;item_sku text;price integer;d date;t time;p jsonb;bad jsonb;created jsonb;saved public.orders;kind text;timing text;missing text;can_create boolean;before_orders bigint;before_audit bigint;before_counter bigint;
begin
 select user_id into actor from public.staff where role='admin' order by user_id limit 1;
 if actor is null then raise exception '009: нет существующего администратора';end if;
 select u.id into buyer from auth.users u where (select count(*) from public.orders o where o.customer_id=u.id and o.created_at>now()-interval '10 minutes')<5 order by (u.id=actor) desc,u.id limit 1;
 if buyer is null then raise exception '009: нет существующего пользователя со свободным лимитом проверки';end if;
 select sku,c.price into item_sku,price from public.catalog c where active order by sku limit 1;
 if item_sku is null then raise exception '009: нет активного блюда';end if;
 select days::date,slots::time into d,t from generate_series((now() at time zone 'Europe/Moscow')::date+1,(now() at time zone 'Europe/Moscow')::date+30,interval '1 day') days cross join generate_series(timestamp '2000-01-01 13:30',timestamp '2000-01-01 23:00',interval '30 minutes') slots
 where not exists(select 1 from public.orders o where o.requested_date=days::date and o.requested_time=slots::time and o.timing='preorder' and o.status in ('new','accepted')) order by days,slots limit 1;
 if d is null then raise exception '009: нет свободного слота для проверки';end if;
 select count(*) into before_orders from public.orders;select count(*) into before_audit from public.audit;select issued into before_counter from missmaki_guard.pickup_counter where singleton;
 foreach kind in array array['pickup','delivery'] loop
  foreach timing in array array['asap','preorder'] loop
   begin
    perform set_config('request.jwt.claim.sub',buyer::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated')::text,true);
    if exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_submission_budget') then alter table public.orders disable trigger orders_submission_budget;end if;
    p=jsonb_build_object('name',case when kind='pickup' then '' else 'ПРОВЕРКА 009 — НЕ ГОТОВИТЬ' end,'phone',case when kind='pickup' then '' else '+70000000000' end,'address','Служебная проверка','area','Тест','fulfillment',kind,'timing',timing,'requestedDate',d,'requestedTime',t,'items',jsonb_build_array(jsonb_build_object('sku',item_sku,'quantity',1)),'subtotal',price,'delivery',case when kind='pickup' or price>=3000 then 0 else 200 end,'total',price+case when kind='pickup' or price>=3000 then 0 else 200 end,'comment','INSTALL 009 ROLLBACK');
    if kind='delivery' then
     foreach missing in array array['name','phone','address'] loop
      bad=jsonb_set(p,array[missing],'""');
      begin
       perform public.create_order(gen_random_uuid(),bad);raise exception '009: доставка принята без обязательного поля';
      exception when others then
       if sqlerrm not in ('Проверьте имя, телефон и комментарий','Укажите адрес и район') then raise;end if;
      end;
     end loop;
    else
     -- Missing keys as well as empty strings must pass contact checks.
     bad=(p-'name'-'phone')||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('sku','__invalid_009__','quantity',1)));
     begin perform public.create_order(gen_random_uuid(),bad);raise exception '009: неизвестное блюдо принято';
     exception when others then if sqlerrm<>'Блюдо недоступно' then raise;end if;end;
    end if;
    can_create=true;
    begin created=public.create_order(gen_random_uuid(),p);
    exception when others then
     if timing='asap' and sqlerrm='Принимаем заказы с 13:00 до 23:00' then can_create=false;else raise;end if;
    end;
    if can_create then
     select * into saved from public.orders where id=(created->>'id')::uuid;
     if not found or saved.fulfillment<>kind or saved.timing<>timing or (kind='pickup' and (saved.name<>'' or saved.phone<>'')) then raise exception '009: неверные данные заказа';end if;
     if timing='preorder' and (saved.requested_date is distinct from d or saved.requested_time is distinct from t) then raise exception '009: дата/время изменены';end if;
     perform set_config('request.jwt.claim.sub',actor::text,true);
     perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
     if not public.is_staff() then raise exception '009: нет доступа кухни';end if;
     perform public.order_status(saved.id,'accepted',15,saved.version);
     select * into saved from public.orders where id=saved.id;
     if saved.status<>'accepted' or (kind='pickup' and saved.pickup_number is null) or (kind='delivery' and saved.pickup_number is not null) then raise exception '009: ошибка подтверждения или ячейки';end if;
     perform public.order_status(saved.id,'rejected',null,saved.version);
    end if;
    raise sqlstate 'P8009' using message='Rollback successful contact scenario';
   exception when sqlstate 'P8009' then null;
   end;
  end loop;
 end loop;
 if (select count(*) from public.orders)<>before_orders or (select count(*) from public.audit)<>before_audit or (select issued from missmaki_guard.pickup_counter where singleton)<>before_counter then raise exception '009: служебная проверка не откатилась';end if;
 raise notice '009: проверки прошли. Вне рабочих часов для обычных заказов проверяется отказ по часам работы, а предзаказы проверяются полностью.';
end $$;
