begin;
create or replace function public.delete_logitrak_operator(p_username text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs.'; end if;
  if p_username=public.get_username() then raise exception 'Votre propre compte ne peut pas être supprimé depuis cette session.'; end if;
  delete from public.operateurs where username=p_username;
  if not found then raise exception 'Compte introuvable.'; end if;
  delete from auth.users where lower(email)=p_username||'@logitrak.internal';
end;
$$;
revoke all on function public.delete_logitrak_operator(text) from public, anon;
grant execute on function public.delete_logitrak_operator(text) to authenticated;
notify pgrst,'reload schema';
commit;
