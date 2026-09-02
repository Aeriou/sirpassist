/**
 * Magasin de dossiers par compte — logique SQL pure (verrou optimiste `rev`).
 * Wrappers `createServerFn` dans `user-store-api.ts`, tests dans
 * `scripts/dryrun-user-store.mts`.
 */
import type { Sql } from "./db";

export type PullResult = { rev: number; data: unknown };

export type PushResult =
  | { ok: true; rev: number }
  | { ok: false; reason: "stale"; rev: number; data: unknown };

export async function pullUserStore(sql: Sql, userId: string): Promise<PullResult> {
  const rows = await sql<{ rev: number; data: unknown }>`
    select rev, data from user_store where user_id = ${userId} limit 1
  `;
  const r = rows[0];
  return r ? { rev: r.rev, data: r.data } : { rev: 0, data: null };
}

export async function pushUserStore(
  sql: Sql,
  userId: string,
  data: unknown,
  baseRev: number,
): Promise<PushResult> {
  const json = JSON.stringify(data ?? {});

  if (baseRev <= 0) {
    // Première écriture : insérer si la ligne n'existe pas encore.
    const ins = await sql<{ rev: number }>`
      insert into user_store (user_id, data, rev, updated_at)
      values (${userId}, ${json}::jsonb, 1, now())
      on conflict (user_id) do nothing
      returning rev
    `;
    if (ins[0]) return { ok: true, rev: ins[0].rev };
    const cur = await pullUserStore(sql, userId);
    return { ok: false, reason: "stale", rev: cur.rev, data: cur.data };
  }

  const upd = await sql<{ rev: number }>`
    update user_store
    set data = ${json}::jsonb, rev = rev + 1, updated_at = now()
    where user_id = ${userId} and rev = ${baseRev}
    returning rev
  `;
  if (upd[0]) return { ok: true, rev: upd[0].rev };

  const cur = await pullUserStore(sql, userId);
  return { ok: false, reason: "stale", rev: cur.rev, data: cur.data };
}
