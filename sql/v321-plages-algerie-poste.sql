-- Correction des plages sur une installation Algérie Poste existante.
begin;
create or replace function public.ap_plage_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_first text;
  v_last text;
begin
  new.numero_debut := upper(trim(new.numero_debut));
  new.numero_fin := upper(trim(new.numero_fin));
  v_first := regexp_replace(new.numero_debut, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g');
  v_last := regexp_replace(new.numero_fin, '[[:space:]' || chr(160) || chr(8239) || ']', '', 'g');

  if v_first ~ '^[0-9]+$' and v_last ~ '^[0-9]+$' then
    if length(v_first) > 40 or length(v_last) > 40 then
      raise exception 'Numéro trop long (40 chiffres maximum).';
    end if;
    if v_last::numeric - v_first::numeric + 1 <> new.quantite_imprimee then
      raise exception 'La plage numérique inclusive doit correspondre à la quantité imprimée.';
    end if;
  end if;
  return new;
end;
$$;
commit;
