# Mise en route / redéploiement

État actuel : l'app tourne sur **GitHub + Vercel + Neon Postgres**, avec
**Better Auth** (e-mail / mot de passe + 2FA) et **Stripe** (webhook signé).
Supabase n'est plus utilisé (retiré au fil de la refonte).

- URL de prod : https://sirpassist.vercel.app
- Dépôt : `Aeriou/sirpassist` · branche unique `main` (Vercel déploie à chaque push)
- Dossier local : `C:\Users\Phil\SIPPAssist\sirpassist`
- Base : Neon `winter-sea-45665868` (Frankfurt), DB `neondb`, `DATABASE_URL` *pooled*

---

## Variables d'environnement Vercel

Projet Vercel `sirpassist` → **Settings → Environment Variables** (Production + Preview).

### Requises

| Nom | Valeur |
|---|---|
| `VITE_AUTH_ENABLED` | `true` |
| `DATABASE_URL` | chaîne **pooled** Neon (`...-pooler...`) |
| `BETTER_AUTH_SECRET` | 64 hex — `openssl rand -hex 32`. **Ne jamais la regénérer** une fois la 2FA en service : elle chiffre les secrets TOTP au repos, la changer verrouille tous les comptes 2FA (il faut alors les réinitialiser en base). |
| `BETTER_AUTH_URL` | `https://sirpassist.vercel.app` |

### Optionnelles (fonctionnalités désactivées si absentes)

| Nom | Effet si absent |
|---|---|
| `STRIPE_SECRET_KEY` | paiement indisponible (le reste marche) |
| `STRIPE_WEBHOOK_SECRET` | le webhook `/api/stripe/webhook` rejette tout |
| `STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_BASIC` | prix créés/retrouvés automatiquement au 1ᵉʳ checkout |
| `XAI_API_KEY` | l'analyse IA retombe sur l'analyse locale (parsing) |
| `RESEND_API_KEY` / `RESEND_FROM` | **vérification d'e-mail dormante** (voir `SETUP-EMAIL.md`) ; sans elles, `requireEmailVerification` reste off |
| `ACCOUNTS_AUTO_APPROVE=true` | les nouveaux comptes sont auto-validés (sinon le propriétaire valide via `/compte`) |

Le compte propriétaire (`phpiheyns@hotmail.com`, Pro gratuit à vie) est une
**constante de code** : `OWNER_EMAILS` dans `src/lib/plan-server.ts` — pas une
variable d'env.

---

## Redéployer de zéro

1. **GitHub** — pousser `main` sur `Aeriou/sirpassist`.
2. **Neon** — créer une base, récupérer la chaîne *pooled* → `DATABASE_URL`.
   Les migrations `migrations/*.sql` s'appliquent **au build Vercel** via
   `npm run build` (→ `npm run db:migrate`). Rien à lancer à la main.
3. **Vercel** — importer le dépôt. Framework : *Other*. Build Command :
   `npm run build` (impératif, sinon `db:migrate` ne tourne pas). Renseigner les
   variables ci-dessus. **Deploy**.
4. **Stripe** (si paiement) — dashboard → webhook vers
   `https://<domaine>/api/stripe/webhook`, événements `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`
   → `STRIPE_WEBHOOK_SECRET`.

---

## Vérification locale (avant chaque push)

Node portable : `C:\Users\Phil\SIPPAssist\_tools\node-v22.23.2-win-x64\` (dans le PATH).

```bash
npm run typecheck
npm run build
node --experimental-strip-types scripts/dryrun-workspace.mts
node --experimental-strip-types scripts/dryrun-share.mts
node --experimental-strip-types scripts/dryrun-user-store.mts
node --experimental-strip-types scripts/dryrun-account.mts
node --experimental-strip-types scripts/dryrun-asset.mts
node --experimental-strip-types scripts/dryrun-rate-limit.mts
node --experimental-strip-types scripts/dryrun-group-classeur.mts
node --experimental-strip-types scripts/dryrun-rls.mts
```

Sans `DATABASE_URL`, l'app utilise un PGLite local (WASM) qui applique lui-même
les migrations — utile pour le dev, jamais en prod.

---

## Docs liées

- `SETUP-PHASE2.md` — activation Better Auth + note de sécurité sur `BETTER_AUTH_SECRET` / 2FA
- `SETUP-EMAIL.md` — activer la vérification d'e-mail (Resend + domaine)
- `SETUP-RLS.md` — activer les politiques RLS Postgres (défense en profondeur, aujourd'hui inertes)
- `REFONTE-SECURITE.md` — historique de la refonte (terminée)
