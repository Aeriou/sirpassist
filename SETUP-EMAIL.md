# Activer la vérification d'e-mail (plus tard)

Aujourd'hui, la limitation des comptes irréels passe par la **validation
manuelle** : un nouveau compte est `en attente`, et le propriétaire
(`phpiheyns@hotmail.com`) le valide dans l'app (onglet **Compte** → « Nouveaux
comptes à valider »). Un compte non validé ne peut ni envoyer ni recevoir de
partage.

La **vérification par lien e-mail** (Better Auth + Resend) est déjà câblée mais
**dormante** : elle s'active dès que les variables ci-dessous sont présentes.
Elle exige **un nom de domaine à toi** (impossible avec `sirpassist.vercel.app`).

## Étapes le jour où tu as un domaine

1. **Domaine** : acheter un domaine (~12 €/an — OVH, Gandi, Cloudflare, ou
   Vercel → Settings → Domains). Le brancher sur le projet Vercel si tu veux
   aussi remplacer `sirpassist.vercel.app`.
2. **Resend** : créer un compte sur [resend.com](https://resend.com) →
   **Domains** → *Add Domain* (ou un sous-domaine, ex. `mail.mondomaine.be`) →
   ajouter les 3 enregistrements DNS (SPF, DKIM, DMARC) chez le registrar →
   attendre « Verified ».
3. **Clé** : Resend → **API Keys** → *Create* → copier (`re_...`).
4. **Variables Vercel** (Project → Settings → Environment Variables) :
   | Nom | Valeur |
   |---|---|
   | `RESEND_API_KEY` | `re_...` |
   | `RESEND_FROM` | `SiprAssist <noreply@mondomaine.be>` |
   | `ACCOUNTS_AUTO_APPROVE` | `true` *(facultatif — voir plus bas)* |
5. **Redéployer**. À partir de là :
   - un nouvel inscrit reçoit un lien de confirmation ;
   - la session est retenue tant que l'adresse n'est pas confirmée
     (`requireEmailVerification`).

## Garder ou non la validation manuelle

- **Sans** `ACCOUNTS_AUTO_APPROVE` : double filtre — l'adresse est confirmée
  *et* le propriétaire valide le compte.
- **Avec** `ACCOUNTS_AUTO_APPROVE=true` : le compte est validé d'office dès la
  confirmation d'e-mail ; la liste « Nouveaux comptes à valider » reste vide.

## Sans clé Resend

`RESEND_API_KEY` absent ⇒ aucun e-mail envoyé, `requireEmailVerification`
désactivé, seule la validation manuelle joue. C'est l'état actuel.
