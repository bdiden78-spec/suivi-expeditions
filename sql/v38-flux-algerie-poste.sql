begin;
alter table public.lignes_expedition add column if not exists ap_production_id uuid references public.ap_productions(id);
create unique index if not exists ap_tirage_expedition_unique on public.lignes_expedition(ap_production_id) where ap_production_id is not null;

create or replace function public.ap_machine_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if exists(select 1 from public.lignes_expedition where ap_production_id=new.id)
       and (new.statut,new.quantite_imprimee,new.numero_debut,new.numero_fin,new.imprimante)
           is distinct from (old.statut,old.quantite_imprimee,old.numero_debut,old.numero_fin,old.imprimante) then
      raise exception 'Ce tirage est lié à un envoi. Retirez-le de l’envoi avant de modifier sa production.';
    end if;
    if (new.statut,new.imprimante) is not distinct from (old.statut,old.imprimante) then return new; end if;
  end if;
  if new.statut <> 'EN_COURS' or new.imprimante = '' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-operator:'||new.created_by,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-printer:'||new.imprimante,0));
  if exists(select 1 from public.ap_productions p where p.id<>new.id and p.statut='EN_COURS' and p.imprimante=new.imprimante) then
    raise exception 'Cette imprimante a déjà un tirage en cours.';
  end if;
  if (select count(*) from public.ap_productions p where p.id<>new.id and p.statut='EN_COURS' and p.imprimante<>'' and p.created_by=new.created_by)>=4 then
    raise exception 'Quatre imprimantes sont déjà en cours pour cet opérateur.';
  end if;
  return new;
end;
$$;
revoke execute on function public.ap_machine_guard() from public;
drop trigger if exists ap_workflow_machine on public.ap_productions;
create trigger ap_workflow_machine before insert or update on public.ap_productions
for each row execute function public.ap_machine_guard();

create or replace function public.ap_expedition_line_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_run public.ap_productions%rowtype; v_order public.ap_commandes%rowtype;
begin
  new.ap_production_id := nullif(new.colisage_detail->>'ap_production_id','')::uuid;
  if new.ap_production_id is null then return new; end if;
  select * into v_run from public.ap_productions where id=new.ap_production_id for update;
  if not found or v_run.statut <> 'TERMINE' then raise exception 'Seul un tirage validé peut être expédié.'; end if;
  select * into v_order from public.ap_commandes where id=v_run.commande_id;
  if new.quantite::bigint <> v_run.quantite_imprimee or upper(new.destinataire) <> upper(v_order.client) then
    raise exception 'La quantité et le client d’un tirage expédié proviennent de sa commande.';
  end if;
  return new;
end;
$$;
revoke execute on function public.ap_expedition_line_guard() from public;
drop trigger if exists ap_expedition_line_guard on public.lignes_expedition;
create trigger ap_expedition_line_guard before insert or update on public.lignes_expedition
for each row execute function public.ap_expedition_line_guard();
notify pgrst,'reload schema';
commit;
