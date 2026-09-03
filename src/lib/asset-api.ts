/**
 * Magasin d'images par compte — fonctions serveur (authMiddleware).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { vBool, vOneOf, vReqStr, vStr, vStrArr } from "@/lib/validate";
import { hitRateLimit } from "./rate-limit";
import * as assetDb from "./asset-db";

async function scopedSql(userId: string) {
  const { getScopedSql } = await import("@/lib/db");
  return getScopedSql(userId);
}

// ~4 Mo de data URL max par image (garde-fou ; nos photos font ~150–350 Ko).
const MAX_DATA_LEN = 4_000_000;
// Quota par compte : nombre d'images et poids total (base64).
const MAX_ASSETS_PER_USER = 3000;
const MAX_BYTES_PER_USER = 300_000_000; // ~300 Mo

export const apiPutAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assetId: string; mime: string; data: string }) => ({ assetId: vStr(input.assetId, 64), mime: vStr(input.mime, 64), data: vStr(input.data, 4_200_000) }))
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: "quota" | "rate" }> => {
    if (!data.assetId || !data.data.startsWith("data:image/") || data.data.length > MAX_DATA_LEN) {
      return { ok: false };
    }
    const sql = await scopedSql(context.userId);

    const rl = await hitRateLimit(sql, {
      bucket: "asset:put",
      subject: context.userId,
      limit: 300,
      windowSec: 3600,
    });
    if (!rl.ok) return { ok: false, reason: "rate" };

    const stats = await assetDb.assetStats(sql, context.userId);
    if (
      stats.count >= MAX_ASSETS_PER_USER ||
      stats.bytes + data.data.length > MAX_BYTES_PER_USER
    ) {
      return { ok: false, reason: "quota" };
    }

    return assetDb.putAsset(sql, context.userId, {
      assetId: data.assetId.slice(0, 64),
      mime: data.mime.slice(0, 64) || "image/jpeg",
      data: data.data,
    });
  });

export const apiGetAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assetId: string }) => ({ assetId: vReqStr(input.assetId, 64) }))
  .handler(async ({ data, context }): Promise<{ data: string | null }> => {
    const sql = await scopedSql(context.userId);
    const row = await assetDb.getAsset(sql, context.userId, data.assetId);
    return { data: row?.data ?? null };
  });

export const apiListAssetIds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ids: string[] }> => {
    const sql = await scopedSql(context.userId);
    return { ids: await assetDb.listAssetIds(sql, context.userId) };
  });
