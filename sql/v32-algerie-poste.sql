-- LogiTrak v3.2. Appliquer après les migrations v2.3.
begin;

create table if not exists public.ap_commandes (
  id uuid primary key default gen_random_uuid(),
  client text not null check (length(trim(client)) > 0),
  categorie text not null check (categorie in ('NATIONAL', 'INTERNATIONAL')),
  sous_categorie text not null check (length(trim(sous_categorie)) > 0),
  quantite_demandee integer not null check (quantite_demandee > 0),
  date_commande date not null default current_date,
  observations text not null default '',
  created_by text not null default public.get_username(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision uuid not null default gen_random_uuid()
);
create table if not exists public.ap_productions (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.ap_commandes(id) on delete cascade,
  date_production date not null default current_date,
  quantite_imprimee integer not null check (quantite_imprimee > 0),
  numero_debut text not null check (length(trim(numero_debut)) > 0),
  numero_fin text not null check (length(trim(numero_fin)) > 0),
  observations text not null default '',
  created_by text not null default public.get_username(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision uuid not null default gen_random_uuid()
);
create index if not exists ap_productions_commande_idx on public.ap_productions(commande_id);
alter table public.ap_commandes enable row level security;
alter table public.ap_productions enable row level security;
grant select, insert, update, delete on public.ap_commandes, public.ap_productions to authenticated;
revoke all on public.ap_commandes, public.ap_productions from anon;

do $$
declare t text;
begin
  foreach t in array array['ap_commandes','ap_productions'] loop
    execute format('drop policy if exists ap_lecture on public.%I', t);
    execute format('create policy ap_lecture on public.%I for select to authenticated using (public.is_operator())', t);
    execute format('drop policy if exists ap_ajout on public.%I', t);
    execute format('create policy ap_ajout on public.%I for insert to authenticated with check (public.is_operator())', t);
    execute format('drop policy if exists ap_modification on public.%I', t);
    execute format('create policy ap_modification on public.%I for update to authenticated using (public.is_operator() and (public.is_admin() or now() - created_at < interval ''48 hours'')) with check (public.is_operator())', t);
    execute format('drop policy if exists ap_suppression on public.%I', t);
    execute format('create policy ap_suppression on public.%I for delete to authenticated using (public.is_operator() and (public.is_admin() or now() - created_at < interval ''48 hours''))', t);
  end loop;
end $$;

create or replace function public.ap_revision_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.revision := gen_random_uuid();
    new.updated_at := now();
    if tg_table_name = 'ap_productions' and new.commande_id is distinct from old.commande_id then
      raise exception 'Une impression ne peut pas être déplacée vers une autre commande.';
    end if;
  else
    new.created_at := now();
    new.updated_at := now();
    new.created_by := public.get_username();
    new.revision := gen_random_uuid();
  end if;
  return new;
end $$;
drop trigger if exists ap_revision_guard on public.ap_commandes;
create trigger ap_revision_guard before insert or update on public.ap_commandes
  for each row execute function public.ap_revision_guard();
drop trigger if exists ap_revision_guard on public.ap_productions;
create trigger ap_revision_guard before insert or update on public.ap_productions
  for each row execute function public.ap_revision_guard();

-- Les plages numériques sont inclusives et doivent correspondre à la quantité.
-- Les plages alphanumériques sont conservées telles que saisies.
create or replace function public.ap_plage_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_first text;
  v_last text;
begin
  new.numero_debut := upper(trim(new.numero_debut));
  new.numero_fin := upper(trim(new.numero_fin));
  v_first := regexp_replace(new.numero_debut, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g');
  v_last := regexp_replace(new.numero_fin, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g');

  if v_first ~ '^[0-9]+$' and v_last ~ '^[0-9]+$' then
    if length(v_first) > 40 or length(v_last) > 40 then
      raise exception 'Numéro trop long (40 chiffres maximum).';
    end if;
    if v_last::numeric - v_first::numeric + 1 <> new.quantite_imprimee then
      raise exception 'La plage numérique inclusive doit correspondre à la quantité imprimée.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ap_plage_guard on public.ap_productions;
create trigger ap_plage_guard before insert or update on public.ap_productions
  for each row execute function public.ap_plage_guard();


-- Une nouvelle impression invalide aussi toute ancienne copie de la commande.
create or replace function public.ap_touch_commande() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.ap_commandes set revision = gen_random_uuid() where id = old.commande_id;
    return old;
  end if;
  update public.ap_commandes set revision = gen_random_uuid() where id = new.commande_id;
  return new;
end $$;
revoke execute on function public.ap_touch_commande() from public;
drop trigger if exists ap_touch_commande on public.ap_productions;
create trigger ap_touch_commande after insert or update or delete on public.ap_productions
  for each row execute function public.ap_touch_commande();

-- Permet à PostgREST de découvrir immédiatement les nouvelles tables.
notify pgrst, 'reload schema';
commit;
