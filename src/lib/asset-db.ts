/**
 * Magasin d'images par compte — logique SQL pure. Adressage par contenu :
 * `assetId` = hash de la data URL (voir `asset-id.ts` côté client).
 */
import type { Sql } from "./db";

export async function putAsset(
  sql: Sql,
  userId: string,
  input: { assetId: string; mime: string; data: string },
): Promise<{ ok: true }> {
  await sql`
    insert into user_asset (user_id, asset_id, mime, data, bytes)
    values (${userId}, ${input.assetId}, ${input.mime}, ${input.data}, ${input.data.length})
    on conflict (user_id, asset_id) do nothing
  `;
  return { ok: true };
}

export async function getAsset(
  sql: Sql,
  userId: string,
  assetId: string,
): Promise<{ mime: string; data: string } | null> {
  const rows = await sql<{ mime: string; data: string }>`
    select mime, data from user_asset where user_id = ${userId} and asset_id = ${assetId} limit 1
  `;
  return rows[0] ?? null;
}

export async function listAssetIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ asset_id: string }>`
    select asset_id from user_asset where user_id = ${userId}
  `;
  return rows.map((r) => r.asset_id);
}

export async function assetStats(
  sql: Sql,
  userId: string,
): Promise<{ count: number; bytes: number }> {
  const rows = await sql<{ n: number; total: number }>`
    select count(*)::int as n, coalesce(sum(bytes), 0)::bigint as total
    from user_asset where user_id = ${userId}
  `;
  return { count: rows[0]?.n ?? 0, bytes: Number(rows[0]?.total ?? 0) };
}

/** Ménage : supprime les images qu'aucun dossier ne référence plus. */
export async function deleteAssetsExcept(
  sql: Sql,
  userId: string,
  keepIds: string[],
): Promise<number> {
  if (keepIds.length === 0) {
    const r = await sql<{ n: number }>`
      with d as (delete from user_asset where user_id = ${userId} returning 1)
      select count(*)::int as n from d
    `;
    return r[0]?.n ?? 0;
  }
  const r = await sql<{ n: number }>`
    with d as (
      delete from user_asset
      where user_id = ${userId} and not (asset_id = any(${keepIds}))
      returning 1
    )
    select count(*)::int as n from d
  `;
  return r[0]?.n ?? 0;
}
