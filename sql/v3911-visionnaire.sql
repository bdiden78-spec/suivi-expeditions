begin;
alter table public.operateurs drop constraint if exists operateurs_role_check;
alter table public.operateurs add constraint operateurs_role_check check (role in ('admin','operateur','visionnaire'));
create or replace function public.is_operator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operateurs where username=public.get_username() and role in ('admin','operateur'))
$$;
create or replace function public.is_visionnaire() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operateurs where username=public.get_username() and role='visionnaire')
$$;
do $$
declare t text;
begin
 foreach t in array array['expeditions','lignes_expedition','production','colisage_ref','parametres','cartons_stock','ap_commandes','ap_productions','ap_historique'] loop
  if to_regclass(format('public.%I',t)) is null then continue; end if;
  execute format('drop policy if exists lecture_visionnaire on public.%I',t);
  execute format('create policy lecture_visionnaire on public.%I for select to authenticated using (public.is_visionnaire())',t);
 end loop;
end $$;
drop policy if exists lecture_propre_compte on public.operateurs;
create policy lecture_propre_compte on public.operateurs for select to authenticated using (username=public.get_username());
notify pgrst,'reload schema';
commit;
