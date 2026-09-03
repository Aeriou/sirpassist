/**
 * Magasin d'images par compte — fonctions serveur (authMiddleware).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "./db";
import * as assetDb from "./asset-db";

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

// ~4 Mo de data URL max par image (garde-fou ; nos photos font ~100–300 Ko).
const MAX_DATA_LEN = 4_000_000;

export const apiPutAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assetId: string; mime: string; data: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    if (!data.assetId || !data.data.startsWith("data:") || data.data.length > MAX_DATA_LEN) {
      return { ok: false };
    }
    const sql = await getSqlClient();
    return assetDb.putAsset(sql, context.userId, {
      assetId: data.assetId.slice(0, 64),
      mime: data.mime.slice(0, 64) || "image/jpeg",
      data: data.data,
    });
  });

export const apiGetAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assetId: string }) => input)
  .handler(async ({ data, context }): Promise<{ data: string | null }> => {
    const sql = await getSqlClient();
    const row = await assetDb.getAsset(sql, context.userId, data.assetId);
    return { data: row?.data ?? null };
  });

export const apiListAssetIds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ids: string[] }> => {
    const sql = await getSqlClient();
    return { ids: await assetDb.listAssetIds(sql, context.userId) };
  });
