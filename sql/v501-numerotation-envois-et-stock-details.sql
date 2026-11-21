-- ==========================================================
-- LogiTrak v5.0.0 / v5.0.1 : Numérotation Envois ENV2611-xxxx & Traçabilité Stock
-- ==========================================================

begin;

-- 1. Ajout de la colonne numero_lot sur production pour traçabilité future
alter table public.production add column if not exists numero_lot text default '';

-- 2. Mise à jour de tous les envois existants au format ENV{YY}{MM}-{XXXX}
-- Le calcul est séquentiel par mois d'expédition (date_envoi ou created_at)
with numbered as (
  select id,
         'ENV' || to_char(coalesce(date_envoi, (created_at at time zone 'Africa/Algiers')::date, current_date), 'YYMM') || '-' ||
         lpad(row_number() over (
           partition by to_char(coalesce(date_envoi, (created_at at time zone 'Africa/Algiers')::date, current_date), 'YYMM')
           order by coalesce(date_envoi, (created_at at time zone 'Africa/Algiers')::date, current_date) asc, created_at asc, id asc
         )::text, 4, '0') as new_num
    from public.expeditions
)
update public.expeditions e
   set numero_bl = n.new_num,
       updated_at = now()
  from numbered n
 where e.id = n.id;

-- 3. Mise à jour de la fonction save_expedition avec la numérotation ENV{YY}{MM}-{XXXX}
-- Protection stricte : seul l'administrateur peut modifier le numéro d'un envoi
create or replace function public.save_expedition(
  p_id uuid, p_date_envoi date, p_numero_bl text, p_transporteur text, p_observations text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_num text;
  v_prefix text;
  v_max int;
  v_box public.cartons_stock%rowtype;
  v_group record;
  v_cartons uuid[] := array[]::uuid[];
begin
  if not public.is_operator() then raise exception 'Accès opérateur requis.'; end if;
  perform pg_advisory_xact_lock(hashtext('logitrak_stock_v23'));

  if p_id is not null then
    perform 1 from public.expeditions
     where id = p_id and (public.is_admin() or (validation <> 'VALIDE' and now() - created_at < interval '24 hours'))
     for update;
    if not found then raise exception 'Modification impossible : envoi validé, délai de 24h dépassé ou accès refusé.'; end if;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Renseignez au moins un article.';
  end if;

  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce(x->>'quantite', '') !~ '^[1-9][0-9]{0,8}$') then
    raise exception 'Quantité invalide : chaque ligne doit avoir une quantité positive.';
  end if;

  -- Vérification et verrouillage des cartons physiques en stock (cartons mixtes)
  for v_group in
    select (x->'colisage_detail'->>'stock_box_id')::uuid id
      from jsonb_array_elements(p_items) x
     where coalesce(x->'colisage_detail'->>'stock_box_id', '') <> ''
     group by 1
  loop
    select * into v_box from public.cartons_stock where id = v_group.id for update;
    if not found or (v_box.expedition_id is not null and v_box.expedition_id is distinct from p_id) then
      raise exception 'Le carton en stock n''est plus disponible (déjà expédié ou supprimé).';
    end if;
    v_cartons := array_append(v_cartons, v_box.id);
  end loop;

  -- Verrouiller les lots de production concernés
  perform p.id from public.production p
   where p.id in (select nullif(x->>'production_id', '')::uuid from jsonb_array_elements(p_items) x)
   order by p.id for update;

  -- Vérification du colisage pour les lots de production (hors admin)
  if not public.is_admin() and exists (
    select 1 from jsonb_array_elements(p_items) x
    join public.production p on p.id = nullif(x->>'production_id', '')::uuid
    where not coalesce(p.colisage_valide, false)
  ) then
    raise exception 'Colisage non validé : validez d''abord le colisage du lot de production (page Colisage).';
  end if;

  -- Contrôle strict des quantités demandées vs solde disponible
  if exists (
    select 1
      from (select nullif(x->>'production_id', '')::uuid as pid,
                   sum(coalesce(nullif(regexp_replace(coalesce(x->>'quantite', ''), '[^0-9]', '', 'g'), '')::int, 0)) as q
              from jsonb_array_elements(p_items) x
             where coalesce(x->>'production_id', '') <> ''
               and coalesce(x->'colisage_detail'->>'stock_box_id', '') = ''
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

  -- Détermination du numéro d'envoi format ENV{YY}{MM}-{XXXX}
  -- Seul l'administrateur peut saisir un numéro personnalisé ou le modifier
  if p_id is null then
    if public.is_admin() and nullif(trim(coalesce(p_numero_bl, '')), '') is not null then
      v_num := trim(p_numero_bl);
    else
      perform pg_advisory_xact_lock(hashtext('logitrak_numero_envoi'));
      v_prefix := 'ENV' || to_char(p_date_envoi, 'YYMM') || '-';
      select coalesce(max((substring(numero_bl from ('^' || v_prefix || '([0-9]{4})$')))::int), 0)
        into v_max
        from public.expeditions
       where numero_bl ~ ('^' || v_prefix || '[0-9]{4}$');
      v_num := v_prefix || lpad((v_max + 1)::text, 4, '0');
    end if;

    insert into public.expeditions (date_envoi, numero_bl, transporteur, observations, validation)
    values (p_date_envoi, v_num, p_transporteur, p_observations, 'A_VALIDER')
    returning id into v_id;
  else
    select numero_bl into v_num from public.expeditions where id = p_id;
    if public.is_admin() and nullif(trim(coalesce(p_numero_bl, '')), '') is not null then
      v_num := trim(p_numero_bl);
    end if;

    update public.expeditions
       set date_envoi = p_date_envoi,
           numero_bl = v_num,
           transporteur = p_transporteur,
           observations = p_observations,
           updated_at = now()
     where id = p_id returning id into v_id;

    delete from public.lignes_expedition where expedition_id = v_id;
  end if;

  -- Insertion des lignes d'expédition
  insert into public.lignes_expedition (
    expedition_id, reference, categorie, designation, destinataire, unite, quantite, cartons,
    production_id, type_carton, poids_carton, of_numero, colisage_detail
  )
  select v_id,
         coalesce(x->>'reference', ''),
         coalesce(x->>'categorie', ''),
         coalesce(x->>'designation', ''),
         coalesce(nullif(trim(x->>'destinataire'), ''), 'STOCK'),
         coalesce(x->>'unite', 'UN'),
         coalesce(x->>'quantite', '0'),
         coalesce(nullif(regexp_replace(x->>'cartons', '[^0-9]', '', 'g'), '')::int, 1),
         nullif(x->>'production_id', '')::uuid,
         coalesce(x->>'type_carton', ''),
         coalesce(nullif(regexp_replace(x->>'poids_carton', '[^0-9.]', '', 'g'), '')::numeric, 0),
         coalesce(x->>'of_numero', ''),
         coalesce(x->'colisage_detail', '{}'::jsonb)
  from jsonb_array_elements(p_items) x;

  -- Mise à jour de l'affectation des cartons en stock
  update public.cartons_stock set expedition_id = null
   where expedition_id = v_id and not (id = any(v_cartons));
  update public.cartons_stock set expedition_id = v_id
   where id = any(v_cartons) and (expedition_id is distinct from v_id or expedition_id is null);

  return v_id;
end; $$;

revoke execute on function public.save_expedition(uuid, date, text, text, text, jsonb) from public, anon;
grant execute on function public.save_expedition(uuid, date, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
