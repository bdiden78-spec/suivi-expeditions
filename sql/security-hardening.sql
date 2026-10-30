-- LogiTrak Eurequat v6 — durcissement RLS non destructif
-- À exécuter dans Supabase > SQL Editor après sauvegarde.
-- Ce script ne supprime aucune table ni aucune donnée.
-- Prérequis : les fonctions is_operator() et is_admin() existent déjà.

alter table public.expeditions enable row level security;
alter table public.lignes_expedition enable row level security;
alter table public.operateurs enable row level security;
alter table public.production enable row level security;

-- Envois
 drop policy if exists "lecture publique" on public.expeditions;
 drop policy if exists "lecture operateurs expeditions" on public.expeditions;
 drop policy if exists "ecriture operateurs 48h" on public.expeditions;
 drop policy if exists "insertion operateurs expeditions" on public.expeditions;
 drop policy if exists "modification expeditions 48h" on public.expeditions;
 drop policy if exists "suppression expeditions 48h" on public.expeditions;
create policy "lecture operateurs expeditions" on public.expeditions
  for select to authenticated using (public.is_operator());
create policy "insertion operateurs expeditions" on public.expeditions
  for insert to authenticated with check (public.is_operator());
create policy "modification expeditions 48h" on public.expeditions
  for update to authenticated
  using (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'))
  with check (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'));
create policy "suppression expeditions 48h" on public.expeditions
  for delete to authenticated
  using (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'));

-- Lignes d'expédition
 drop policy if exists "lecture publique" on public.lignes_expedition;
 drop policy if exists "lecture operateurs lignes" on public.lignes_expedition;
 drop policy if exists "ecriture operateurs 48h lignes" on public.lignes_expedition;
 drop policy if exists "insertion lignes operateurs" on public.lignes_expedition;
 drop policy if exists "modification lignes 48h" on public.lignes_expedition;
 drop policy if exists "suppression lignes 48h" on public.lignes_expedition;
create policy "lecture operateurs lignes" on public.lignes_expedition
  for select to authenticated using (public.is_operator());
create policy "insertion lignes operateurs" on public.lignes_expedition
  for insert to authenticated with check (public.is_operator() and exists (
    select 1 from public.expeditions e where e.id = expedition_id
      and (public.is_admin() or now() - e.created_at < interval '48 hours')
  ));
create policy "modification lignes 48h" on public.lignes_expedition
  for update to authenticated
  using (public.is_operator() and exists (
    select 1 from public.expeditions e where e.id = expedition_id
      and (public.is_admin() or now() - e.created_at < interval '48 hours')
  ))
  with check (public.is_operator() and exists (
    select 1 from public.expeditions e where e.id = expedition_id
      and (public.is_admin() or now() - e.created_at < interval '48 hours')
  ));
create policy "suppression lignes 48h" on public.lignes_expedition
  for delete to authenticated using (public.is_operator() and exists (
    select 1 from public.expeditions e where e.id = expedition_id
      and (public.is_admin() or now() - e.created_at < interval '48 hours')
  ));

-- Production : lecture privée, historique lisible par les opérateurs autorisés.
 drop policy if exists "lecture publique production" on public.production;
 drop policy if exists "lecture operateurs production" on public.production;
 drop policy if exists "ajout operateurs production" on public.production;
 drop policy if exists "modif operateurs production" on public.production;
 drop policy if exists "suppression admin production" on public.production;
 drop policy if exists "ecriture operateurs 48h production" on public.production;
 drop policy if exists "insertion operateurs production" on public.production;
 drop policy if exists "modification production 48h" on public.production;
 drop policy if exists "suppression production 48h" on public.production;
create policy "lecture operateurs production" on public.production
  for select to authenticated using (public.is_operator());
create policy "insertion operateurs production" on public.production
  for insert to authenticated with check (public.is_operator());
create policy "modification production 48h" on public.production
  for update to authenticated
  using (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'))
  with check (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'));
create policy "suppression production 48h" on public.production
  for delete to authenticated
  using (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'));

-- Liste des opérateurs : réservée aux opérateurs déjà autorisés.
 drop policy if exists "lecture operateurs" on public.operateurs;
create policy "lecture operateurs" on public.operateurs
  for select to authenticated using (public.is_operator());

-- Vérification après exécution : dans Supabase > Table Editor > Policies,
-- aucune politique de lecture publique ne doit subsister sur ces 4 tables.


-- Empêche un opérateur de réinitialiser lui-même la fenêtre de modification de 48 h.
create or replace function public.prevent_created_at_reset()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_at is distinct from old.created_at and not public.is_admin() then
    raise exception 'Le champ created_at ne peut pas être modifié par un opérateur.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_expeditions_created_at on public.expeditions;
create trigger protect_expeditions_created_at before update on public.expeditions
for each row execute function public.prevent_created_at_reset();

drop trigger if exists protect_production_created_at on public.production;
create trigger protect_production_created_at before update on public.production
for each row execute function public.prevent_created_at_reset();
