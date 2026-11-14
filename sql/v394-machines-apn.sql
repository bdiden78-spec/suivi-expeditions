begin;
create table if not exists public.machines_usine (
 id uuid primary key default gen_random_uuid(),
 nom text not null unique check (nom=upper(trim(nom)) and nom<>''),
 marque text not null, reference text not null, numero_serie text not null,
 imprimante_ap boolean not null default false,
 mise_en_service date, etat text not null default 'En service'
 check (etat in ('En service','En maintenance','Hors service')),
 prochain_preventif date, notes text not null default ''
);
create table if not exists public.machines_interventions (
 id uuid primary key default gen_random_uuid(),
 machine_id uuid not null references public.machines_usine(id),
 date_intervention date not null,
 type text not null check (type in ('Préventif','Correctif','Contrôle')),
 description text not null check (trim(description)<>'')
);
alter table public.machines_usine enable row level security;
alter table public.machines_interventions enable row level security;
do $$
declare t text;
begin
 foreach t in array array['machines_usine','machines_interventions'] loop
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('drop policy if exists lecture on public.%I',t);
  execute format('create policy lecture on public.%I for select to authenticated using (public.is_operator())',t);
  execute format('drop policy if exists gestion on public.%I',t);
  execute format('create policy gestion on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',t);
 end loop;
end $$;

create or replace function public.ap_commande_numero_guard() returns trigger
language plpgsql set search_path='' as $$
declare n text;
begin
 if tg_op='INSERT' then
  n:=nextval('public.ap_commande_num_seq')::text;
  new.ap_numero:='APN°: '||to_char(coalesce(new.date_commande,current_date),'YYMM')||'-'||lpad(n,greatest(4,length(n)),'0');
 elsif new.ap_numero is distinct from old.ap_numero then
  if not public.is_admin() then raise exception 'Modification du numéro APN réservée à l’administrateur.'; end if;
  if new.ap_numero !~ '^APN°: [0-9]{2}(0[1-9]|1[0-2])-[0-9]{4,}$' then
   raise exception 'Format attendu : APN°: AAMM-0001.';
  end if;
 end if;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
