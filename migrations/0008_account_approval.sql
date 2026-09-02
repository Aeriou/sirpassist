-- Validation des nouveaux comptes par le propriétaire.
--
-- À l'inscription, une ligne `pending` est créée (voir le hook `user.create`
-- dans src/lib/auth/server.ts). Le propriétaire (OWNER_EMAILS) valide ou refuse
-- depuis l'app. Un compte non validé ne peut ni envoyer ni recevoir de partage.
--
-- `ACCOUNTS_AUTO_APPROVE=true` (env) : les nouveaux comptes sont validés
-- d'office (à utiliser quand la vérification e-mail Resend est active).
--
-- Les comptes déjà présents sont considérés validés (backfill ci-dessous +
-- « pas de ligne = validé » dans le code, par sécurité).

create table if not exists account_approval (
  user_id text primary key,
  email text not null default '',
  name text not null default '',
  status text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create index if not exists account_approval_status_idx on account_approval (status);

insert into account_approval (user_id, email, name, status, decided_at, decided_by)
select id, lower(email), name, 'approved', now(), 'backfill'
from "user"
on conflict (user_id) do nothing;
