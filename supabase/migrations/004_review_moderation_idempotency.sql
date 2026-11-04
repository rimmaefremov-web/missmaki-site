-- Apply only to MissMaki-test after 001/002; independent of archived 003.
-- Preserves users, roles, data, RLS and external review status mapping. Safe to reapply.
begin;
create or replace function public.moderate_review(p_id uuid,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.reviews;
begin
 if not public.is_staff() then raise exception 'Доступ запрещён'; end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception 'Неверный статус'; end if;
 select * into r from public.reviews where id=p_id for update;
 if not found then raise exception 'Отзыв не найден'; end if;
 -- Retries are no-ops even with the previous version; only real changes need a current version.
 if r.status=p_status then return; end if;
 if r.version is distinct from p_version then raise exception 'Отзыв уже изменён. Обновите список'; end if;
 update public.reviews set status=p_status,version=version+1 where id=p_id;
 insert into public.audit(entity,entity_id,actor,old_status,new_status) values('review',p_id,auth.uid(),r.status,p_status);
end $$;
revoke all on function public.moderate_review(uuid,text,integer) from public,anon;
grant execute on function public.moderate_review(uuid,text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
