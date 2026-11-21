-- ==========================================================
-- LogiTrak v4.0.27 : GESTION DU STOCK, RÉCEPTIONS EXTERNES & RETOURS
-- Permet la gestion du stock de production, la traçabilité des produits
-- reçus d'ailleurs ou retournés par les clients, et leur réexpédition
-- depuis l'usine de Tlemcen.
-- ==========================================================

begin;

-- 1. Table des Réceptions Externes & Retours Produits
create table if not exists public.receptions_externes (
  id uuid primary key default gen_random_uuid(),
  numero_reception text not null,                       -- ex: REC2602-0001 ou RET2602-0001
  type_entree text not null default 'RECEPTION'         -- 'RECEPTION' (Produit d'ailleurs) ou 'RETOUR' (Retour client)
    check (type_entree in ('RECEPTION', 'RETOUR')),
  provenance text not null default '',                  -- Fournisseur, client ou site externe d'origine
  reference text not null default '',
  designation text default '',
  categorie text default '',
  unite text not null default 'UN',
  quantite_recue int not null check (quantite_recue > 0),
  cartons int not null default 1 check (cartons >= 0),
  type_carton text default 'H2',
  client_destinataire text default 'STOCK',             -- Client prévu pour réexpédition ou STOCK
  motif text default '',                                -- Motif du retour ou motif de réception
  observations text default '',
  date_reception date not null default current_date,
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Colonne dans lignes_expedition pour lier les expéditions de réceptions/retours
alter table public.lignes_expedition add column if not exists reception_id uuid references public.receptions_externes(id) on delete set null;

-- Index pour des recherches rapides
create index if not exists idx_receptions_ref on public.receptions_externes(upper(reference));
create index if not exists idx_receptions_date on public.receptions_externes(date_reception);
create index if not exists idx_lignes_reception on public.lignes_expedition(reception_id) where reception_id is not null;

-- 2. Sécurité RLS (Row Level Security)
alter table public.receptions_externes enable row level security;
revoke all on public.receptions_externes from public, anon;
grant select, insert, update, delete on public.receptions_externes to authenticated;

drop policy if exists "lecture operateurs receptions" on public.receptions_externes;
create policy "lecture operateurs receptions" on public.receptions_externes
  for select to authenticated using (is_operator());

drop policy if exists "insertion operateurs receptions" on public.receptions_externes;
create policy "insertion operateurs receptions" on public.receptions_externes
  for insert to authenticated with check (is_operator());

drop policy if exists "modification operateurs receptions 24h" on public.receptions_externes;
create policy "modification operateurs receptions 24h" on public.receptions_externes
  for update to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '24 hours'))
  with check (is_operator());

drop policy if exists "suppression operateurs receptions 24h" on public.receptions_externes;
create policy "suppression operateurs receptions 24h" on public.receptions_externes
  for delete to authenticated
  using (is_operator() and (is_admin() or now() - created_at < interval '24 hours'));

-- 3. Trigger d'audit created_by
create or replace function public.reception_created_by_trg()
returns trigger language plpgsql as $$
begin
  if new.created_by is null or new.created_by = '' then
    new.created_by := coalesce(public.get_username(), 'operateur');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_reception_created_by on public.receptions_externes;
create trigger trg_reception_created_by
  before insert or update on public.receptions_externes
  for each row execute function public.reception_created_by_trg();

-- 4. Trigger automatique sur lignes_expedition pour peupler reception_id depuis colisage_detail
create or replace function public.lignes_expedition_reception_trg()
returns trigger language plpgsql as $$
begin
  if new.reception_id is null and new.colisage_detail ? 'reception_id' then
    new.reception_id := nullif(new.colisage_detail->>'reception_id', '')::uuid;
  end if;
  return new;
end $$;

drop trigger if exists trg_lignes_expedition_reception on public.lignes_expedition;
create trigger trg_lignes_expedition_reception
  before insert or update on public.lignes_expedition
  for each row execute function public.lignes_expedition_reception_trg();

notify pgrst, 'reload schema';
commit;
