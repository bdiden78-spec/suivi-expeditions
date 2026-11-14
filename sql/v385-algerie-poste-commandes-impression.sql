-- LogiTrak v3.8.5 — Numérotation APN immuable et préparation du suivi multi-imprimantes.
-- À exécuter dans Supabase SQL Editor après les migrations v3.8.4.
begin;

create sequence if not exists public.ap_commande_num_seq;
alter table public.ap_commandes add column if not exists ap_numero text;

with numbered as (
  select id, row_number() over (order by created_at, id) as n
  from public.ap_commandes where ap_numero is null
)
update public.ap_commandes c
set ap_numero = 'APN° : ' || lpad(numbered.n::text, 4, '0')
from numbered where c.id = numbered.id;

select setval('public.ap_commande_num_seq', greatest(coalesce((select count(*) from public.ap_commandes),0),1), coalesce((select count(*) from public.ap_commandes),0) > 0);
alter table public.ap_commandes alter column ap_numero set not null;
create unique index if not exists ap_commandes_ap_numero_uidx on public.ap_commandes(ap_numero);

grant usage, select on sequence public.ap_commande_num_seq to authenticated;

create or replace function public.ap_commande_numero_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.ap_numero := 'APN° : ' || lpad(nextval('public.ap_commande_num_seq')::text, 4, '0');
  elsif new.ap_numero is distinct from old.ap_numero then
    raise exception 'Le numéro de traçabilité APN est définitif et ne peut pas être modifié.';
  end if;
  return new;
end;
$$;
drop trigger if exists ap_commande_numero_guard on public.ap_commandes;
create trigger ap_commande_numero_guard before insert or update on public.ap_commandes
for each row execute function public.ap_commande_numero_guard();

-- Empêche deux opérateurs de réserver accidentellement des ID qui se chevauchent
-- sur une même commande, même lorsqu'ils travaillent en parallèle.
create or replace function public.ap_no_overlapping_ranges() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_start numeric;
  v_end numeric;
  v_conflict boolean;
begin
  v_start := nullif(regexp_replace(new.numero_debut, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g'), '')::numeric;
  v_end := nullif(regexp_replace(new.numero_fin, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g'), '')::numeric;
  if v_start is null or v_end is null then return new; end if;
  perform 1 from public.ap_commandes where id = new.commande_id for update;
  select exists (
    select 1 from public.ap_productions p
    where p.commande_id = new.commande_id and p.id <> new.id
      and regexp_replace(p.numero_debut, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g') ~ '^[0-9]+$'
      and regexp_replace(p.numero_fin, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g') ~ '^[0-9]+$'
      and v_start <= regexp_replace(p.numero_fin, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g')::numeric
      and v_end >= regexp_replace(p.numero_debut, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g')::numeric
  ) into v_conflict;
  if v_conflict then raise exception 'Cette plage d’ID chevauche une plage déjà déclarée pour cette commande.'; end if;
  return new;
exception when invalid_text_representation then
  return new;
end;
$$;
drop trigger if exists ap_range_overlap_guard on public.ap_productions;
create trigger ap_range_overlap_guard before insert or update of commande_id, numero_debut, numero_fin on public.ap_productions
for each row execute function public.ap_no_overlapping_ranges();

notify pgrst, 'reload schema';
commit;
