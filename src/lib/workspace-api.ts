/**
 * Espaces de travail (groupes) — fonctions serveur exposées au client.
 *
 * Toutes protégées par `authMiddleware` : `context.userId` est l'id de session
 * Better Auth vérifié. Le client n'envoie jamais d'id d'utilisateur.
 * La logique SQL est dans `workspace-db.ts` (testable seule).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { vBool, vOneOf, vReqStr, vStr, vStrArr } from "@/lib/validate";
import type { Sql } from "./db";
import type { WorkspaceCloudSnapshot } from "./types";
import * as wdb from "./workspace-db";

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

/** Nom + e-mail de l'utilisateur courant, depuis la table Better Auth `user`. */
async function currentUser(
  sql: Sql,
  userId: string,
): Promise<{ email: string; name: string }> {
  const rows = await sql<{ email: string | null; name: string | null }>`
    select email, name from "user" where id = ${userId} limit 1
  `;
  const row = rows[0];
  return {
    email: (row?.email ?? "").toLowerCase(),
    name: row?.name ?? "",
  };
}

export const apiCreateWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; kind: "entreprise" | "independant" }) => ({ name: vStr(input.name, 120), kind: vOneOf(input.kind, ["entreprise", "independant"] as const, "entreprise") }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    const { email, name } = await currentUser(sql, context.userId);
    const ws = await wdb.createWorkspace(sql, {
      userId: context.userId,
      email,
      name,
      wsName: data.name,
      kind: data.kind,
    });
    return { ok: true as const, workspace: ws };
  });

export const apiListWorkspaces = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSqlClient();
    const rows = await wdb.listMyWorkspaces(sql, context.userId);
    return {
      ok: true as const,
      workspaces: rows.map((w) => {
        const pending = w.status !== "active";
        return {
          id: w.id,
          name: w.name,
          // Un membre en attente ne reçoit que le nom : ni le code, ni le type,
          // ni le rôle réel tant que le propriétaire n'a pas validé.
          kind: pending ? "" : w.kind,
          code: pending ? "" : w.join_code,
          role: !pending && w.role === "owner" ? ("owner" as const) : ("member" as const),
          status: pending ? ("pending" as const) : ("active" as const),
          isOwner: !pending && w.owner_user_id === context.userId,
        };
      }),
    };
  });

export const apiCancelJoinRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({ workspaceId: vReqStr(input.workspaceId, 64) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return wdb.cancelJoinRequest(sql, data.workspaceId, context.userId);
  });

export const apiRequestJoin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string }) => ({ code: vStr(input.code, 16) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    const { email, name } = await currentUser(sql, context.userId);
    return wdb.requestJoin(sql, { userId: context.userId, email, name, code: data.code });
  });

export const apiListJoinRequests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({ workspaceId: vReqStr(input.workspaceId, 64) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return wdb.listJoinRequests(sql, data.workspaceId, context.userId);
  });

export const apiDecideJoin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; targetUserId: string; approve: boolean }) => ({ workspaceId: vReqStr(input.workspaceId, 64), targetUserId: vReqStr(input.targetUserId, 64), approve: vBool(input.approve) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return wdb.decideJoin(sql, {
      workspaceId: data.workspaceId,
      targetUserId: data.targetUserId,
      approve: data.approve,
      userId: context.userId,
    });
  });

export const apiListMembers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({ workspaceId: vReqStr(input.workspaceId, 64) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    const res = await wdb.listMembers(sql, data.workspaceId, context.userId);
    if (!res.ok) return res;
    return {
      ok: true as const,
      members: res.members.map((m) => ({
        userId: m.user_id,
        email: m.email,
        name: m.name,
        role: m.role === "owner" ? ("owner" as const) : ("member" as const),
        isSelf: m.user_id === context.userId,
      })),
    };
  });

export const apiRemoveMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; targetUserId: string }) => ({ workspaceId: vReqStr(input.workspaceId, 64), targetUserId: vReqStr(input.targetUserId, 64) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return wdb.removeMember(sql, {
      workspaceId: data.workspaceId,
      targetUserId: data.targetUserId,
      userId: context.userId,
    });
  });

export const apiMyMembership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({ workspaceId: vReqStr(input.workspaceId, 64) }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return wdb.myMembership(sql, data.workspaceId, context.userId);
  });

export const apiPullWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({ workspaceId: vReqStr(input.workspaceId, 64) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: false; reason: "forbidden" }
      | { ok: true; snapshot: WorkspaceCloudSnapshot | null }
    > => {
      const sql = await getSqlClient();
      const res = await wdb.pullWorkspaceData(sql, data.workspaceId, context.userId);
      if (!res.ok) return res;
      return { ok: true, snapshot: (res.snapshot as WorkspaceCloudSnapshot | null) ?? null };
    },
  );

export const apiPushWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; snapshot: WorkspaceCloudSnapshot }) => ({ workspaceId: vReqStr(input.workspaceId, 64), snapshot: input.snapshot }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return wdb.pushWorkspaceData(sql, data.workspaceId, context.userId, data.snapshot);
  });
