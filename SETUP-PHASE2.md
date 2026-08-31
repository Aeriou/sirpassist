# Phase 2 — Activer l'authentification serveur (Better Auth)

Le code est sur la branche `refonte-securite`. Il faut : une base Postgres (Neon),
4 variables d'environnement Vercel, puis fusionner et redéployer.

Aucune donnée existante n'est touchée : la page « Compte » actuelle continue de
fonctionner comme avant. La nouvelle connexion est sur une page séparée `/connexion`.

---

## 1. Base de données Neon

1. **neon.tech** → se connecter (compte GitHub possible) → **New Project**.
   - Nom : `sirpassist`
   - Région : Europe (`AWS eu-central-1 / Frankfurt`)
   - Create.
2. Sur l'écran du projet, section **Connection string** → choisir **Pooled connection**
   (l'URL contient `-pooler`). Copier toute la chaîne, du type :
   ```
   postgresql://neondb_owner:XXXX@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   → c'est la valeur de **`DATABASE_URL`**.

*(Alternative : dans Vercel → onglet **Storage** → **Create Database → Neon/Postgres**.
Vercel crée la base et injecte `DATABASE_URL` tout seul. Si tu fais ça, saute l'ajout
manuel de `DATABASE_URL` ci-dessous.)*

---

## 2. Variables d'environnement Vercel

Projet `sirpassist` → **Settings → Environment Variables**. Pour chacune : Type **Config**,
Environments **Production + Preview**.

| Name | Value |
|---|---|
| `VITE_AUTH_ENABLED` | `true`  *(remplace la valeur `false` actuelle — Edit sur la ligne existante)* |
| `DATABASE_URL` | *(chaîne pooled Neon de l'étape 1)* |
| `BETTER_AUTH_SECRET` | `d72de0672445bc25c88f2a2e9171745e763d4831ae2365e6471f79b8c036fafc` |
| `BETTER_AUTH_URL` | `https://sirpassist.vercel.app` |

> `BETTER_AUTH_SECRET` ci-dessus a été généré pour toi (aléatoire, 32 octets). Tu peux
> le garder tel quel. Si tu ajoutes un jour un nom de domaine perso, mets à jour
> `BETTER_AUTH_URL` avec cette nouvelle adresse.

---

## 3. Fusionner et déployer

Dans GitHub Desktop :
1. **Current branch → `refonte-securite`** → **Push origin** (envoie les nouveaux commits).
2. **Branch → Merge into current branch…** — d'abord repasser sur `main`
   (Current branch → `main`), puis **Merge into current branch → `refonte-securite`**.
3. **Push origin** sur `main`.

Vercel redéploie `main` automatiquement.

*(En ligne de commande, équivalent : `git checkout main && git merge refonte-securite && git push`.)*

---

## 4. Vérifier

Sur le déploiement `main` terminé :

1. **Log de build** → doit contenir `[migrate] applied 0001_auth.sql` et `0002_support_tickets.sql`.
2. Ouvrir **`https://sirpassist.vercel.app/connexion`** → « Créer un compte » →
   e-mail + mot de passe (≥ 8 caractères) → la carte « Session ouverte (serveur) »
   doit s'afficher avec l'e-mail et un `id`.
3. **Recharger la page** → la session doit persister (cookie `__Host-…session_token`).
4. **`https://sirpassist.vercel.app/api/auth/get-session`** → renvoie un JSON avec
   `user` (connecté) ou `null` (déconnecté).
5. « Se déconnecter » → la session disparaît.

Si erreur : colle-moi le **log de build** Vercel, ou le message affiché sur `/connexion`
(et éventuellement l'onglet **Functions / Logs** de Vercel pour l'erreur serveur).

---

## Ensuite — Phase 3

Migrer la page « Compte », les données (visites, anomalies, FDS, RPS, PGP) vers Neon
avec `authMiddleware`, et retirer l'ancien système (Supabase, `password.ts`, `totp.ts`,
`admin-account.ts`).
