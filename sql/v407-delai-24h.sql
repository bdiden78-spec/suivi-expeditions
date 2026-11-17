begin;
-- Actualise les règles installées sans remplacer les autres conditions d'accès.
do $$
declare
  p record;
  f record;
  using_new text;
  check_new text;
  definition text;
begin
  for p in
    select * from pg_policies
    where schemaname='public' and tablename in
      ('expeditions','lignes_expedition','production','colisage_ref','ap_commandes','ap_productions','cartons_stock')
  loop
    using_new := replace(replace(p.qual,'48:00:00','24:00:00'),'48 hours','24 hours');
    check_new := replace(replace(p.with_check,'48:00:00','24:00:00'),'48 hours','24 hours');
    if using_new is distinct from p.qual or check_new is distinct from p.with_check then
      execute format('alter policy %I on %I.%I%s%s',p.policyname,p.schemaname,p.tablename,
        case when using_new is null then '' else format(' using (%s)',using_new) end,
        case when check_new is null then '' else format(' with check (%s)',check_new) end);
    end if;
  end loop;
  for f in
    select pg_get_functiondef(r.oid) as source from pg_proc r join pg_namespace n on n.oid=r.pronamespace
    where n.nspname='public' and r.prokind='f' and r.proname in
      ('save_expedition','production_guard','apply_colisage_ref','save_carton_stock','expedition_guard')
  loop
    definition := regexp_replace(f.source, '(48)(:00:00|[[:space:]]*h(ours)?)', '24\2','g');
    if definition<>f.source then execute definition; end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
