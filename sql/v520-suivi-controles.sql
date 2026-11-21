begin;
create table if not exists public.logitrak_audit(
 id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),actor text not null,
 entity text not null, record_id text, action text not null, before_data jsonb, after_data jsonb);
create table if not exists public.logitrak_moves(
 id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),actor text not null,
 reference text not null,source text not null,record_id text,kind text not null,delta numeric not null);
alter table public.logitrak_audit enable row level security;
alter table public.logitrak_moves enable row level security;
revoke all on public.logitrak_audit,public.logitrak_moves from anon,authenticated;
grant select on public.logitrak_audit,public.logitrak_moves to authenticated;
drop policy if exists audit_read on public.logitrak_audit;
create policy audit_read on public.logitrak_audit for select to authenticated using(public.is_admin() or (public.is_operator() and actor=public.get_username()));
drop policy if exists moves_read on public.logitrak_moves;
create policy moves_read on public.logitrak_moves for select to authenticated using(public.is_operator() or exists(select 1 from public.operateurs where username=public.get_username() and role='visionnaire'));
create or replace function public.lt_number(v text) returns numeric language sql immutable set search_path='' as $$
 select coalesce(nullif(regexp_replace(coalesce(v,''),'[^0-9.-]','','g'),'')::numeric,0)
$$;
create or replace function public.lt_audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; q numeric:=0; kind text; ref text; who text:=coalesce(nullif(public.get_username(),''),'Système');
begin
 if tg_op<>'INSERT' then b:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then a:=to_jsonb(new);end if;
 if a is not distinct from b then return coalesce(new,old);end if;
 insert into public.logitrak_audit(actor,entity,record_id,action,before_data,after_data) values(who,tg_table_name,coalesce(a->>'id',b->>'id'),tg_op,b,a);
 ref:=coalesce(a->>'reference',b->>'reference','');
 if tg_table_name='production' then q:=public.lt_number(a->>'quantite_produite')-public.lt_number(b->>'quantite_produite');kind:='PRODUCTION';
 elsif tg_table_name='receptions_externes' then q:=public.lt_number(a->>'quantite_recue')-public.lt_number(b->>'quantite_recue');kind:='RECEPTION / RETOUR';
 elsif tg_table_name='ap_productions' then
  q:=case when a->>'statut'='TERMINE' then public.lt_number(a->>'quantite_imprimee') else 0 end-case when b->>'statut'='TERMINE' then public.lt_number(b->>'quantite_imprimee') else 0 end;
  select case when c.type_produit='N_GC' then 'E02CV25P1' else 'E02CW25P1' end into ref from public.ap_commandes c where c.id::text=coalesce(a->>'commande_id',b->>'commande_id');kind:='PRODUCTION AP';
 elsif tg_table_name='lignes_expedition' then
  q:=public.lt_number(b->>'quantite')-public.lt_number(a->>'quantite');kind:=case when q>0 then 'LIBERATION / RETOUR EN STOCK' else 'RESERVATION ENVOI' end;
  if tg_op='UPDATE' and (a->>'reference') is distinct from (b->>'reference') then
    insert into public.logitrak_moves(actor,reference,source,record_id,kind,delta) values(who,coalesce(b->>'reference',''),tg_table_name,b->>'id','LIBERATION',public.lt_number(b->>'quantite'));
    q:=-public.lt_number(a->>'quantite');
  end if;
 elsif tg_table_name='expeditions' and tg_op='UPDATE' and a->>'validation' is distinct from b->>'validation' then
  insert into public.logitrak_moves(actor,reference,source,record_id,kind,delta)
  select who,coalesce(l.reference,''),tg_table_name,a->>'id',case when a->>'validation'='VALIDE' then 'EXPEDITION VALIDEE' else 'VALIDATION ANNULEE' end,0 from public.lignes_expedition l where l.expedition_id::text=a->>'id';
 end if;
 if tg_table_name in ('production','receptions_externes') and tg_op='UPDATE' and a->>'reference' is distinct from b->>'reference' then
  insert into public.logitrak_moves(actor,reference,source,record_id,kind,delta) values(who,coalesce(b->>'reference',''),tg_table_name,b->>'id','CHANGEMENT REFERENCE',-public.lt_number(case when tg_table_name='production' then b->>'quantite_produite' else b->>'quantite_recue' end));
  q:=public.lt_number(case when tg_table_name='production' then a->>'quantite_produite' else a->>'quantite_recue' end);
 end if;
 if q<>0 then insert into public.logitrak_moves(actor,reference,source,record_id,kind,delta) values(who,coalesce(ref,''),tg_table_name,coalesce(a->>'id',b->>'id'),kind,q);end if;
 return coalesce(new,old);
end $$;
do $$ declare t text;begin
 foreach t in array array['production','receptions_externes','ap_commandes','ap_productions','lignes_expedition','expeditions','cartons_stock','colisage_ref','ap_colisage_groupes'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists lt_audit_change on public.%I',t);
   execute format('create trigger lt_audit_change after insert or update or delete on public.%I for each row execute function public.lt_audit_change()',t);
  end if;
 end loop;
end $$;
-- Contrôle appelé également par le déclencheur : protège validation manuelle et automatique.
create or replace function public.lt_check_shipment(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare errors jsonb:='[]';warnings jsonb:='[]';e public.expeditions%rowtype;l record;available numeric;used numeric;pid text;rid text;
begin
 if auth.uid() is not null and not public.is_operator() then raise exception 'Compte opérateur requis.';end if;
 select * into e from public.expeditions where id=p_id;
 if not found then raise exception 'Envoi introuvable.';end if;
 if nullif(btrim(e.transporteur),'') is null then errors:=errors||jsonb_build_array('Transporteur manquant.');end if;
 if not exists(select 1 from public.lignes_expedition where expedition_id=p_id) then errors:=errors||jsonb_build_array('Envoi sans article.');end if;
 for l in select * from public.lignes_expedition where expedition_id=p_id loop
  if nullif(btrim(l.destinataire),'') is null then errors:=errors||jsonb_build_array('Destinataire manquant : '||coalesce(l.reference,''));end if;
  if public.lt_number(l.quantite)<=0 then errors:=errors||jsonb_build_array('Quantité invalide : '||coalesce(l.reference,''));end if;
  if public.lt_number(l.cartons::text)<=0 and coalesce(l.colisage_detail->>'mixte','false')<>'true' and not (l.colisage_detail ? 'ap_pack') then warnings:=warnings||jsonb_build_array('Colisage à vérifier : '||coalesce(l.reference,''));end if;
  if l.production_id is not null then
    select quantite_produite into available from public.production where id=l.production_id for update;
    select sum(public.lt_number(quantite)) into used from public.lignes_expedition where production_id=l.production_id;
    if exists(select 1 from public.production p where p.id=l.production_id and p.qte_par_carton>1 and mod(public.lt_number(l.quantite),p.qte_par_carton)>0)
      and coalesce(l.colisage_detail->>'mixte','false')<>'true' then warnings:=warnings||jsonb_build_array('Carton incomplet ou reliquat à confirmer : '||coalesce(l.reference,''));end if;
    if available is null or coalesce(used,0)>available then errors:=errors||jsonb_build_array('Stock insuffisant : '||coalesce(l.reference,''));end if;
  end if;
  rid:=coalesce(to_jsonb(l)->>'reception_id',l.colisage_detail->>'reception_id');
  if nullif(rid,'') is not null then
   select quantite_recue into available from public.receptions_externes where id::text=rid for update;
   select sum(public.lt_number(x.quantite)) into used from public.lignes_expedition x where coalesce(to_jsonb(x)->>'reception_id',x.colisage_detail->>'reception_id')=rid;
   if available is null or coalesce(used,0)>available then errors:=errors||jsonb_build_array('Stock réception insuffisant : '||coalesce(l.reference,''));end if;
  end if;
  pid:=coalesce(l.ap_production_id::text,l.colisage_detail->>'ap_production_id');
  if nullif(pid,'') is not null then
    select case when statut='TERMINE' then quantite_imprimee else 0 end into available from public.ap_productions where id::text=pid for update;
    select sum(public.lt_number(quantite)) into used from public.lignes_expedition where coalesce(ap_production_id::text,colisage_detail->>'ap_production_id')=pid;
    if available is null or coalesce(used,0)>available then errors:=errors||jsonb_build_array('Paquets AP indisponibles : '||coalesce(l.reference,''));end if;
  end if;
 end loop;
 -- Reliquats non affectés, pour les références de l’envoi.
 if exists(select 1 from public.production p where exists(select 1 from public.lignes_expedition l where l.expedition_id=p_id and l.reference=p.reference)
 and p.quantite_produite>coalesce((select sum(public.lt_number(x.quantite)) from public.lignes_expedition x where x.production_id=p.id),0)) then warnings:=warnings||jsonb_build_array('Il reste des produits de ces références en stock : vérifiez les reliquats avant le départ.');end if;
 return jsonb_build_object('errors',errors,'warnings',warnings);
end $$;
revoke all on function public.lt_check_shipment(uuid) from public;
grant execute on function public.lt_check_shipment(uuid) to authenticated;
create or replace function public.lt_shipment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if new.validation='VALIDE' and old.validation is distinct from 'VALIDE' then
 result:=public.lt_check_shipment(new.id);
 if jsonb_array_length(result->'errors')>0 then raise exception 'Validation refusée : %',result->'errors';end if;
 end if;return new;
end $$;
drop trigger if exists lt_shipment_guard on public.expeditions;
create trigger lt_shipment_guard before update of validation on public.expeditions for each row execute function public.lt_shipment_guard();
notify pgrst,'reload schema';
commit;
