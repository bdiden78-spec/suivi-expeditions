begin;
create or replace function public.create_operator(p_username text,p_password text,p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare
  account_id uuid:=gen_random_uuid();
  login_name text:=lower(trim(p_username));
  login_email text;
  password_hash text;
  crypto_schema text;
  identity_payload jsonb;
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs.'; end if;
  if login_name is null or login_name !~ '^[a-z0-9._-]{1,64}$' then raise exception 'Identifiant invalide.'; end if;
  if p_role is null or p_role not in ('admin','operateur','visionnaire') then raise exception 'Rôle invalide.'; end if;
  if p_password is null or length(p_password)<8 or octet_length(p_password)>72 then
    raise exception 'Mot de passe de 8 caractères minimum et 72 octets maximum.';
  end if;
  login_email:=login_name||'@logitrak.internal';
  if exists(select 1 from public.operateurs where username=login_name) or exists(select 1 from auth.users where lower(email)=login_email) then
    raise exception 'Cet identifiant existe déjà.';
  end if;
  select n.nspname into strict crypto_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute format('select %I.crypt($1,%I.gen_salt(''bf''))',crypto_schema,crypto_schema) into password_hash using p_password;
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values(account_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',login_email,password_hash,now(),
    '{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  identity_payload:=jsonb_build_object('sub',account_id::text,'email',login_email,'email_verified',true);
  if exists(select 1 from pg_catalog.pg_attribute where attrelid='auth.identities'::regclass and attname='provider_id' and not attisdropped) then
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),account_id::text,account_id,identity_payload,'email',now(),now(),now());
  else
    insert into auth.identities(id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),account_id,identity_payload,'email',now(),now(),now());
  end if;
  insert into public.operateurs(username,role) values(login_name,p_role);
end $$;
revoke all on function public.create_operator(text,text,text) from public,anon;
grant execute on function public.create_operator(text,text,text) to authenticated;

create or replace function public.edit_logitrak_operator(p_current text,p_username text,p_password text)
returns void language plpgsql security definer set search_path='' as $$
declare account_id uuid; new_email text; crypto_schema text; password_hash text;
begin
 if not public.is_admin() then raise exception 'Accès réservé à l’administrateur.'; end if;
 if p_username is null or p_username !~ '^[a-z0-9._-]{1,64}$' then raise exception 'Identifiant invalide.'; end if;
 select id into account_id from auth.users where lower(email)=p_current||'@logitrak.internal' for update;
 if not found or not exists(select 1 from public.operateurs where username=p_current) then raise exception 'Compte introuvable.'; end if;
 new_email:=p_username||'@logitrak.internal';
 if coalesce(p_password,'')<>'' then
   if length(p_password)<8 or octet_length(p_password)>72 then raise exception 'Mot de passe de 8 caractères minimum et 72 octets maximum.'; end if;
   select n.nspname into crypto_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
   execute format('select %I.crypt($1,%I.gen_salt(''bf''))',crypto_schema,crypto_schema) into password_hash using p_password;
 end if;
 update public.operateurs set username=p_username where username=p_current;
 update auth.users set email=new_email, encrypted_password=coalesce(password_hash,encrypted_password),updated_at=now() where id=account_id;
 update auth.identities set identity_data=jsonb_set(identity_data,'{email}',to_jsonb(new_email)),updated_at=now()
 where user_id=account_id and provider='email';
 if password_hash is not null or p_current<>p_username then
   delete from auth.sessions where user_id=account_id;
 end if;
end $$;
revoke all on function public.edit_logitrak_operator(text,text,text) from public,anon;
grant execute on function public.edit_logitrak_operator(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
