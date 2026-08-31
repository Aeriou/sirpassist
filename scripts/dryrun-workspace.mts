/**
 * Dry-run local (hors Vercel) : applique la migration 0003 sur une base PGLite
 * en mémoire et exerce toute la logique de `src/lib/workspace-db.ts`.
 *
 *   node --experimental-strip-types scripts/dryrun-workspace.mts
 *
 * Vérifie surtout : une demande "pending" ne peut PAS lire les données ;
 * seul un membre "active" le peut ; seul le propriétaire valide / retire.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as wdb from "../src/lib/workspace-db.ts";

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
pg.exec(readFileSync(join(root, "migrations/0003_workspace.sql"), "utf8"));
const sql = makeSql(pg);

const OWNER = "user_owner";
const JOINER = "user_joiner";
const STRANGER = "user_stranger";

// --- création ---
const created = await wdb.createWorkspace(sql, {
  userId: OWNER,
  email: "owner@example.com",
  name: "Olivier Owner",
  wsName: "  Groupe Test  ",
  kind: "entreprise",
});
check("createWorkspace renvoie un code à 6 caractères", /^[A-Z0-9]{6}$/.test(created.code));
check("nom nettoyé", created.name === "Groupe Test");

const mine = await wdb.listMyWorkspaces(sql, OWNER);
check("le propriétaire voit son espace (role owner)", mine.length === 1 && mine[0]!.role === "owner");

// --- demande d'adhésion ---
const badLen = await wdb.requestJoin(sql, { userId: JOINER, email: "j@x", name: "J", code: "abc" });
check("code trop court -> invalid", badLen.ok === false && badLen.reason === "invalid");

const unknown = await wdb.requestJoin(sql, { userId: JOINER, email: "j@x", name: "J", code: "ZZZZZZ" });
check("code inconnu -> unknown", unknown.ok === false && unknown.reason === "unknown");

const req1 = await wdb.requestJoin(sql, {
  userId: JOINER,
  email: "joiner@example.com",
  name: "Jeanne Joiner",
  code: created.code.toLowerCase(), // normalisation
});
check("requestJoin -> pending", req1.ok === true && req1.status === "pending");

const req2 = await wdb.requestJoin(sql, {
  userId: JOINER,
  email: "joiner@example.com",
  name: "Jeanne Joiner",
  code: created.code,
});
check("requestJoin idempotent (toujours pending, pas de doublon)", req2.ok === true && req2.status === "pending");

// --- le pending NE PEUT PAS lire les données ---
const pullPending = await wdb.pullWorkspaceData(sql, created.id, JOINER);
check("membre en attente -> pas d'accès aux données", pullPending.ok === false && pullPending.reason === "forbidden");

// --- validation réservée au propriétaire ---
const reqAsJoiner = await wdb.listJoinRequests(sql, created.id, JOINER);
check("listJoinRequests par un non-propriétaire -> forbidden", reqAsJoiner.ok === false);

const reqAsOwner = await wdb.listJoinRequests(sql, created.id, OWNER);
check(
  "le propriétaire voit 1 demande en attente (le bon e-mail)",
  reqAsOwner.ok === true &&
    reqAsOwner.requests.length === 1 &&
    reqAsOwner.requests[0]!.email === "joiner@example.com",
);

const decideAsJoiner = await wdb.decideJoin(sql, {
  workspaceId: created.id,
  targetUserId: JOINER,
  approve: true,
  userId: JOINER,
});
check("un non-propriétaire ne peut pas valider -> forbidden", decideAsJoiner.ok === false);

const approve = await wdb.decideJoin(sql, {
  workspaceId: created.id,
  targetUserId: JOINER,
  approve: true,
  userId: OWNER,
});
check("le propriétaire valide la demande", approve.ok === true);

const membership = await wdb.myMembership(sql, created.id, JOINER);
check("le demandeur est maintenant actif", membership.status === "active" && membership.role === "member");

// --- membre actif : lecture/écriture OK ---
const push = await wdb.pushWorkspaceData(sql, created.id, JOINER, { v: 1, hello: "monde" });
check("membre actif -> push OK", push.ok === true);

const pullActive = await wdb.pullWorkspaceData(sql, created.id, JOINER);
check(
  "membre actif -> pull renvoie le snapshot",
  pullActive.ok === true &&
    JSON.stringify((pullActive as { snapshot: unknown }).snapshot) === JSON.stringify({ v: 1, hello: "monde" }),
);

// --- étranger : rien ---
const pullStranger = await wdb.pullWorkspaceData(sql, created.id, STRANGER);
check("un étranger (jamais demandé) -> pas d'accès", pullStranger.ok === false);

// --- retrait de membre ---
const removeOwner = await wdb.removeMember(sql, {
  workspaceId: created.id,
  targetUserId: OWNER,
  userId: OWNER,
});
check("on ne peut pas retirer le propriétaire", removeOwner.ok === false && (removeOwner as { reason: string }).reason === "owner");

const removeJoiner = await wdb.removeMember(sql, {
  workspaceId: created.id,
  targetUserId: JOINER,
  userId: OWNER,
});
check("le propriétaire retire un membre", removeJoiner.ok === true);

const afterRemove = await wdb.myMembership(sql, created.id, JOINER);
check("le membre retiré n'a plus de statut", afterRemove.status === null);

const pullAfterRemove = await wdb.pullWorkspaceData(sql, created.id, JOINER);
check("le membre retiré n'accède plus aux données", pullAfterRemove.ok === false);

// --- refus d'une demande ---
await wdb.requestJoin(sql, { userId: STRANGER, email: "s@x", name: "S", code: created.code });
const refuse = await wdb.decideJoin(sql, {
  workspaceId: created.id,
  targetUserId: STRANGER,
  approve: false,
  userId: OWNER,
});
check("le propriétaire refuse une demande", refuse.ok === true);
const afterRefuse = await wdb.myMembership(sql, created.id, STRANGER);
check("la demande refusée est supprimée", afterRefuse.status === null);

console.log(failures === 0 ? "\n✅ tous les contrôles passent" : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
