-- Partage ciblé d'un dossier (visite) ou d'un signalement (constat) entre deux
-- comptes, avec acceptation explicite du destinataire.
--
-- Modèle : COPIE, pas d'édition partagée en direct. L'expéditeur envoie une
-- proposition à une adresse e-mail ; le destinataire l'accepte ou la refuse.
-- Un aller-retour (le destinataire retravaille puis renvoie) est une nouvelle
-- proposition rattachée au même `thread_id`, avec `reply_to` = id précédent.
--
-- from_user_id / to_user_id : TEXT = id de session Better Auth, résolus
-- serveur. Le client n'envoie jamais d'id — seulement une adresse e-mail.

create table if not exists share_offer (
  id text primary key,
  thread_id text not null,
  reply_to text,
  from_user_id text not null,
  from_name text not null default '',
  from_email text not null default '',
  to_user_id text not null,
  to_email text not null default '',
  kind text not null,                            -- 'visit' | 'anomaly'
  title text not null default '',
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',        -- 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists share_offer_inbox_idx on share_offer (to_user_id, status);
create index if not exists share_offer_outbox_idx on share_offer (from_user_id, status);
create index if not exists share_offer_thread_idx on share_offer (thread_id);
