-- LogiTrak Eurequat — à exécuter UNE fois dans Supabase > SQL Editor.
-- 1) Remplacez VOTRE-EMAIL@exemple.com (en minuscules) à la dernière ligne par votre adresse.

-- Table des personnes autorisées à modifier
create table if not exists operateurs (
  email text primary key check (email = lower(email)),
  role text not null default 'operateur' check (role in ('admin', 'operateur')),
  created_at timestamptz not null default now()
);

create or replace function is_operator() returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from operateurs where email = lower(auth.jwt() ->> 'email')) $$;

create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from operateurs where email = lower(auth.jwt() ->> 'email') and role = 'admin') $$;

alter table expeditions enable row level security;
alter table lignes_expedition enable row level security;
alter table operateurs enable row level security;

-- Nettoyage d'éventuelles anciennes règles de même nom
drop policy if exists "lecture publique" on expeditions;
drop policy if exists "lecture publique" on lignes_expedition;
drop policy if exists "ecriture operateurs" on expeditions;
drop policy if exists "ecriture operateurs" on lignes_expedition;

-- Tout le monde (visiteurs) peut lire
create policy "lecture publique" on expeditions for select using (true);
create policy "lecture publique" on lignes_expedition for select using (true);

-- Seuls les opérateurs autorisés peuvent écrire
create policy "ecriture operateurs" on expeditions for all to authenticated using (is_operator()) with check (is_operator());
create policy "ecriture operateurs" on lignes_expedition for all to authenticated using (is_operator()) with check (is_operator());

-- Liste des opérateurs : chacun voit sa ligne, l'admin voit et gère tout
drop policy if exists "operateurs lecture" on operateurs;
drop policy if exists "operateurs admin" on operateurs;
create policy "operateurs lecture" on operateurs for select to authenticated using (email = lower(auth.jwt() ->> 'email') or is_admin());
create policy "operateurs admin" on operateurs for all to authenticated using (is_admin()) with check (is_admin());

-- Premier administrateur (vous)
insert into operateurs (email, role) values ('VOTRE-EMAIL@exemple.com', 'admin') on conflict (email) do update set role = 'admin';
