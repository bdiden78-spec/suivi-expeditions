begin;
alter table public.ap_productions drop constraint if exists ap_productions_numero_debut_check;
alter table public.ap_productions drop constraint if exists ap_numero_debut_validation_chk;
alter table public.ap_productions add constraint ap_numero_debut_validation_chk
  check (statut <> 'TERMINE' or length(btrim(numero_debut)) > 0);
create or replace function public.ap_workflow_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_changed boolean := true;
begin
  new.imprimante := upper(trim(new.imprimante));
  if tg_op = 'INSERT' then
    new.demarre_at := now();
  else
    new.demarre_at := old.demarre_at;
    v_changed := (new.statut,new.imprimante,new.quantite_prevue,new.quantite_imprimee,new.numero_debut,new.numero_fin,new.date_production)
      is distinct from
      (old.statut,old.imprimante,old.quantite_prevue,old.quantite_imprimee,old.numero_debut,old.numero_fin,old.date_production);
  end if;
  if new.statut = 'TERMINE' and length(new.imprimante) = 0 and v_changed then raise exception 'Indiquez l’imprimante utilisée pour ce tirage.'; end if;
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
notify pgrst,'reload schema';
commit;
