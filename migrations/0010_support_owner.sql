-- Support interne : la revue passe désormais par une vue propriétaire dans
-- l'app (plus d'e-mail FormSubmit, plus de lien à jeton). On garde
-- `review_token` (index unique) pour ne pas casser le schéma, mais il n'est
-- plus exposé. Nouvelle colonne : le compte auteur, pour tracer la demande.

alter table support_tickets add column if not exists author_user_id text;
create index if not exists support_tickets_user_idx on support_tickets (author_user_id);
create index if not exists support_tickets_status_idx on support_tickets (status);
