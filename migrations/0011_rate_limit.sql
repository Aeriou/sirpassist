-- Limitation de débit — compteur à fenêtre fixe, partagé (serverless = pas de
-- mémoire persistante entre invocations).
--
-- `subject` = id de compte vérifié, ou `ip:<addr>` pour les endpoints publics
-- (proxy géo). Une ligne par (bucket, subject, fenêtre). Les vieilles lignes
-- sont purgées opportunistement par le code.

create table if not exists rate_limit (
  bucket text not null,
  subject text not null,
  window_start bigint not null,   -- epoch (s), aligné sur la fenêtre
  count integer not null default 0,
  primary key (bucket, subject, window_start)
);

create index if not exists rate_limit_gc_idx on rate_limit (window_start);
