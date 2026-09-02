/**
 * Validation des comptes — logique SQL pure. Wrappers dans `account-api.ts`,
 * tests dans `scripts/dryrun-account.mts`.
 *
 * `userId` = id de session Better Auth vérifié. Le contrôle « suis-je le
 * propriétaire ? » se fait par e-mail (OWNER_EMAILS) dans les wrappers.
 */
import type { Sql } from "./db";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type PendingRow = {
  user_id: string;
  email: string;
  name: string;
  status: ApprovalStatus;
  requested_at: string;
};

/**
 * Un compte est autorisé si : aucune ligne (compte d'avant cette
 * fonctionnalité, backfill), OU ligne `approved`. Les comptes propriétaires
 * sont `approved` d'office (hook `user.create` + backfill).
 */
export async function isAccountApproved(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ status: string }>`
    select status from account_approval where user_id = ${userId} limit 1
  `;
  if (!rows[0]) return true;
  return rows[0].status === "approved";
}

export async function myApprovalStatus(
  sql: Sql,
  userId: string,
): Promise<ApprovalStatus | "none"> {
  const rows = await sql<{ status: ApprovalStatus }>`
    select status from account_approval where user_id = ${userId} limit 1
  `;
  return rows[0]?.status ?? "none";
}

export async function listPendingAccounts(sql: Sql): Promise<PendingRow[]> {
  return sql<PendingRow>`
    select user_id, email, name, status, requested_at::text as requested_at
    from account_approval
    where status = 'pending'
    order by requested_at
  `;
}

export async function listRecentDecisions(sql: Sql, limit = 20): Promise<PendingRow[]> {
  return sql<PendingRow>`
    select user_id, email, name, status, requested_at::text as requested_at
    from account_approval
    where status in ('approved', 'rejected') and decided_by <> 'backfill'
    order by decided_at desc nulls last
    limit ${limit}
  `;
}

export async function decideAccount(
  sql: Sql,
  input: { targetUserId: string; approve: boolean; deciderUserId: string },
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const rows = await sql<{ user_id: string }>`
    select user_id from account_approval
    where user_id = ${input.targetUserId} and status = 'pending' limit 1
  `;
  if (!rows[0]) return { ok: false, reason: "not_found" };
  await sql`
    update account_approval
    set status = ${input.approve ? "approved" : "rejected"},
        decided_at = now(),
        decided_by = ${input.deciderUserId}
    where user_id = ${input.targetUserId}
  `;
  return { ok: true };
}

/**
 * Purge des données applicatives d'un compte supprimé (hook `afterDelete`).
 * Le `user` Better Auth (et session/account/twoFactor par cascade) est déjà
 * parti à ce stade. Best-effort, dans l'ordre des dépendances.
 */
export async function purgeUserData(sql: Sql, userId: string): Promise<void> {
  await sql`
    delete from workspace_snapshot
    where workspace_id in (select id from workspace where owner_user_id = ${userId})
  `;
  await sql`delete from workspace where owner_user_id = ${userId}`;
  await sql`delete from workspace_member where user_id = ${userId}`;
  await sql`delete from share_offer where from_user_id = ${userId} or to_user_id = ${userId}`;
  await sql`delete from user_store where user_id = ${userId}`;
  await sql`delete from sipr_billing where user_id = ${userId}`;
  await sql`delete from account_approval where user_id = ${userId}`;
}

/** Créée à l'inscription (hook Better Auth). Idempotent. */
export async function ensureApprovalRow(
  sql: Sql,
  input: { userId: string; email: string; name: string; autoApprove: boolean },
): Promise<void> {
  const status: ApprovalStatus = input.autoApprove ? "approved" : "pending";
  const decidedAt = input.autoApprove ? new Date().toISOString() : null;
  await sql`
    insert into account_approval (user_id, email, name, status, decided_at, decided_by)
    values (
      ${input.userId}, ${input.email.toLowerCase()}, ${input.name},
      ${status}, ${decidedAt}, ${input.autoApprove ? "auto" : null}
    )
    on conflict (user_id) do nothing
  `;
}
