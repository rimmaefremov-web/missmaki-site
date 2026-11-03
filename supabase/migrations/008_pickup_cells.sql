-- Prepared only. Shared transactional pickup numbering; no occupancy/reservation model.
-- Apply after the existing 004-007 installation. Does not backfill or renumber old orders.
begin;
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
