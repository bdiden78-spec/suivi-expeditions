begin;
create table if not exists public.ap_reservations_postes (
 poste text primary key check(poste in ('Poste01','Poste02')),
 operateur text not null unique
);
alter table public.ap_reservations_postes enable row level security;
revoke all on public.ap_reservations_postes from anon,authenticated;
grant select on public.ap_reservations_postes to authenticated;
drop policy if exists lecture on public.ap_reservations_postes;
create policy lecture on public.ap_reservations_postes for select to authenticated using(public.is_operator());

create or replace function public.ap_reserver_poste(p_poste text,p_liberer boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare acteur text:=public.get_username(); titulaire text;
begin
 if not public.is_operator() then raise exception 'Accès opérateur requis.'; end if;
 if p_poste is null or p_poste not in ('Poste01','Poste02') then raise exception 'Poste invalide.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(405,15);
 select operateur into titulaire from public.ap_reservations_postes where poste=p_poste;
 if p_liberer then
   if titulaire is null or (titulaire<>acteur and not public.is_admin()) then raise exception 'Ce poste ne vous appartient pas.'; end if;
   if exists(select 1 from public.ap_productions where statut='EN_COURS' and (poste_travail=p_poste or (poste_travail is null and case when p_poste='Poste01' then imprimante in ('IMP01','IMP02','IMP03','IMP04') else imprimante in ('IMP05','IMP06') end))) then
     raise exception 'Validez les impressions en cours avant de libérer ce poste.';
   end if;
   delete from public.ap_reservations_postes where poste=p_poste;
 else
   if titulaire is not null and titulaire<>acteur then raise exception 'Ce poste est déjà réservé par %.',titulaire; end if;
   if exists(select 1 from public.ap_reservations_postes where operateur=acteur and poste<>p_poste) then
     raise exception 'Libérez votre poste actuel avant d’en choisir un autre.';
   end if;
   insert into public.ap_reservations_postes values(p_poste,acteur) on conflict(poste) do nothing;
 end if;
end $$;
revoke all on function public.ap_reserver_poste(text,boolean) from public,anon;
grant execute on function public.ap_reserver_poste(text,boolean) to authenticated;

create or replace function public.ap_require_station() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.statut<>'EN_COURS' then return new; end if;
 if tg_op='UPDATE' and (new.statut,new.poste_travail,new.imprimante) is not distinct from (old.statut,old.poste_travail,old.imprimante) then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(405,15);
 if not exists(select 1 from public.ap_reservations_postes where poste=new.poste_travail and operateur=public.get_username()) then
   raise exception 'Réservez ce poste avant de démarrer une impression.';
 end if;
 return new;
end $$;
drop trigger if exists ap_a_require_station on public.ap_productions;
create trigger ap_a_require_station before insert or update on public.ap_productions for each row execute function public.ap_require_station();
notify pgrst,'reload schema';
commit;
