-- LogiTrak 5.1.2 : regroupement volontaire de fractions UPW compatibles.
-- Nouveau script, indépendant de la renumérotation APN (ne la réexécute pas).
begin;
create table if not exists public.ap_colisage_groupes (
 id uuid primary key default gen_random_uuid(),
 commande_ids uuid[] not null check(cardinality(commande_ids)>=2),
 created_by text not null,
 created_at timestamptz not null default now()
);
alter table public.ap_colisage_groupes enable row level security;
drop policy if exists ap_groupes_lecture on public.ap_colisage_groupes;
create policy ap_groupes_lecture on public.ap_colisage_groupes for select to authenticated using(true);
revoke all on public.ap_colisage_groupes from anon, authenticated;
grant select on public.ap_colisage_groupes to authenticated;

create or replace function public.ap_regrouper_fractions(p_commande uuid,p_avec uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare ids uuid[]; expected integer; matched integer; incompatible integer; bad integer;
 g uuid; first_order public.ap_commandes%rowtype; actor text:=public.get_username();
begin
 if not public.is_operator() then raise exception 'Compte opérateur requis.'; end if;
 if p_commande=p_avec then raise exception 'Choisissez deux commandes différentes.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-colisage-groupes',0));
 lock table public.ap_commandes in share row exclusive mode;
 lock table public.ap_productions in share row exclusive mode;
 lock table public.lignes_expedition in share row exclusive mode;
 select array_agg(distinct id) into ids from (
   select unnest(array[p_commande,p_avec]) id union all
   select unnest(commande_ids) from public.ap_colisage_groupes where commande_ids && array[p_commande,p_avec]
 ) x;
 expected:=cardinality(ids);
 select * into first_order from public.ap_commandes where id=p_commande;
 select count(*) into matched from public.ap_commandes where id=any(ids);
 if matched<>expected then raise exception 'Commande introuvable.'; end if;
 if exists(select 1 from public.ap_commandes where id=any(ids) and (
   upper(regexp_replace(btrim(client),'\s+',' ','g'))<>upper(regexp_replace(btrim(first_order.client),'\s+',' ','g'))
   or categorie is distinct from first_order.categorie or type_produit is distinct from first_order.type_produit)) then
   raise exception 'Même UPW, même catégorie et même type d’identifiant obligatoires.';
 end if;
 if (select max(date_commande)-min(date_commande) from public.ap_commandes where id=any(ids))>7 then
   raise exception 'Écart maximal : 7 jours entre les commandes.';
 end if;
 -- Un tirage totalement réservé/expédié est exclu ; un tirage partiel empêche le regroupement.
 if exists(select 1 from public.ap_productions p where p.commande_id=any(ids) and p.statut='TERMINE'
   and (select coalesce(sum(coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)),0) from public.lignes_expedition l where l.ap_production_id=p.id)>0
   and (select coalesce(sum(coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)),0) from public.lignes_expedition l where l.ap_production_id=p.id)<p.quantite_imprimee) then
   raise exception 'Un tirage est partiellement réservé ou expédié.';
 end if;
 select count(distinct p.commande_id) into matched from public.ap_productions p
 where p.commande_id=any(ids) and p.statut='TERMINE'
 and not exists(select 1 from public.lignes_expedition l where l.ap_production_id=p.id and coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)>0);
 if matched<>expected then raise exception 'Chaque fraction doit avoir des paquets validés disponibles.'; end if;
 if exists(select 1 from public.ap_productions p where p.commande_id=any(ids) and p.statut='TERMINE'
   and not exists(select 1 from public.lignes_expedition l where l.ap_production_id=p.id and coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)>0)
   and (regexp_replace(p.numero_debut,'\s','','g') !~ '^[0-9]{8}$' or regexp_replace(p.numero_fin,'\s','','g') !~ '^[0-9]{8}$'
   or coalesce(p.type_carton_ap,'H1')<>'H1')) then raise exception 'Plages numériques à 8 chiffres et colisage H1 obligatoires.'; end if;
 with available as (
   select regexp_replace(p.numero_debut,'\s','','g')::bigint as debut,
          regexp_replace(p.numero_fin,'\s','','g')::bigint as fin,p.quantite_imprimee as qty
   from public.ap_productions p where p.commande_id=any(ids) and p.statut='TERMINE'
   and not exists(select 1 from public.lignes_expedition l where l.ap_production_id=p.id and coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)>0)
 ), spans as (select *,lag(fin) over(order by debut,fin) as precedent from available)
 select count(*) into bad from spans where fin-debut+1<>qty or (precedent is not null and debut<>precedent+1);
 if bad>0 then raise exception 'Les plages disponibles doivent être continues, sans trou ni chevauchement.'; end if;
 select count(distinct coalesce(p.poids_paquet_ap,case when first_order.type_produit='N_GC' then .500 else .750 end)) into incompatible
 from public.ap_productions p where p.commande_id=any(ids) and p.statut='TERMINE'
 and not exists(select 1 from public.lignes_expedition l where l.ap_production_id=p.id and coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)>0);
 if incompatible<>1 then raise exception 'Les poids des paquets doivent être identiques.'; end if;
 delete from public.ap_colisage_groupes where commande_ids && ids;
 insert into public.ap_colisage_groupes(commande_ids,created_by) values(ids,actor) returning id into g;
 return g;
end $$;

create or replace function public.ap_dissocier_fractions(p_groupe uuid)
returns void language plpgsql security definer set search_path='' as $$
declare g public.ap_colisage_groupes%rowtype;
begin
 if not public.is_operator() then raise exception 'Compte opérateur requis.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-colisage-groupes',0));
 select * into g from public.ap_colisage_groupes where id=p_groupe for update;
 if not found then raise exception 'Regroupement introuvable.'; end if;
 if not public.is_admin() and g.created_by<>public.get_username() then raise exception 'Seul l’auteur ou un administrateur peut dissocier ce regroupement.'; end if;
 if exists(select 1 from public.lignes_expedition l join public.ap_productions p on p.id=l.ap_production_id
   where p.commande_id=any(g.commande_ids) and coalesce(nullif(regexp_replace(coalesce(l.quantite::text,''),'[^0-9]','','g'),'')::bigint,0)>0
   and coalesce(l.colisage_detail->'ap_pack'->>'groupId','')=g.id::text) then
   raise exception 'Ce regroupement est utilisé dans un envoi. Retirez-le de l’envoi avant de le dissocier.';
 end if;
 delete from public.ap_colisage_groupes where id=p_groupe;
end $$;
revoke all on function public.ap_regrouper_fractions(uuid,uuid) from public;
revoke all on function public.ap_dissocier_fractions(uuid) from public;
grant execute on function public.ap_regrouper_fractions(uuid,uuid) to authenticated;
grant execute on function public.ap_dissocier_fractions(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
