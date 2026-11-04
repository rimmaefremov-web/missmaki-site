-- Requires 005. Only Supabase Anonymous Auth remains; no database-token sessions.
-- Existing users/sessions/passwords are unchanged. New anonymous signups require a signed CPU proof.
begin;
create table if not exists missmaki_guard.auth_secret(singleton boolean primary key default true check(singleton),key bytea not null);
insert into missmaki_guard.auth_secret(key) values(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'))) on conflict(singleton) do nothing;
create table if not exists missmaki_guard.auth_challenges(nonce uuid primary key,expires_at timestamptz not null);
create index if not exists auth_challenge_expiry on missmaki_guard.auth_challenges(expires_at);
alter table missmaki_guard.auth_secret enable row level security;
alter table missmaki_guard.auth_challenges enable row level security;
revoke all on missmaki_guard.auth_secret,missmaki_guard.auth_challenges from public,anon,authenticated;
create or replace function missmaki_guard.auth_seal(message text) returns text language plpgsql stable security definer set search_path='' as $$
declare k bytea;ipad bytea=decode(repeat('36',64),'hex');opad bytea=decode(repeat('5c',64),'hex');i integer;
begin
 select key into k from missmaki_guard.auth_secret where singleton;
 for i in 0..31 loop ipad=set_byte(ipad,i,get_byte(k,i)#54);opad=set_byte(opad,i,get_byte(k,i)#92);end loop;
 return encode(sha256(opad||sha256(ipad||convert_to(message,'UTF8'))),'hex');
end $$;
create or replace function public.auth_signup_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare nonce uuid=gen_random_uuid();expires bigint=floor(extract(epoch from now()))::bigint+120;
begin
 perform missmaki_guard.consume('auth-challenge-minute',120,60);
 return jsonb_build_object('nonce',nonce,'expires',expires,'bits',18,'seal',missmaki_guard.auth_seal('mm-auth:'||nonce||':'||expires||':18'));
end $$;
create or replace function missmaki_guard.check_auth_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare proof jsonb;challenge jsonb;solution text;nonce uuid;expires bigint;signature text;h bytea;
begin
 if octet_length(new.raw_user_meta_data::text)>8192 then raise exception 'Слишком большой профиль';end if;
 if tg_op='UPDATE' then return new;end if;
 if new.is_anonymous is true then
  proof=new.raw_user_meta_data->'mm_proof';
  if proof is null or pg_column_size(proof)>2048 then raise exception 'Требуется проверка перед входом';end if;
  challenge=proof->'challenge';solution=proof->>'solution';
  if challenge is null or solution is null or pg_column_size(solution)>32 or solution!~'^[0-9]{1,10}$' then raise exception 'Неверная проверка входа';end if;
  nonce=(challenge->>'nonce')::uuid;expires=(challenge->>'expires')::bigint;
  if nonce is null or expires is null or expires<extract(epoch from now()) or expires>extract(epoch from now())+120 or challenge->>'bits' is distinct from '18' then raise exception 'Проверка входа истекла';end if;
  signature=missmaki_guard.auth_seal('mm-auth:'||nonce||':'||expires||':18');
  if challenge->>'seal' is distinct from signature then raise exception 'Неверная подпись входа';end if;
  h=sha256(convert_to(signature||':'||solution,'UTF8'));
  if get_byte(h,0)<>0 or get_byte(h,1)<>0 or get_byte(h,2)>=64 then raise exception 'Не пройдена проверка входа';end if;
  delete from missmaki_guard.auth_challenges where expires_at<now();
  begin insert into missmaki_guard.auth_challenges values(nonce,to_timestamp(expires));
  exception when unique_violation then raise exception 'Проверка входа уже использована';end;
  new.raw_user_meta_data=new.raw_user_meta_data-'mm_proof';
 end if;
 -- Includes regular email signup, so changing signup type cannot bypass the shared budget.
 perform missmaki_guard.consume('auth-signup-hour',60,3600);
 perform missmaki_guard.consume('auth-signup-day',300,86400);
 return new;
end $$;
revoke all on all functions in schema missmaki_guard from public,anon,authenticated;
revoke all on function public.auth_signup_challenge() from public,anon,authenticated;
grant execute on function public.auth_signup_challenge() to anon;
drop trigger if exists missmaki_auth_signup_guard on auth.users;
create trigger missmaki_auth_signup_guard before insert or update of raw_user_meta_data on auth.users for each row execute function missmaki_guard.check_auth_signup();
notify pgrst,'reload schema';
commit;
