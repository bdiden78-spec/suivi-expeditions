-- ==========================================================
-- LogiTrak v18 — Listes administrateur, OF verrouillé, N° d'envoi verrouillé
-- À exécuter dans Supabase > SQL Editor, EN DERNIER (après setup, production, security-hardening).
-- Non destructif : aucune donnée n'est supprimée. Peut être relancé sans risque.
-- ==========================================================

-- 1. Listes gérées par l'administrateur (catégories, unités, types de carton)
create table if not exists public.parametres (
  cle text primary key,
  valeurs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.parametres enable row level security;

drop policy if exists "lecture parametres operateurs" on public.parametres;
drop policy if exists "ajout parametres admin" on public.parametres;
drop policy if exists "modif parametres admin" on public.parametres;
drop policy if exists "suppression parametres admin" on public.parametres;
create policy "lecture parametres operateurs" on public.parametres
  for select to authenticated using (public.is_operator());
create policy "ajout parametres admin" on public.parametres
  for insert to authenticated with check (public.is_admin());
create policy "modif parametres admin" on public.parametres
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "suppression parametres admin" on public.parametres
  for delete to authenticated using (public.is_admin());

insert into public.parametres (cle, valeurs) values
  ('categories',   '["RUBAN","ETIQUETTE","ETIQUETTE RFID","CARTE PVC","TAG"]'::jsonb),
  ('unites',       '["UN","PAQUET","ID"]'::jsonb),
  ('types_carton', '["H1","H2"]'::jsonb)
on conflict (cle) do nothing;

-- 2. Ordre de fabrication : format MOyymm-xxxx imposé (ex. MO2610-0000)
--    Contrôlé à la création et dès que l'OF est modifié ; les anciens OF déjà saisis restent intacts.
create or replace function public.check_of_format()
returns trigger language plpgsql as $$
declare v_check boolean;
begin
  if tg_op = 'INSERT' then v_check := true;
  else v_check := new.of_numero is distinct from old.of_numero;
  end if;
  if v_check and coalesce(new.of_numero, '') !~ '^MO[0-9]{2}(0[1-9]|1[0-2])-[0-9]{4}$' then
    raise exception 'Ordre de fabrication invalide : format MOyymm-xxxx attendu (ex. MO2610-0000).';
  end if;
  return new;
end; $$;
drop trigger if exists production_of_format on public.production;
create trigger production_of_format before insert or update of of_numero on public.production
for each row execute function public.check_of_format();

-- 3. Sauvegarde d'un envoi : N° d'envoi verrouillé pour les opérateurs
--    - Création par un opérateur : le N° est calculé par le serveur (ENV + année + n° à 3 chiffres)
--    - Modification par un opérateur : le N° d'origine est conservé
--    - Administrateur : peut saisir / modifier le N° librement
--    Cette fonction contient aussi les colonnes de production (production_id, OF, carton, catégorie) :
--    elle remplace celle de setup.sql qui ne les enregistrait pas.
alter table public.lignes_expedition add column if not exists categorie text default '';
alter table public.lignes_expedition add column if not exists type_carton text default '';
alter table public.lignes_expedition add column if not exists poids_carton numeric(10,3) default 0;
alter table public.lignes_expedition add column if not exists of_numero text default '';
alter table public.lignes_expedition add column if not exists production_id uuid references public.production(id) on delete set null;

create or replace function public.save_expedition(
  p_id uuid, p_date_envoi date, p_numero_bl text, p_transporteur text, p_observations text, p_items jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_num text; v_year text; v_max int;
begin
  if p_id is null then
    if public.is_admin() then
      v_num := nullif(trim(coalesce(p_numero_bl, '')), '');
    else
      v_year := to_char(p_date_envoi, 'YYYY');
      select coalesce(max((substring(numero_bl from ('^ENV' || v_year || '([0-9]+)$')))::int), 0)
        into v_max from public.expeditions where numero_bl ~ ('^ENV' || v_year || '[0-9]+$');
      v_num := 'ENV' || v_year || lpad((v_max + 1)::text, 3, '0');
    end if;
    insert into public.expeditions (date_envoi, numero_bl, transporteur, observations)
    values (p_date_envoi, v_num, p_transporteur, p_observations) returning id into v_id;
  else
    if not exists (select 1 from public.expeditions where id = p_id and (public.is_admin() or now() - created_at < interval '48 hours')) then
      raise exception 'Modification impossible : délai de 48h dépassé ou accès refusé.';
    end if;
    select numero_bl into v_num from public.expeditions where id = p_id;
    if public.is_admin() then
      v_num := coalesce(nullif(trim(coalesce(p_numero_bl, '')), ''), v_num);
    end if;
    update public.expeditions
       set date_envoi = p_date_envoi, numero_bl = v_num, transporteur = p_transporteur,
           observations = p_observations, updated_at = now()
     where id = p_id returning id into v_id;
    delete from public.lignes_expedition where expedition_id = v_id;
  end if;

  insert into public.lignes_expedition (expedition_id, reference, categorie, designation, destinataire, unite, quantite, cartons, production_id, type_carton, poids_carton, of_numero)
  select v_id,
         coalesce(x->>'reference', ''),
         coalesce(x->>'categorie', ''),
         coalesce(x->>'designation', ''),
         coalesce(x->>'destinataire', 'STOCK'),
         coalesce(x->>'unite', 'UN'),
         coalesce(x->>'quantite', '0'),
         coalesce((x->>'cartons')::int, 1),
         nullif(x->>'production_id', '')::uuid,
         coalesce(x->>'type_carton', ''),
         coalesce(nullif(x->>'poids_carton', '')::numeric, 0),
         coalesce(x->>'of_numero', '')
  from jsonb_array_elements(p_items) x;

  return v_id;
end; $$;

-- 4. Accueil « Lots expédiés » : rattache aux lots de production les anciennes lignes d'envoi
--    qui ont gardé l'OF et la référence mais pas le lien production_id.
update public.lignes_expedition l
   set production_id = p.id
  from public.production p
 where l.production_id is null
   and coalesce(l.of_numero, '') <> ''
   and l.of_numero = p.of_numero
   and l.reference = p.reference;

-- Diagnostic (à lancer à part si « Lots expédiés » reste à 0) :
--   select count(*) filter (where production_id is not null) as lignes_liees,
--          count(*) filter (where production_id is null)     as lignes_sans_lien
--     from public.lignes_expedition;
-- Si « lignes_liees » vaut 0, les envois ont été enregistrés avant ce correctif :
-- ouvrez l'envoi, ré-importez le lot depuis la production, puis enregistrez.
