/**
 * Validation des comptes — fonctions serveur.
 * Le contrôle « propriétaire » se fait par e-mail (OWNER_EMAILS), jamais depuis
 * le client.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { vBool, vOneOf, vReqStr, vStr, vStrArr } from "@/lib/validate";
import type { Sql } from "./db";
import * as adb from "./account-db";
import { isOwnerEmail } from "./plan-server";

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

/** Connexion scopée RLS. Réservée à la lecture de SA PROPRE ligne
 *  `account_approval` — les fonctions propriétaire (liste / décision) doivent
 *  rester sur `getSqlClient()` (accès inter-comptes). */
async function scopedSql(userId: string): Promise<Sql> {
  const { getScopedSql } = await import("@/lib/db");
  return getScopedSql(userId);
}

async function emailOf(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return (rows[0]?.email ?? "").toLowerCase();
}

export const apiMyAccountStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ status: adb.ApprovalStatus | "none"; owner: boolean }> => {
    const sql = await scopedSql(context.userId);
    const email = await emailOf(sql, context.userId);
    if (isOwnerEmail(email)) return { status: "approved", owner: true };
    return { status: await adb.myApprovalStatus(sql, context.userId), owner: false };
  });

export const apiListPendingAccounts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<
      | { ok: false; reason: "forbidden" }
      | { ok: true; pending: adb.PendingRow[]; recent: adb.PendingRow[] }
    > => {
      const sql = await getSqlClient();
      if (!isOwnerEmail(await emailOf(sql, context.userId))) {
        return { ok: false, reason: "forbidden" };
      }
      return {
        ok: true,
        pending: await adb.listPendingAccounts(sql),
        recent: await adb.listRecentDecisions(sql),
      };
    },
  );

export const apiDecideAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetUserId: string; approve: boolean }) => ({ targetUserId: vReqStr(input.targetUserId, 64), approve: vBool(input.approve) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true } | { ok: false; reason: "forbidden" | "not_found" }> => {
      const sql = await getSqlClient();
      if (!isOwnerEmail(await emailOf(sql, context.userId))) {
        return { ok: false, reason: "forbidden" };
      }
      return adb.decideAccount(sql, {
        targetUserId: data.targetUserId,
        approve: data.approve,
        deciderUserId: context.userId,
      });
    },
  );
