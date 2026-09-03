# Activer la Row-Level Security (optionnel)

La migration `0012_rls.sql` pose déjà les **politiques RLS** sur `user_store`,
`user_asset`, `account_approval`, `sipr_billing`, `share_offer`. Elles sont
**inertes** : l'app se connecte avec le rôle *propriétaire* des tables, pour
lequel Postgres ignore la RLS. Aucun effet sur la prod tant que les étapes
ci-dessous ne sont pas faites.

But : si un jour une fonction serveur oublie de filtrer par `userId`, la base
refuse quand même les lignes des autres comptes (défense en profondeur).
L'isolation actuelle par le code reste correcte et testée — ceci est un filet.

## Étapes (à faire quand tu veux)

### 1. Rôle Neon restreint

Neon → SQL Editor (base `neondb`) :

```sql
-- rôle applicatif, sans possession de table ni BYPASSRLS
create role app_user login password 'CHOISIS_UN_MOT_DE_PASSE_FORT';

grant connect on database neondb to app_user;
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;

-- pour les tables créées par les futures migrations
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;
```

> Le migrateur (`scripts/migrate.mjs`) doit continuer à tourner avec le rôle
> **propriétaire** actuel (il crée des tables). Ne change que la connexion de
> l'app (voir étape 2), pas celle du build.

### 2. Connexion de l'app

Il faut **deux** URLs :

| Variable Vercel | Rôle | Usage |
|---|---|---|
| `DATABASE_URL` | **propriétaire** (actuelle) | migrations au build |
| `APP_DATABASE_URL` | `app_user` | requêtes des fonctions serveur |

Récupère la chaîne pooled de `app_user` dans Neon (Connect → Role = `app_user`).

### 3. Code : poser `app.user_id` par requête

`src/lib/db.ts` : ajouter un client « scopé » qui, pour `app_user`, ouvre une
transaction et fait `set local app.user_id = <id vérifié>` avant les requêtes.
Puis, dans chaque fonction serveur sous `authMiddleware`, remplacer
`getSql()` par `getScopedSql(context.userId)`.

Esquisse :

```ts
// nouveau, dans db.ts — actif seulement si APP_DATABASE_URL est défini
export async function getScopedSql(userId: string): Promise<Sql> {
  const base = await getAppSql();            // pool sur APP_DATABASE_URL
  return wrap(async (text, params) => {
    return base.transaction(async (tx) => {
      await tx.query("select set_config('app.user_id', $1, true)", [userId]);
      return tx.query(text, params);
    });
  });
}
```

Sans `APP_DATABASE_URL`, `getScopedSql` renvoie simplement `getSql()` — donc on
peut livrer le code avant de faire la bascule.

### 4. Points à traiter AVANT d'activer

- **`account_approval`** : la ligne `pending` est créée par le hook Better Auth
  `user.create` (au signup), qui tourne hors contexte `app.user_id`. Il faut
  soit garder ce hook sur le rôle propriétaire, soit lui poser `app.user_id`
  = l'id du nouvel utilisateur.
- **Migrateur** : `scripts/migrate.mjs` doit rester sur le rôle propriétaire.
- **`workspace`, `workspace_member`, `workspace_snapshot`, `support_tickets`** :
  politiques plus fines (adhésion, vue propriétaire) — phase 2.

Tant que ces points ne sont pas réglés, ne bascule pas `DATABASE_URL` de l'app
sur `app_user`.

## Rollback

Revenir `DATABASE_URL` de l'app sur le rôle propriétaire → la RLS redevient
inerte, sans migration à défaire.
