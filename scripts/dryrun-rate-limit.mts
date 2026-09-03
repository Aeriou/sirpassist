/**
 * Dry-run : applique 0011 sur PGLite et exerce `src/lib/rate-limit.ts`.
 *
 *   node --experimental-strip-types scripts/dryrun-rate-limit.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { hitRateLimit, clientIpFrom } from "../src/lib/rate-limit.ts";

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
pg.exec(readFileSync(join(root, "migrations/0011_rate_limit.sql"), "utf8"));
const sql = makeSql(pg);

const opts = { bucket: "test", subject: "u1", limit: 3, windowSec: 3600 };

const r1 = await hitRateLimit(sql, opts);
const r2 = await hitRateLimit(sql, opts);
const r3 = await hitRateLimit(sql, opts);
check("3 premiers appels -> ok", r1.ok && r2.ok && r3.ok);

const r4 = await hitRateLimit(sql, opts);
check("4e appel -> refusé + retryAfter > 0", !r4.ok && (r4 as { retryAfter: number }).retryAfter > 0);

const other = await hitRateLimit(sql, { ...opts, subject: "u2" });
check("autre subject -> compteur indépendant", other.ok);

const otherBucket = await hitRateLimit(sql, { ...opts, bucket: "test2" });
check("autre bucket -> compteur indépendant", otherBucket.ok);

// fenêtre écoulée : une vieille ligne ne compte plus
await sql`insert into rate_limit (bucket, subject, window_start, count) values ('old', 'u1', 0, 999)`;
const afterWindow = await hitRateLimit(sql, { bucket: "old", subject: "u1", limit: 3, windowSec: 60 });
check("nouvelle fenêtre -> repart de zéro malgré une vieille ligne saturée", afterWindow.ok);

// clientIpFrom
const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
check("clientIpFrom prend la 1re IP du XFF", clientIpFrom(h) === "203.0.113.7");
check("clientIpFrom sans header -> unknown", clientIpFrom(undefined) === "unknown");

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
