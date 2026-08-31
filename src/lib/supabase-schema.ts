/** One-shot SQL for the project's Supabase SQL editor. */
export const SUPABASE_SCHEMA_SQL = `-- SiprAssist — copie cloud (exécuter une fois : SQL Editor → Run)
create table if not exists public.sipr_snapshots (
  workspace_id text primary key,
  join_code text not null unique,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists sipr_snapshots_code_idx
  on public.sipr_snapshots (upper(join_code));

alter table public.sipr_snapshots enable row level security;

revoke all on public.sipr_snapshots from anon, authenticated, public;

create or replace function public.sipr_pull(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  if p_code is null or length(trim(p_code)) < 4 then
    return null;
  end if;
  select workspace_id, snapshot, updated_at into rec
  from public.sipr_snapshots
  where upper(join_code) = upper(trim(p_code));
  if not found then
    return null;
  end if;
  return json_build_object(
    'workspace_id', rec.workspace_id,
    'updated_at', rec.updated_at,
    'snapshot', rec.snapshot
  );
end;
$$;

create or replace function public.sipr_push(p_code text, p_workspace_id text, p_snapshot jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  wid text;
  existing_id text;
  existing_code text;
begin
  code := upper(trim(coalesce(p_code, '')));
  wid := trim(coalesce(p_workspace_id, ''));
  if length(code) < 4 or wid = '' or p_snapshot is null then
    raise exception 'paramètres invalides';
  end if;

  select s.workspace_id, s.join_code into existing_id, existing_code
  from public.sipr_snapshots s
  where s.workspace_id = wid or upper(s.join_code) = code
  limit 1;

  if existing_id is not null then
    if existing_id <> wid or upper(existing_code) <> code then
      raise exception 'code ou espace déjà utilisé';
    end if;
    update public.sipr_snapshots
      set snapshot = p_snapshot, updated_at = now()
      where workspace_id = wid;
  else
    insert into public.sipr_snapshots (workspace_id, join_code, snapshot, updated_at)
    values (wid, code, p_snapshot, now());
  end if;

  return json_build_object('ok', true, 'workspace_id', wid, 'updated_at', now());
end;
$$;

-- Porte volontaire : tablette hors-ligne, accès par code groupe uniquement.
-- Le linter WARN 0028/0029 sur sipr_pull / sipr_push est attendu.
revoke all on function public.sipr_pull(text) from public, authenticated;
revoke all on function public.sipr_push(text, text, jsonb) from public, authenticated;
grant execute on function public.sipr_pull(text) to anon;
grant execute on function public.sipr_push(text, text, jsonb) to anon;

create table if not exists public.sipr_accounts (
  email text primary key,
  user_id text not null,
  name text not null,
  title text not null,
  level int not null default 3,
  organisation text not null default '',
  kind text not null default 'entreprise',
  workspace_id text not null,
  join_code text not null,
  salt text not null,
  password_hash text not null,
  plan text not null default 'trial',
  trial_ends_at text,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sipr_accounts enable row level security;
revoke all on public.sipr_accounts from anon, authenticated, public;

create or replace function public.sipr_account_salt(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  mail text;
begin
  mail := lower(trim(coalesce(p_email, '')));
  if position('@' in mail) = 0 then
    return null;
  end if;
  select salt into s from public.sipr_accounts where lower(email) = mail;
  if s is null then
    select u->>'salt' into s
    from public.sipr_snapshots snap
    cross join lateral jsonb_array_elements(coalesce(snap.snapshot->'users', '[]'::jsonb)) u
    where lower(coalesce(u->>'email', '')) = mail
    limit 1;
  end if;
  if s is null or s = '' then
    return null;
  end if;
  return json_build_object('salt', s);
end;
$$;

create or replace function public.sipr_account_login(p_email text, p_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  acc public.sipr_accounts%rowtype;
  snap jsonb;
  code text;
  wid text;
  u jsonb;
  mail text;
begin
  mail := lower(trim(coalesce(p_email, '')));
  if mail = '' or p_hash is null then
    return json_build_object('ok', false);
  end if;
  select * into acc from public.sipr_accounts where lower(email) = mail;
  if found and acc.password_hash = p_hash then
    select snapshot into snap from public.sipr_snapshots
      where upper(join_code) = upper(acc.join_code) or workspace_id = acc.workspace_id
      limit 1;
    return json_build_object(
      'ok', true,
      'join_code', acc.join_code,
      'workspace_id', acc.workspace_id,
      'user', json_build_object(
        'id', acc.user_id,
        'name', acc.name,
        'email', acc.email,
        'title', acc.title,
        'level', acc.level,
        'organisation', acc.organisation,
        'kind', acc.kind,
        'workspaceId', acc.workspace_id,
        'homeWorkspaceId', acc.workspace_id,
        'salt', acc.salt,
        'passwordHash', acc.password_hash,
        'plan', acc.plan,
        'trialEndsAt', acc.trial_ends_at,
        'stripeCustomerId', acc.stripe_customer_id,
        'stripeSubscriptionId', acc.stripe_subscription_id
      ),
      'snapshot', snap
    );
  end if;

  select snap.snapshot, snap.join_code, snap.workspace_id, u
    into snap, code, wid, u
  from public.sipr_snapshots snap
  cross join lateral jsonb_array_elements(coalesce(snap.snapshot->'users', '[]'::jsonb)) u
  where lower(coalesce(u->>'email', '')) = mail
    and coalesce(u->>'passwordHash', '') = p_hash
  limit 1;

  if snap is null or u is null then
    return json_build_object('ok', false);
  end if;

  insert into public.sipr_accounts (
    email, user_id, name, title, level, organisation, kind, workspace_id, join_code,
    salt, password_hash, plan, trial_ends_at, updated_at
  ) values (
    mail,
    coalesce(u->>'id', 'user_cloud'),
    coalesce(u->>'name', 'Conseiller'),
    coalesce(u->>'title', 'Conseiller en prévention'),
    coalesce((u->>'level')::int, 3),
    coalesce(u->>'organisation', ''),
    coalesce(u->>'kind', 'entreprise'),
    wid,
    code,
    coalesce(u->>'salt', ''),
    p_hash,
    coalesce(u->>'plan', 'trial'),
    u->>'trialEndsAt',
    now()
  )
  on conflict (email) do update set
    password_hash = excluded.password_hash,
    salt = excluded.salt,
    workspace_id = excluded.workspace_id,
    join_code = excluded.join_code,
    updated_at = now();

  return json_build_object(
    'ok', true,
    'join_code', code,
    'workspace_id', wid,
    'user', json_build_object(
      'id', coalesce(u->>'id', 'user_cloud'),
      'name', coalesce(u->>'name', 'Conseiller'),
      'email', mail,
      'title', coalesce(u->>'title', 'Conseiller en prévention'),
      'level', coalesce((u->>'level')::int, 3),
      'organisation', coalesce(u->>'organisation', ''),
      'kind', coalesce(u->>'kind', 'entreprise'),
      'workspaceId', wid,
      'homeWorkspaceId', coalesce(u->>'homeWorkspaceId', wid),
      'salt', coalesce(u->>'salt', ''),
      'passwordHash', p_hash,
      'plan', coalesce(u->>'plan', 'trial'),
      'trialEndsAt', u->>'trialEndsAt',
      'stripeCustomerId', u->>'stripeCustomerId',
      'stripeSubscriptionId', u->>'stripeSubscriptionId'
    ),
    'snapshot', snap
  );
end;
$$;

create or replace function public.sipr_account_upsert(
  p_email text,
  p_user_id text,
  p_name text,
  p_title text,
  p_level int,
  p_organisation text,
  p_kind text,
  p_workspace_id text,
  p_join_code text,
  p_salt text,
  p_hash text,
  p_plan text,
  p_trial_ends_at text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  mail text;
begin
  mail := lower(trim(coalesce(p_email, '')));
  if position('@' in mail) = 0 or p_user_id is null or p_hash is null then
    raise exception 'compte invalide';
  end if;
  insert into public.sipr_accounts (
    email, user_id, name, title, level, organisation, kind, workspace_id, join_code,
    salt, password_hash, plan, trial_ends_at, updated_at
  ) values (
    mail, p_user_id, p_name, p_title, coalesce(p_level, 3), coalesce(p_organisation, ''),
    coalesce(p_kind, 'entreprise'), p_workspace_id, upper(trim(p_join_code)),
    p_salt, p_hash, coalesce(p_plan, 'trial'), p_trial_ends_at, now()
  )
  on conflict (email) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    title = excluded.title,
    level = excluded.level,
    organisation = excluded.organisation,
    kind = excluded.kind,
    workspace_id = excluded.workspace_id,
    join_code = excluded.join_code,
    salt = excluded.salt,
    password_hash = excluded.password_hash,
    plan = excluded.plan,
    trial_ends_at = excluded.trial_ends_at,
    updated_at = now();
  return json_build_object('ok', true, 'email', mail);
end;
$$;

create or replace function public.sipr_account_set_billing(
  p_email text,
  p_plan text,
  p_customer text,
  p_subscription text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  mail text;
begin
  mail := lower(trim(coalesce(p_email, '')));
  update public.sipr_accounts
    set plan = coalesce(p_plan, plan),
        stripe_customer_id = coalesce(p_customer, stripe_customer_id),
        stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
        updated_at = now()
    where lower(email) = mail;
  if not found then
    return json_build_object('ok', false);
  end if;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.sipr_account_salt(text) from public, authenticated;
revoke all on function public.sipr_account_login(text, text) from public, authenticated;
revoke all on function public.sipr_account_upsert(text, text, text, text, int, text, text, text, text, text, text, text, text) from public, authenticated;
revoke all on function public.sipr_account_set_billing(text, text, text, text) from public, authenticated;
grant execute on function public.sipr_account_salt(text) to anon;
grant execute on function public.sipr_account_login(text, text) to anon;
grant execute on function public.sipr_account_upsert(text, text, text, text, int, text, text, text, text, text, text, text, text) to anon;
grant execute on function public.sipr_account_set_billing(text, text, text, text) to anon;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
`;

const ACCOUNTS_MARK = "create table if not exists public.sipr_accounts";

export const SUPABASE_ACCOUNTS_SQL =
  `-- SiprAssist — connexion e-mail PC / smartphone (coller une fois, puis Run)\n` +
  SUPABASE_SCHEMA_SQL.slice(SUPABASE_SCHEMA_SQL.indexOf(ACCOUNTS_MARK));

/** Correctif à coller si le schéma est déjà en place (alertes Advisor). */
export const SUPABASE_HARDENING_SQL = `-- SiprAssist — resserrer les droits (schéma déjà créé)
revoke all on function public.sipr_pull(text) from public, authenticated;
revoke all on function public.sipr_push(text, text, jsonb) from public, authenticated;
grant execute on function public.sipr_pull(text) to anon;
grant execute on function public.sipr_push(text, text, jsonb) to anon;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
`;
