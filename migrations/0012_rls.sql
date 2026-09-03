-- Row-Level Security — défense en profondeur.
--
-- INERTE tant que l'app se connecte avec le rôle PROPRIÉTAIRE des tables
-- (Postgres ignore la RLS pour le propriétaire / BYPASSRLS). Ça n'a donc AUCUN
-- effet sur la prod actuelle ni sur PGLite en local.
--
-- Pour l'ACTIVER : créer un rôle restreint, y basculer `DATABASE_URL`, et faire
-- `SET LOCAL app.user_id = '<id vérifié>'` au début de chaque requête. Voir
-- `SETUP-RLS.md`.
--
-- Politique : `app.user_id` est un paramètre de session posé par l'app à partir
-- de l'id Better Auth VÉRIFIÉ. `current_setting(…, true)` renvoie NULL si absent
-- (donc « deny » pour le rôle restreint tant que l'app ne l'a pas posé).

alter table user_store        enable row level security;
alter table user_asset        enable row level security;
alter table account_approval  enable row level security;
alter table sipr_billing      enable row level security;
alter table share_offer       enable row level security;

drop policy if exists p_owner on user_store;
create policy p_owner on user_store
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

drop policy if exists p_owner on user_asset;
create policy p_owner on user_asset
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

drop policy if exists p_owner on account_approval;
create policy p_owner on account_approval
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

drop policy if exists p_owner on sipr_billing;
create policy p_owner on sipr_billing
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

-- Un partage appartient à l'expéditeur OU au destinataire.
drop policy if exists p_party on share_offer;
create policy p_party on share_offer
  using (
    from_user_id = current_setting('app.user_id', true)
    or to_user_id = current_setting('app.user_id', true)
  )
  with check (from_user_id = current_setting('app.user_id', true));
