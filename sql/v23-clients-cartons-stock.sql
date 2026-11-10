-- LogiTrak v2.3. Appliquer après v22-validation-envois.sql.
begin;

alter table public.production add column if not exists client text not null default '';

create table if not exists public.cartons_stock (
  id uuid primary key default gen_random_uuid(),
  type_carton text not null check (type_carton in ('H1', 'H2')),
  contenu jsonb not null check (jsonb_typeof(contenu) = 'object' and contenu <> '{}'::jsonb),
  expedition_id uuid references public.expeditions(id) on delete set null,
  created_at timestamptz not null default now(),
  revision uuid not null default gen_random_uuid()
);
alter table public.cartons_stock enable row level security;
revoke all on public.cartons_stock from public, anon, authenticated;
grant select on public.cartons_stock to authenticated;
drop policy if exists "lecture cartons stock" on public.cartons_stock;
create policy "lecture cartons stock" on public.cartons_stock for select to authenticated
  using (public.is_operator());

create or replace function public.save_carton_stock(
  p_id uuid, p_type text, p_contenu jsonb, p_revision uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_box public.cartons_stock%rowtype;
  v_lot public.production%rowtype;
  v_item record;
  v_other bigint;
  v_normal bigint;
  v_mixte bigint;
  v_reste int;
  v_poids numeric;
begin
  if not public.is_operator() then raise exception 'Accès opérateur requis.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('logitrak_stock_v23'));
  if p_id is not null then
    select * into v_box from public.cartons_stock where id = p_id for update;
    if not found or v_box.expedition_id is not null or v_box.revision is distinct from p_revision then
      raise exception 'Ce carton a changé ou a été expédié. Rechargez le stock.';
    end if;
    if p_contenu is null then
      delete from public.cartons_stock where id = p_id;
      return p_id;
    end if;
  end if;
  if p_type is null or p_type not in ('H1', 'H2') or
     jsonb_typeof(p_contenu) is distinct from 'object' or p_contenu = '{}'::jsonb then
    raise exception 'Choisissez un carton et au moins un reliquat.';
  end if;
  v_poids := case p_type when 'H1' then 0.420 else 0.465 end;
  for v_item in select key, value from jsonb_each_text(p_contenu) order by key loop
    if v_item.value is null or v_item.value !~ '^[1-9][0-9]{0,8}$' then raise exception 'Quantité invalide.'; end if;
    select * into v_lot from public.production where id = v_item.key::uuid for update;
    if not found or not v_lot.colisage_valide then raise exception 'Le lot doit avoir un colisage validé.'; end if;
    select coalesce(sum((b.contenu->>v_item.key)::int), 0) into v_other
      from public.cartons_stock b where b.expedition_id is null and b.id is distinct from p_id and b.contenu ? v_item.key;
    if v_item.key <> v_lot.id::text then raise exception 'Identifiant de lot invalide.'; end if;
    select coalesce(sum(q) filter (where not mixte), 0), coalesce(sum(q) filter (where mixte), 0)
      into v_normal, v_mixte
      from (select coalesce(nullif(regexp_replace(quantite, '[^0-9]', '', 'g'), '')::bigint, 0) q,
                   colisage_detail->>'mixte' is not distinct from 'true' as mixte
              from public.lignes_expedition where production_id = v_lot.id) l;
    v_reste := v_lot.quantite_produite % greatest(1, v_lot.qte_par_carton);
    if v_item.value::int + v_other + v_mixte + greatest(0, v_normal - (v_lot.quantite_produite - v_reste)) > v_reste then
      raise exception 'Reliquat disponible insuffisant pour % (%).', v_lot.reference, v_lot.of_numero;
    end if;
    v_poids := v_poids + v_item.value::int * coalesce(nullif(v_lot.poids_bobine, 0),
      greatest(0, v_lot.poids_carton - coalesce(nullif(v_lot.poids_carton_vide, 0),
        case v_lot.type_carton when 'H1' then 0.420 when 'H2' then 0.465 else 0 end)) / greatest(1, v_lot.qte_par_carton));
  end loop;
  if v_poids > 15 and not public.is_admin() then raise exception 'Le poids du carton dépasse 15 kg.'; end if;
  if p_id is null then
    insert into public.cartons_stock (type_carton, contenu) values (p_type, p_contenu) returning id into p_id;
  else
    update public.cartons_stock set type_carton = p_type, contenu = p_contenu, revision = gen_random_uuid() where id = p_id;
  end if;
  return p_id;
end $$;
revoke execute on function public.save_carton_stock(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.save_carton_stock(uuid, text, jsonb, uuid) to authenticated;

-- Garder les allocations intactes quand un lot est modifié.
create or replace function public.cartons_stock_production_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.quantite_produite >= old.quantite_produite
       and new.quantite_produite % greatest(1, new.qte_par_carton) = old.quantite_produite % greatest(1, old.qte_par_carton)
       and (new.qte_par_carton, new.colisage_valide, new.reference, new.unite, new.poids_bobine)
      is not distinct from
       (old.qte_par_carton, old.colisage_valide, old.reference, old.unite, old.poids_bobine)
    then return new; end if;
  end if;
  if exists (select 1 from public.cartons_stock where contenu ? old.id::text) then
    raise exception 'Ce lot est lié à un carton composé. Retirez son affectation avant cette opération.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists cartons_stock_production_guard on public.production;
create trigger cartons_stock_production_guard before update or delete on public.production
  for each row execute function public.cartons_stock_production_guard();

create or replace function public.production_guard() returns trigger language plpgsql as $$
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
                   new.quantite_produite, new.date_production, new.client)
         is distinct from
                  (old.of_numero, old.reference, old.categorie, old.designation, old.type_produit, old.unite,
                   old.quantite_produite, old.date_production, old.client);

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

create or replace function public.check_of_format()
returns trigger language plpgsql as $$
declare v_check boolean;
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then v_check := true;
  else v_check := new.of_numero is distinct from old.of_numero;
  end if;
  if v_check and coalesce(new.of_numero, '') !~ '^MO[0-9]{2}(0[1-9]|1[0-2])-[0-9]{4}$' then
    raise exception 'Ordre de fabrication invalide : format MOyymm-xxxx attendu (ex. MO2610-0000).';
  end if;
  return new;
end; $$;

create or replace function public.save_expedition(
  p_id uuid, p_date_envoi date, p_numero_bl text, p_transporteur text, p_observations text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_num text; v_year text; v_max int;
  v_box public.cartons_stock%rowtype;
  v_group record;
  v_cartons uuid[] := array[]::uuid[];
begin
  if not public.is_operator() then raise exception 'Accès opérateur requis.'; end if;
  perform pg_advisory_xact_lock(hashtext('logitrak_stock_v23'));
  if p_id is not null then
    perform 1 from public.expeditions
     where id = p_id and (public.is_admin() or (validation <> 'VALIDE' and now() - created_at < interval '48 hours'))
     for update;
    if not found then raise exception 'Modification impossible : envoi validé, délai de 48h dépassé ou accès refusé.'; end if;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Renseignez au moins un article.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce(x->>'quantite', '') !~ '^[1-9][0-9]{0,8}$') then
    raise exception 'Quantité invalide.';
  end if;

  for v_group in
    select (x->'colisage_detail'->>'stock_box_id')::uuid id,
           jsonb_object_agg(x->>'production_id', (x->>'quantite')::int) contenu,
           count(*) nb, count(distinct x->>'production_id') nb_lots,
           bool_and((x->'colisage_detail'->>'mixte') is not distinct from 'true') mixte,
           min(x->'colisage_detail'->>'carton_mixte') type_min,
           max(x->'colisage_detail'->>'carton_mixte') type_max,
           count(x->'colisage_detail'->>'carton_mixte') nb_types,
           count(distinct upper(coalesce(nullif(trim(x->>'destinataire'), ''), 'STOCK'))) nb_clients,
           sum((x->>'cartons')::int) nb_cartons
      from jsonb_array_elements(p_items) x
     where coalesce(x->'colisage_detail'->>'stock_box_id', '') <> ''
     group by 1
  loop
    select * into v_box from public.cartons_stock where id = v_group.id for update;
    if not found or (v_box.expedition_id is not null and v_box.expedition_id is distinct from p_id)
       or v_box.contenu is distinct from v_group.contenu or v_group.nb <> v_group.nb_lots
       or not v_group.mixte or v_group.type_min is distinct from v_box.type_carton
       or v_group.type_max is distinct from v_box.type_carton or v_group.nb_types <> v_group.nb
       or v_group.nb_clients <> 1 or v_group.nb_cartons is distinct from 1::bigint then
      raise exception 'Le contenu du carton en stock a changé ou ses lignes sont incomplètes. Réimportez le carton entier.';
    end if;
    v_cartons := array_append(v_cartons, v_box.id);
  end loop;

  -- Verrouiller les lots pendant le contrôle et l'écriture.
  perform p.id from public.production p
   where p.id in (select nullif(x->>'production_id', '')::uuid from jsonb_array_elements(p_items) x)
   order by p.id for update;

  -- colisage validé obligatoire pour les lots de production
  if not public.is_admin() and exists (
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
     where s.q + coalesce((
         select sum((b.contenu->>p.id::text)::int) from public.cartons_stock b
          where (b.expedition_id is null or b.expedition_id = p_id)
            and not (b.id = any(v_cartons)) and b.contenu ? p.id::text
       ), 0) + coalesce((select sum(coalesce(nullif(regexp_replace(coalesce(l.quantite, ''), '[^0-9]', '', 'g'), '')::int, 0))
                             from public.lignes_expedition l
                            where l.production_id = p.id and l.expedition_id is distinct from p_id), 0) > p.quantite_produite
      and (not public.is_admin() or s.q > coalesce((
        select sum(coalesce(nullif(regexp_replace(l.quantite, '[^0-9]', '', 'g'), '')::int, 0))
        from public.lignes_expedition l where l.production_id = p.id and l.expedition_id = p_id
      ), 0))
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

  update public.cartons_stock set expedition_id = null
   where expedition_id = v_id and not (id = any(v_cartons));
  update public.cartons_stock set expedition_id = v_id
   where id = any(v_cartons) and expedition_id is distinct from v_id;

  return v_id;
end; $$;

revoke execute on function public.save_expedition(uuid, date, text, text, text, jsonb) from public, anon;
grant execute on function public.save_expedition(uuid, date, text, text, text, jsonb) to authenticated;
-- Toutes les lignes sont écrites par save_expedition, avec leur réservation.
revoke insert, update, delete on public.lignes_expedition from anon, authenticated;

commit;
