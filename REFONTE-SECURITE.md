# SiprAssist — Refonte sécurité & optimisation

> **✅ Refonte terminée (septembre 2026).** Ce document est conservé comme
> historique. L'auth, le stockage, le forfait, la 2FA et le webhook Stripe sont
> tous passés côté serveur ; l'ancien backend Supabase a été entièrement retiré.
> État courant de l'infra : voir `SETUP.md`.

Décisions initiales (toutes appliquées) :
- **Authentification** : refonte serveur — vraie auth serveur, hachage fort, 2FA vérifiée côté serveur, entitlement Pro côté serveur, webhook Stripe.
- **Compte propriétaire** : `phpiheyns@hotmail.com` en Pro gratuit à vie via une allowlist serveur (`OWNER_EMAILS` dans `src/lib/plan-server.ts`), plus de hash en dur `BOOTSTRAP_HASH`.

---

## Avant / après

| Domaine | Avant (app d'origine) | Livré |
|---|---|---|
| Identité | `VITE_AUTH_ENABLED=false` → aucune vérif serveur. « L'utilisateur » = ce que le navigateur déclare. | **Better Auth** actif (e-mail + mot de passe), cookie `__Host-`, `authMiddleware` + garde CSRF Fetch-Metadata sur chaque server function. |
| Mots de passe | 1 tour de SHA-256 calculé dans le navigateur. | Hachage **serveur** par Better Auth (scrypt). Ancien code maison supprimé. |
| 2FA / TOTP | Vérifiée côté client, secret en clair dans `localStorage` + cloud. | Plugin `twoFactor` Better Auth : secret chiffré au repos (`BETTER_AUTH_SECRET`), challenge serveur, codes de secours hachés, verrouillage à la connexion. |
| Forfait Pro | `activatePlan('pro')` = action zustand → Pro gratuit pour tous. | `plan` en base, écrit **uniquement** par le webhook Stripe signé + l'allowlist propriétaire. Le client lit, n'écrit jamais. |
| Backend données | Snapshot JSON complet poussé à Supabase par RPC `anon`, accès par `join_code` 6 car. | **Neon Postgres**, données scopées par `user_id` vérifié (`user_store`, `user_asset`) ; groupes gatés par appartenance active (`workspace_*`, `group_classeur`). Migrations appliquées au build. |
| Fonctions IA | `analyzeAnomaly` / `analyzeFds` publiques, sans quota. | `authMiddleware` + quota par utilisateur (rate-limit Postgres) + cap de taille + `data:image/` obligatoire. |
| Secrets | `STRIPE_SECRET_KEY` en clair dans `netlify.toml` versionné + `.grok/server-secrets.json`. | Variables d'environnement de la plateforme uniquement ; ces fichiers supprimés. Clés à révoquer côté dashboards (action manuelle). |
| Admin | `phpiheyns@hotmail.com` + `BOOTSTRAP_HASH` cassable hors ligne (dans le bundle public). | Allowlist e-mail serveur (`OWNER_EMAILS`, hors bundle) ; `admin-account.ts` supprimé. |

---

## Phases — toutes livrées

### Phase 1 — Nettoyage sans risque ✅
- [x] `STRIPE_SECRET_KEY` retiré de `netlify.toml` (fichier supprimé) ; passage en variable d'env.
- [x] `.grok/server-secrets.json` retiré. *(Révocation des clés Stripe test = action manuelle dans le dashboard.)*
- [x] Hachage des mots de passe délégué à Better Auth (serveur).
- [x] `npm audit` + correctifs.

### Phase 2 — Better Auth (e-mail + mot de passe) ✅
- [x] `emailAndPasswordEnabled = true`, schéma `migrations/0001_auth.sql`, handler `/api/auth/*`, `vercel.json` → `buildCommand: npm run build`.
- [x] Infra : base **Neon** → `DATABASE_URL` *pooled* ; variables Vercel `VITE_AUTH_ENABLED=true`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- [x] Vérifié en prod : création de compte, session persistante après reload, écriture en base.

### Phase 3 — Comptes + données sur Neon ✅
- [x] **3a** Profil + forfait + allowlist propriétaire ; `SessionBridge` fait le pont session ↔ store.
- [x] **3b** Espaces de travail serveur (`workspace` / `workspace_member`), validation d'adhésion, puis **invitation par e-mail** (remplace le code 6 caractères).
- [x] **3c** Stockage des dossiers par compte : `user_store` (instantané JSON, verrou optimiste `rev`) + `user_asset` (photos content-addressed, hors blob). `<UserStoreHost>` synchronise.
- [x] **3d** PGP / PAA inclus dans l'instantané `user_store`.
- [x] **3e** Ancien système retiré : `supabase-schema.ts`, `password.ts`, `totp.ts`, `admin-account.ts`, `cloud-card.tsx`, la synchro « snapshot de groupe » inachevée, le SQL Supabase. Variables `VITE_SUPABASE_*` à retirer de Vercel (action manuelle, sans impact code).

### Phase 4 — 2FA serveur ✅
- [x] Plugin `twoFactor` Better Auth, migration `0004_two_factor.sql`.
- [x] `two-factor-card.tsx` (QR + 10 codes de secours) ; `auth-panel.tsx` gère `twoFactorRedirect` à la connexion.
- [x] Plus de `totpSecret` côté client. Vérifié en prod (enrôlement, reconnexion exigeant le code, désactivation).

### Phase 5 — Entitlement Pro serveur + webhook Stripe ✅
- [x] Colonne `plan` (table `sipr_billing`), écrite serveur uniquement.
- [x] `/api/stripe/webhook` : signature vérifiée, gère `checkout.session.completed`, `customer.subscription.updated|deleted`, `charge.refunded` (remboursement → accès coupé immédiatement + abonnement annulé).
- [x] `planView` lit le forfait depuis le serveur ; `activatePlan`/`activatePro` retirés du chemin d'écriture client.
- [x] Allowlist propriétaire serveur ; `admin-account.ts` supprimé.
- [x] Durcissement complémentaire : `startCheckout` / `confirmCheckout` / `startBillingPortal` sous `authMiddleware`, IDOR corrigé (customerId depuis la base, pas le client).

### Phase 6 — Optimisation (partiel — non bloquant)
- [x] Clignotement au chargement (React #418) : squelette statique le temps de la réhydratation.
- [x] Photos : compression JPEG + downscale (bannière « preuve CBE » préservée) ; stockage binaire serveur (`user_asset`), plus de base64 en base — constats, couvertures **et** notices FDS.
- [x] `store.ts` : `partialize` resserré, persistance par compte (`siprassist-v5::<userId>`).
- [ ] Import dynamique de `recharts` / `d3-*` (encore dans le bundle des pages graphiques).
- [ ] CSP applicative / en-têtes sécurité fins.
- [ ] Budget de bundle + smoke desktop/mobile automatisés.

### Durcissement (post-phases) ✅
- [x] **Lot 1** : rate-limiting (envois, uploads, IA, géo) + quotas d'images (`rate_limit`, `0011`).
- [x] **Lot 2** : validation runtime des entrées (`src/lib/validate.ts`, tous les `validator`) + politiques RLS Postgres (`0012`/`0013`) — **inertes** (l'app se connecte en rôle propriétaire) ; activation décrite dans `SETUP-RLS.md`.
- [x] Suppression de compte (RGPD) : `purgeUserData` efface espaces, snapshot, memberships, partages, assets, billing, classeurs de groupe publiés.

### Partage & groupes (tranche produit, livrée) ✅
- [x] Partage ciblé dossier / constat par e-mail (accepter / refuser, notes signées, aller-retour).
- [x] Entité **Classeur** : regroupe visites + constats, synchronisée par compte.
- [x] Partage d'un classeur avec un **groupe** (lecture seule, photos comprises), page **Groupe** dédiée, suppression de groupe, « Importer dans mes dossiers » pour récupérer un classeur reçu.

---

## Backlog produit (hors sécurité)
- Rapport de visite PDF enrichi (en-tête SIPP, signatures, photos horodatées).
- Registre légal : export PAA / PGP conforme au Code du bien-être, références auto.
- Rappels N1–N3 avec notifications (échéances, revues RPS).
- Mode hors-ligne réel (PWA + file de sync).
- Bibliothèque FDS partagée au sein d'un groupe.
- Notifications e-mail (Resend, dormant — nécessite un domaine + DNS).
