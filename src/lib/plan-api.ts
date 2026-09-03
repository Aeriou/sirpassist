import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "./db";
import { resolveServerPlan } from "./plan-server";

async function scopedSql(userId: string): Promise<Sql> {
  const { getScopedSql } = await import("@/lib/db");
  return getScopedSql(userId);
}

async function emailOf(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return rows[0]?.email ?? null;
}

/**
 * Forfait effectif de l'utilisateur connecté — source de vérité serveur.
 * Le client lit ceci et n'écrit jamais le forfait lui-même.
 */
export const apiGetMyPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{ plan: "trial" | "basic" | "pro" | "expired"; trialEndsAt: string | null; owner: boolean }> => {
      const sql = await scopedSql(context.userId);
      const email = await emailOf(sql, context.userId);
      return resolveServerPlan(sql, context.userId, email);
    },
  );
