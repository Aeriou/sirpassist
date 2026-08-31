# SiprAssist — Refonte sécurité & optimisation

Plan de travail. Décisions prises :
- **Authentification** : refonte serveur (activer la vraie auth serveur, hachage fort, 2FA vérifiée côté serveur, entitlement Pro côté serveur, webhook Stripe).
- **Compte propriétaire** : garder `phpiheyns@hotmail.com` comme accès Pro gratuit à vie, mais via un mécanisme serveur propre (mot de passe long choisi par le propriétaire, haché fort, jamais dans le bundle) — suppression du hash en dur `BOOTSTRAP_HASH`.

---

## État des lieux (constat)

| Domaine | Aujourd'hui | Cible |
|---|---|---|
| Identité | `VITE_AUTH_ENABLED=false` → aucune vérif serveur. « L'utilisateur » = ce que le navigateur déclare. | Better Auth actif (email + mot de passe), session cookie `__Host-`, `authMiddleware` sur chaque server function. |
| Mots de passe | 1 tour de SHA-256, hash calculé dans le navigateur = équivaut au mot de passe. | PBKDF2 (≥210 000 itérations) ou Argon2id, calcul **serveur**, poivre serveur. |
| 2FA / TOTP | Vérifiée côté client uniquement ; secret TOTP en clair dans `localStorage` + cloud ; contournable en appelant l'API. | Plugin `twoFactor` de Better Auth : secret chiffré au repos, challenge vérifié serveur, codes de secours hachés, throttling. |
| Forfait Pro | `activatePlan('pro')` = action zustand → Pro gratuit pour tous via la console. Pas de webhook Stripe. | `plan` stocké en base, écrit **uniquement** par le webhook Stripe signé + l'allowlist propriétaire. Le client lit, n'écrit jamais. |
| Backend données | Snapshot JSON complet poussé à Supabase par RPC `anon`, accès par `join_code` 6 car., `sipr_push` écrase tout. | Tables Neon avec `user_id` / `workspace_id`, RLS applicative via `authMiddleware`, écritures granulaires. |
| Fonctions IA | `analyzeAnomaly` / `analyzeFds` publiques, sans quota ni cap de taille → consomment `XAI_API_KEY`. | `authMiddleware` + quota par utilisateur + cap de taille image + validation `data:` uniquement. |
| Secrets | `STRIPE_SECRET_KEY` en clair dans `netlify.toml` (versionné) et `.grok/server-secrets.json`. | Variables d'environnement de la plateforme uniquement. Clés Stripe **révoquées et recréées**. |
| Admin | `phpiheyns@hotmail.com` en dur + `BOOTSTRAP_HASH` cassable hors ligne (dans le bundle public). | Allowlist e-mail côté serveur + mot de passe fort haché ; aucun hash dans le code. |

---

## Contrainte de méthode

Le poste actuel n'a **pas** Node/npm : on peut éditer le code mais pas le compiler/tester ici.
La refonte auth **doit** être vérifiée dans une boucle build + preview. Deux options :

1. **Grok sandbox** — rouvrir le projet dans Grok (build + live preview intégrés). Je fournis le code par étape, tu colles les erreurs de build, j'itère.
2. **GitHub `Aeriou/sippassist` + Vercel** — je pousse sur une branche, les preview deployments Vercel servent de vérification.

Chaque phase se termine par : `npm run build` + `npm run typecheck` verts, puis test manuel du parcours décrit.

---

## Phases

### Phase 1 — Nettoyage sans risque (aucune dépendance architecture)
- [ ] Retirer `STRIPE_SECRET_KEY` de `netlify.toml` ; documenter la mise en variable d'env.
- [ ] Retirer `.grok/server-secrets.json` du zip distribué ; **révoquer + recréer** les clés Stripe test dans le dashboard Stripe.
- [ ] `password.ts` : PBKDF2 (Web Crypto `deriveBits`, SHA-256, 210k itérations) ; garder un chemin de vérif rétro-compatible pour les hash SHA-256 existants → ré-hachage transparent à la prochaine connexion.
- [ ] `.gitignore` : confirmer l'exclusion de `attachments/`, `screenshots/` du déploiement.
- [ ] `npm audit` + montée des correctifs.

### Phase 2 — Activer Better Auth (email + mot de passe)  ✅ code prêt (branche `refonte-securite`)
Fait dans le code :
- [x] `emailAndPasswordEnabled = true` (`src/lib/auth/email-password.ts`) — seul fichier `auth/` modifié.
- [x] Schéma Better Auth copié dans `migrations/0001_auth.sql` (appliqué à Neon au build via `npm run db:migrate`).
- [x] `src/routes/api/auth/$.ts` — handler catch-all `/api/auth/*`.
- [x] `vercel.json` → `buildCommand: npm run build` (sinon `db:migrate` ne tourne pas).
- [x] `src/routes/connexion.tsx` — page de test isolée (créer un compte / se connecter / se déconnecter), **la page « Compte » n'est pas touchée**.

À faire côté infra (voir `SETUP-PHASE2.md`) :
- [ ] Créer une base **Neon** (ou Vercel Postgres) → `DATABASE_URL` (chaîne *pooled*).
- [ ] Variables Vercel : `VITE_AUTH_ENABLED=true`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://sirpassist.vercel.app`.
- [ ] Fusionner `refonte-securite` → `main`, redéployer.
- [ ] Test : `/connexion` → créer un compte → session affichée ; `/api/auth/get-session` renvoie l'utilisateur ; recharger la page garde la session.

### Phase 3 — Migrer comptes + données vers Neon  (nouveau projet : pas de reprise de données)
Découpée en sous-étapes, chacune = 1 déploiement + test :
- [ ] **3a — Profil + forfait + propriétaire.** Migration `sipr_profile` (`user_id` PK, name/title/level/organisation/kind, `plan` défaut `trial`, `trial_ends_at`). Server fns `getMyProfile` / `updateMyProfile` (`authMiddleware`). Création auto du profil à la 1ʳᵉ connexion. Allowlist serveur : `phpiheyns@hotmail.com` → `plan = pro` forcé (constante serveur, hors bundle client). Bascule de la **page « Compte »** sur la session Better Auth + ce profil.
- [ ] **3b — Espaces.** Tables `workspace` + `workspace_member`. `createWorkspace` / `listMyWorkspaces` / `joinWorkspace(code)`.
- [ ] **3c — Enregistrements.** Tables `visit` / `anomaly` / `fds_notice` / `rps_situation` + CRUD `authMiddleware`, filtrés par appartenance à l'espace. `store.ts` → cache alimenté par le serveur (TanStack Query), fin du snapshot monolithique.
- [ ] **3d — PGP / PAA.** Tables `pgp_plan` / `paa_line` + endpoints.
- [ ] **3e — Retrait de l'ancien système.** Supprimer `cloud-sync.ts`, `supabase*.ts`, `src/lib/password.ts`, `src/lib/admin-account.ts`, le SQL Supabase, les variables `VITE_SUPABASE_*`. (`totp.ts` part en Phase 4.)

### Phase 4 — 2FA serveur
- [ ] Ajouter le plugin `twoFactor` (`better-auth/plugins`) au `betterAuth({...})` ; migration des tables 2FA.
- [ ] Écran `compte.tsx` → utiliser `authClient.twoFactor.*` (enroll, verify, backup codes) au lieu de `src/lib/totp.ts` maison.
- [ ] Supprimer `totpSecret` / `totpBackupHashes` du type `SiprUser` et du store client.
- [ ] Throttling des tentatives (Better Auth `rateLimit`).
- [ ] Test : activer 2FA, se déconnecter, reconnexion exige le code ; code de secours consommé une seule fois ; appel API direct sans code = refusé.

### Phase 5 — Entitlement Pro serveur + webhook Stripe
- [ ] Colonne `plan` sur `sipr_user_profile`, écrite uniquement serveur.
- [ ] `src/routes/api/stripe/webhook.ts` : vérif signature (`STRIPE_WEBHOOK_SECRET`), gérer `checkout.session.completed`, `customer.subscription.updated/deleted` → met à jour `plan`.
- [ ] `plan.ts` : `planView` lit `plan` depuis la session serveur ; `activatePlan`/`activatePro` retirés du client.
- [ ] Allowlist propriétaire : `phpiheyns@hotmail.com` → `plan = "pro"` forcé côté serveur (constante serveur, pas dans le bundle client). Mot de passe fort défini via le parcours normal Better Auth.
- [ ] Supprimer `src/lib/admin-account.ts` (`BOOTSTRAP_HASH`).
- [ ] Test : checkout test Stripe → Pro ; annulation via webhook → retour trial/expired ; compte propriétaire → Pro sans paiement.

### Phase 6 — Optimisation
- [ ] Import dynamique de `recharts` / `d3-*` sur `tableau.tsx`, `pgp.tsx`, `paa.tsx`.
- [ ] Vérifier que `@electric-sql/pglite` (WASM) n'entre pas dans le bundle client.
- [ ] `store.ts` : debounce de la persistance `localStorage` (~500 ms) ; `partialize` resserré.
- [ ] Photos : stockage binaire (Supabase Storage / Vercel Blob), pas de base64 en base.
- [ ] En-têtes sécurité : CSP applicative (compatible avec le script grok.com requis), `Referrer-Policy`, `X-Content-Type-Options`.
- [ ] Budget de bundle + `browser-smoke` desktop/mobile verts.

---

## Points « rendre l'app indispensable au conseiller en prévention »
(hors sécurité — backlog produit à prioriser ensuite)
- Génération du rapport de visite PDF en 1 clic (déjà `pdf.ts` — étendre : en-tête SIPP, signatures, photos horodatées).
- Registre légal : export PAA / PGP conforme au Code du bien-être, avec références auto.
- Rappels N1–N3 avec notifications (échéances d'actions, revues RPS).
- Mode hors-ligne réel (PWA + file d'attente de sync) pour le terrain.
- Bibliothèque FDS partagée entre espaces d'un même groupe.
