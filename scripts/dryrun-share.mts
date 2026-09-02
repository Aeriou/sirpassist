/**
 * Dry-run local (hors Vercel) : applique la table `user` (0001) et la migration
 * 0006 sur une base PGLite en mémoire, puis exerce `src/lib/share-db.ts`.
 *
 *   node --experimental-strip-types scripts/dryrun-share.mts
 *
 * Vérifie surtout : cible inconnue -> refus ; on ne se partage pas à soi-même ;
 * le destinataire (et lui seul) accepte/refuse ; l'expéditeur (et lui seul)
 * annule ; un « retour » exige d'avoir été partie prenante du fil.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as sdb from "../src/lib/share-db.ts";

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
// Le sous-ensemble de 0001 dont on a besoin : la table `user`.
pg.exec(`
  create table if not exists "user" (
    "id" text primary key,
    "name" text not null,
    "email" text not null unique,
    "emailVerified" boolean not null default true,
    "createdAt" timestamptz default now() not null,
    "updatedAt" timestamptz default now() not null
  );
`);
pg.exec(readFileSync(join(root, "migrations/0006_share.sql"), "utf8"));
const sql = makeSql(pg);

const ALICE = "user_alice";
const BOB = "user_bob";
await sql`insert into "user" (id, name, email, "emailVerified") values (${ALICE}, 'Alice', 'alice@example.com', true)`;
await sql`insert into "user" (id, name, email, "emailVerified") values (${BOB}, 'Bob', 'bob@example.com', true)`;

// --- résolution de cible ---
const notFound = await sdb.findUserByEmail(sql, "nobody@example.com");
check("findUserByEmail inconnu -> null", notFound === null);
const found = await sdb.findUserByEmail(sql, "  BOB@Example.com ");
check("findUserByEmail insensible casse/espaces", found?.id === BOB);

// --- envoi ---
const unknownTarget = await sdb.sendOffer(sql, {
  fromUserId: ALICE,
  fromName: "Alice",
  fromEmail: "alice@example.com",
  toEmail: "ghost@example.com",
  kind: "visit",
  title: "Dossier X",
  summary: "…",
  payload: { v: 1 },
});
check("envoi vers e-mail inconnu -> unknown_user", unknownTarget.ok === false && unknownTarget.reason === "unknown_user");

const toSelf = await sdb.sendOffer(sql, {
  fromUserId: ALICE,
  fromName: "Alice",
  fromEmail: "alice@example.com",
  toEmail: "alice@example.com",
  kind: "visit",
  title: "Dossier X",
  summary: "…",
  payload: { v: 1 },
});
check("envoi vers soi-même -> self", toSelf.ok === false && toSelf.reason === "self");

const sent = await sdb.sendOffer(sql, {
  fromUserId: ALICE,
  fromName: "Alice",
  fromEmail: "alice@example.com",
  toEmail: "bob@example.com",
  kind: "visit",
  title: "Atelier 3 Charleroi",
  summary: "Dossier — 2 constats",
  payload: { v: 1, kind: "visit", anomalies: [{}, {}] },
});
check("envoi valide -> ok + threadId", sent.ok === true && typeof sent.threadId === "string");
const offerId = sent.ok ? sent.id : "";
const threadId = sent.ok ? sent.threadId : "";

// --- boîtes ---
const bobInbox = await sdb.listIncoming(sql, BOB);
check("Bob voit 1 proposition entrante", bobInbox.length === 1 && bobInbox[0]!.title === "Atelier 3 Charleroi");
check("compteur entrant Bob = 1", (await sdb.countIncoming(sql, BOB)) === 1);
check("Alice n'a rien en entrant", (await sdb.listIncoming(sql, ALICE)).length === 0);
check("Alice voit 1 proposition sortante", (await sdb.listOutgoing(sql, ALICE)).length === 1);

// --- payload réservé au destinataire ---
const aliceTriesPayload = await sdb.getPayloadForRecipient(sql, offerId, ALICE);
check("Alice ne peut pas lire le payload (pas destinataire)", aliceTriesPayload.ok === false);
const bobPayload = await sdb.getPayloadForRecipient(sql, offerId, BOB);
check("Bob lit le payload", bobPayload.ok === true);

// --- réponse ---
const strangerResponds = await sdb.respondOffer(sql, { offerId, userId: ALICE, accept: true });
check("un non-destinataire ne peut pas répondre -> not_found", strangerResponds.ok === false);

const bobAccepts = await sdb.respondOffer(sql, { offerId, userId: BOB, accept: true });
check("Bob accepte -> ok + payload", bobAccepts.ok === true && bobAccepts.ok && bobAccepts.accepted === true);
check("après acceptation, plus rien dans la boîte de Bob", (await sdb.countIncoming(sql, BOB)) === 0);

const bobAcceptsAgain = await sdb.respondOffer(sql, { offerId, userId: BOB, accept: true });
check("on ne répond pas deux fois -> not_found", bobAcceptsAgain.ok === false);

// --- annulation (expéditeur seulement, si en attente) ---
const sent2 = await sdb.sendOffer(sql, {
  fromUserId: ALICE,
  fromName: "Alice",
  fromEmail: "alice@example.com",
  toEmail: "bob@example.com",
  kind: "anomaly",
  title: "Constat Y",
  summary: "…",
  payload: { v: 1, kind: "anomaly", anomalies: [{}] },
});
const id2 = sent2.ok ? sent2.id : "";
const bobCancels = await sdb.cancelOffer(sql, { offerId: id2, userId: BOB });
check("le destinataire ne peut pas annuler -> not_found", bobCancels.ok === false);
const aliceCancels = await sdb.cancelOffer(sql, { offerId: id2, userId: ALICE });
check("l'expéditeur annule sa proposition en attente", aliceCancels.ok === true);
check("après annulation, plus rien dans la boîte de Bob", (await sdb.countIncoming(sql, BOB)) === 0);

// --- retour (reply) ---
const badReply = await sdb.sendOffer(sql, {
  fromUserId: "user_carol",
  fromName: "Carol",
  fromEmail: "carol@example.com",
  toEmail: "alice@example.com",
  kind: "visit",
  title: "Retour pirate",
  summary: "…",
  payload: { v: 1 },
  replyTo: offerId,
});
check("répondre à un fil dont on n'est pas partie -> bad_reply", badReply.ok === false && badReply.reason === "bad_reply");

// Bob (destinataire initial) renvoie à Alice : même thread.
await sql`insert into "user" (id, name, email, "emailVerified") values ('user_carol', 'Carol', 'carol@example.com', true)`;
const bobReturns = await sdb.sendOffer(sql, {
  fromUserId: BOB,
  fromName: "Bob",
  fromEmail: "bob@example.com",
  toEmail: "alice@example.com",
  kind: "visit",
  title: "Atelier 3 Charleroi (retour)",
  summary: "Dossier retravaillé",
  payload: { v: 1, kind: "visit", anomalies: [{}, {}, {}] },
  replyTo: offerId,
});
check("Bob renvoie sur le même fil", bobReturns.ok === true && bobReturns.ok && bobReturns.threadId === threadId);
check("Alice reçoit le retour", (await sdb.countIncoming(sql, ALICE)) === 1);

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
