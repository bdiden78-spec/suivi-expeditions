begin;
alter table public.ap_commandes add column if not exists autorise_nouvelle_commande boolean not null default false;
create or replace function public.ap_order_while_printing_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor text:=public.get_username();
begin
 if public.is_admin() then return new; end if;
 if tg_op='UPDATE' then
   if new.autorise_nouvelle_commande is distinct from old.autorise_nouvelle_commande then
     raise exception 'Autorisation réservée aux administrateurs.';
   end if;
   return new;
 end if;
 if new.autorise_nouvelle_commande then raise exception 'Autorisation réservée aux administrateurs.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-operator:'||actor,0));
 if exists(select 1 from public.ap_commandes c where c.created_by=actor and not c.autorise_nouvelle_commande
   and c.quantite_demandee>(select coalesce(sum(p.quantite_imprimee),0) from public.ap_productions p where p.commande_id=c.id and p.statut='TERMINE')) then
   raise exception 'Terminez votre commande en cours ou demandez une autorisation à un administrateur.';
 end if;
 return new;
end $$;
drop trigger if exists ap_order_while_printing_guard on public.ap_commandes;
create trigger ap_order_while_printing_guard before insert or update on public.ap_commandes
for each row execute function public.ap_order_while_printing_guard();
notify pgrst,'reload schema';
commit;
