/**
 * Dry-run local : applique 0007 sur une base PGLite en mémoire et exerce le
 * verrou optimiste de `src/lib/user-store-db.ts`.
 *
 *   node --experimental-strip-types scripts/dryrun-user-store.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as udb from "../src/lib/user-store-db.ts";

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
pg.exec(readFileSync(join(root, "migrations/0007_user_store.sql"), "utf8"));
const sql = makeSql(pg);

const U = "user_1";

const empty = await udb.pullUserStore(sql, U);
check("pull sur compte vide -> rev 0, data null", empty.rev === 0 && empty.data === null);

const first = await udb.pushUserStore(sql, U, { visits: [1] }, 0);
check("première écriture -> ok, rev 1", first.ok === true && first.ok && first.rev === 1);

const second = await udb.pushUserStore(sql, U, { visits: [1, 2] }, 1);
check("écriture séquentielle sur bonne rev -> ok, rev 2", second.ok === true && second.ok && second.rev === 2);

const stale = await udb.pushUserStore(sql, U, { visits: [9] }, 1);
check("écriture sur rev périmée -> stale + rev courante + data", stale.ok === false && stale.ok === false && stale.rev === 2 && Boolean(stale.data));

const afterStaleMerge = await udb.pushUserStore(sql, U, { visits: [1, 2, 3] }, 2);
check("re-push sur rev à jour -> ok, rev 3", afterStaleMerge.ok === true && afterStaleMerge.ok && afterStaleMerge.rev === 3);

const firstButExists = await udb.pushUserStore(sql, U, { visits: [] }, 0);
check("baseRev 0 alors que la ligne existe -> stale (pas d'écrasement)", firstButExists.ok === false);

const back = await udb.pullUserStore(sql, U);
check("pull final -> rev 3, data conservée", back.rev === 3 && JSON.stringify(back.data) === JSON.stringify({ visits: [1, 2, 3] }));

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
