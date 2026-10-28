-- ==========================================================
-- LogiTrak : module PRODUCTION & COLISAGE (v2)
-- À exécuter dans Supabase > SQL Editor.
-- Ce script AJOUTE / MET À JOUR les éléments sans supprimer vos données.
-- ==========================================================

-- 1. Table des lots de production (saisis par les opérateurs)
create table if not exists production (
  id uuid primary key default gen_random_uuid(),
  of_numero text not null,                              -- ordre de fabrication
  reference text not null default '',
  categorie text default '',
  designation text default '',
  type_produit text not null default 'ETIQUETTE',       -- ETIQUETTE, RUBAN, CARTE_PVC
  unite text not null default 'BOBINE',                 -- BOBINE, UN, LOT, ID
  quantite_produite int not null check (quantite_produite > 0),
  qte_par_carton int not null default 1 check (qte_par_carton > 0),
  type_carton text default 'H2',                        -- ex : H2 (carton plein)
  type_carton_partiel text default 'H1',                -- ex : H1 (carton reliquat <= moitié)
  qte_carton_partiel int default 0,                     -- qté dans le dernier carton partiel
  nb_cartons_total int default 1,                       -- nombre total de cartons calculés (entier)
  poids_carton numeric(10,3) not null default 0,        -- poids d'un carton plein (kg)
  -- Champs techniques de colisage selon le produit :
  etq_par_bobine int default 0,                         -- Étiquettes : nb d'étiquettes / bobine
  mandrin text default '',                              -- Étiquettes / Rubans : ex 40mm, 76mm, 1 pouce
  matiere text default '',                              -- Étiquettes / Rubans / PVC : Thermique, Vélin, Cire, Résine, PVC...
  dim_produit text default '',                          -- Dimensions : ex 100x150, 110x300, 0.76mm
  cartes_par_paquet int default 100,                    -- Cartes PVC : 100, 50 ou 20 cartes / paquet
  colisage_valide boolean not null default false,       -- Indique si la fiche de colisage a été renseignée/validée
  observations text default '',
  date_production date not null default current_date,
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ajout des colonnes si la table production existait déjà (migration douce)
alter table production add column if not exists type_produit text not null default 'ETIQUETTE';
alter table production add column if not exists type_carton_partiel text default 'H1';
alter table production add column if not exists qte_carton_partiel int default 0;
alter table production add column if not exists nb_cartons_total int default 1;
alter table production add column if not exists etq_par_bobine int default 0;
alter table production add column if not exists mandrin text default '';
alter table production add column if not exists matiere text default '';
alter table production add column if not exists dim_produit text default '';
alter table production add column if not exists cartes_par_paquet int default 100;
alter table production add column if not exists colisage_valide boolean not null default false;
alter table production add column if not exists observations text default '';

-- 2. Sécurité : Mêmes conditions que les envois (Opérateur < 48h, Admin illimité)
alter table production enable row level security;

drop policy if exists "lecture operateurs production" on production;
drop policy if exists "lecture publique production" on production;
create policy "lecture publique production" on production
  for select using (true);

drop policy if exists "ajout operateurs production" on production;
drop policy if exists "modif operateurs production" on production;
drop policy if exists "suppression admin production" on production;
drop policy if exists "ecriture operateurs 48h production" on production;

create policy "ecriture operateurs 48h production" on production
  for all to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '48 hours'))
  with check (is_operator() and (is_admin() or now() - created_at < interval '48 hours'));

-- 3. Les lignes d'envoi gardent le lien complet avec la production et le colisage
alter table lignes_expedition add column if not exists categorie text default '';
alter table lignes_expedition add column if not exists production_id uuid references production(id) on delete set null;
alter table lignes_expedition add column if not exists type_carton text default '';
alter table lignes_expedition add column if not exists poids_carton numeric(10,3) default 0;
alter table lignes_expedition add column if not exists of_numero text default '';
create index if not exists idx_lignes_production on lignes_expedition(production_id);

-- 4. Sauvegarde d'un envoi (mise à jour : prend en compte la production et le colisage)
create or replace function save_expedition(
  p_id uuid, p_date_envoi date, p_numero_bl text, p_transporteur text, p_observations text, p_items jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid;
begin
  if p_id is null then
    insert into expeditions (date_envoi, numero_bl, transporteur, observations)
    values (p_date_envoi, p_numero_bl, p_transporteur, p_observations) returning id into v_id;
  else
    if not exists (select 1 from expeditions where id = p_id and (is_admin() or now() - created_at < interval '48 hours')) then
      raise exception 'Modification impossible : délai de 48h dépassé ou accès refusé.';
    end if;

    update expeditions set date_envoi = p_date_envoi, numero_bl = p_numero_bl, transporteur = p_transporteur, observations = p_observations, updated_at = now()
    where id = p_id returning id into v_id;

    delete from lignes_expedition where expedition_id = v_id;
  end if;

  insert into lignes_expedition (expedition_id, reference, categorie, designation, destinataire, unite, quantite, cartons, production_id, type_carton, poids_carton, of_numero)
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
         coalesce(x->>'of_numero', '')
  from jsonb_array_elements(p_items) x;

  return v_id;
end; $$;
