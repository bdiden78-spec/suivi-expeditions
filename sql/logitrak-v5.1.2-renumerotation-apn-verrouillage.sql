-- LogiTrak 5.1.2 : renumérotation exceptionnelle des DEUX premières commandes.
-- À exécuter une seule fois dans Supabase > SQL Editor, avec le rôle postgres.
-- Les UUID des commandes, impressions et paquets sont conservés.
begin;
lock table public.ap_commandes in access exclusive mode;
lock table public.ap_productions in share mode;
lock table public.lignes_expedition in share mode;

do $$
begin
  if (select count(*) from public.ap_commandes) <> 2 then
    raise exception 'Opération annulée : exactement deux commandes Algérie Poste sont attendues.';
  end if;
  if exists (
    select 1 from public.lignes_expedition l
    join public.ap_productions p on p.id = l.ap_production_id
    join public.ap_commandes c on c.id = p.commande_id
  ) then
    raise exception 'Opération annulée : une commande est déjà liée à un envoi, même non validé.';
  end if;
end $$;

create temp table ap_renumerotation_512 on commit drop as
select id, ap_numero as ancien_numero,
       'APN°: ' || to_char(coalesce(date_commande,current_date),'YYMM') || '-' ||
       lpad((row_number() over(order by created_at,id))::text,4,'0') as nouveau_numero
from public.ap_commandes;

-- Conserver exactement l’état antérieur des déclencheurs.
create temp table ap_triggers_512 on commit drop as
select tgname,tgenabled from pg_trigger
where tgrelid='public.ap_commandes'::regclass and not tgisinternal;
alter table public.ap_commandes disable trigger user;

-- Passage temporaire pour éviter les conflits de l’index unique.
update public.ap_commandes set ap_numero='RENUMERATION-512-' || id::text;
update public.ap_commandes c set ap_numero=n.nouveau_numero
from ap_renumerotation_512 n where n.id=c.id;

do $$
declare t record;
begin
  for t in select * from ap_triggers_512 loop
    execute format('alter table public.ap_commandes %s trigger %I',
      case t.tgenabled when 'D' then 'disable' when 'R' then 'enable replica'
           when 'A' then 'enable always' else 'enable' end,t.tgname);
  end loop;
end $$;

-- Numéro attribué automatiquement à la création, ensuite immuable pour tous.
create or replace function public.ap_commande_numero_guard() returns trigger
language plpgsql set search_path='' as $$
declare n text;
begin
  if tg_op='INSERT' then
    n:=nextval('public.ap_commande_num_seq'::regclass)::text;
    new.ap_numero:='APN°: '||to_char(coalesce(new.date_commande,current_date),'YYMM')||'-'||lpad(n,greatest(4,length(n)),'0');
  elsif new.ap_numero is distinct from old.ap_numero then
    raise exception 'Le numéro APN° est définitif et ne peut pas être modifié, même par un administrateur.';
  end if;
  return new;
end $$;

drop trigger if exists ap_commande_numero_guard on public.ap_commandes;
drop trigger if exists ap_zz_commande_numero_guard on public.ap_commandes;
-- Après les vérifications métier connues pour limiter les numéros consommés par les refus.
create trigger ap_zz_commande_numero_guard before insert or update on public.ap_commandes
for each row execute function public.ap_commande_numero_guard();

-- RESTART est transactionnel : le prochain numéro sera 3.
alter sequence public.ap_commande_num_seq restart with 3;
select ancien_numero,nouveau_numero from ap_renumerotation_512 order by nouveau_numero;
notify pgrst,'reload schema';
commit;
