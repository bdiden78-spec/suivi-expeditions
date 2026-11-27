begin;
create or replace function public.ap_regrouper_fractions_liste(p_commandes uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare ids uuid[];pending uuid[];result uuid;candidate uuid;progress boolean;last_error text;
begin
 if not public.is_operator() then raise exception 'Compte opérateur requis.';end if;
 select array_agg(distinct id order by id) into ids from unnest(p_commandes) as u(id) where id is not null;
 if coalesce(cardinality(ids),0)<2 then raise exception 'Choisissez au moins deux fractions.';end if;
 pending:=ids[2:cardinality(ids)];
 -- Étendre depuis une fraction adjacente, indépendamment de l’ordre des UUID.
 -- Chaque appel réutilise les contrôles UPW/type/date/plage/stock.
 while cardinality(pending)>0 loop
  progress:=false;
  foreach candidate in array pending loop
   begin
    result:=public.ap_regrouper_fractions(ids[1],candidate);
    pending:=array_remove(pending,candidate);
    progress:=true;
   exception when raise_exception then
    get stacked diagnostics last_error=message_text;
   end;
  end loop;
  if not progress then raise exception 'Regroupement annulé : %',coalesce(last_error,'Fractions incompatibles.');end if;
 end loop;
 return result;
end $$;
revoke all on function public.ap_regrouper_fractions_liste(uuid[]) from public;
grant execute on function public.ap_regrouper_fractions_liste(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
