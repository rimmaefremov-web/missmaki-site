-- Existing MissMaki-test; preserves data, Auth, RLS, budgets, prices and pickup counter.
begin;
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
commit;
