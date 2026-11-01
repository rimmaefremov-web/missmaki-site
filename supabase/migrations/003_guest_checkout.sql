-- TEST ONLY. Review and approve before applying to MissMaki-test. No Auth/server settings changed.
begin;
create schema missmaki_private;
revoke all on schema missmaki_private from public,anon,authenticated;
create table missmaki_private.guest_secret(singleton boolean primary key default true check(singleton),key bytea not null);
insert into missmaki_private.guest_secret(key) values(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')));
create table missmaki_private.guest_sessions(id uuid primary key default gen_random_uuid(),token_hash bytea unique not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days');
create table missmaki_private.used_challenges(nonce uuid primary key,expires_at timestamptz not null);
create index guest_challenge_expiry on missmaki_private.used_challenges(expires_at);
create table missmaki_private.quotas(key text primary key,window_end timestamptz not null,n integer not null);
create index guest_quota_expiry on missmaki_private.quotas(window_end);
alter table missmaki_private.guest_secret enable row level security;
alter table missmaki_private.guest_sessions enable row level security;
alter table missmaki_private.used_challenges enable row level security;
alter table missmaki_private.quotas enable row level security;
alter table public.orders alter column customer_id drop not null;
alter table public.orders add column guest_session_id uuid references missmaki_private.guest_sessions(id);
alter table public.orders add constraint orders_one_owner check(num_nonnulls(customer_id,guest_session_id)=1);
create unique index orders_guest_request on public.orders(guest_session_id,request_id) where guest_session_id is not null;
alter table public.reviews alter column customer_id drop not null;
alter table public.reviews add column guest_session_id uuid references missmaki_private.guest_sessions(id);
alter table public.reviews add constraint reviews_one_owner check(num_nonnulls(customer_id,guest_session_id)=1);
create unique index reviews_guest_request on public.reviews(guest_session_id,request_id) where guest_session_id is not null;
-- Existing staff/Auth RLS remains intact. No SELECT/INSERT/UPDATE grants to anon on tables.
create function missmaki_private.token_hash(t text) returns bytea language plpgsql immutable set search_path='' as $$
begin
 if t is null or pg_column_size(t)>128 or t!~'^[a-f0-9]{64}$' then raise exception 'Недействительная гостевая сессия'; end if;
 return sha256(convert_to(t,'UTF8'));
end $$;
create function missmaki_private.session_id(t text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare sid uuid;
begin
 select id into sid from missmaki_private.guest_sessions where token_hash=missmaki_private.token_hash(t) and expires_at>now();
 if not found then raise exception 'Гостевая сессия истекла или не найдена'; end if;
 return sid;
end $$;
-- RFC 2104 HMAC-SHA256, using built-in SHA256; no optional extension or external service.
create function missmaki_private.seal(message text) returns text language plpgsql stable security definer set search_path='' as $$
declare k bytea;ipad bytea=decode(repeat('36',64),'hex');opad bytea=decode(repeat('5c',64),'hex');i integer;
begin
 select key into k from missmaki_private.guest_secret where singleton;
 for i in 0..31 loop ipad=set_byte(ipad,i,get_byte(k,i)#54);opad=set_byte(opad,i,get_byte(k,i)#92);end loop;
 return encode(sha256(opad||sha256(ipad||convert_to(message,'UTF8'))),'hex');
end $$;
create function missmaki_private.quota(k text,cap integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare count_now integer;end_at timestamptz;
begin
 end_at=to_timestamp((floor(extract(epoch from now())/seconds)+1)*seconds);
 insert into missmaki_private.quotas(key,window_end,n) values(k,end_at,1)
 on conflict(key) do update set window_end=excluded.window_end,n=case when missmaki_private.quotas.window_end<=now() then 1 else missmaki_private.quotas.n+1 end returning n into count_now;
 if count_now>cap then raise exception 'Слишком много запросов. Попробуйте позже'; end if;
end $$;
create function missmaki_private.challenge_message(t text,scope text,request_id uuid,payload jsonb,nonce uuid,expiry bigint) returns text language sql immutable set search_path='' as $$
 select encode(missmaki_private.token_hash(t),'hex')||':'||scope||':'||coalesce(request_id::text,'')||':'||encode(sha256(convert_to(coalesce(payload,'{}'::jsonb)::text,'UTF8')),'hex')||':'||nonce::text||':'||expiry::text||':18'
$$;
create function public.guest_challenge(p_token text,p_scope text,p_request uuid default null,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare nonce uuid=gen_random_uuid();expiry bigint=floor(extract(epoch from now()))::bigint+120;
begin
 perform missmaki_private.token_hash(p_token);
 if p_scope is null or p_scope not in ('session','order','review') or pg_column_size(p_payload)>65536 or (p_scope<>'session' and p_request is null) then raise exception 'Неверный запрос проверки'; end if;
 if p_scope<>'session' then perform missmaki_private.session_id(p_token);end if;
 perform missmaki_private.quota('challenge-minute',240,60);
 return jsonb_build_object('nonce',nonce,'expires',expiry,'bits',18,'seal',missmaki_private.seal(missmaki_private.challenge_message(p_token,p_scope,p_request,p_payload,nonce,expiry)));
end $$;
create function missmaki_private.proof(t text,scope text,request_id uuid,payload jsonb,c jsonb,solution text) returns void language plpgsql security definer set search_path='' as $$
declare nonce uuid;expiry bigint;signature text;h bytea;
begin
 if pg_column_size(payload)>65536 then raise exception 'Слишком большой запрос';end if;
 if c is null or pg_column_size(c)>1024 or solution is null or pg_column_size(solution)>32 or solution!~'^[0-9]{1,10}$' then raise exception 'Не пройдена проверка отправки';end if;
 nonce=(c->>'nonce')::uuid;expiry=(c->>'expires')::bigint;
 if nonce is null or expiry is null or expiry<extract(epoch from now()) or expiry>extract(epoch from now())+120 or c->>'bits' is distinct from '18' then raise exception 'Проверка истекла. Повторите отправку';end if;
 signature=missmaki_private.seal(missmaki_private.challenge_message(t,scope,request_id,payload,nonce,expiry));
 if c->>'seal' is distinct from signature then raise exception 'Неверная подпись проверки';end if;
 h=sha256(convert_to(signature||':'||solution,'UTF8'));
 if get_byte(h,0)<>0 or get_byte(h,1)<>0 or get_byte(h,2)>=64 then raise exception 'Не пройдена проверка отправки';end if;
 delete from missmaki_private.used_challenges where expires_at<now();
 delete from missmaki_private.quotas where window_end<now()-interval '1 day';
 insert into missmaki_private.used_challenges values(nonce,to_timestamp(expiry));
exception when unique_violation then raise exception 'Проверка уже использована';
end $$;
create function public.guest_session(p_token text,p_challenge jsonb,p_solution text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s missmaki_private.guest_sessions;hash bytea=missmaki_private.token_hash(p_token);
begin
 perform pg_advisory_xact_lock(hashtextextended(encode(hash,'hex'),7));
 select * into s from missmaki_private.guest_sessions where token_hash=hash;
 if found then
  if s.expires_at<=now() then raise exception 'Гостевая сессия истекла';end if;
  return jsonb_build_object('ok',true,'expiresAt',s.expires_at);
 end if;
 perform missmaki_private.proof(p_token,'session',null,'{}',p_challenge,p_solution);
 perform missmaki_private.quota('session-minute',5,60);perform missmaki_private.quota('session-day',300,86400);
 insert into missmaki_private.guest_sessions(token_hash) values(hash) returning * into s;
 return jsonb_build_object('ok',true,'expiresAt',s.expires_at);
end $$;

-- Single pricing/validation path for both Auth and capability guests.
create function missmaki_private.create_order(p_actor uuid,p_guest boolean,p_request uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders; result public.orders; it jsonb; product public.catalog; cooked jsonb='[]'; amount integer=0; fee integer; q integer; tm timestamp; gift boolean; d date; t time;
begin
 if p_actor is null then raise exception 'Войдите в систему'; end if;
 if p is null or pg_column_size(p)>65536 then raise exception 'Слишком большой заказ'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into existing from public.orders where (case when p_guest then guest_session_id=p_actor else customer_id=p_actor end) and request_id=p_request;
 if found then
  if existing.payload<>p then raise exception 'Этот номер запроса уже использован'; end if;
  return jsonb_build_object('ok',true,'id',existing.id,'number',existing.number,'requestId',existing.request_id);
 end if;
 -- Serialize per customer; identical submissions from tabs without Web Locks also converge.
 select * into existing from public.orders where (case when p_guest then guest_session_id=p_actor else customer_id=p_actor end) and payload=p and created_at>now()-interval '10 minutes' order by created_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'id',existing.id,'number',existing.number,'requestId',existing.request_id); end if;
 if (select count(*) from public.orders where (case when p_guest then guest_session_id=p_actor else customer_id=p_actor end) and created_at>now()-interval '10 minutes')>=5 then raise exception 'Слишком много заказов. Позвоните в MissMaki'; end if;
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
 insert into public.orders(customer_id,guest_session_id,request_id,payload,name,phone,address,area,fulfillment,timing,requested_date,requested_time,items,subtotal,delivery,total,comment)
 values(case when p_guest then null else p_actor end,case when p_guest then p_actor else null end,p_request,p,p->>'name',p->>'phone',case when p->>'fulfillment'='pickup' then 'п. Южный, ул. Северная, 16/1' else p->>'address' end,coalesce(p->>'area',''),p->>'fulfillment',p->>'timing',d,t,cooked,amount,fee,amount+fee,coalesce(p->>'comment','')) returning * into result;
 insert into public.audit(entity,entity_id,actor,new_status) values('order',result.id,p_actor,'new');
 return jsonb_build_object('ok',true,'id',result.id,'number',result.number,'requestId',result.request_id);
exception when unique_violation then raise exception 'Время предзаказа уже занято. Выберите другое';
end $$;

create or replace function public.create_order(p_request uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_staff() then raise exception 'Покупатель оформляет заказ через защищённую гостевую сессию';end if;
 return missmaki_private.create_order(auth.uid(),false,p_request,p);
end $$;
create function public.guest_create_order(p_token text,p_request uuid,p jsonb,p_challenge jsonb,p_solution text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid=missmaki_private.session_id(p_token);o public.orders;
begin
 perform pg_advisory_xact_lock(hashtextextended(sid::text,7));
 select * into o from public.orders where guest_session_id=sid and request_id=p_request;
 if found then
  if o.payload is distinct from p then raise exception 'Этот номер запроса уже использован';end if;
  return jsonb_build_object('ok',true,'id',o.id,'number',o.number,'requestId',o.request_id);
 end if;
 perform missmaki_private.proof(p_token,'order',p_request,p,p_challenge,p_solution);
 perform missmaki_private.quota('order-minute',10,60);perform missmaki_private.quota('order-day',200,86400);
 perform missmaki_private.quota('order-session:'||sid,5,600);
 -- A failed business validation still consumes the challenge and rate budget.
 begin return missmaki_private.create_order(sid,true,p_request,p);
 exception when sqlstate 'P0001' then return jsonb_build_object('ok',false,'message',sqlerrm);
 when others then return jsonb_build_object('ok',false,'message','Проверьте данные заказа');end;
end $$;
create function public.guest_order(p_token text,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid=missmaki_private.session_id(p_token);result jsonb;
begin
 perform missmaki_private.quota('read:'||sid,120,60);
 select jsonb_build_object('id',id,'requestId',request_id,'number',number,'status',status,'minutes',minutes) into result from public.orders where guest_session_id=sid and request_id=p_request;
 return result;
end $$;
create function public.guest_availability(p_date date,p_time time) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform missmaki_private.quota('availability-minute',120,60);
 return public.availability(p_date,p_time);
end $$;
create function public.guest_submit_review(p_token text,p_request uuid,p_name text,p_rating integer,p_body text,p_consent boolean,p_challenge jsonb,p_solution text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid=missmaki_private.session_id(p_token);r public.reviews;rid uuid;payload jsonb=jsonb_build_object('name',p_name,'rating',p_rating,'body',p_body,'consent',p_consent);
begin
 perform pg_advisory_xact_lock(hashtextextended(sid::text,7));
 select * into r from public.reviews where guest_session_id=sid and request_id=p_request;
 if found then
  if r.name is distinct from trim(p_name) or r.rating is distinct from p_rating or r.body is distinct from trim(p_body) or p_consent is distinct from true then raise exception 'Этот номер запроса уже использован';end if;
  return jsonb_build_object('ok',true,'id',r.id);
 end if;
 perform missmaki_private.proof(p_token,'review',p_request,payload,p_challenge,p_solution);
 perform missmaki_private.quota('review-minute',5,60);perform missmaki_private.quota('review-day',100,86400);perform missmaki_private.quota('review-session:'||sid,3,3600);
 begin
  if p_consent is distinct from true then raise exception 'Подтвердите согласие на публикацию';end if;
  insert into public.reviews(customer_id,guest_session_id,request_id,name,rating,body) values(null,sid,p_request,trim(p_name),p_rating,trim(p_body)) returning id into rid;
  insert into public.audit(entity,entity_id,actor,new_status) values('review',rid,sid,'pending');
  return jsonb_build_object('ok',true,'id',rid);
 exception when others then return jsonb_build_object('ok',false,'message','Проверьте отзыв и отдельное согласие на публикацию');end;
end $$;
create function public.guest_my_reviews(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid=missmaki_private.session_id(p_token);result jsonb;
begin
 perform missmaki_private.quota('read:'||sid,120,60);
 select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (select id,name,rating,body,created_at,case when status='approved' then 'approved' else 'pending' end as status from public.reviews where guest_session_id=sid order by created_at desc limit 100) x;
 return result;
end $$;
-- Close the old email-signup route as a way around guest proof/rate limits.
create or replace function public.submit_review(p_request uuid,p_name text,p_rating integer,p_body text,p_consent boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not public.is_staff() then raise exception 'Отзыв отправляется через защищённую гостевую сессию';end if;
 if auth.uid() is null or p_consent is distinct from true then raise exception 'Подтвердите согласие на публикацию'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 select id into rid from public.reviews where customer_id=auth.uid() and request_id=p_request;
 if found then return rid; end if;
 if (select count(*) from public.reviews where customer_id=auth.uid() and created_at>now()-interval '1 hour')>=3 then raise exception 'Попробуйте позже'; end if;
 insert into public.reviews(customer_id,request_id,name,rating,body) values(auth.uid(),p_request,trim(p_name),p_rating,trim(p_body)) returning id into rid;
 insert into public.audit(entity,entity_id,actor,new_status) values('review',rid,auth.uid(),'pending');
 return rid;
end $$;

revoke all on all tables in schema missmaki_private from public,anon,authenticated;
revoke all on all functions in schema missmaki_private from public,anon,authenticated;
revoke all on function public.guest_challenge(text,text,uuid,jsonb),public.guest_session(text,jsonb,text),public.guest_create_order(text,uuid,jsonb,jsonb,text),public.guest_order(text,uuid),public.guest_availability(date,time),public.guest_submit_review(text,uuid,text,integer,text,boolean,jsonb,text),public.guest_my_reviews(text) from public,anon,authenticated;
grant execute on function public.guest_challenge(text,text,uuid,jsonb),public.guest_session(text,jsonb,text),public.guest_create_order(text,uuid,jsonb,jsonb,text),public.guest_order(text,uuid),public.guest_availability(date,time),public.guest_submit_review(text,uuid,text,integer,text,boolean,jsonb,text),public.guest_my_reviews(text) to anon;
-- Guests use the anon API role plus per-browser token; never authenticated/staff credentials.
commit;
