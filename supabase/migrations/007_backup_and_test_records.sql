-- Admin-only consistent business-data export. No Auth passwords/tokens are exposed.
begin;
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
commit;
