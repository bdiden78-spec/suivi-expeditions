-- Activer l'extension cryptographique nécessaire pour les mots de passe
create extension if not exists pgcrypto;

-- Installation non destructive : ne jamais supprimer les tables existantes.
-- Pour une remise à zéro volontaire, effectuer une procédure séparée après sauvegarde.

-- 1. Tables
create table if not exists expeditions (
  id uuid primary key default gen_random_uuid(),
  date_envoi date not null,
  numero_bl text,
  transporteur text not null default 'AUTRE',
  observations text default '',
  statut text not null default 'Expédié',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lignes_expedition (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references expeditions(id) on delete cascade,
  reference text default '',
  designation text default '',
  destinataire text not null default 'STOCK',
  unite text not null default 'UN',
  quantite text not null default '0',
  cartons int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists operateurs (
  username text primary key check (username = lower(username)),
  role text not null default 'operateur' check (role in ('admin', 'operateur')),
  created_at timestamptz not null default now()
);

-- 2. Fonctions d'autorisation
create or replace function get_username() returns text
language sql security definer set search_path = public stable as
$$ select split_part(lower(auth.jwt() ->> 'email'), '@', 1) $$;

create or replace function is_operator() returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from operateurs where username = get_username()) $$;

create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from operateurs where username = get_username() and role = 'admin') $$;

-- 3. RLS (Sécurité)
alter table expeditions enable row level security;
alter table lignes_expedition enable row level security;
alter table operateurs enable row level security;

-- Politiques idempotentes : lecture réservée aux opérateurs authentifiés.
-- Les anciennes politiques publiques sont supprimées avant leur remplacement.
drop policy if exists "lecture publique" on expeditions;
drop policy if exists "lecture operateurs expeditions" on expeditions;
drop policy if exists "ecriture operateurs 48h" on expeditions;
drop policy if exists "lecture publique" on lignes_expedition;
drop policy if exists "lecture operateurs lignes" on lignes_expedition;
drop policy if exists "ecriture operateurs 48h lignes" on lignes_expedition;
drop policy if exists "lecture operateurs" on operateurs;
drop policy if exists "insertion operateurs expeditions" on expeditions;
drop policy if exists "modification expeditions 48h" on expeditions;
drop policy if exists "suppression expeditions 48h" on expeditions;
drop policy if exists "insertion lignes operateurs" on lignes_expedition;
drop policy if exists "modification lignes 48h" on lignes_expedition;
drop policy if exists "suppression lignes 48h" on lignes_expedition;

create policy "lecture operateurs expeditions" on expeditions
  for select to authenticated using (is_operator());
create policy "lecture operateurs lignes" on lignes_expedition
  for select to authenticated using (is_operator());
create policy "lecture operateurs" on operateurs
  for select to authenticated using (is_operator());

-- Les opérateurs peuvent créer des envois et modifier/supprimer les leurs pendant 48 h.
-- Les administrateurs disposent d'un accès sans limite de temps.
create policy "insertion operateurs expeditions" on expeditions
  for insert to authenticated with check (is_operator());
create policy "modification expeditions 48h" on expeditions
  for update to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '48 hours'))
  with check (is_operator() and (is_admin() or now() - created_at < interval '48 hours'));
create policy "suppression expeditions 48h" on expeditions
  for delete to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '48 hours'));

create policy "insertion lignes operateurs" on lignes_expedition
  for insert to authenticated with check (is_operator() and exists (
    select 1 from expeditions e where e.id = expedition_id
      and (is_admin() or now() - e.created_at < interval '48 hours')
  ));
create policy "modification lignes 48h" on lignes_expedition
  for update to authenticated
  using (is_operator() and exists (
    select 1 from expeditions e where e.id = expedition_id
      and (is_admin() or now() - e.created_at < interval '48 hours')
  ))
  with check (is_operator() and exists (
    select 1 from expeditions e where e.id = expedition_id
      and (is_admin() or now() - e.created_at < interval '48 hours')
  ));
create policy "suppression lignes 48h" on lignes_expedition
  for delete to authenticated
  using (is_operator() and exists (
    select 1 from expeditions e where e.id = expedition_id
      and (is_admin() or now() - e.created_at < interval '48 hours')
  ));

-- 4. RPC : Création de compte par l'Admin
create or replace function create_operator(p_username text, p_password text, p_role text)
returns void language plpgsql security definer as $$
declare
  v_email text := lower(p_username) || '@logitrak.internal';
  v_user_id uuid := gen_random_uuid();
begin
  if not is_admin() then raise exception 'Accès refusé : réservé aux administrateurs'; end if;
  if exists (select 1 from operateurs where username = lower(p_username)) then
    raise exception 'Ce pseudo existe déjà';
  end if;

  -- Création dans auth.users
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', v_email, crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', '', '', '', '');

  -- Création dans auth.identities (nécessaire pour la connexion)
  insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_user_id, json_build_object('sub', v_user_id::text, 'email', v_email)::jsonb, 'email', now(), now(), now());

  -- Attribution du rôle
  insert into operateurs (username, role) values (lower(p_username), p_role);
end; $$;

-- 5. RPC : Sauvegarde transactionnelle
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

  insert into lignes_expedition (expedition_id, reference, designation, destinataire, unite, quantite, cartons)
  select v_id, coalesce(x->>'reference', ''), coalesce(x->>'designation', ''), coalesce(x->>'destinataire', 'STOCK'), coalesce(x->>'unite', 'UN'), coalesce(x->>'quantite', '0'), coalesce((x->>'cartons')::int, 1)
  from jsonb_array_elements(p_items) x;

  return v_id;
end; $$;

-- 6. Création du premier compte Admin 
-- ⚠️ IMPORTANT : Connectez-vous d'abord avec un compte existant ou créez-en un manuellement 
-- (email: admin@logitrak.internal / mdp: motdepasse) via le dashboard Supabase (Authentication > Users),
-- puis exécutez cette requête :
insert into operateurs (username, role) values ('admin', 'admin') on conflict (username) do update set role = 'admin';

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

drop trigger if exists protect_expeditions_created_at on expeditions;
create trigger protect_expeditions_created_at before update on expeditions
for each row execute function public.prevent_created_at_reset();

drop trigger if exists protect_production_created_at on production;
create trigger protect_production_created_at before update on production
for each row execute function public.prevent_created_at_reset();
