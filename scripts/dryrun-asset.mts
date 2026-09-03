/**
 * Dry-run local : applique 0009 sur PGLite en mémoire et exerce
 * `src/lib/asset-db.ts` (magasin d'images par compte).
 *
 *   node --experimental-strip-types scripts/dryrun-asset.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as assetDb from "../src/lib/asset-db.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
}

function makeSql(pg: PGlite) {
  const run = async (text: string, params: unknown[]) => {
    const res = await pg.query(text, params);
    return res.rows as unknown[];
  };
  const sql: any = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]!;
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text: string, params: unknown[] = []) => run(text, params);
  return sql;
}

const pg = new PGlite({ parsers: { 20: Number } });
await pg.waitReady;
pg.exec(readFileSync(join(root, "migrations/0009_user_asset.sql"), "utf8"));
const sql = makeSql(pg);

const A = "user_a";
const B = "user_b";

check("get sur asset absent -> null", (await assetDb.getAsset(sql, A, "x")) === null);

await assetDb.putAsset(sql, A, { assetId: "h1", mime: "image/jpeg", data: "data:img1" });
await assetDb.putAsset(sql, A, { assetId: "h2", mime: "image/jpeg", data: "data:img2" });
await assetDb.putAsset(sql, B, { assetId: "h1", mime: "image/jpeg", data: "data:autre" });

const got = await assetDb.getAsset(sql, A, "h1");
check("get renvoie les octets du bon compte", got?.data === "data:img1");
check("même asset_id, autre compte -> octets distincts", (await assetDb.getAsset(sql, B, "h1"))?.data === "data:autre");

// putAsset idempotent (adressage par contenu) : ne réécrit pas
await assetDb.putAsset(sql, A, { assetId: "h1", mime: "image/jpeg", data: "data:CHANGED" });
check("putAsset idempotent (on ne réécrit pas un id existant)", (await assetDb.getAsset(sql, A, "h1"))?.data === "data:img1");

const ids = (await assetDb.listAssetIds(sql, A)).sort();
check("listAssetIds -> les 2 du compte A", ids.length === 2 && ids[0] === "h1" && ids[1] === "h2");

// ménage : ne garder que h2
const removed = await assetDb.deleteAssetsExcept(sql, A, ["h2"]);
check("deleteAssetsExcept -> 1 supprimé", removed === 1);
check("h1 supprimé, h2 conservé", (await assetDb.listAssetIds(sql, A)).join() === "h2");
check("le compte B n'est pas touché", (await assetDb.listAssetIds(sql, B)).join() === "h1");

const wipe = await assetDb.deleteAssetsExcept(sql, A, []);
check("deleteAssetsExcept([]) -> tout le compte A supprimé", wipe === 1 && (await assetDb.listAssetIds(sql, A)).length === 0);

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
