alter table public.ap_commandes add column if not exists regroupement_h2 boolean not null default false;
notify pgrst,'reload schema';
