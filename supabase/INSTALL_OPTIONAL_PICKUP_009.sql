-- Existing MissMaki-test with 001/002 and 004-008 installed. Run this entire file once.
-- No users, real orders, prices, RLS or quotas are deleted/reset. Test rows roll back.
-- Identity/audit sequences may have normal rollback gaps; they are never rewound.
begin;
-- Existing MissMaki-test; preserves data, Auth, RLS, budgets, prices and pickup counter.

create or replace function public.create_order(p_request uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders; result public.orders; it jsonb; product public.catalog; cooked jsonb='[]'; amount integer=0; fee integer; q integer; tm timestamp; gift boolean; d date; t time;
begin
 if auth.uid() is null then raise exception 'Войдите в систему'; end if;
 if p is null or pg_column_size(p)>65536 then raise exception 'Слишком большой заказ'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into existing from public.orders where customer_id=auth.uid() and request_id=p_request;
 if found then
  if existing.payload<>p then raise exception 'Этот номер запроса уже использован'; end if;
  return jsonb_build_object('ok',true,'id',existing.id,'number',existing.number,'requestId',existing.request_id);
 end if;
 -- Serialize per customer; identical submissions from tabs without Web Locks also converge.
 select * into existing from public.orders where customer_id=auth.uid() and payload=p and created_at>now()-interval '10 minutes' order by created_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'id',existing.id,'number',existing.number,'requestId',existing.request_id); end if;
 if (select count(*) from public.orders where customer_id=auth.uid() and created_at>now()-interval '10 minutes')>=5 then raise exception 'Слишком много заказов. Позвоните в MissMaki'; end if;
 if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 100 then raise exception 'Проверьте корзину'; end if;
 -- Pickup contacts are optional; if provided they retain the original size/phone checks.
 if length(coalesce(p->>'comment',''))>1000 then raise exception 'Проверьте имя, телефон и комментарий'; end if;
 if p->>'fulfillment'='pickup' then
  if length(trim(coalesce(p->>'name','')))>100 or (trim(coalesce(p->>'phone',''))<>'' and (length(trim(p->>'phone')) not between 10 and 50 or trim(p->>'phone')!~'^\+?[0-9 ()-]+$')) then raise exception 'Проверьте имя, телефон и комментарий';end if;
 else
  if length(trim(coalesce(p->>'name',''))) not between 1 and 100 or trim(coalesce(p->>'phone',''))='' or length(coalesce(p->>'phone','')) not between 10 and 50 or (p->>'phone')!~'^\+?[0-9 ()-]+$' then raise exception 'Проверьте имя, телефон и комментарий';end if;
 end if;
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
 values(auth.uid(),p_request,p,case when p->>'fulfillment'='pickup' then trim(coalesce(p->>'name','')) else p->>'name' end,case when p->>'fulfillment'='pickup' then trim(coalesce(p->>'phone','')) else p->>'phone' end,case when p->>'fulfillment'='pickup' then 'п. Южный, ул. Северная, 16/1' else p->>'address' end,coalesce(p->>'area',''),p->>'fulfillment',p->>'timing',d,t,cooked,amount,fee,amount+fee,coalesce(p->>'comment','')) returning * into result;
 insert into public.audit(entity,entity_id,actor,new_status) values('order',result.id,auth.uid(),'new');
 return jsonb_build_object('ok',true,'id',result.id,'number',result.number,'requestId',result.request_id);
exception when unique_violation then raise exception 'Время предзаказа уже занято. Выберите другое';
end $$;

revoke all on function public.create_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_order(uuid,jsonb) to authenticated;

create or replace function public.checkout_capabilities() returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('version',9,'pickupContactOptional',true,'deliveryContactRequired',true)$$;
revoke all on function public.checkout_capabilities() from public,anon,authenticated;
grant execute on function public.checkout_capabilities() to anon,authenticated;
notify pgrst,'reload schema';

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

select jsonb_build_object('migration','009','installed',true,'selfChecks','passed','testRecordsPersisted',false,'businessHoursOpen',(now() at time zone 'Europe/Moscow')::time>=time '13:00' and (now() at time zone 'Europe/Moscow')::time<time '23:00') as result;
commit;
