import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { apiGetMyPlan } from "@/lib/plan-api";
import { DEFAULT_PROFILE } from "@/lib/seed";
import { useSipr } from "@/lib/store";
import { applyStoreScope } from "@/lib/store-scope";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";

/**
 * Fait le pont entre la session Better Auth (serveur) et l'état local de l'app.
 *
 * Tant que la migration complète des données n'est pas faite, l'app travaille
 * toujours sur le store zustand. Ce composant garantit que : connecté via
 * `/connexion` ⇒ connecté PARTOUT (avatar, espace, profil), que l'espace démo
 * disparaît dès qu'un compte est ouvert, et que chaque compte a ses propres
 * données locales (clé localStorage dédiée, cf. `applyStoreScope`). Déconnexion
 * Better Auth ⇒ déconnexion locale + retour à l'espace démo.
 *
 * Monté une fois dans `__root.tsx`. Ne rend rien.
 */
export function SessionBridge() {
  const { data, isPending } = authClient.useSession();
  const baUserId = data?.user?.id ?? null;

  // Le store persistant est cloisonné par compte. On attend que la session
  // soit résolue avant de réhydrater, pour ne pas charger l'état d'un compte
  // puis basculer sur un autre. `scopedFor` = compte pour lequel le store est
  // actuellement chargé (`undefined` tant que rien n'est chargé).
  const [scopedFor, setScopedFor] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    void applyStoreScope(baUserId).then(() => {
      if (!cancelled) setScopedFor(baUserId);
    });
    return () => {
      cancelled = true;
    };
  }, [baUserId, isPending]);

  const ready = !isPending && scopedFor === baUserId;

  useEffect(() => {
    if (!ready) return;
    const st = useSipr.getState();
    const baUser = data?.user;

    if (baUser) {
      const email = (baUser.email ?? "").toLowerCase();
      const localId = `ba_${baUser.id}`;
      // Correspondance UNIQUEMENT sur l'id de session serveur. On n'adopte jamais
      // un ancien compte local (`user_…`, d'avant la refonte) par e-mail : il
      // ramènerait son espace/profil périmés (souvent la démo).
      const target = st.users.find((u) => u.id === localId);

      if (target) {
        if (st.sessionUserId !== target.id) st.signInUser(target.id);
      } else {
        // Premier passage pour ce compte : lui donner un espace personnel réel
        // (l'espace démo cesse alors d'être l'espace actif).
        const owned = st.workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID);
        const wsId =
          owned[0]?.id ?? st.createWorkspace({ kind: "independant", name: "Mon espace" }).id;
        const friendlyName =
          baUser.name && !baUser.name.includes("@")
            ? baUser.name
            : email.split("@")[0] || "Conseiller";
        st.addUser({
          id: localId,
          name: friendlyName,
          email,
          title: "Conseiller en prévention",
          level: 3,
          organisation: "",
          kind: "independant",
          workspaceId: wsId,
          salt: "",
          passwordHash: "",
          createdAt: new Date().toISOString(),
        });
      }

      // Forfait = source de vérité serveur (allowlist propriétaire + sipr_billing).
      void apiGetMyPlan()
        .then((p) => {
          const s = useSipr.getState();
          if (!s.sessionUserId) return;
          s.patchSessionUser({
            plan: p.plan === "expired" ? "trial" : p.plan,
            trialEndsAt: p.trialEndsAt ?? undefined,
          });
        })
        .catch(() => {
          /* réessai au prochain rendu */
        });
      return;
    }

    // Pas de session Better Auth : personne n'est connecté. La seule
    // authentification est désormais Better Auth, donc TOUTE session locale
    // (nouvelle « ba_ » comme ancienne « user_ ») est périmée -> état invité.
    if (st.sessionUserId) {
      st.signOutUser();
      st.setProfile({ ...DEFAULT_PROFILE });
      if (st.workspaces.some((w) => w.id === DEMO_WORKSPACE_ID)) {
        st.switchWorkspace(DEMO_WORKSPACE_ID);
      }
    }
  }, [baUserId, ready]);

  return null;
}
