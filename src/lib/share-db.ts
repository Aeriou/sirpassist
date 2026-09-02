/**
 * Partage ciblé — logique SQL pure (voir `share-api.ts` pour les wrappers
 * `createServerFn`, et `scripts/dryrun-share.mts` pour les tests).
 *
 * `userId` est TOUJOURS l'id de session Better Auth vérifié. Le client ne
 * fournit qu'une adresse e-mail comme cible ; on la résout ici.
 */
import type { Sql } from "./db";

export type ShareKind = "visit" | "anomaly";
export type ShareStatus = "pending" | "accepted" | "declined" | "cancelled";

export type ShareRow = {
  id: string;
  thread_id: string;
  reply_to: string | null;
  from_user_id: string;
  from_name: string;
  from_email: string;
  to_user_id: string;
  to_email: string;
  kind: ShareKind;
  title: string;
  summary: string;
  status: ShareStatus;
  created_at: string;
};

type CountRow = { n: number };

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 16)}`;
}

export async function findUserByEmail(
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

export async function sendOffer(
  sql: Sql,
  input: {
    fromUserId: string;
    fromName: string;
    fromEmail: string;
    toEmail: string;
    kind: ShareKind;
    title: string;
    summary: string;
    payload: unknown;
    replyTo?: string | null;
  },
): Promise<
  | { ok: false; reason: "unknown_user" | "self" | "bad_reply" }
  | { ok: true; id: string; threadId: string; toName: string; toEmail: string }
> {
  const target = await findUserByEmail(sql, input.toEmail);
  if (!target) return { ok: false, reason: "unknown_user" };
  if (target.id === input.fromUserId) return { ok: false, reason: "self" };

  let threadId = newId("thr");
  if (input.replyTo) {
    const prev = await sql<{ thread_id: string; from_user_id: string; to_user_id: string }>`
      select thread_id, from_user_id, to_user_id from share_offer where id = ${input.replyTo} limit 1
    `;
    const p = prev[0];
    // On ne peut répondre qu'à une proposition dont on était partie prenante.
    if (!p || (p.from_user_id !== input.fromUserId && p.to_user_id !== input.fromUserId)) {
      return { ok: false, reason: "bad_reply" };
    }
    threadId = p.thread_id;
  }

  const id = newId("shr");
  await sql`
    insert into share_offer
      (id, thread_id, reply_to, from_user_id, from_name, from_email,
       to_user_id, to_email, kind, title, summary, payload)
    values
      (${id}, ${threadId}, ${input.replyTo ?? null}, ${input.fromUserId}, ${input.fromName},
       ${input.fromEmail}, ${target.id}, ${target.email}, ${input.kind}, ${input.title.slice(0, 200)},
       ${input.summary.slice(0, 400)}, ${JSON.stringify(input.payload ?? {})}::jsonb)
  `;
  return { ok: true, id, threadId, toName: target.name, toEmail: target.email };
}

export async function listIncoming(sql: Sql, userId: string): Promise<ShareRow[]> {
  return sql<ShareRow>`
    select id, thread_id, reply_to, from_user_id, from_name, from_email, to_user_id,
           to_email, kind, title, summary, status, created_at::text as created_at
    from share_offer
    where to_user_id = ${userId} and status = 'pending'
    order by created_at desc
  `;
}

export async function listOutgoing(sql: Sql, userId: string): Promise<ShareRow[]> {
  return sql<ShareRow>`
    select id, thread_id, reply_to, from_user_id, from_name, from_email, to_user_id,
           to_email, kind, title, summary, status, created_at::text as created_at
    from share_offer
    where from_user_id = ${userId}
    order by created_at desc
    limit 50
  `;
}

export async function countIncoming(sql: Sql, userId: string): Promise<number> {
  const r = await sql<CountRow>`
    select count(*)::int as n from share_offer
    where to_user_id = ${userId} and status = 'pending'
  `;
  return r[0]?.n ?? 0;
}

/** Charge utile complète — seulement pour le destinataire d'une proposition en attente. */
export async function getPayloadForRecipient(
  sql: Sql,
  offerId: string,
  userId: string,
): Promise<{ ok: false } | { ok: true; kind: ShareKind; payload: unknown }> {
  const rows = await sql<{ kind: ShareKind; payload: unknown }>`
    select kind, payload from share_offer
    where id = ${offerId} and to_user_id = ${userId} and status = 'pending'
    limit 1
  `;
  const r = rows[0];
  return r ? { ok: true, kind: r.kind, payload: r.payload } : { ok: false };
}

export async function respondOffer(
  sql: Sql,
  input: { offerId: string; userId: string; accept: boolean },
): Promise<
  | { ok: false; reason: "not_found" }
  | { ok: true; accepted: boolean; kind: ShareKind; payload: unknown }
> {
  const rows = await sql<{ kind: ShareKind; payload: unknown }>`
    select kind, payload from share_offer
    where id = ${input.offerId} and to_user_id = ${input.userId} and status = 'pending'
    limit 1
  `;
  const r = rows[0];
  if (!r) return { ok: false, reason: "not_found" };
  await sql`
    update share_offer
    set status = ${input.accept ? "accepted" : "declined"}, resolved_at = now()
    where id = ${input.offerId} and to_user_id = ${input.userId} and status = 'pending'
  `;
  return { ok: true, accepted: input.accept, kind: r.kind, payload: r.payload };
}

export async function cancelOffer(
  sql: Sql,
  input: { offerId: string; userId: string },
): Promise<{ ok: false; reason: "not_found" } | { ok: true }> {
  const rows = await sql<CountRow>`
    select count(*)::int as n from share_offer
    where id = ${input.offerId} and from_user_id = ${input.userId} and status = 'pending'
  `;
  if (!rows[0]?.n) return { ok: false, reason: "not_found" };
  await sql`
    update share_offer set status = 'cancelled', resolved_at = now()
    where id = ${input.offerId} and from_user_id = ${input.userId} and status = 'pending'
  `;
  return { ok: true };
}
