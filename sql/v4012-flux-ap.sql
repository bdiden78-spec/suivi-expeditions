begin;
alter table public.production add column if not exists objectif_of integer check (objectif_of > 0);
alter table public.ap_productions add column if not exists poste_travail text;
create or replace function public.ap_z_workstation_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' and new.statut='EN_COURS' then
   if not coalesce((new.poste_travail='Poste01' and new.imprimante in ('IMP01','IMP02','IMP03','IMP04'))
      or (new.poste_travail='Poste02' and new.imprimante in ('IMP05','IMP06')),false) then
      raise exception 'Imprimante hors du poste de travail sélectionné.';
   end if;
 end if;
 if new.statut='TERMINE' and (tg_op='INSERT' or old.statut is distinct from new.statut) then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-printer:'||new.imprimante,0));
   if exists(select 1 from public.ap_productions p where p.id<>new.id and p.imprimante=new.imprimante
      and p.termine_at>clock_timestamp()-interval '5 minutes') then
      raise exception 'Attendez cinq minutes entre deux validations sur cette imprimante.';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists ap_z_workstation_guard on public.ap_productions;
create trigger ap_z_workstation_guard before insert or update on public.ap_productions
for each row execute function public.ap_z_workstation_guard();

create or replace function public.ap_order_while_printing_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ap-operator:'||public.get_username(),0));
 if not public.is_admin() and exists(select 1 from public.ap_productions
   where created_by=public.get_username() and statut='EN_COURS') then
   raise exception 'Validez vos impressions en cours avant de saisir une nouvelle commande.';
 end if;
 return new;
end $$;
drop trigger if exists ap_order_while_printing_guard on public.ap_commandes;
create trigger ap_order_while_printing_guard before insert on public.ap_commandes
for each row execute function public.ap_order_while_printing_guard();

create table if not exists public.ap_notifications(
 id uuid primary key default gen_random_uuid(), destinataire text not null,
 commande_id uuid not null, auteur text not null, cree_at timestamptz not null default now()
);
alter table public.ap_notifications enable row level security;
grant select on public.ap_notifications to authenticated;
drop policy if exists ap_notifications_recipient on public.ap_notifications;
create policy ap_notifications_recipient on public.ap_notifications for select to authenticated using(destinataire=public.get_username());
create or replace function public.ap_notify_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.statut='EN_COURS' then
   insert into public.ap_notifications(destinataire,commande_id,auteur)
   select created_by,id,new.created_by from public.ap_commandes
   where id=new.commande_id and created_by<>new.created_by
   and not exists(select 1 from public.ap_productions p where p.id<>new.id and p.commande_id=new.commande_id and p.created_by=new.created_by and p.statut='EN_COURS');
 end if;
 return new;
end $$;
drop trigger if exists ap_notify_owner on public.ap_productions;
create trigger ap_notify_owner after insert on public.ap_productions for each row execute function public.ap_notify_owner();
notify pgrst,'reload schema';
commit;
