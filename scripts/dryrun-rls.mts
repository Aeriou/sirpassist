/**
 * Dry-run local : vérifie que la migration 0012/0013 pose bien la RLS
 * (`enable row level security` + une politique) sur chaque table sensible.
 *
 *   node --experimental-strip-types scripts/dryrun-rls.mts
 *
 * ⚠️ PGLite (WASM) N'APPLIQUE PAS la RLS à l'exécution — les drapeaux et les
 * politiques existent mais le filtrage des lignes est inactif. La vérification
 * COMPORTEMENTALE (un compte ne voit pas les lignes d'un autre) doit se faire
 * sur un vrai Postgres (Neon) : voir SETUP-RLS.md. Ici on contrôle seulement
 * que rien n'a été oublié côté schéma.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
}

const pg = new PGlite({ parsers: { 20: Number } });
await pg.waitReady;
pg.exec(`create table if not exists "user" (
  "id" text primary key, "name" text not null default '', "email" text not null default ''
)`);
for (const m of [
  "0005_billing.sql",
  "0006_share.sql",
  "0007_user_store.sql",
  "0008_account_approval.sql",
  "0009_user_asset.sql",
  "0012_rls.sql",
  "0013_rls_share_fix.sql",
]) {
  pg.exec(readFileSync(join(root, "migrations", m), "utf8"));
}

const EXPECTED = ["user_store", "user_asset", "account_approval", "sipr_billing", "share_offer"];

for (const t of EXPECTED) {
  const rows = await pg.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where relname = $1",
    [t],
  );
  check(`${t} : RLS activée`, rows.rows[0]?.relrowsecurity === true);

  const pol = await pg.query<{ n: number }>(
    "select count(*)::int as n from pg_policies where tablename = $1",
    [t],
  );
  check(`${t} : au moins une politique`, (pol.rows[0]?.n ?? 0) >= 1);
}

// Le `with check` de share_offer doit autoriser émetteur OU destinataire
// (correctif 0013 — sinon le destinataire ne peut pas accepter).
const soCheck = await pg.query<{ with_check: string | null; qual: string | null }>(
  "select with_check, qual from pg_policies where tablename = 'share_offer' limit 1",
);
const wc = soCheck.rows[0]?.with_check ?? "";
check(
  "share_offer : with check autorise les deux parties (from_user_id OR to_user_id)",
  wc.includes("from_user_id") && wc.includes("to_user_id"),
);

// Aucune autre table ne doit avoir la RLS activée par erreur.
const others = await pg.query<{ relname: string }>(
  `select c.relname from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
     and c.relname <> all($1::text[])`,
  [EXPECTED],
);
check(
  "aucune table hors périmètre n'a la RLS activée",
  others.rows.length === 0,
);

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✅ schéma RLS conforme (comportement à valider sur Neon)");
