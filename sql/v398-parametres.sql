begin;
drop policy if exists ap_suppression on public.ap_commandes;
create policy ap_suppression on public.ap_commandes for delete to authenticated
using (public.is_admin() or (public.is_operator() and now()-created_at<interval '48 hours' and not exists
(select 1 from public.ap_productions p where p.commande_id=ap_commandes.id)));
create or replace function public.ap_delete_started_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not public.is_admin() and exists(select 1 from public.ap_productions where commande_id=old.id) then
   raise exception 'Seul un administrateur peut supprimer une commande dont la production a démarré.';
 end if;
 return old;
end $$;
drop trigger if exists ap_delete_started_guard on public.ap_commandes;
create trigger ap_delete_started_guard before delete on public.ap_commandes
for each row execute function public.ap_delete_started_guard();
create or replace function public.get_username() returns text
language sql security definer set search_path='' stable as $$
 select split_part(lower(email),'@',1) from auth.users where id=auth.uid() and lower(email) like '%@logitrak.internal'
$$;
create or replace function public.edit_logitrak_operator(p_current text,p_username text,p_password text)
returns void language plpgsql security definer set search_path='' as $$
declare account_id uuid; new_email text; crypto_schema text; password_hash text;
begin
 if not public.is_admin() then raise exception 'Accès réservé à l’administrateur.'; end if;
 if p_username is null or p_username !~ '^[a-z0-9._-]{1,64}$' then raise exception 'Identifiant invalide.'; end if;
 select id into account_id from auth.users where email=p_current||'@logitrak.internal' for update;
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
