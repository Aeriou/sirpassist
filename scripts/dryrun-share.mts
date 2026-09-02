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
import { computeSharedPlan, mergeShareNotes } from "../src/lib/share-merge.ts";

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
pg.exec(readFileSync(join(root, "migrations/0008_account_approval.sql"), "utf8"));
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

// -- validation de compte : un compte 'pending' ne peut ni envoyer ni être ciblé --
await sql`insert into "user" (id, name, email, "emailVerified") values ('user_dave', 'Dave', 'dave@example.com', true)`;
await sql`insert into account_approval (user_id, email, name, status) values ('user_dave', 'dave@example.com', 'Dave', 'pending')`;
const daveSends = await sdb.sendOffer(sql, {
  fromUserId: "user_dave", fromName: "Dave", fromEmail: "dave@example.com",
  toEmail: "alice@example.com", kind: "visit", title: "X", summary: "", payload: { v: 1 },
});
check("compte en attente -> ne peut pas envoyer (sender_pending)", daveSends.ok === false && daveSends.reason === "sender_pending");
const toDave = await sdb.sendOffer(sql, {
  fromUserId: ALICE, fromName: "Alice", fromEmail: "alice@example.com",
  toEmail: "dave@example.com", kind: "visit", title: "X", summary: "", payload: { v: 1 },
});
check("compte en attente -> ne peut pas être ciblé (target_pending)", toDave.ok === false && toDave.reason === "target_pending");
await sql`update account_approval set status = 'approved' where user_id = 'user_dave'`;
const toDaveOk = await sdb.sendOffer(sql, {
  fromUserId: ALICE, fromName: "Alice", fromEmail: "alice@example.com",
  toEmail: "dave@example.com", kind: "visit", title: "X", summary: "", payload: { v: 1 },
});
check("une fois validé -> le partage passe", toDaveOk.ok === true);

// ---------------------------------------------------------------------------
// Planificateur de rapprochement (pur) — computeSharedPlan / mergeShareNotes
// ---------------------------------------------------------------------------

const mkAnomaly = (o: Record<string, unknown>) => ({
  title: "",
  location: "",
  description: "",
  theme: "t",
  urgency: "moyenne",
  correctiveAction: "",
  kinney: { score: 10 },
  voice: { danger: "", measure: "", zone: "" },
  ...o,
});

// -- 1. import neuf : aucun dossier local pour ce fil --
const planFresh = computeSharedPlan(
  { visits: [], anomalies: [] } as any,
  {
    v: 1,
    kind: "visit",
    sharedAt: "",
    byName: "Alice",
    byEmail: "a@x",
    visit: { name: "D", company: "D", shareOriginId: "ov" } as any,
    anomalies: [mkAnomaly({ shareOriginId: "oa1", title: "A1" }), mkAnomaly({ shareOriginId: "oa2", title: "A2" })] as any,
  },
  "thr_1",
);
check("import neuf -> isMerge false", planFresh.isMerge === false);
check("import neuf -> tous les constats en 'new'/'add'", planFresh.incoming.every((r) => r.state === "new" && r.choice === "add"));
check("import neuf -> aucune suppression", planFresh.removals.length === 0);

// -- 2. fusion (retour) : 1 inchangé, 1 modifié, 1 nouveau, 1 retiré --
const localVisit = {
  id: "v1",
  name: "Atelier 3",
  company: "Atelier 3",
  interlocutor: "Chef",
  date: "2026-09-01",
  site: "",
  notes: "",
  sharedThreadId: "thr_2",
  shareOriginId: "ov2",
  shareNotes: [{ id: "n1", author: "Bob", at: "2026-09-01T10:00:00Z", text: "déjà là" }],
};
const localAnoms = [
  mkAnomaly({ id: "a1", visitId: "v1", shareOriginId: "oa_same", title: "Sol glissant", description: "idem" }),
  mkAnomaly({ id: "a2", visitId: "v1", shareOriginId: "oa_chg", title: "Câble", description: "ancienne" }),
  mkAnomaly({ id: "a3", visitId: "v1", shareOriginId: "oa_gone", title: "Retiré ensuite" }),
];
const planMerge = computeSharedPlan(
  { visits: [localVisit], anomalies: localAnoms } as any,
  {
    v: 1,
    kind: "visit",
    sharedAt: "",
    byName: "Alice",
    byEmail: "a@x",
    visit: {
      name: "Atelier 3",
      company: "Atelier 3 SPRL", // changé
      interlocutor: "Chef",
      date: "2026-09-01",
      site: "",
      notes: "",
      shareOriginId: "ov2",
      shareNotes: [
        { id: "n1", author: "Bob", at: "2026-09-01T10:00:00Z", text: "déjà là" },
        { id: "n2", author: "Alice", at: "2026-09-02T09:00:00Z", text: "revu le point câble" },
      ],
    } as any,
    anomalies: [
      mkAnomaly({ shareOriginId: "oa_same", title: "Sol glissant", description: "idem" }),
      mkAnomaly({ shareOriginId: "oa_chg", title: "Câble dénudé", description: "précisée" }),
      mkAnomaly({ shareOriginId: "oa_new", title: "Extincteur manquant" }),
    ] as any,
  },
  "thr_2",
);
check("fusion -> isMerge true, cible v1", planMerge.isMerge === true && planMerge.targetVisitId === "v1");
check("fusion -> infos dossier détectées modifiées", planMerge.visitChanged === true);
const same = planMerge.incoming.find((r) => r.shareOriginId === "oa_same");
const chg = planMerge.incoming.find((r) => r.shareOriginId === "oa_chg");
const neuf = planMerge.incoming.find((r) => r.shareOriginId === "oa_new");
check("fusion -> constat inchangé => same/skip", same?.state === "same" && same?.choice === "skip");
check("fusion -> constat modifié => changed/take + localId", chg?.state === "changed" && chg?.choice === "take" && chg?.localId === "a2");
check("fusion -> constat nouveau => new/add", neuf?.state === "new" && neuf?.choice === "add");
check("fusion -> constat absent de l'entrant => suppression proposée (garder par défaut)",
  planMerge.removals.length === 1 && planMerge.removals[0]!.localId === "a3" && planMerge.removals[0]!.choice === "keep");
check("fusion -> 1 note de partage entrante nouvelle", planMerge.incomingNoteCount === 1);

// -- 2bis. cible explicite (bouton « reporter » entre deux dossiers frères) --
const twoSiblings = [
  { ...localVisit, id: "v_orig", sharedThreadId: "thr_9", shareOriginId: "ov9" },
  { ...localVisit, id: "v_recv", sharedThreadId: "thr_9", shareOriginId: "ov9", name: "Atelier 3 — retour de Alice" },
];
const planTargeted = computeSharedPlan(
  { visits: twoSiblings, anomalies: [mkAnomaly({ id: "ax", visitId: "v_orig", shareOriginId: "oa_x", title: "X" })] } as any,
  {
    v: 1, kind: "visit", sharedAt: "", byName: "Alice", byEmail: "a@x",
    visit: { name: "Atelier 3", company: "Atelier 3", shareOriginId: "ov9", shareNotes: [] } as any,
    anomalies: [mkAnomaly({ shareOriginId: "oa_x", title: "X modifié", description: "chg" })] as any,
  },
  "thr_9",
  "v_orig",
);
check("cible explicite -> targetVisitId respecté (v_orig, pas v_recv)", planTargeted.targetVisitId === "v_orig" && planTargeted.isMerge === true);
check("cible explicite -> le constat commun ressort 'changed'/'take'",
  planTargeted.incoming[0]?.state === "changed" && planTargeted.incoming[0]?.choice === "take" && planTargeted.incoming[0]?.localId === "ax");

// -- 3. mergeShareNotes : dédoublonne par id, trie par date --
const merged = mergeShareNotes(
  [{ id: "n1", author: "Bob", at: "2026-09-02T00:00:00Z", text: "b" }],
  [
    { id: "n1", author: "Bob", at: "2026-09-02T00:00:00Z", text: "b" },
    { id: "n0", author: "Al", at: "2026-09-01T00:00:00Z", text: "a" },
  ],
);
check("mergeShareNotes -> 2 notes, dédoublonnées", merged.length === 2);
check("mergeShareNotes -> triées par date", merged[0]!.id === "n0" && merged[1]!.id === "n1");

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ tous les contrôles passent");
