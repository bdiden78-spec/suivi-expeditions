begin;
alter table public.ap_productions add column if not exists type_carton_ap text not null default 'H1';
alter table public.ap_productions add column if not exists paquets_par_carton_ap integer;
alter table public.ap_productions add column if not exists poids_paquet_ap numeric;
alter table public.ap_productions drop constraint if exists ap_colisage_parametres_chk;
alter table public.ap_productions add constraint ap_colisage_parametres_chk check (
  length(btrim(type_carton_ap)) between 1 and 80
  and (paquets_par_carton_ap is null or paquets_par_carton_ap between 1 and 2147483)
  and (poids_paquet_ap is null or poids_paquet_ap between 0.001 and 100)
);
create or replace function public.ap_workflow_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_changed boolean := true;
begin
  new.imprimante := upper(trim(new.imprimante));
  if tg_op = 'INSERT' then
    new.demarre_at := now();
  else
    new.demarre_at := old.demarre_at;
    v_changed := (new.statut,new.imprimante,new.quantite_prevue,new.quantite_imprimee,new.numero_debut,new.numero_fin,new.date_production)
      is distinct from
      (old.statut,old.imprimante,old.quantite_prevue,old.quantite_imprimee,old.numero_debut,old.numero_fin,old.date_production);
  end if;
  if length(new.imprimante) = 0 and v_changed then raise exception 'Indiquez l’imprimante utilisée pour ce tirage.'; end if;
  if new.statut = 'TERMINE' then
    if v_changed then
      new.termine_at := now();
      new.termine_par := public.get_username();
    else
      new.termine_at := old.termine_at;
      new.termine_par := old.termine_par;
    end if;
  else
    new.quantite_imprimee := 0;
    new.termine_at := null;
    new.termine_par := '';
  end if;
  return new;
end;
$$;

create or replace function public.ap_workflow_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_order public.ap_commandes%rowtype; v_reserved bigint; v_quantity integer;
begin
  if tg_op = 'UPDATE' then
    if (new.commande_id,new.statut,new.quantite_prevue,new.quantite_imprimee)
       is not distinct from (old.commande_id,old.statut,old.quantite_prevue,old.quantite_imprimee) then
      return new;
    end if;
  end if;
  -- Ce verrou sérialise les déclarations et les changements de quantité de la commande.
  select * into v_order from public.ap_commandes where id = new.commande_id for update;
  if not found then raise exception 'Choisissez une commande existante.'; end if;
  if v_order.type_produit is null then raise exception 'Renseignez le type de produit de cette commande dans Algérie Poste.'; end if;
  select coalesce(sum(case when statut = 'TERMINE' then quantite_imprimee else quantite_prevue end),0)
  into v_reserved from public.ap_productions where commande_id = new.commande_id and id <> new.id;
  v_quantity := case when new.statut = 'TERMINE' then new.quantite_imprimee else new.quantite_prevue end;
  if v_reserved + v_quantity > v_order.quantite_demandee then
    raise exception 'Quantité supérieure au reste de la commande (% ID disponibles).', greatest(0,v_order.quantite_demandee-v_reserved);
  end if;
  return new;
end;
$$;
revoke execute on function public.ap_workflow_limit() from public;
notify pgrst,'reload schema';
commit;
