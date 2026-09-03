# Activer la Row-Level Security

**Le code est prêt.** La migration `0012`/`0013` pose les politiques RLS sur
`user_store`, `user_asset`, `account_approval`, `sipr_billing`, `share_offer`,
et les fonctions serveur concernées utilisent déjà `getScopedSql(context.userId)`
(pose `set_config('app.user_id', …)` par requête). Tant que `APP_DATABASE_URL`
n'est pas défini, `getScopedSql` retombe sur `getSql()` et la RLS reste inerte.

**But :** si une fonction serveur oublie un jour de filtrer par `userId`, la base
refuse quand même les lignes des autres comptes. Filet de sécurité —
l'isolation par le code reste correcte et testée.

Il reste **2 étapes d'infra** (toi) + un redéploiement.

---

## Étape 1 — Rôle Neon restreint

Console Neon : **https://console.neon.tech/** → projet `winter-sea-45665868` →
onglet **SQL Editor** (base `neondb`). Colle et exécute :

```sql
-- rôle applicatif : ni propriétaire de table, ni BYPASSRLS
create role app_user login password 'CHOISIS_UN_MOT_DE_PASSE_FORT';

grant connect on database neondb to app_user;
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;

-- pour les tables des futures migrations
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;
```

> Le migrateur (`npm run db:migrate` au build) continue d'utiliser `DATABASE_URL`
> (rôle propriétaire) — il crée des tables, `app_user` ne le peut pas. On ne
> change QUE la connexion runtime de l'app.

---

## Étape 2 — Variable Vercel

Neon → **Connect** → *Role* = `app_user`, *Connection pooling* = **on** → copie la
chaîne (`postgresql://app_user:…-pooler.…/neondb?sslmode=require`).

Vercel : **https://vercel.com/aervox/sirpassist/settings/environment-variables**
→ **Add** :

| Nom | Valeur |
|---|---|
| `APP_DATABASE_URL` | la chaîne **pooled** de `app_user` |

`DATABASE_URL` (propriétaire) reste inchangée.

Puis **Deployments** → dernier → `⋯` → **Redeploy**.

---

## Ce qui passe sous RLS (et ce qui reste en propriétaire)

**Scopé `getScopedSql` (RLS active)** — accès strictement à ses propres lignes :

| Fonction | Table(s) |
|---|---|
| `apiPullUserStore` / `apiPushUserStore` | `user_store` |
| `apiPutAsset` / `apiGetAsset` / `apiListAssetIds` | `user_asset` |
| `apiListIncomingShares` / `apiListOutgoingShares` / `apiShareInboxCount` / `apiPreviewShare` / `apiRespondShare` / `apiCancelShare` | `share_offer` |
| `apiMyAccountStatus` | `account_approval` (sa ligne) |
| `apiGetMyPlan` | `sipr_billing` (sa ligne) |

**Reste en propriétaire `getSql()` (RLS contournée, à dessein)** :

- **Migrateur** (`scripts/migrate.mjs`) — crée des tables.
- **Better Auth** — sa propre connexion via `DATABASE_URL` (signup, sessions).
- **`apiSendShare`** — doit lire la ligne `account_approval` du *destinataire*.
- **`apiListPendingAccounts` / `apiDecideAccount`** — le propriétaire agit sur
  les lignes d'autres comptes.
- **Webhook Stripe** (`/api/stripe/webhook`) — sessionless, écrit `sipr_billing`.
- **`purgeUserData`** (suppression RGPD) — efface les lignes du compte via le
  hook `afterDelete`.
- Tout `workspace_*` / `group_classeur` / `support_tickets` — pas de RLS
  (politiques « appartenance » = phase 2 ; l'isolation par le code y est
  couverte par les dry-runs).

---

## Vérification

- `node --experimental-strip-types scripts/dryrun-rls.mts` — contrôle **de
  schéma** (RLS activée + politique présente sur les 5 tables). ⚠️ PGLite
  n'applique pas la RLS à l'exécution, donc l'isolation **comportementale** ne
  se teste que sur Neon.
- Après le redéploiement avec `APP_DATABASE_URL` : se connecter avec 2 comptes
  de test, vérifier que chacun ne voit que ses dossiers / photos / partages, et
  que le parcours complet (création de compte, 2FA, partage, groupe) fonctionne.

---

## Rollback

Retirer `APP_DATABASE_URL` de Vercel → redéployer. `getScopedSql` retombe sur
`getSql()`, la RLS redevient inerte. Aucune migration à défaire.
