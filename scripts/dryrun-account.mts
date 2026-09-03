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
for (const m of [
  "0003_workspace.sql",
  "0005_billing.sql",
  "0006_share.sql",
  "0007_user_store.sql",
  "0008_account_approval.sql",
  "0009_user_asset.sql",
  "0014_group_classeur.sql",
]) {
  pg.exec(readFileSync(join(root, "migrations", m), "utf8"));
}
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

// -- purge d'un compte supprimé --
const D = "user_del";
await sql`insert into "user" (id, name, email, "emailVerified") values (${D}, 'Del', 'del@example.com', true)`;
await sql`insert into workspace (id, name, kind, join_code, owner_user_id) values ('ws_del', 'G', 'entreprise', 'ZZZ111', ${D})`;
await sql`insert into workspace_snapshot (workspace_id, data) values ('ws_del', '{}'::jsonb)`;
await sql`insert into workspace_member (workspace_id, user_id, role, status) values ('ws_del', ${D}, 'owner', 'active')`;
// Un groupe appartenant à quelqu'un d'autre, dont le compte supprimé est membre.
await sql`insert into workspace (id, name, kind, join_code, owner_user_id) values ('ws_keep', 'K', 'entreprise', 'ZZZ222', 'user_other')`;
await sql`insert into workspace_member (workspace_id, user_id, role, status) values ('ws_keep', 'user_other', 'owner', 'active')`;
await sql`insert into workspace_member (workspace_id, user_id, role, status) values ('ws_keep', ${D}, 'member', 'active')`;
await sql`insert into share_offer (id, thread_id, from_user_id, to_user_id, kind, payload) values ('shr_del', 'thr', ${D}, 'user_other', 'visit', '{}'::jsonb)`;
await sql`insert into user_store (user_id, data, rev) values (${D}, '{}'::jsonb, 3)`;
await sql`insert into user_asset (user_id, asset_id, mime, data, bytes) values (${D}, 'a1', 'image/jpeg', 'data:x', 6)`;
await sql`insert into sipr_billing (user_id, plan) values (${D}, 'trial')`;
await adb.ensureApprovalRow(sql, { userId: D, email: "del@example.com", name: "Del", autoApprove: true });

await adb.purgeUserData(sql, D);

const gone = async (q: Promise<unknown[]>) => (await q).length === 0;
check("purge : workspace supprimé", await gone(sql`select 1 from workspace where owner_user_id = ${D}`));
check("purge : workspace_snapshot supprimé", await gone(sql`select 1 from workspace_snapshot where workspace_id = 'ws_del'`));
check("purge : ses appartenances supprimées", await gone(sql`select 1 from workspace_member where user_id = ${D}`));
check("purge : partages (émis ou reçus) supprimés", await gone(sql`select 1 from share_offer where from_user_id = ${D} or to_user_id = ${D}`));
check("purge : user_store supprimé", await gone(sql`select 1 from user_store where user_id = ${D}`));
check("purge : user_asset supprimé", await gone(sql`select 1 from user_asset where user_id = ${D}`));
check("purge : sipr_billing supprimé", await gone(sql`select 1 from sipr_billing where user_id = ${D}`));
check("purge : account_approval supprimé", await gone(sql`select 1 from account_approval where user_id = ${D}`));
check(
  "purge : un groupe d'autrui survit, seule l'appartenance du compte part",
  (await sql`select 1 from workspace where id = 'ws_keep'`).length === 1 &&
    (await sql`select 1 from workspace_member where workspace_id = 'ws_keep' and user_id = 'user_other'`).length === 1 &&
    (await sql`select 1 from workspace_member where workspace_id = 'ws_keep' and user_id = ${D}`).length === 0,
);

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
