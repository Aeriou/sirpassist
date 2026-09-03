/**
 * Classeurs partagés dans un groupe — fonctions serveur exposées au client.
 *
 * Toutes sous `authMiddleware` : `context.userId` = id de session Better Auth
 * vérifié. Le client choisit un `workspaceId` de groupe et un `classeurId` à
 * lui ; l'appartenance active est vérifiée dans `group-classeur-db.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { hitRateLimit } from "./rate-limit";
import { vObject, vReqStr, vStr } from "./validate";
import type { Sql } from "./db";
import * as gdb from "./group-classeur-db";

const MAX_PAYLOAD_BYTES = 6_000_000; // ~6 Mo de JSON (photos exclues côté client)

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function currentName(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ name: string | null }>`
    select name from "user" where id = ${userId} limit 1
  `;
  return rows[0]?.name ?? "";
}

export const apiShareClasseurToGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { workspaceId: string; classeurId: string; name: string; payload: unknown }) => ({
      workspaceId: vReqStr(input.workspaceId, 64),
      classeurId: vReqStr(input.classeurId, 64),
      name: vStr(input.name, 200),
      payload: vObject(input.payload, MAX_PAYLOAD_BYTES),
    }),
  )
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    const rl = await hitRateLimit(sql, {
      bucket: "classeur:share",
      subject: context.userId,
      limit: 120,
      windowSec: 3600,
    });
    if (!rl.ok) {
      return { ok: false as const, reason: "rate_limited" as const, retryAfter: rl.retryAfter };
    }
    const name = await currentName(sql, context.userId);
    return gdb.shareClasseur(sql, {
      workspaceId: data.workspaceId,
      userId: context.userId,
      userName: name,
      classeurId: data.classeurId,
      name: data.name,
      payload: data.payload,
    });
  });

export const apiUnshareClasseurFromGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; classeurId: string }) => ({
    workspaceId: vReqStr(input.workspaceId, 64),
    classeurId: vReqStr(input.classeurId, 64),
  }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    return gdb.unshareClasseur(sql, {
      workspaceId: data.workspaceId,
      userId: context.userId,
      classeurId: data.classeurId,
    });
  });

export type SharedClasseurView = {
  workspaceId: string;
  classeurId: string;
  sharedByName: string;
  sharedByMe: boolean;
  name: string;
  updatedAt: string;
  /** `GroupClasseurPayload` sérialisé (parsé côté client). */
  payloadJson: string;
};

export const apiListGroupClasseurs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({
    workspaceId: vReqStr(input.workspaceId, 64),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: false; reason: "forbidden" | "not_found" }
      | { ok: true; classeurs: SharedClasseurView[] }
    > => {
      const sql = await getSqlClient();
      const res = await gdb.listGroupClasseurs(sql, data.workspaceId, context.userId);
      if (!res.ok) return res;
      return {
        ok: true,
        classeurs: res.classeurs.map((c) => ({
          workspaceId: c.workspace_id,
          classeurId: c.classeur_id,
          sharedByName: c.shared_by_name,
          sharedByMe: c.shared_by === context.userId,
          name: c.name,
          updatedAt: c.updated_at,
          payloadJson: JSON.stringify(c.payload ?? {}),
        })),
      };
    },
  );

export const apiMySharedClasseurIds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => ({
    workspaceId: vReqStr(input.workspaceId, 64),
  }))
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    const ids = await gdb.mySharedClasseurIds(sql, data.workspaceId, context.userId);
    return { ok: true as const, ids };
  });
