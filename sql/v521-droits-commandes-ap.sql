-- LogiTrak 5.2.1 : commandes AP modifiables par leur créateur ou admin ; suppression admin uniquement.
begin;
drop policy if exists ap_modification on public.ap_commandes;
create policy ap_modification on public.ap_commandes for update to authenticated
 using(public.is_operator() and (public.is_admin() or created_by=public.get_username()))
 with check(public.is_operator() and (public.is_admin() or created_by=public.get_username()));
drop policy if exists ap_suppression on public.ap_commandes;
create policy ap_suppression on public.ap_commandes for delete to authenticated using(public.is_admin());
-- Les politiques restrictives évitent qu’une ancienne politique permissive ouvre les droits.
drop policy if exists ap_owner_update_restriction on public.ap_commandes;
create policy ap_owner_update_restriction on public.ap_commandes as restrictive for update to authenticated
 using(public.is_operator() and (public.is_admin() or created_by=public.get_username()))
 with check(public.is_operator() and (public.is_admin() or created_by=public.get_username()));
drop policy if exists ap_admin_delete_restriction on public.ap_commandes;
create policy ap_admin_delete_restriction on public.ap_commandes as restrictive for delete to authenticated using(public.is_admin());

create or replace function public.ap_owner_edit_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor text:=public.get_username();planned bigint;
begin
 if tg_op='DELETE' then
  if not public.is_admin() and not (auth.uid() is null and current_user in ('postgres','supabase_admin','service_role')) then
   raise exception 'La suppression des commandes est réservée à l’administrateur.';
  end if;
  return old;
 end if;
 if new.ap_numero is distinct from old.ap_numero then raise exception 'Le numéro APN° est définitif, même pour un administrateur.';end if;
 if new.created_by is distinct from old.created_by then raise exception 'Le créateur de la commande ne peut pas être changé.';end if;
 -- ap_touch_commande met seulement à jour la révision lorsqu’un autre opérateur imprime.
 -- Ce suivi technique doit rester possible sans lui donner le droit de modifier la commande.
 if (to_jsonb(new)-array['revision','updated_at']) is distinct from (to_jsonb(old)-array['revision','updated_at']) then
  if not public.is_admin() and actor is distinct from old.created_by
   and not (auth.uid() is null and current_user in ('postgres','supabase_admin','service_role')) then
   raise exception 'Seul le créateur de la commande ou un administrateur peut la modifier.';
  end if;
 end if;
 if new.quantite_demandee is distinct from old.quantite_demandee then
  select coalesce(sum(case when statut='EN_COURS' then quantite_prevue else quantite_imprimee end),0)
   into planned from public.ap_productions where commande_id=old.id;
  if new.quantite_demandee<planned then raise exception 'Quantité inférieure aux % ID produits ou en cours.',planned;end if;
 end if;
 return new;
end $$;
drop trigger if exists ap_owner_edit_guard on public.ap_commandes;
create trigger ap_owner_edit_guard before update or delete on public.ap_commandes
for each row execute function public.ap_owner_edit_guard();
notify pgrst,'reload schema';
commit;
