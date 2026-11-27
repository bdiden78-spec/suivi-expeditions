-- LogiTrak 5.2.1 : validation à CREATED_AT + 24 heures (jamais DATE_ENVOI).
-- À exécuter comme postgres dans Supabase SQL Editor.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create table if not exists public.lt_auto_validation_errors(
 expedition_id uuid primary key references public.expeditions(id) on delete cascade,
 last_attempt timestamptz not null default now(),last_error text not null,attempts integer not null default 1
);
alter table public.lt_auto_validation_errors enable row level security;
revoke all on public.lt_auto_validation_errors from anon,authenticated;
grant select on public.lt_auto_validation_errors to authenticated;
drop policy if exists auto_errors_admin on public.lt_auto_validation_errors;
create policy auto_errors_admin on public.lt_auto_validation_errors for select to authenticated using(public.is_admin());

create or replace function public.lt_expedition_creation_clock() returns trigger
language plpgsql set search_path='' as $clock$
begin
 if tg_op='INSERT' then new.created_at:=clock_timestamp();
 else new.created_at:=old.created_at;
 end if;
 return new;
end;
$clock$;
drop trigger if exists lt_expedition_creation_clock on public.expeditions;
create trigger lt_expedition_creation_clock before insert or update on public.expeditions
for each row execute function public.lt_expedition_creation_clock();

create or replace function public.lt_auto_validate_due_shipments() returns integer
language plpgsql security definer set search_path='' as $auto$
declare shipment record;validated integer:=0;
begin
 -- Un travail interrompu ou une seconde exécution ne doit pas doubler les traitements.
 if not pg_try_advisory_xact_lock(hashtextextended('logitrak-auto-validation-24h',0)) then return 0;end if;
 for shipment in select id from public.expeditions
  where validation='A_VALIDER' and created_at is not null
  and created_at<=now()-interval '24 hours'
  order by created_at,id for update skip locked
 loop
  begin
   -- Le contrôle de stock de la 5.2.0 reste actif : un envoi invalide ne sera pas forcé.
   update public.expeditions set validation='VALIDE',valide_par='Automatique (24 h)',valide_at=now(),updated_at=now()
    where id=shipment.id and validation='A_VALIDER';
   if found then validated:=validated+1;end if;
   delete from public.lt_auto_validation_errors where expedition_id=shipment.id;
  exception when others then
   insert into public.lt_auto_validation_errors(expedition_id,last_error)
    values(shipment.id,sqlerrm)
    on conflict(expedition_id) do update set last_attempt=now(),last_error=excluded.last_error,attempts=public.lt_auto_validation_errors.attempts+1;
  end;
 end loop;
 return validated;
end;
$auto$;
revoke all on function public.lt_auto_validate_due_shipments() from public,anon,authenticated;
-- Même nom : une réexécution remplace le travail existant, sans doublon.
select cron.schedule('logitrak-auto-validation-24h','* * * * *','select public.lt_auto_validate_due_shipments();');
notify pgrst,'reload schema';
commit;
-- Vérification du travail installé (l’exécution effective a lieu à la prochaine minute).
select jobid,jobname,schedule,active from cron.job where jobname='logitrak-auto-validation-24h';
