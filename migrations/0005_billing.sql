-- Forfait par utilisateur, source de vérité côté serveur.
--
-- Écrit uniquement par : le webhook Stripe signé et la confirmation de paiement
-- (server function authentifiée). Le client lit via `apiGetMyPlan`, il n'écrit
-- jamais. L'accès Pro gratuit du propriétaire est une constante serveur
-- (`OWNER_EMAILS` dans src/lib/plan-server.ts), pas une ligne ici.

create table if not exists sipr_billing (
  user_id text primary key,
  plan text not null default 'trial',            -- 'trial' | 'basic' | 'pro' | 'expired'
  trial_ends_at text,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
