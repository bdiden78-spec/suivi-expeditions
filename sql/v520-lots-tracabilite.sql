-- LogiTrak 5.2.0 : lots facultatifs, préfixe automatique et quatre chiffres manuels.
begin;
alter table public.production add column if not exists lots_tracabilite jsonb not null default '[]'::jsonb;

create or replace function public.lt_product_batches_guard()
returns trigger
language plpgsql
set search_path = ''
as $batches$
declare
  entry jsonb;
  assigned bigint := 0;
  batch_number text;
  numbers text[] := array[]::text[];
  q bigint;
  prefix text;
  category text;
begin
  category := upper(coalesce(new.categorie, ''));
  prefix := case
    when category like '%PVC%' or upper(coalesce(new.reference, '')) like 'PVC%' then 'CL'
    when category like '%RFID%' then 'RFL'
    when category like '%RUBAN%' or category like '%TTR%' then 'RL'
    when category like '%ETIQUET%' or category like '%ÉTIQUET%' then 'EL'
    else null
  end;
  if prefix is not null then
    prefix := prefix || to_char(coalesce(new.date_production, current_date), 'YY') || '-';
  end if;
  if jsonb_typeof(new.lots_tracabilite) is distinct from 'array' then
    raise exception 'La liste des lots doit être un tableau.';
  end if;
  if jsonb_array_length(new.lots_tracabilite) > 500 then
    raise exception 'Maximum 500 numéros de lot par production.';
  end if;
  for entry in select value from jsonb_array_elements(new.lots_tracabilite)
  loop
    if jsonb_typeof(entry) is distinct from 'object' then
      raise exception 'Chaque lot doit contenir un numéro et une quantité facultative.';
    end if;
    batch_number := upper(btrim(entry->>'numero'));
    if coalesce(length(batch_number), 0) = 0 or length(batch_number) > 100 then
      raise exception 'Numéro de lot obligatoire (100 caractères maximum).';
    end if;
    if prefix is not null then
      if batch_number !~ ('^' || prefix || '[0-9]{4}$') then
        raise exception 'Format attendu : % suivi de 4 chiffres saisis par l’opérateur.', prefix;
      end if;
    end if;
    if batch_number = any(numbers) then
      raise exception 'Numéro de lot en double : %', batch_number;
    end if;
    numbers := array_append(numbers, batch_number);
    if entry->>'quantite' is not null then
      if (entry->>'quantite') !~ '^[0-9]{1,10}$' then
        raise exception 'Quantité de lot invalide.';
      end if;
      q := (entry->>'quantite')::bigint;
      if q < 1 or q > 2147483647 then
        raise exception 'Quantité de lot hors limites.';
      end if;
      assigned := assigned + q;
    end if;
  end loop;
  if assigned > new.quantite_produite then
    raise exception 'La somme des quantités de lot dépasse la quantité produite.';
  end if;
  if cardinality(numbers) > 0 then
    new.numero_lot := array_to_string(numbers, ' · ');
  end if;
  return new;
end;
$batches$;

drop trigger if exists lt_product_batches_guard on public.production;
create trigger lt_product_batches_guard
before insert or update on public.production
for each row execute function public.lt_product_batches_guard();
notify pgrst, 'reload schema';
commit;
