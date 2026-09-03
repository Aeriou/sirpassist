/**
 * Espaces de travail (groupes) — logique SQL pure, sans dépendance framework.
 *
 * Chaque fonction reçoit le client `sql` et l'`userId` VÉRIFIÉ (session Better
 * Auth) ; aucune ne fait confiance à un id venu du client. Les wrappers
 * `createServerFn` sont dans `workspace-api.ts`. Testable seul (voir
 * `scripts/dryrun-workspace.mts`).
 */
import type { Sql } from "./db";

export type WsRole = "owner" | "member";
export type WsStatus = "pending" | "active";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I O 0 1

export function genJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (let i = 0; i < 6; i += 1) s += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export type WorkspaceRow = {
  id: string;
  name: string;
  kind: string;
  join_code: string;
  owner_user_id: string;
  created_at: string;
};

type CountRow = { n: number };

async function isOwner(sql: Sql, workspaceId: string, userId: string): Promise<boolean> {
  const r = await sql<CountRow>`
    select count(*)::int as n from workspace
    where id = ${workspaceId} and owner_user_id = ${userId}
  `;
  return Boolean(r[0]?.n);
}

async function isActiveMember(sql: Sql, workspaceId: string, userId: string): Promise<boolean> {
  const r = await sql<CountRow>`
    select count(*)::int as n from workspace_member
    where workspace_id = ${workspaceId} and user_id = ${userId} and status = 'active'
  `;
  return Boolean(r[0]?.n);
}

export async function createWorkspace(
  sql: Sql,
  input: { userId: string; email: string; name: string; wsName: string; kind: string },
): Promise<{ id: string; name: string; kind: string; code: string }> {
  const wsName = input.wsName.trim().slice(0, 120) || "Groupe";
  const kind = input.kind === "independant" ? "independant" : "entreprise";
  const id = `ws_${crypto.randomUUID().slice(0, 12)}`;

  let code = genJoinCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const clash = await sql<CountRow>`
      select count(*)::int as n from workspace where join_code = ${code}
    `;
    if (!clash[0]?.n) break;
    code = genJoinCode();
  }

  await sql`
    insert into workspace (id, name, kind, join_code, owner_user_id)
    values (${id}, ${wsName}, ${kind}, ${code}, ${input.userId})
  `;
  await sql`
    insert into workspace_member (workspace_id, user_id, role, status, email, name, decided_at)
    values (${id}, ${input.userId}, 'owner', 'active', ${input.email}, ${input.name}, now())
  `;
  return { id, name: wsName, kind, code };
}

/** Espaces où l'utilisateur est membre actif OU a une demande en attente. */
export async function listMyWorkspaces(sql: Sql, userId: string) {
  return sql<{
    id: string;
    name: string;
    kind: string;
    join_code: string;
    owner_user_id: string;
    role: string;
    status: string;
  }>`
    select w.id, w.name, w.kind, w.join_code, w.owner_user_id, m.role, m.status
    from workspace w
    join workspace_member m on m.workspace_id = w.id
    where m.user_id = ${userId} and m.status in ('active', 'pending', 'invited')
    order by w.created_at
  `;
}

/** Résout un compte par e-mail (copie locale — module sans import de valeur). */
async function userByEmail(
  sql: Sql,
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  const rows = await sql<{ id: string; name: string | null; email: string | null }>`
    select id, name, email from "user" where lower(email) = ${clean} limit 1
  `;
  const r = rows[0];
  return r ? { id: r.id, name: r.name ?? "", email: (r.email ?? "").toLowerCase() } : null;
}

/** Le propriétaire invite un compte (par e-mail) à rejoindre son groupe. */
export async function inviteMember(
  sql: Sql,
  input: { workspaceId: string; byUserId: string; targetEmail: string },
): Promise<
  | { ok: false; reason: "forbidden" | "unknown_user" | "self" | "already" }
  | { ok: true; name: string; email: string }
> {
  if (!(await isOwner(sql, input.workspaceId, input.byUserId))) {
    return { ok: false, reason: "forbidden" };
  }
  const target = await userByEmail(sql, input.targetEmail);
  if (!target) return { ok: false, reason: "unknown_user" };
  if (target.id === input.byUserId) return { ok: false, reason: "self" };

  const existing = await sql<{ status: string }>`
    select status from workspace_member
    where workspace_id = ${input.workspaceId} and user_id = ${target.id} limit 1
  `;
  if (existing[0]) return { ok: false, reason: "already" };

  await sql`
    insert into workspace_member (workspace_id, user_id, role, status, email, name)
    values (${input.workspaceId}, ${target.id}, 'member', 'invited', ${target.email}, ${target.name})
  `;
  return { ok: true, name: target.name, email: target.email };
}

/** Invitations reçues par l'utilisateur (nom du groupe + qui invite). */
export async function listMyInvites(sql: Sql, userId: string) {
  return sql<{ id: string; name: string; kind: string; owner_name: string }>`
    select w.id, w.name, w.kind,
      coalesce((select om.name from workspace_member om
        where om.workspace_id = w.id and om.role = 'owner' limit 1), '') as owner_name
    from workspace w
    join workspace_member m on m.workspace_id = w.id
    where m.user_id = ${userId} and m.status = 'invited'
    order by w.created_at
  `;
}

/** Le destinataire accepte (devient membre actif) ou refuse (ligne supprimée). */
export async function respondInvite(
  sql: Sql,
  input: { workspaceId: string; userId: string; accept: boolean },
): Promise<{ ok: false; reason: "not_found" } | { ok: true; accepted: boolean }> {
  const rows = await sql<CountRow>`
    select count(*)::int as n from workspace_member
    where workspace_id = ${input.workspaceId} and user_id = ${input.userId} and status = 'invited'
  `;
  if (!rows[0]?.n) return { ok: false, reason: "not_found" };
  if (input.accept) {
    await sql`
      update workspace_member set status = 'active', decided_at = now()
      where workspace_id = ${input.workspaceId} and user_id = ${input.userId} and status = 'invited'
    `;
  } else {
    await sql`
      delete from workspace_member
      where workspace_id = ${input.workspaceId} and user_id = ${input.userId} and status = 'invited'
    `;
  }
  return { ok: true, accepted: input.accept };
}

/** Invitations envoyées encore en attente (propriétaire). */
export async function listSentInvites(
  sql: Sql,
  workspaceId: string,
  byUserId: string,
): Promise<
  | { ok: false; reason: "forbidden" }
  | { ok: true; invites: { user_id: string; email: string; name: string }[] }
> {
  if (!(await isOwner(sql, workspaceId, byUserId))) return { ok: false, reason: "forbidden" };
  const invites = await sql<{ user_id: string; email: string; name: string }>`
    select user_id, email, name from workspace_member
    where workspace_id = ${workspaceId} and status = 'invited'
    order by name
  `;
  return { ok: true, invites };
}

/** Le propriétaire retire une invitation non encore acceptée. */
export async function revokeInvite(
  sql: Sql,
  input: { workspaceId: string; targetUserId: string; byUserId: string },
): Promise<{ ok: false; reason: "forbidden" } | { ok: true }> {
  if (!(await isOwner(sql, input.workspaceId, input.byUserId))) {
    return { ok: false, reason: "forbidden" };
  }
  await sql`
    delete from workspace_member
    where workspace_id = ${input.workspaceId} and user_id = ${input.targetUserId} and status = 'invited'
  `;
  return { ok: true };
}

/** Annuler sa propre demande en attente (mauvais code, changement d'avis). */
export async function cancelJoinRequest(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true }> {
  await sql`
    delete from workspace_member
    where workspace_id = ${workspaceId} and user_id = ${userId} and status = 'pending'
  `;
  return { ok: true };
}

export async function requestJoin(
  sql: Sql,
  input: { userId: string; email: string; name: string; code: string },
): Promise<
  | { ok: false; reason: "unknown" | "invalid" }
  | { ok: true; status: WsStatus; role: WsRole; workspaceId: string; workspaceName: string }
> {
  const code = normalizeCode(input.code);
  if (code.length !== 6) return { ok: false, reason: "invalid" };

  const rows = await sql<WorkspaceRow>`
    select * from workspace where join_code = ${code} limit 1
  `;
  const ws = rows[0];
  if (!ws) return { ok: false, reason: "unknown" };

  const existing = await sql<{ status: string; role: string }>`
    select status, role from workspace_member
    where workspace_id = ${ws.id} and user_id = ${input.userId} limit 1
  `;
  if (existing[0]) {
    return {
      ok: true,
      status: existing[0].status === "active" ? "active" : "pending",
      role: existing[0].role === "owner" ? "owner" : "member",
      workspaceId: ws.id,
      workspaceName: ws.name,
    };
  }

  await sql`
    insert into workspace_member (workspace_id, user_id, role, status, email, name)
    values (${ws.id}, ${input.userId}, 'member', 'pending', ${input.email}, ${input.name})
  `;
  return {
    ok: true,
    status: "pending",
    role: "member",
    workspaceId: ws.id,
    workspaceName: ws.name,
  };
}

export async function listJoinRequests(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<
  | { ok: false; reason: "forbidden" }
  | { ok: true; requests: { user_id: string; email: string; name: string; requested_at: string }[] }
> {
  if (!(await isOwner(sql, workspaceId, userId))) return { ok: false, reason: "forbidden" };
  const requests = await sql<{
    user_id: string;
    email: string;
    name: string;
    requested_at: string;
  }>`
    select user_id, email, name, requested_at::text as requested_at
    from workspace_member
    where workspace_id = ${workspaceId} and status = 'pending'
    order by requested_at
  `;
  return { ok: true, requests };
}

export async function decideJoin(
  sql: Sql,
  input: { workspaceId: string; targetUserId: string; approve: boolean; userId: string },
): Promise<{ ok: false; reason: "forbidden" } | { ok: true }> {
  if (!(await isOwner(sql, input.workspaceId, input.userId))) {
    return { ok: false, reason: "forbidden" };
  }
  if (input.approve) {
    await sql`
      update workspace_member set status = 'active', decided_at = now()
      where workspace_id = ${input.workspaceId}
        and user_id = ${input.targetUserId}
        and status = 'pending'
    `;
  } else {
    await sql`
      delete from workspace_member
      where workspace_id = ${input.workspaceId}
        and user_id = ${input.targetUserId}
        and status = 'pending'
    `;
  }
  return { ok: true };
}

export async function listMembers(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<
  | { ok: false; reason: "forbidden" }
  | { ok: true; members: { user_id: string; email: string; name: string; role: string }[] }
> {
  if (!(await isActiveMember(sql, workspaceId, userId))) return { ok: false, reason: "forbidden" };
  const members = await sql<{ user_id: string; email: string; name: string; role: string }>`
    select user_id, email, name, role
    from workspace_member
    where workspace_id = ${workspaceId} and status = 'active'
    order by case role when 'owner' then 0 else 1 end, name
  `;
  return { ok: true, members };
}

export async function removeMember(
  sql: Sql,
  input: { workspaceId: string; targetUserId: string; userId: string },
): Promise<{ ok: false; reason: "forbidden" | "owner" } | { ok: true }> {
  if (!(await isOwner(sql, input.workspaceId, input.userId))) {
    return { ok: false, reason: "forbidden" };
  }
  const owner = await sql<{ owner_user_id: string }>`
    select owner_user_id from workspace where id = ${input.workspaceId}
  `;
  if (owner[0]?.owner_user_id === input.targetUserId) return { ok: false, reason: "owner" };
  await sql`
    delete from workspace_member
    where workspace_id = ${input.workspaceId} and user_id = ${input.targetUserId}
  `;
  return { ok: true };
}

/**
 * Suppression complète d'un groupe — propriétaire uniquement. Les membres, le
 * snapshot et les classeurs mis en commun partent en cascade (FK). Les
 * classeurs restent chez chaque membre dans son propre compte : seul le
 * partage vers le groupe disparaît.
 */
export async function deleteWorkspace(
  sql: Sql,
  input: { workspaceId: string; userId: string },
): Promise<{ ok: false; reason: "forbidden" } | { ok: true }> {
  if (!(await isOwner(sql, input.workspaceId, input.userId))) {
    return { ok: false, reason: "forbidden" };
  }
  await sql`delete from workspace where id = ${input.workspaceId}`;
  return { ok: true };
}

export async function myMembership(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<{ status: WsStatus | null; role: WsRole | null }> {
  const r = await sql<{ status: string; role: string }>`
    select status, role from workspace_member
    where workspace_id = ${workspaceId} and user_id = ${userId} limit 1
  `;
  if (!r[0]) return { status: null, role: null };
  return {
    status: r[0].status === "active" ? "active" : "pending",
    role: r[0].role === "owner" ? "owner" : "member",
  };
}

