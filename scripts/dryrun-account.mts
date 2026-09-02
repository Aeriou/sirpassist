/**
 * Dry-run local : applique la table `user` (0001) + 0008 sur PGLite en mémoire
 * et exerce `src/lib/account-db.ts` (validation des comptes).
 *
 *   node --experimental-strip-types scripts/dryrun-account.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as adb from "../src/lib/account-db.ts";

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
pg.exec(`
  create table if not exists "user" (
    "id" text primary key, "name" text not null, "email" text not null unique,
    "emailVerified" boolean not null default true,
    "createdAt" timestamptz default now() not null, "updatedAt" timestamptz default now() not null
  );
`);
// Un compte "historique" présent avant la fonctionnalité.
await pg.query(`insert into "user" (id, name, email, "emailVerified") values ('user_old', 'Old', 'old@example.com', true)`);
pg.exec(readFileSync(join(root, "migrations/0008_account_approval.sql"), "utf8"));
const sql = makeSql(pg);

check("backfill : le compte historique est 'approved'", (await adb.myApprovalStatus(sql, "user_old")) === "approved");
check("compte historique -> autorisé", await adb.isAccountApproved(sql, "user_old"));

// Nouvel inscrit -> pending
await adb.ensureApprovalRow(sql, { userId: "user_new", email: "new@example.com", name: "New", autoApprove: false });
check("nouvel inscrit -> pending", (await adb.myApprovalStatus(sql, "user_new")) === "pending");
check("nouvel inscrit -> non autorisé", !(await adb.isAccountApproved(sql, "user_new")));

// Compte sans ligne (jamais passé par le hook) -> autorisé (repli backfill)
check("compte sans ligne -> autorisé (repli)", await adb.isAccountApproved(sql, "user_unknown"));

// ensureApprovalRow est idempotent
await adb.ensureApprovalRow(sql, { userId: "user_new", email: "new@example.com", name: "New", autoApprove: true });
check("ensureApprovalRow idempotent (reste pending)", (await adb.myApprovalStatus(sql, "user_new")) === "pending");

// Validation
const pendingList = await adb.listPendingAccounts(sql);
check("listPendingAccounts -> 1 (user_new)", pendingList.length === 1 && pendingList[0]!.user_id === "user_new");

const noRow = await adb.decideAccount(sql, { targetUserId: "user_ghost", approve: true, deciderUserId: "d" });
check("decideAccount sur inconnu -> not_found", noRow.ok === false);

const decided = await adb.decideAccount(sql, { targetUserId: "user_new", approve: true, deciderUserId: "user_owner" });
check("decideAccount valide -> ok", decided.ok === true);
check("après validation -> autorisé", await adb.isAccountApproved(sql, "user_new"));
check("après validation -> plus dans la liste d'attente", (await adb.listPendingAccounts(sql)).length === 0);

const twice = await adb.decideAccount(sql, { targetUserId: "user_new", approve: false, deciderUserId: "d" });
check("on ne re-décide pas un compte déjà traité -> not_found", twice.ok === false);

// autoApprove
await adb.ensureApprovalRow(sql, { userId: "user_auto", email: "auto@example.com", name: "Auto", autoApprove: true });
check("autoApprove -> directement approved", (await adb.myApprovalStatus(sql, "user_auto")) === "approved");

const recent = await adb.listRecentDecisions(sql);
check("listRecentDecisions exclut le backfill", recent.every((r) => r.user_id !== "user_old"));
check("listRecentDecisions inclut user_new", recent.some((r) => r.user_id === "user_new"));

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
