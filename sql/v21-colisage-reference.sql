-- ==========================================================
-- LogiTrak v21 : colisage par RÉFÉRENCE, décision du reliquat,
-- envois validés à partir de 08h30, contrôles renforcés.
--
-- À exécuter UNE fois dans Supabase > SQL Editor (bouton Run),
-- APRÈS sql/setup.sql, sql/production.sql, sql/security-hardening.sql
-- et sql/v18-listes-et-verrous.sql (déjà exécutés pour la v20).
-- Ce script AJOUTE / MET À JOUR : il ne supprime AUCUNE donnée
-- et peut être relancé sans risque.
-- ==========================================================

-- 1. Fiches de colisage par référence (saisies par les opérateurs, indépendantes des lots)
create table if not exists colisage_ref (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  designation text default '',
  categorie text default '',
  type_produit text not null default 'ETIQUETTE',       -- ETIQUETTE, RUBAN, CARTE_PVC, AUTRE
  matiere text default '',
  gabarit text default '',                              -- dimensions de l'étiquette, ex. 65x120
  etq_par_bobine int default 0,                         -- étiquettes par bobine
  cartes_par_paquet int default 100,                    -- cartes PVC : 100, 50 ou 20
  mandrin text default '',
  poids_bobine numeric(10,3) default 0,                 -- poids d'une bobine (kg)
  diametre_bobine int default 0,                        -- diamètre d'une bobine (mm)
  type_carton text not null default 'H2',               -- H1, H2 (liste gérée par l'admin)
  qte_par_carton int not null default 1 check (qte_par_carton > 0),   -- bobines (ou unités, paquets) par carton plein
  poids_carton_vide numeric(10,3) default 0,            -- H1 = 0,420 kg ; H2 = 0,465 kg
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists colisage_ref_reference_uq on colisage_ref (upper(reference));

-- 2. Nouvelles colonnes de la production
alter table production add column if not exists gabarit text default '';
alter table production add column if not exists poids_bobine numeric(10,3) default 0;
alter table production add column if not exists diametre_bobine int default 0;
alter table production add column if not exists poids_carton_vide numeric(10,3) default 0;
alter table production add column if not exists colisage_ref_id uuid references colisage_ref(id) on delete set null;
alter table production add column if not exists colisage_at timestamptz;
-- Reliquat (bobines qui ne remplissent pas un carton) : décision de l'opérateur
alter table production add column if not exists reliquat_mode text default '';      -- '' (à décider), CARTON, STOCK
alter table production add column if not exists reliquat_carton text default '';    -- type de carton si CARTON
alter table production add column if not exists qte_reliquat int default 0;

-- 3. Les lignes d'envoi gardent une COPIE FIGÉE du colisage
alter table lignes_expedition add column if not exists colisage_detail jsonb default '{}'::jsonb;

-- 4. Reprise des données existantes (une seule fois par ligne concernée)
--    a) fiches par référence créées à partir des lots dont le colisage était validé
insert into colisage_ref (reference, designation, categorie, type_produit, matiere, gabarit, etq_par_bobine,
                          cartes_par_paquet, mandrin, type_carton, qte_par_carton, poids_carton_vide, created_by)
select distinct on (upper(reference))
       upper(reference), coalesce(designation, ''), coalesce(categorie, ''), coalesce(type_produit, 'ETIQUETTE'),
       coalesce(matiere, ''), coalesce(dim_produit, ''), coalesce(etq_par_bobine, 0), coalesce(cartes_par_paquet, 100),
       coalesce(mandrin, ''), coalesce(nullif(type_carton, ''), 'H2'), qte_par_carton,
       case upper(coalesce(type_carton, '')) when 'H1' then 0.420 when 'H2' then 0.465 else 0 end,
       coalesce(created_by, '')
  from production
 where colisage_valide and coalesce(reference, '') <> ''
 order by upper(reference), created_at desc
on conflict do nothing;

--    b) lots déjà validés : le reliquat garde le comportement de la v20 (placé dans un carton)
update production
   set reliquat_mode = 'CARTON',
       reliquat_carton = coalesce(nullif(type_carton_partiel, ''), type_carton, 'H2'),
       qte_reliquat = quantite_produite % qte_par_carton
 where colisage_valide and coalesce(reliquat_mode, '') = '' and qte_par_carton > 0
   and quantite_produite % qte_par_carton > 0;
update production set colisage_at = coalesce(updated_at, created_at) where colisage_valide and colisage_at is null;

-- 5. Sécurité des fiches de colisage : réservées aux opérateurs ; opérateur 48 h, admin à tout moment
alter table colisage_ref enable row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'colisage_ref' loop
    execute format('drop policy %I on public.colisage_ref', r.policyname);
  end loop;
end $$;
create policy "lecture operateurs colisage_ref" on colisage_ref
  for select to authenticated using (is_operator());
create policy "ajout operateurs colisage_ref" on colisage_ref
  for insert to authenticated with check (is_operator());
create policy "modif colisage_ref 48h" on colisage_ref
  for update to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '48 hours'))
  with check (is_operator());
create policy "suppression colisage_ref 48h" on colisage_ref
  for delete to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '48 hours'));

create or replace function public.colisage_ref_touch() returns trigger language plpgsql as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_colisage_ref_touch on colisage_ref;
create trigger trg_colisage_ref_touch before update on colisage_ref
  for each row execute function public.colisage_ref_touch();

-- 6. Production : règles de modification
--    Production (OF, référence, quantité...) : opérateur 48 h après la création du lot, admin à tout moment.
--    Colisage du lot : libre tant qu'il n'est pas validé, puis 48 h après sa validation ; admin à tout moment.
--    Reliquat : l'opérateur peut décider une première fois à tout moment, puis les règles du colisage s'appliquent.
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'production' loop
    execute format('drop policy %I on public.production', r.policyname);
  end loop;
end $$;
create policy "lecture operateurs production" on production
  for select to authenticated using (is_operator());
create policy "ajout operateurs production" on production
  for insert to authenticated with check (is_operator());
create policy "modif production" on production
  for update to authenticated
  using (is_operator() and (is_admin()
         or now() - created_at < interval '48 hours'
         or not colisage_valide
         or coalesce(reliquat_mode, '') = ''
         or now() - coalesce(colisage_at, created_at) < interval '48 hours'))
  with check (is_operator());
create policy "suppression production 48h" on production
  for delete to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '48 hours'));

create or replace function production_guard() returns trigger language plpgsql as $$
declare
  colis_changed boolean;
  core_changed boolean;
  reliq_changed boolean;
begin
  colis_changed := (new.qte_par_carton, new.type_carton, new.poids_carton, new.type_carton_partiel, new.qte_carton_partiel,
                    new.nb_cartons_total, new.etq_par_bobine, new.mandrin, new.matiere, new.dim_produit, new.gabarit,
                    new.cartes_par_paquet, new.poids_bobine, new.diametre_bobine, new.poids_carton_vide,
                    new.colisage_valide, new.colisage_ref_id, new.observations)
         is distinct from
                   (old.qte_par_carton, old.type_carton, old.poids_carton, old.type_carton_partiel, old.qte_carton_partiel,
                    old.nb_cartons_total, old.etq_par_bobine, old.mandrin, old.matiere, old.dim_produit, old.gabarit,
                    old.cartes_par_paquet, old.poids_bobine, old.diametre_bobine, old.poids_carton_vide,
                    old.colisage_valide, old.colisage_ref_id, old.observations);
  reliq_changed := (new.reliquat_mode, new.reliquat_carton, new.qte_reliquat)
         is distinct from (old.reliquat_mode, old.reliquat_carton, old.qte_reliquat);
  core_changed := (new.of_numero, new.reference, new.categorie, new.designation, new.type_produit, new.unite,
                   new.quantite_produite, new.date_production)
         is distinct from
                  (old.of_numero, old.reference, old.categorie, old.designation, old.type_produit, old.unite,
                   old.quantite_produite, old.date_production);

  -- modifications faites directement depuis Supabase (SQL Editor, service) : aucune restriction
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    new.updated_at := now();
    return new;
  end if;

  if not is_admin() then
    if core_changed and now() - old.created_at >= interval '48 hours' then
      raise exception 'Modification impossible : délai de 48h dépassé (seul un administrateur peut modifier la production).';
    end if;
    if colis_changed and coalesce(old.colisage_valide, false)
       and now() - coalesce(old.colisage_at, old.created_at) >= interval '48 hours' then
      raise exception 'Colisage verrouillé : délai de 48h dépassé (seul un administrateur peut le modifier).';
    end if;
    if reliq_changed and coalesce(old.reliquat_mode, '') <> ''
       and now() - coalesce(old.colisage_at, old.created_at) >= interval '48 hours' then
      raise exception 'Décision du reliquat verrouillée : délai de 48h dépassé (seul un administrateur peut la modifier).';
    end if;
  end if;

  if new.colisage_valide and (colis_changed or not coalesce(old.colisage_valide, false)) then
    new.colisage_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_production_guard on production;
create trigger trg_production_guard before update on production
  for each row execute function production_guard();

-- 7. Propage une fiche de colisage aux lots de la même référence dont le colisage n'est pas encore validé
create or replace function public.apply_colisage_ref(p_reference text)
returns int language plpgsql security definer set search_path = public as $$
declare c colisage_ref%rowtype; n int;
begin
  if not public.is_operator() then raise exception 'Réservé aux opérateurs.'; end if;
  select * into c from colisage_ref where upper(reference) = upper(p_reference);
  if not found then return 0; end if;
  update production p
     set matiere = c.matiere, mandrin = c.mandrin, etq_par_bobine = c.etq_par_bobine,
         cartes_par_paquet = c.cartes_par_paquet, dim_produit = c.gabarit, gabarit = c.gabarit,
         poids_bobine = c.poids_bobine, diametre_bobine = c.diametre_bobine,
         type_carton = c.type_carton, qte_par_carton = c.qte_par_carton, poids_carton_vide = c.poids_carton_vide,
         poids_carton = round((c.poids_carton_vide + c.qte_par_carton * c.poids_bobine)::numeric, 3),
         nb_cartons_total = p.quantite_produite / c.qte_par_carton + (case when p.quantite_produite % c.qte_par_carton > 0 then 1 else 0 end),
         type_carton_partiel = '', qte_carton_partiel = p.quantite_produite % c.qte_par_carton,
         type_produit = c.type_produit, colisage_valide = true, colisage_ref_id = c.id
   where upper(p.reference) = upper(p_reference) and not p.colisage_valide;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.apply_colisage_ref(text) to authenticated;

-- 8. Sauvegarde d'un envoi
--    - N° d'envoi verrouillé (comme la v18), numérotation protégée contre les créations simultanées
--    - un envoi n'est validé qu'à partir de 08h30 du jour indiqué (heure d'Alger) ; l'admin n'est pas soumis à cette règle
--    - refuse un lot dont le colisage n'est pas validé
--    - refuse une quantité supérieure au reste à expédier du lot
--    - enregistre la copie figée du colisage de chaque ligne
create or replace function public.save_expedition(
  p_id uuid, p_date_envoi date, p_numero_bl text, p_transporteur text, p_observations text, p_items jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_num text; v_year text; v_max int;
begin
  -- 08h30 du jour de l'envoi (heure d'Alger)
  if not public.is_admin() and (p_date_envoi + time '08:30') > (now() at time zone 'Africa/Algiers') then
    raise exception 'Un envoi ne peut être validé qu''à partir de 08h30 du jour indiqué (%).', to_char(p_date_envoi, 'DD/MM/YYYY');
  end if;

  -- colisage validé obligatoire pour les lots de production
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    join public.production p on p.id = nullif(x->>'production_id', '')::uuid
    where not p.colisage_valide
  ) then
    raise exception 'Colisage non validé : validez d''abord le colisage du lot de production (page Colisage).';
  end if;

  -- quantité demandée <= reste du lot (les autres envois sont comptés, celui qu'on modifie est exclu)
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
    if not exists (select 1 from public.expeditions where id = p_id and (public.is_admin() or now() - created_at < interval '48 hours')) then
      raise exception 'Modification impossible : délai de 48h dépassé ou accès refusé.';
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
