/**
 * Magasin de dossiers par compte — fonctions serveur.
 * Sous `authMiddleware` : `context.userId` = id de session Better Auth vérifié.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "./db";
import * as udb from "./user-store-db";
import type { UserSnapshot } from "./user-snapshot";

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export const apiPullUserStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ rev: number; data: UserSnapshot | null }> => {
    const sql = await getSqlClient();
    const r = await udb.pullUserStore(sql, context.userId);
    return { rev: r.rev, data: (r.data as UserSnapshot | null) ?? null };
  });

export const apiPushUserStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { data: UserSnapshot; baseRev: number }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; rev: number }
      | { ok: false; reason: "stale"; rev: number; data: UserSnapshot | null }
    > => {
      const sql = await getSqlClient();
      const res = await udb.pushUserStore(sql, context.userId, data.data, data.baseRev);
      if (res.ok) return res;
      return {
        ok: false,
        reason: "stale",
        rev: res.rev,
        data: (res.data as UserSnapshot | null) ?? null,
      };
    },
  );
