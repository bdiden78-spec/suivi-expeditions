-- ==========================================================
-- OPTIONNEL : autoriser les visiteurs (non connectés) à CONSULTER les envois.
-- Par défaut (security-hardening.sql), seuls les opérateurs connectés lisent les envois.
-- N'exécutez ce script QUE si vous voulez que les visiteurs puissent voir la liste des envois
-- (en lecture seule). Les visiteurs ne voient jamais la production ni le colisage.
-- Pour revenir en arrière : relancez sql/security-hardening.sql.
-- ==========================================================
drop policy if exists "lecture publique expeditions" on expeditions;
create policy "lecture publique expeditions" on expeditions for select to anon, authenticated using (true);

drop policy if exists "lecture publique lignes" on lignes_expedition;
create policy "lecture publique lignes" on lignes_expedition for select to anon, authenticated using (true);
