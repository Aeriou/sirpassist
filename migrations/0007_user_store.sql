-- Magasin de dossiers par compte, source de vérité côté serveur.
--
-- L'app tenait ses dossiers uniquement dans le localStorage du navigateur :
-- vider le cache ou changer d'appareil = tout perdre. Ici chaque compte a une
-- ligne `data` (JSON) synchronisée : visites, constats, notices FDS, RPS, plans
-- PGP/PAA, profil, tickets, corbeille. Les PHOTOS restent locales pour l'instant
-- (blob volumineux — un magasin d'images serveur viendra plus tard).
--
-- `rev` = verrou optimiste : le client renvoie la révision sur laquelle il
-- s'appuie ; si elle a bougé (autre onglet / autre appareil), l'écriture est
-- refusée, le client refusionne et repousse.

create table if not exists user_store (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  rev integer not null default 0,
  updated_at timestamptz not null default now()
);
