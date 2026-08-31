-- Espaces de travail (groupes) côté serveur, avec validation d'adhésion.
--
-- Remplace l'ancien accès Supabase par simple code : « rejoindre » crée une
-- DEMANDE en attente, le propriétaire valide, et seuls les membres ACTIFS
-- peuvent lire ou écrire les données de l'espace (table workspace_snapshot).
--
-- user_id / owner_user_id : TEXT (id de session Better Auth), jamais un id
-- fourni par le client — chaque requête est filtrée serveur.

create table if not exists workspace (
  id text primary key,
  name text not null,
  kind text not null default 'entreprise',        -- 'entreprise' | 'independant'
  join_code text not null unique,
  owner_user_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists workspace_owner_idx on workspace (owner_user_id);

create table if not exists workspace_member (
  workspace_id text not null references workspace (id) on delete cascade,
  user_id text not null,
  role text not null default 'member',             -- 'owner' | 'member'
  status text not null default 'pending',          -- 'pending' | 'active'
  email text not null default '',
  name text not null default '',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (workspace_id, user_id)
);
create index if not exists workspace_member_user_idx on workspace_member (user_id, status);

create table if not exists workspace_snapshot (
  workspace_id text primary key references workspace (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
