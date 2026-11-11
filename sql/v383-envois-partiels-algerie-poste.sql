begin;
drop index if exists public.ap_tirage_expedition_unique;
create index if not exists ap_tirage_expedition_idx on public.lignes_expedition(ap_production_id) where ap_production_id is not null;

create or replace function public.ap_expedition_line_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_run public.ap_productions%rowtype; v_order public.ap_commandes%rowtype; v_used bigint; v_quantity bigint;
begin
  new.ap_production_id := nullif(new.colisage_detail->>'ap_production_id','')::uuid;
  if new.ap_production_id is null then return new; end if;
  select * into v_run from public.ap_productions where id=new.ap_production_id for update;
  if not found or v_run.statut <> 'TERMINE' then raise exception 'Seul un tirage validé peut être expédié.'; end if;
  select * into v_order from public.ap_commandes where id=v_run.commande_id;
  if upper(new.destinataire) <> upper(v_order.client) then
    raise exception 'Le client du tirage expédié provient de sa commande.';
  end if;
  v_quantity := new.quantite::bigint;
  select coalesce(sum(quantite::bigint),0) into v_used
    from public.lignes_expedition where ap_production_id=new.ap_production_id and id<>new.id;
  if v_quantity < 1 or v_used+v_quantity > v_run.quantite_imprimee then
    raise exception 'Quantité supérieure au solde du tirage (% ID disponibles).', greatest(0,v_run.quantite_imprimee-v_used);
  end if;
  return new;
end;
$$;
revoke execute on function public.ap_expedition_line_guard() from public;
notify pgrst,'reload schema';
commit;
