-- Magasin d'images par compte (photos de constats).
--
-- Les photos sont volumineuses : elles ne rentrent pas dans le blob
-- `user_store` poussé à chaque modification. Ici chaque image est une ligne,
-- adressée par le hash de son contenu (`asset_id`) — deux constats avec la même
-- photo partagent la ligne. Le blob `user_store` ne garde qu'un `photoAssetId`.
--
-- `data` = data URL base64 (le format déjà manipulé côté app), texte.

create table if not exists user_asset (
  user_id text not null,
  asset_id text not null,
  mime text not null default 'image/jpeg',
  data text not null,
  bytes integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create index if not exists user_asset_user_idx on user_asset (user_id);
