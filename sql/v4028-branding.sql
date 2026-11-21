-- ==========================================================
-- LogiTrak v4.0.28 — Identité Visuelle & Personnalisation (Logo, Slogan, Titre)
-- Permet à l'administrateur de personnaliser le logo, le slogan et le nom du site.
-- Accessible en lecture publique pour un rendu immédiat dès le chargement.
-- ==========================================================

create table if not exists public.parametres (
  cle text primary key,
  valeurs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.parametres enable row level security;

-- Valeur par défaut pour l'identité visuelle LogiTrak Eurequat Algérie
insert into public.parametres (cle, valeurs)
values (
  'app_branding',
  '{"logo_url":"assets/logitrak-eurequat.jpg","slogan":"Usine Tlemcen • Suivi d''expéditions","app_name":"LogiTrak"}'::jsonb
)
on conflict (cle) do nothing;

-- RLS : Lecture de la configuration d'identité visuelle autorisée pour tous (visiteurs + opérateurs)
drop policy if exists "lecture branding publique" on public.parametres;
create policy "lecture branding publique" on public.parametres
  for select to anon, authenticated
  using (cle = 'app_branding');

-- RLS : Seul l'administrateur peut modifier l'identité visuelle
-- (déjà couvert par les politiques admin de v18-listes-et-verrous.sql, rappel ici par sécurité)
drop policy if exists "modif app_branding admin" on public.parametres;
create policy "modif app_branding admin" on public.parametres
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
