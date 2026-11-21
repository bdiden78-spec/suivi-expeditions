-- ==========================================================
-- LogiTrak v5.1.0 : Plaques de Découpe, Bobines Mères & Calcul de Drops
-- Eurequat Algérie — Usine de Tlemcen
-- ==========================================================

begin;

-- 1. Table des Plaques de Découpe (Outillage de Façonnage)
create table if not exists public.plaques_decoupe (
  id uuid primary key default gen_random_uuid(),
  code_plaque text not null unique,
  nom_outil text not null default '',
  largeur_etiquette numeric(10,2) not null check (largeur_etiquette > 0),
  hauteur_etiquette numeric(10,2) not null check (hauteur_etiquette > 0),
  nb_poses_front int not null default 1 check (nb_poses_front > 0),
  entre_pose_frontale numeric(10,2) not null default 3.0,
  entre_pose_avance numeric(10,2) not null default 3.0,
  developpement_z int default 0,
  forme text not null default 'RECTANGLE' check (forme in ('RECTANGLE', 'ROND', 'OVALE', 'SPECIAL')),
  rayon_angle numeric(5,2) default 2.0,
  references_liees text[] not null default array[]::text[],
  machine_preferee text default '',
  emplacement_rack text default '',
  statut text not null default 'EN_SERVICE' check (statut in ('EN_SERVICE', 'AFFUTAGE', 'USURE', 'REFORME')),
  compteur_tours int default 0,
  observations text default '',
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plaques_decoupe enable row level security;
grant select, insert, update, delete on public.plaques_decoupe to authenticated;

drop policy if exists "lecture operateurs plaques_decoupe" on public.plaques_decoupe;
create policy "lecture operateurs plaques_decoupe" on public.plaques_decoupe for select to authenticated using (public.is_operator());
drop policy if exists "ajout operateurs plaques_decoupe" on public.plaques_decoupe;
create policy "ajout operateurs plaques_decoupe" on public.plaques_decoupe for insert to authenticated with check (public.is_operator());
drop policy if exists "modif operateurs plaques_decoupe" on public.plaques_decoupe;
create policy "modif operateurs plaques_decoupe" on public.plaques_decoupe for update to authenticated using (public.is_operator());
drop policy if exists "suppression admin plaques_decoupe" on public.plaques_decoupe;
create policy "suppression admin plaques_decoupe" on public.plaques_decoupe for delete to authenticated using (public.is_admin());


-- 2. Table des Bobines Mères (Jumbos / Matières Premières en Amont)
create table if not exists public.bobines_meres (
  id uuid primary key default gen_random_uuid(),
  numero_bobine text not null unique,
  fournisseur text not null default '',
  matiere text not null,
  reference_fournisseur text default '',
  laize_mm numeric(10,2) not null check (laize_mm > 0),
  lineaire_initial_m numeric(10,2) not null check (lineaire_initial_m > 0),
  lineaire_restant_m numeric(10,2) not null check (lineaire_restant_m >= 0),
  grammage_g_m2 numeric(10,2) default 0,
  poids_kg numeric(10,2) default 0,
  emplacement text default '',
  date_reception date not null default current_date,
  statut text not null default 'DISPONIBLE' check (statut in ('DISPONIBLE', 'EN_COURS', 'EPUISEE', 'REBUT')),
  observations text default '',
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bobines_meres enable row level security;
grant select, insert, update, delete on public.bobines_meres to authenticated;

drop policy if exists "lecture operateurs bobines_meres" on public.bobines_meres;
create policy "lecture operateurs bobines_meres" on public.bobines_meres for select to authenticated using (public.is_operator());
drop policy if exists "ajout operateurs bobines_meres" on public.bobines_meres;
create policy "ajout operateurs bobines_meres" on public.bobines_meres for insert to authenticated with check (public.is_operator());
drop policy if exists "modif operateurs bobines_meres" on public.bobines_meres;
create policy "modif operateurs bobines_meres" on public.bobines_meres for update to authenticated using (public.is_operator());
drop policy if exists "suppression admin bobines_meres" on public.bobines_meres;
create policy "suppression admin bobines_meres" on public.bobines_meres for delete to authenticated using (public.is_admin());


-- 3. Colonnes d'intégration dans la table production (Liaison Outillage, Drops & Matière)
alter table public.production add column if not exists plaque_id uuid references public.plaques_decoupe(id) on delete set null;
alter table public.production add column if not exists bobine_mere_id uuid references public.bobines_meres(id) on delete set null;
alter table public.production add column if not exists nb_poses_front int default 1;
alter table public.production add column if not exists bobines_par_drop int default 1;
alter table public.production add column if not exists nb_drops int default 0;
alter table public.production add column if not exists lineaire_par_bobine_m numeric(10,2) default 0;
alter table public.production add column if not exists lineaire_total_consomme_m numeric(10,2) default 0;
alter table public.production add column if not exists gache_pourcent numeric(5,2) default 3.0;


-- 4. Fonction RPC pour déduire le métrage linéaire consommé d'une bobine mère
create or replace function public.deduire_lineaire_bobine_mere(
  p_bobine_id uuid,
  p_metres numeric
) returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_restant numeric;
  v_nouveau numeric;
begin
  if not public.is_operator() then raise exception 'Accès opérateur requis.'; end if;
  
  select lineaire_restant_m into v_restant
    from public.bobines_meres
   where id = p_bobine_id
     for update;
     
  if not found then raise exception 'Bobine mère introuvable.'; end if;
  
  v_nouveau := greatest(0, round((v_restant - coalesce(p_metres, 0))::numeric, 2));
  
  update public.bobines_meres
     set lineaire_restant_m = v_nouveau,
         statut = case when v_nouveau <= 0 then 'EPUISEE' else 'EN_COURS' end,
         updated_at = now()
   where id = p_bobine_id;
   
  return v_nouveau;
end; $$;

revoke execute on function public.deduire_lineaire_bobine_mere(uuid, numeric) from public, anon;
grant execute on function public.deduire_lineaire_bobine_mere(uuid, numeric) to authenticated;


-- 5. Exemples de plaques d'outillage usine courantes
insert into public.plaques_decoupe (code_plaque, nom_outil, largeur_etiquette, hauteur_etiquette, nb_poses_front, entre_pose_frontale, entre_pose_avance, references_liees, machine_preferee, emplacement_rack)
values
  ('PLQ-100x150-1P', 'Découpe Logistique 100x150 (1 pose)', 100, 150, 1, 3.0, 3.0, array['ETQ100X150', 'E02CW25P1'], 'DÉCOUPEUSE 01', 'Râtelier A-01'),
  ('PLQ-85x54-2P',   'Découpe Algérie Poste 85x54 (2 poses)', 85, 54, 2, 3.0, 3.0, array['E02CW25P1', 'AP-N-RR', 'AP-N-CP'], 'ROTATIVE 01', 'Râtelier A-04'),
  ('PLQ-85x36-3P',   'Découpe Grand Compte 85x36 (3 poses)', 85, 36, 3, 3.0, 3.0, array['E02CV25P1', 'AP-N-GC'], 'ROTATIVE 01', 'Râtelier A-05'),
  ('PLQ-50x25-4P',   'Découpe Code-Barres 50x25 (4 poses)',  50, 25, 4, 2.5, 3.0, array['ETQ50X25', 'GEN-50X25'], 'DÉCOUPEUSE 02', 'Râtelier B-02'),
  ('PLQ-58x43-3P',   'Découpe Poids/Prix 58x43 (3 poses)',   58, 43, 3, 3.0, 3.0, array['ETQ58X43'], 'DÉCOUPEUSE 01', 'Râtelier B-06')
on conflict (code_plaque) do nothing;


-- 6. Exemples de bobines mères (Jumbos) en stock
insert into public.bobines_meres (numero_bobine, fournisseur, matiere, laize_mm, lineaire_initial_m, lineaire_restant_m, grammage_g_m2, emplacement, statut)
values
  ('JMB2611-001', 'RAFLATAC', 'THERMIQUE ECO', 330, 4000, 3850, 75, 'Allée Matière A-01', 'DISPONIBLE'),
  ('JMB2611-002', 'AVERY FASSON', 'THERMIQUE TOP', 250, 3000, 3000, 80, 'Allée Matière A-02', 'DISPONIBLE'),
  ('JMB2611-003', 'RAFLATAC', 'VELIN COUCHE', 500, 5000, 4200, 80, 'Allée Matière B-01', 'DISPONIBLE'),
  ('JMB2611-004', 'RICOH', 'POLYPROPYLENE PP BLANC', 330, 2500, 2500, 60, 'Allée Matière C-01', 'DISPONIBLE')
on conflict (numero_bobine) do nothing;

notify pgrst, 'reload schema';
commit;
