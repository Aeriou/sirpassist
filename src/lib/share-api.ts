/**
 * Partage ciblé — fonctions serveur exposées au client.
 *
 * Toutes sous `authMiddleware` : `context.userId` = id de session Better Auth
 * vérifié. Le client n'envoie jamais d'id d'utilisateur, seulement une adresse
 * e-mail comme cible. Logique SQL dans `share-db.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { hitRateLimit } from "./rate-limit";
import { vBool, vOneOf, vReqStr, vStr } from "./validate";
import type { Sql } from "./db";
import * as sdb from "./share-db";
import { isSharePayloadV1, type SharePayloadV1 } from "./share-payload";

const MAX_PAYLOAD_BYTES = 8_000_000; // ~8 Mo de JSON (photos comprises)

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

/** Connexion scopée RLS — pour les endpoints où tout se filtre sur
 *  `context.userId` (from/to). `apiSendShare` reste sur `getSqlClient()` :
 *  il doit lire la ligne `account_approval` du DESTINATAIRE. */
async function scopedSql(userId: string): Promise<Sql> {
  const { getScopedSql } = await import("@/lib/db");
  return getScopedSql(userId);
}

async function currentUser(sql: Sql, userId: string): Promise<{ email: string; name: string }> {
  const rows = await sql<{ email: string | null; name: string | null }>`
    select email, name from "user" where id = ${userId} limit 1
  `;
  const row = rows[0];
  return { email: (row?.email ?? "").toLowerCase(), name: row?.name ?? "" };
}

export const apiSendShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      toEmail: string;
      kind: "visit" | "anomaly";
      title: string;
      summary: string;
      payload: SharePayloadV1;
      replyTo?: string | null;
    }) => ({
      toEmail: vReqStr(input.toEmail, 200).toLowerCase(),
      kind: vOneOf(input.kind, ["visit", "anomaly"] as const, "visit"),
      title: vStr(input.title, 200),
      summary: vStr(input.summary, 400),
      payload: input.payload,
      replyTo: typeof input.replyTo === "string" ? input.replyTo.slice(0, 64) : null,
    }),
  )
  .handler(async ({ data, context }) => {
    const sql = await getSqlClient();
    const rl = await hitRateLimit(sql, {
      bucket: "share:send",
      subject: context.userId,
      limit: 30,
      windowSec: 3600,
    });
    if (!rl.ok) {
      return { ok: false as const, reason: "rate_limited" as const, retryAfter: rl.retryAfter };
    }
    if (!isSharePayloadV1(data.payload)) {
      return { ok: false as const, reason: "bad_payload" as const };
    }
    if (JSON.stringify(data.payload).length > MAX_PAYLOAD_BYTES) {
      return { ok: false as const, reason: "too_large" as const };
    }
    const me = await currentUser(sql, context.userId);
    return sdb.sendOffer(sql, {
      fromUserId: context.userId,
      fromName: me.name,
      fromEmail: me.email,
      toEmail: data.toEmail,
      kind: data.kind,
      title: data.title,
      summary: data.summary,
      payload: data.payload,
      replyTo: data.replyTo ?? null,
    });
  });

/** Aperçu de la charge utile SANS consommer la proposition (destinataire seul). */
export const apiPreviewShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offerId: string }) => ({ offerId: vReqStr(input.offerId, 64) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: false }
      | { ok: true; kind: "visit" | "anomaly"; payload: SharePayloadV1 | null }
    > => {
      const sql = await scopedSql(context.userId);
      const res = await sdb.getPayloadForRecipient(sql, data.offerId, context.userId);
      if (!res.ok) return { ok: false };
      return {
        ok: true,
        kind: res.kind,
        payload: (res.payload as SharePayloadV1 | null) ?? null,
      };
    },
  );

export const apiListIncomingShares = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await scopedSql(context.userId);
    const rows = await sdb.listIncoming(sql, context.userId);
    return { ok: true as const, offers: rows };
  });

export const apiListOutgoingShares = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await scopedSql(context.userId);
    const rows = await sdb.listOutgoing(sql, context.userId);
    return { ok: true as const, offers: rows };
  });

export const apiShareInboxCount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await scopedSql(context.userId);
    return { ok: true as const, count: await sdb.countIncoming(sql, context.userId) };
  });

export const apiRespondShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offerId: string; accept: boolean }) => ({
    offerId: vReqStr(input.offerId, 64),
    accept: vBool(input.accept),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: false; reason: "not_found" }
      | { ok: true; accepted: boolean; kind: "visit" | "anomaly"; payload: SharePayloadV1 | null }
    > => {
      const sql = await scopedSql(context.userId);
      const res = await sdb.respondOffer(sql, {
        offerId: data.offerId,
        userId: context.userId,
        accept: data.accept,
      });
      if (!res.ok) return res;
      return {
        ok: true,
        accepted: res.accepted,
        kind: res.kind,
        payload: (res.payload as SharePayloadV1 | null) ?? null,
      };
    },
  );

export const apiCancelShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offerId: string }) => ({ offerId: vReqStr(input.offerId, 64) }))
  .handler(async ({ data, context }) => {
    const sql = await scopedSql(context.userId);
    return sdb.cancelOffer(sql, { offerId: data.offerId, userId: context.userId });
  });
