-- LogiTrak v3.7. Appliquer après l'installation du module Algérie Poste (v3.2).
begin;

create or replace function public.ap_revision_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.revision := gen_random_uuid();
    new.updated_at := now();
    if tg_table_name = 'ap_productions' then
      if new.commande_id is distinct from old.commande_id then
        raise exception 'Une impression ne peut pas être déplacée vers une autre commande.';
      end if;
    end if;
  else
    new.created_at := now();
    new.updated_at := now();
    new.created_by := public.get_username();
    new.revision := gen_random_uuid();
  end if;
  return new;
end;
$$;


alter table public.ap_productions add column if not exists imprimante text not null default '';
alter table public.ap_productions add column if not exists statut text;
-- Les anciennes impressions étaient déjà comptabilisées comme produites.
update public.ap_productions set statut = 'TERMINE' where statut is null;
alter table public.ap_productions alter column statut set default 'EN_COURS';
alter table public.ap_productions alter column statut set not null;
alter table public.ap_productions add column if not exists quantite_prevue integer not null default 0;
update public.ap_productions set quantite_prevue = quantite_imprimee where quantite_prevue = 0 and quantite_imprimee > 0;
alter table public.ap_productions add column if not exists demarre_at timestamptz;
update public.ap_productions set demarre_at = created_at where demarre_at is null;
alter table public.ap_productions alter column demarre_at set default now();
alter table public.ap_productions alter column demarre_at set not null;
alter table public.ap_productions add column if not exists termine_at timestamptz;
alter table public.ap_productions add column if not exists termine_par text not null default '';
-- Une ancienne date de validation inconnue reste inconnue.
alter table public.ap_productions alter column numero_fin set default '';
alter table public.ap_productions alter column quantite_imprimee set default 0;
alter table public.ap_productions drop constraint if exists ap_productions_quantite_imprimee_check;
alter table public.ap_productions drop constraint if exists ap_productions_numero_fin_check;
alter table public.ap_productions drop constraint if exists ap_run_quantites_chk;
alter table public.ap_productions add constraint ap_run_quantites_chk check (
  quantite_prevue > 0 and quantite_imprimee >= 0
  and statut in ('EN_COURS','TERMINE')
  and ((statut = 'EN_COURS' and quantite_imprimee = 0) or
       (statut = 'TERMINE' and quantite_imprimee > 0 and length(trim(numero_fin)) > 0))
);
create index if not exists ap_productions_imprimante_idx on public.ap_productions(imprimante);


create or replace function public.ap_plage_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_first text; v_last text;
begin
  new.numero_debut := upper(trim(new.numero_debut));
  new.numero_fin := upper(trim(new.numero_fin));
  if new.statut = 'TERMINE' then
    v_first := regexp_replace(new.numero_debut, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g');
    v_last := regexp_replace(new.numero_fin, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g');
    if v_first ~ '^[0-9]+$' and v_last ~ '^[0-9]+$' then
      if length(v_first) > 40 or length(v_last) > 40 then raise exception 'Numéro trop long (40 chiffres maximum).'; end if;
      if v_last::numeric - v_first::numeric + 1 <> new.quantite_imprimee then
        raise exception 'La plage numérique inclusive doit correspondre à la quantité réellement imprimée.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.ap_workflow_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_changed boolean := true;
begin
  new.imprimante := upper(trim(new.imprimante));
  if length(new.imprimante) = 0 then raise exception 'Indiquez l’imprimante utilisée pour ce tirage.'; end if;
  if tg_op = 'INSERT' then
    new.demarre_at := now();
  else
    new.demarre_at := old.demarre_at;
    v_changed := (new.statut,new.imprimante,new.quantite_prevue,new.quantite_imprimee,new.numero_debut,new.numero_fin,new.date_production)
      is distinct from
      (old.statut,old.imprimante,old.quantite_prevue,old.quantite_imprimee,old.numero_debut,old.numero_fin,old.date_production);
  end if;
  if new.statut = 'TERMINE' then
    if v_changed then
      new.termine_at := now();
      new.termine_par := public.get_username();
    else
      new.termine_at := old.termine_at;
      new.termine_par := old.termine_par;
    end if;
  else
    new.quantite_imprimee := 0;
    new.termine_at := null;
    new.termine_par := '';
  end if;
  return new;
end;
$$;
drop trigger if exists ap_workflow_guard on public.ap_productions;
create trigger ap_workflow_guard before insert or update on public.ap_productions
  for each row execute function public.ap_workflow_guard();

-- Même règle que depuis la v3.2 : 48 h après création, admin sans limite de temps.
drop policy if exists ap_modification on public.ap_productions;
create policy ap_modification on public.ap_productions for update to authenticated
  using (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'))
  with check (public.is_operator());
drop policy if exists ap_suppression on public.ap_productions;
create policy ap_suppression on public.ap_productions for delete to authenticated
  using (public.is_operator() and (public.is_admin() or now() - created_at < interval '48 hours'));

create table if not exists public.ap_historique (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null,
  commande_id uuid not null,
  action text not null check (action in ('DEMARRAGE','VALIDATION','MODIFICATION','REOUVERTURE','SUPPRESSION','REPRISE_HISTORIQUE')),
  auteur text not null,
  horodatage timestamptz not null default now(),
  commande jsonb not null,
  avant jsonb,
  apres jsonb
);
create index if not exists ap_historique_production_idx on public.ap_historique(production_id);
create index if not exists ap_historique_horodatage_idx on public.ap_historique(horodatage desc);
alter table public.ap_historique enable row level security;
revoke all on public.ap_historique from public, anon, authenticated;
grant select on public.ap_historique to authenticated;
drop policy if exists ap_historique_lecture on public.ap_historique;
create policy ap_historique_lecture on public.ap_historique for select to authenticated using (public.is_operator());

create or replace function public.ap_trace() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_action text; v_commande jsonb; v_commande_id uuid; v_production_id uuid;
begin
  if tg_op = 'DELETE' then
    v_commande_id := old.commande_id;
    v_production_id := old.id;
    v_action := 'SUPPRESSION';
  else
    v_commande_id := new.commande_id;
    v_production_id := new.id;
    if tg_op = 'INSERT' then
      v_action := case when new.statut = 'TERMINE' then 'VALIDATION' else 'DEMARRAGE' end;
    elsif old.statut <> new.statut then
      v_action := case when new.statut = 'TERMINE' then 'VALIDATION' else 'REOUVERTURE' end;
    else
      v_action := 'MODIFICATION';
    end if;
  end if;
  select to_jsonb(c) into v_commande from public.ap_commandes c where c.id = v_commande_id;
  if v_commande is null then
    select commande into v_commande from public.ap_historique
      where production_id = v_production_id order by horodatage desc,id desc limit 1;
  end if;
  insert into public.ap_historique(production_id,commande_id,action,auteur,commande,avant,apres)
  values(v_production_id,v_commande_id,v_action,coalesce(public.get_username(),''),coalesce(v_commande,'{}'::jsonb),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.ap_trace() from public;
drop trigger if exists ap_trace on public.ap_productions;
create trigger ap_trace after insert or update or delete on public.ap_productions
  for each row execute function public.ap_trace();

insert into public.ap_historique(production_id,commande_id,action,auteur,commande,apres)
select p.id,p.commande_id,'REPRISE_HISTORIQUE',coalesce(p.created_by,''),to_jsonb(c),to_jsonb(p)
  from public.ap_productions p join public.ap_commandes c on c.id = p.commande_id
 where not exists(select 1 from public.ap_historique h where h.production_id = p.id);

notify pgrst,'reload schema';
commit;
