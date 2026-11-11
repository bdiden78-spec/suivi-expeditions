-- LogiTrak 3.7.1. Exécuter après v37-tracabilite-algerie-poste.sql.
begin;
alter table public.ap_commandes add column if not exists type_produit text;
alter table public.ap_commandes drop constraint if exists ap_type_produit_chk;
alter table public.ap_commandes add constraint ap_type_produit_chk check (
  type_produit is null
  or (categorie = 'NATIONAL' and type_produit in ('N_RR','N_CP','N_GC'))
  or (categorie = 'INTERNATIONAL' and type_produit in ('I_RR','I_CP'))
);

create or replace function public.ap_order_capacity_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_reserved bigint;
begin
  if tg_op = 'INSERT' then
    if new.type_produit is null then raise exception 'Choisissez un type de produit Algérie Poste.'; end if;
    return new;
  end if;
  if new.type_produit is distinct from old.type_produit then
    if new.type_produit is null then raise exception 'Choisissez un type de produit Algérie Poste.'; end if;
    if old.type_produit is not null and exists (
      select 1 from public.ap_productions where commande_id = old.id
    ) then
      raise exception 'Le type de produit est verrouillé dès le premier tirage.';
    end if;
  end if;
  if new.quantite_demandee is distinct from old.quantite_demandee then
    select coalesce(sum(case when statut = 'TERMINE' then quantite_imprimee else quantite_prevue end),0)
    into v_reserved from public.ap_productions where commande_id = old.id;
    if new.quantite_demandee < v_reserved then
      raise exception 'Quantité commandée inférieure aux % ID déjà produits ou en cours.', v_reserved;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ap_order_capacity_guard on public.ap_commandes;
create trigger ap_order_capacity_guard before insert or update on public.ap_commandes
for each row execute function public.ap_order_capacity_guard();

create or replace function public.ap_workflow_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_order public.ap_commandes%rowtype; v_reserved bigint; v_quantity integer;
begin
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
drop trigger if exists ap_workflow_limit on public.ap_productions;
create trigger ap_workflow_limit before insert or update on public.ap_productions
for each row execute function public.ap_workflow_limit();
notify pgrst,'reload schema';
commit;
