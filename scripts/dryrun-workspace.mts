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
pg.exec(`
  create table if not exists "user" (
    "id" text primary key, "name" text not null, "email" text not null unique,
    "emailVerified" boolean not null default true
  );
`);
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

// --- le demandeur voit sa demande en attente dans listMyWorkspaces ---
const joinerList = await wdb.listMyWorkspaces(sql, JOINER);
check(
  "listMyWorkspaces renvoie la demande en attente au demandeur",
  joinerList.length === 1 && joinerList[0]!.status === "pending",
);

// --- annulation de sa propre demande, puis re-demande ---
await wdb.cancelJoinRequest(sql, created.id, JOINER);
const afterCancel = await wdb.listMyWorkspaces(sql, JOINER);
check("après annulation, plus de demande listée", afterCancel.length === 0);
await wdb.requestJoin(sql, {
  userId: JOINER,
  email: "joiner@example.com",
  name: "Jeanne Joiner",
  code: created.code,
});
check("re-demande possible après annulation", (await wdb.myMembership(sql, created.id, JOINER)).status === "pending");

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

// --- invitation par e-mail ---
await sql`insert into "user" (id, name, email) values (${OWNER}, 'Olivier', 'owner@ex.be')`;
await sql`insert into "user" (id, name, email) values ('user_col', 'Colette', 'col@ex.be')`;

const invFromStranger = await wdb.inviteMember(sql, {
  workspaceId: created.id,
  byUserId: STRANGER,
  targetEmail: "col@ex.be",
});
check("un non-propriétaire ne peut pas inviter -> forbidden", invFromStranger.ok === false && invFromStranger.reason === "forbidden");

const invUnknown = await wdb.inviteMember(sql, {
  workspaceId: created.id,
  byUserId: OWNER,
  targetEmail: "personne@nulle.part",
});
check("invitation vers e-mail inconnu -> unknown_user", invUnknown.ok === false && invUnknown.reason === "unknown_user");

const invSelf = await wdb.inviteMember(sql, {
  workspaceId: created.id,
  byUserId: OWNER,
  targetEmail: "owner@ex.be",
});
check("invitation vers soi-même -> self", invSelf.ok === false && invSelf.reason === "self");

const invOk = await wdb.inviteMember(sql, {
  workspaceId: created.id,
  byUserId: OWNER,
  targetEmail: "  COL@ex.be ",
});
check("invitation valide (casse/espaces tolérés) -> ok", invOk.ok === true);

const dupInv = await wdb.inviteMember(sql, {
  workspaceId: created.id,
  byUserId: OWNER,
  targetEmail: "col@ex.be",
});
check("2e invitation même personne -> already", dupInv.ok === false && dupInv.reason === "already");

const myInv = await wdb.listMyInvites(sql, "user_col");
check(
  "Colette voit 1 invitation (nom du groupe + invitant)",
  myInv.length === 1 && myInv[0]!.name === "Groupe Test" && myInv[0]!.owner_name.length > 0,
);

const sent = await wdb.listSentInvites(sql, created.id, OWNER);
check("le propriétaire voit 1 invitation envoyée", sent.ok === true && sent.ok && sent.invites.length === 1);

const colStillNoData = await wdb.pullWorkspaceData(sql, created.id, "user_col");
check("invité (pas encore accepté) -> pas d'accès aux données", colStillNoData.ok === false);

const accept = await wdb.respondInvite(sql, { workspaceId: created.id, userId: "user_col", accept: true });
check("Colette accepte -> membre actif", accept.ok === true && accept.ok && accept.accepted === true);
check("après acceptation -> accès aux données", (await wdb.pullWorkspaceData(sql, created.id, "user_col")).ok === true);
check("après acceptation -> plus dans les invitations envoyées", (await wdb.listSentInvites(sql, created.id, OWNER) as { ok: true; invites: unknown[] }).invites.length === 0);
check("après acceptation -> boîte d'invitations vide", (await wdb.listMyInvites(sql, "user_col")).length === 0);

const acceptTwice = await wdb.respondInvite(sql, { workspaceId: created.id, userId: "user_col", accept: true });
check("on ne répond pas 2x à une invitation -> not_found", acceptTwice.ok === false);

// --- suppression du groupe (propriétaire uniquement) ---
const delByMember = await wdb.deleteWorkspace(sql, { workspaceId: created.id, userId: "user_col" });
check("un membre ne peut pas supprimer le groupe -> forbidden", delByMember.ok === false && delByMember.reason === "forbidden");

const delByStranger = await wdb.deleteWorkspace(sql, { workspaceId: created.id, userId: STRANGER });
check("un étranger ne peut pas supprimer le groupe -> forbidden", delByStranger.ok === false);

const memberCountBefore = await sql`select count(*)::int as n from workspace_member where workspace_id = ${created.id}`;
check("avant suppression : le groupe a des membres", (memberCountBefore[0] as { n: number }).n > 0);

const delOk = await wdb.deleteWorkspace(sql, { workspaceId: created.id, userId: OWNER });
check("le propriétaire supprime le groupe", delOk.ok === true);

check("après suppression : le propriétaire ne voit plus le groupe", (await wdb.listMyWorkspaces(sql, OWNER)).every((w) => w.id !== created.id));
check("après suppression : plus aucune appartenance", (await wdb.myMembership(sql, created.id, "user_col")).status === null);
const memberCountAfter = await sql`select count(*)::int as n from workspace_member where workspace_id = ${created.id}`;
check("après suppression : membres partis en cascade", (memberCountAfter[0] as { n: number }).n === 0);

const delMissing = await wdb.deleteWorkspace(sql, { workspaceId: created.id, userId: OWNER });
check("suppression d'un groupe déjà supprimé -> forbidden (introuvable)", delMissing.ok === false);

console.log(failures === 0 ? "\n✅ tous les contrôles passent" : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
