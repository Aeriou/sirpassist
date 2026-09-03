/**
 * Dry-run local : applique 0003 + 0014 sur une base PGLite en mémoire et exerce
 * `src/lib/group-classeur-db.ts`.
 *
 *   node --experimental-strip-types scripts/dryrun-group-classeur.mts
 *
 * Vérifie : seul un membre ACTIF publie / lit ; l'auteur ou le propriétaire du
 * groupe retire ; un membre en attente ou un étranger n'a aucun accès.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as gdb from "../src/lib/group-classeur-db.ts";

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
pg.exec(readFileSync(join(root, "migrations/0014_group_classeur.sql"), "utf8"));
const sql = makeSql(pg);

const OWNER = "u_owner";
const MEMBER = "u_member";
const PENDING = "u_pending";
const STRANGER = "u_stranger";
const WS = "ws_1";

await sql`insert into workspace (id, name, kind, join_code, owner_user_id)
  values (${WS}, 'Groupe', 'entreprise', 'CODE12', ${OWNER})`;
await sql`insert into workspace_member (workspace_id, user_id, role, status)
  values (${WS}, ${OWNER}, 'owner', 'active')`;
await sql`insert into workspace_member (workspace_id, user_id, role, status)
  values (${WS}, ${MEMBER}, 'member', 'active')`;
await sql`insert into workspace_member (workspace_id, user_id, role, status)
  values (${WS}, ${PENDING}, 'member', 'pending')`;

const payload = { v: 1, visits: [{ id: "v1" }], anomalies: [] };

// --- publication ---
const byPending = await gdb.shareClasseur(sql, {
  workspaceId: WS, userId: PENDING, userName: "P", classeurId: "c1", name: "C1", payload,
});
check("membre en attente -> forbidden", byPending.ok === false && byPending.reason === "forbidden");

const byStranger = await gdb.shareClasseur(sql, {
  workspaceId: WS, userId: STRANGER, userName: "S", classeurId: "c1", name: "C1", payload,
});
check("étranger -> forbidden", byStranger.ok === false);

const byMember = await gdb.shareClasseur(sql, {
  workspaceId: WS, userId: MEMBER, userName: "Mireille", classeurId: "c1", name: "Classeur 1", payload,
});
check("membre actif -> publie", byMember.ok === true);

const upd = await gdb.shareClasseur(sql, {
  workspaceId: WS, userId: MEMBER, userName: "Mireille", classeurId: "c1", name: "Classeur 1 (maj)",
  payload: { v: 1, visits: [{ id: "v1" }, { id: "v2" }], anomalies: [] },
});
check("re-publication même classeur -> upsert", upd.ok === true);

// --- lecture ---
const listMember = await gdb.listGroupClasseurs(sql, WS, MEMBER);
check(
  "membre actif lit 1 classeur (nom maj, payload conservé)",
  listMember.ok === true && listMember.ok &&
    listMember.classeurs.length === 1 &&
    listMember.classeurs[0]!.name === "Classeur 1 (maj)" &&
    (listMember.classeurs[0]!.payload as { visits: unknown[] }).visits.length === 2,
);

const listOwner = await gdb.listGroupClasseurs(sql, WS, OWNER);
check("propriétaire lit aussi", listOwner.ok === true && listOwner.ok && listOwner.classeurs.length === 1);

const listPending = await gdb.listGroupClasseurs(sql, WS, PENDING);
check("membre en attente ne lit rien -> forbidden", listPending.ok === false);

const mine = await gdb.mySharedClasseurIds(sql, WS, MEMBER);
check("mySharedClasseurIds -> ['c1']", mine.length === 1 && mine[0] === "c1");
check("mySharedClasseurIds pour le propriétaire -> vide", (await gdb.mySharedClasseurIds(sql, WS, OWNER)).length === 0);

// --- retrait ---
const rmStranger = await gdb.unshareClasseur(sql, { workspaceId: WS, userId: STRANGER, classeurId: "c1" });
check("un tiers ne peut pas retirer -> forbidden", rmStranger.ok === false && rmStranger.reason === "forbidden");

const rmByOwner = await gdb.unshareClasseur(sql, { workspaceId: WS, userId: OWNER, classeurId: "c1" });
check("le propriétaire du groupe peut retirer", rmByOwner.ok === true);

const rmMissing = await gdb.unshareClasseur(sql, { workspaceId: WS, userId: MEMBER, classeurId: "c1" });
check("retrait d'un classeur absent -> not_found", rmMissing.ok === false && rmMissing.reason === "not_found");

const reshare = await gdb.shareClasseur(sql, {
  workspaceId: WS, userId: MEMBER, userName: "Mireille", classeurId: "c2", name: "C2", payload,
});
const rmByAuthor = await gdb.unshareClasseur(sql, { workspaceId: WS, userId: MEMBER, classeurId: "c2" });
check("l'auteur retire son propre classeur", reshare.ok === true && rmByAuthor.ok === true);

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
