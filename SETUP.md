# Mise en route — nouveau projet (GitHub + Vercel + Supabase)

Objectif de cette étape : déployer l'app **telle quelle** (comportement actuel préservé)
sur ta nouvelle infra, et confirmer que le build Vercel passe. Aucune modification de
comportement ici — juste le nettoyage et le passage en variables d'environnement.

Dossier local du projet : `C:\Users\Phil\SIPPAssist\sirpassist`
Branches : `main` (référence) · `refonte-securite` (travail).

---

## 1. GitHub — nouveau dépôt

1. Sur github.com → **New repository** → nom par ex. `sippassist` → **Private** → *ne pas* cocher « Add a README ». Créer.
2. Dans un terminal (Git est installé) :

```bash
cd C:\Users\Phil\SIPPAssist\sirpassist
git remote add origin https://github.com/<ton-compte>/sippassist.git
git push -u origin main
git push -u origin refonte-securite
```

Si Git demande une authentification : utiliser un **Personal Access Token** GitHub
(Settings → Developer settings → Tokens) comme mot de passe.

---

## 2. Supabase — nouveau projet

1. supabase.com → **New project** (région Europe, ex. `eu-central-1`). Noter le mot de passe DB.
2. Projet → **Project Settings → API** : relever
   - **Project URL** → `VITE_SUPABASE_URL`
   - clé **`publishable`** (ou `anon`) → `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Projet → **SQL Editor → New query** : coller le script de schéma cloud et **Run**.
   Le script est dans le code : `src/lib/supabase-schema.ts` (constante `SUPABASE_SCHEMA_SQL`).
   Copier tout ce qui est entre les backticks.
   *(Ce backend Supabase disparaîtra en Phase 3 — on le garde juste pour que la
   version de référence tourne à l'identique.)*

---

## 3. Vercel — nouveau projet

1. vercel.com → **Add New → Project** → importer le dépôt GitHub `sippassist`.
2. Framework Preset : **Vite** (ou « Other »). Build Command : `npm run build`.
   Laisser le reste par défaut (le preset Nitro `vercel` produit `.vercel/output`).
3. **Environment Variables** (Production + Preview) :

   | Nom | Valeur | Remarque |
   |---|---|---|
   | `VITE_AUTH_ENABLED` | `false` | on garde le comportement actuel pour la référence ; passera à `true` en Phase 2 |
   | `VITE_SUPABASE_URL` | *(URL projet Supabase)* | |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | *(clé publishable Supabase)* | |
   | `STRIPE_SECRET_KEY` | *(nouvelle clé test `sk_test_...`)* | optionnel ; sans elle, seul le paiement est indisponible |
   | `XAI_API_KEY` | *(ta clé xAI, optionnel)* | sans elle, l'analyse IA retombe sur l'analyse locale |

   Ne **pas** définir `DATABASE_URL` pour l'instant (ajout en Phase 2 avec Neon).
4. **Deploy**. Vérifier que le build se termine en vert et que l'app s'ouvre.

---

## 4. Clé Stripe

Dans le dashboard Stripe : **révoquer** l'ancienne clé test `sk_test_51U9pPj…`
(Developers → API keys → Roll key) puisqu'elle a circulé, puis créer/relever une
nouvelle clé test pour `STRIPE_SECRET_KEY` ci-dessus.

---

## 5. Me redire

Une fois le déploiement Vercel vert (ou s'il échoue, coller le log de build) :
on enchaîne sur la **Phase 2 — activation de Better Auth** sur la branche `refonte-securite`.
