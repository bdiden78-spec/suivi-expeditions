-- ==========================================================
-- LogiTrak v2.2 : VALIDATION DES ENVOIS PAR UN ADMINISTRATEUR
--
-- À exécuter UNE fois dans Supabase > SQL Editor (bouton Run),
-- APRÈS sql/v21-colisage-reference.sql.
-- Ce script AJOUTE / MET À JOUR : il ne supprime AUCUNE donnée
-- et peut être relancé sans risque.
--
-- Fonctionnement :
--   - un envoi créé par un opérateur est « À valider » ;
--   - seul un administrateur le valide (ou annule sa validation) ;
--   - un envoi validé est verrouillé pour les opérateurs ;
--   - la règle de 08h30 de la v21 est supprimée.
-- ==========================================================

-- 1. État de validation des envois (nouvelle colonne « validation » : l'ancienne colonne « statut » n'est pas touchée).
--    Les envois déjà enregistrés sont considérés comme validés.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'expeditions' and column_name = 'validation') then
    alter table expeditions add column validation text not null default 'VALIDE';   -- historique : déjà validé
    alter table expeditions add column valide_par text default '';
    alter table expeditions add column valide_at timestamptz;
    alter table expeditions alter column validation set default 'A_VALIDER';        -- les nouveaux envois sont à valider
    update expeditions set valide_par = '(historique)', valide_at = coalesce(created_at, now());
    alter table expeditions add constraint expeditions_validation_chk check (validation in ('A_VALIDER', 'VALIDE'));
  end if;
end $$;
create index if not exists idx_expeditions_validation on expeditions(validation);

-- 2. Déclencheur : un opérateur ne peut ni valider, ni modifier un envoi validé
create or replace function public.expedition_guard() returns trigger language plpgsql as $$
begin
  -- modifications faites directement depuis Supabase (SQL Editor, service) : aucune restriction
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;

  if tg_op = 'INSERT' then
    new.validation := 'A_VALIDER'; new.valide_par := ''; new.valide_at := null;     -- tout nouvel envoi est à valider
    return new;
  end if;

  if not public.is_admin() then
    if old.validation = 'VALIDE' then
      raise exception 'Envoi validé : seul un administrateur peut le modifier.';
    end if;
    if (new.validation, new.valide_par, new.valide_at) is distinct from (old.validation, old.valide_par, old.valide_at) then
      raise exception 'Seul un administrateur peut valider un envoi.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_expedition_guard on expeditions;
create trigger trg_expedition_guard before insert or update on expeditions
  for each row execute function public.expedition_guard();

-- 3. Droits : opérateur = envoi non validé et 48 h après la création ; administrateur = à tout moment
--    On remplace TOUTES les règles d'écriture des envois et de leurs lignes (les règles de lecture sont conservées),
--    pour qu'aucune ancienne règle ne permette de modifier un envoi validé.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('expeditions', 'lignes_expedition') and cmd <> 'SELECT' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- lecture par les opérateurs (au cas où une ancienne règle « tout » la fournissait)
drop policy if exists "lecture operateurs expeditions v22" on expeditions;
create policy "lecture operateurs expeditions v22" on expeditions for select to authenticated using (is_operator());
drop policy if exists "lecture operateurs lignes v22" on lignes_expedition;
create policy "lecture operateurs lignes v22" on lignes_expedition for select to authenticated using (is_operator());

create policy "insertion expeditions operateurs" on expeditions
  for insert to authenticated with check (is_operator());

drop policy if exists "modification expeditions 48h" on expeditions;
create policy "modification expeditions 48h" on expeditions
  for update to authenticated
  using (is_operator() and (is_admin() or (validation <> 'VALIDE' and now() - created_at < interval '48 hours')))
  with check (is_operator());

drop policy if exists "suppression expeditions 48h" on expeditions;
create policy "suppression expeditions 48h" on expeditions
  for delete to authenticated
  using (is_operator() and (is_admin() or (validation <> 'VALIDE' and now() - created_at < interval '48 hours')));

drop policy if exists "insertion lignes operateurs" on lignes_expedition;
create policy "insertion lignes operateurs" on lignes_expedition
  for insert to authenticated
  with check (is_operator() and exists (select 1 from expeditions e where e.id = expedition_id
              and (is_admin() or (e.validation <> 'VALIDE' and now() - e.created_at < interval '48 hours'))));

drop policy if exists "modification lignes 48h" on lignes_expedition;
create policy "modification lignes 48h" on lignes_expedition
  for update to authenticated
  using (is_operator() and exists (select 1 from expeditions e where e.id = expedition_id
         and (is_admin() or (e.validation <> 'VALIDE' and now() - e.created_at < interval '48 hours'))))
  with check (is_operator() and exists (select 1 from expeditions e where e.id = expedition_id
              and (is_admin() or (e.validation <> 'VALIDE' and now() - e.created_at < interval '48 hours'))));

drop policy if exists "suppression lignes 48h" on lignes_expedition;
create policy "suppression lignes 48h" on lignes_expedition
  for delete to authenticated
  using (is_operator() and exists (select 1 from expeditions e where e.id = expedition_id
         and (is_admin() or (e.validation <> 'VALIDE' and now() - e.created_at < interval '48 hours'))));

-- 4. Validation par un administrateur
create or replace function public.valider_expedition(p_id uuid, p_valide boolean default true)
returns void language plpgsql security invoker as $$
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut valider un envoi.';
  end if;
  update public.expeditions
     set validation = case when p_valide then 'VALIDE' else 'A_VALIDER' end,
         valide_par = case when p_valide then public.get_username() else '' end,
         valide_at = case when p_valide then now() else null end
   where id = p_id;
  if not found then raise exception 'Envoi introuvable.'; end if;
end $$;
grant execute on function public.valider_expedition(uuid, boolean) to authenticated;

create or replace function public.valider_toutes_expeditions()
returns int language plpgsql security invoker as $$
declare n int;
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut valider un envoi.';
  end if;
  update public.expeditions
     set validation = 'VALIDE', valide_par = public.get_username(), valide_at = now()
   where validation = 'A_VALIDER';
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.valider_toutes_expeditions() to authenticated;

-- 5. Sauvegarde d'un envoi (la règle de 08h30 de la v21 est supprimée ; un envoi validé est verrouillé)
create or replace function public.save_expedition(
  p_id uuid, p_date_envoi date, p_numero_bl text, p_transporteur text, p_observations text, p_items jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_num text; v_year text; v_max int;
begin
  -- colisage validé obligatoire pour les lots de production
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    join public.production p on p.id = nullif(x->>'production_id', '')::uuid
    where not p.colisage_valide
  ) then
    raise exception 'Colisage non validé : validez d''abord le colisage du lot de production (page Colisage).';
  end if;

  -- quantité demandée <= reste du lot (tous les autres envois sont comptés, validés ou non : ils réservent la quantité)
  if exists (
    select 1
      from (select nullif(x->>'production_id', '')::uuid as pid,
                   sum(coalesce(nullif(regexp_replace(coalesce(x->>'quantite', ''), '[^0-9]', '', 'g'), '')::int, 0)) as q
              from jsonb_array_elements(p_items) x
             where coalesce(x->>'production_id', '') <> ''
             group by 1) s
      join public.production p on p.id = s.pid
     where s.q + coalesce((select sum(coalesce(nullif(regexp_replace(coalesce(l.quantite, ''), '[^0-9]', '', 'g'), '')::int, 0))
                             from public.lignes_expedition l
                            where l.production_id = p.id and l.expedition_id is distinct from p_id), 0) > p.quantite_produite
  ) then
    raise exception 'Quantité supérieure au reste à expédier d''un lot de production.';
  end if;

  if p_id is null then
    if public.is_admin() then
      v_num := nullif(trim(coalesce(p_numero_bl, '')), '');
    else
      perform pg_advisory_xact_lock(hashtext('logitrak_numero_envoi'));
      v_year := to_char(p_date_envoi, 'YYYY');
      select coalesce(max((substring(numero_bl from ('^ENV' || v_year || '([0-9]+)$')))::int), 0)
        into v_max from public.expeditions where numero_bl ~ ('^ENV' || v_year || '[0-9]+$');
      v_num := 'ENV' || v_year || lpad((v_max + 1)::text, 3, '0');
    end if;
    insert into public.expeditions (date_envoi, numero_bl, transporteur, observations)
    values (p_date_envoi, v_num, p_transporteur, p_observations) returning id into v_id;
  else
    if not exists (select 1 from public.expeditions where id = p_id
                   and (public.is_admin() or (validation <> 'VALIDE' and now() - created_at < interval '48 hours'))) then
      raise exception 'Modification impossible : envoi validé, délai de 48h dépassé ou accès refusé.';
    end if;
    select numero_bl into v_num from public.expeditions where id = p_id;
    if public.is_admin() then
      v_num := coalesce(nullif(trim(coalesce(p_numero_bl, '')), ''), v_num);
    end if;
    update public.expeditions
       set date_envoi = p_date_envoi, numero_bl = v_num, transporteur = p_transporteur,
           observations = p_observations, updated_at = now()
     where id = p_id returning id into v_id;
    delete from public.lignes_expedition where expedition_id = v_id;
  end if;

  insert into public.lignes_expedition (expedition_id, reference, categorie, designation, destinataire, unite, quantite, cartons,
                                        production_id, type_carton, poids_carton, of_numero, colisage_detail)
  select v_id,
         coalesce(x->>'reference', ''),
         coalesce(x->>'categorie', ''),
         coalesce(x->>'designation', ''),
         coalesce(x->>'destinataire', 'STOCK'),
         coalesce(x->>'unite', 'UN'),
         coalesce(x->>'quantite', '0'),
         coalesce((x->>'cartons')::int, 1),
         nullif(x->>'production_id', '')::uuid,
         coalesce(x->>'type_carton', ''),
         coalesce(nullif(x->>'poids_carton', '')::numeric, 0),
         coalesce(x->>'of_numero', ''),
         coalesce(x->'colisage_detail', '{}'::jsonb)
  from jsonb_array_elements(p_items) x;

  return v_id;
end; $$;
