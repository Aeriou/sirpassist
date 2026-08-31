-- Tickets support (bug / amélioration). Accès uniquement via jeton de revue
-- (liens e-mail). Pas de liste publique, pas de suppression de masse.
create table if not exists support_tickets (
  id text primary key,
  kind text not null,
  title text not null,
  description text not null,
  page text,
  photos_json text not null default '[]',
  author_name text not null,
  author_email text not null,
  author_title text not null,
  author_level text not null,
  organisation text not null,
  workspace_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'envoye',
  review_token text not null,
  reviewed_at timestamptz,
  grok_prompt text
);
create unique index if not exists support_tickets_token_idx on support_tickets (review_token);
