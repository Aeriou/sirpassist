-- Classeurs mis en commun dans un groupe (lecture seule côté membres).
--
-- Chaque membre ACTIF d'un espace peut y publier un de ses classeurs : le
-- contenu (visites + constats, sans photos base64) est copié dans `payload`.
-- Les autres membres actifs le lisent, sans jamais l'écrire. Le partage ciblé
-- personne -> personne (table share_offer) reste disponible en parallèle.
--
-- shared_by : id de session Better Auth vérifié (jamais fourni par le client).

create table if not exists group_classeur (
  workspace_id   text not null references workspace (id) on delete cascade,
  classeur_id    text not null,
  shared_by      text not null,
  shared_by_name text not null default '',
  name           text not null default '',
  payload        jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, classeur_id)
);

create index if not exists group_classeur_ws_idx on group_classeur (workspace_id);
create index if not exists group_classeur_by_idx on group_classeur (shared_by);
