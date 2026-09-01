import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { DEFAULT_PROFILE } from "@/lib/seed";
import { useSipr } from "@/lib/store";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";

/**
 * Fait le pont entre la session Better Auth (serveur) et l'état local de l'app.
 *
 * Tant que la migration complète des données n'est pas faite, l'app travaille
 * toujours sur le store zustand. Ce composant garantit que : connecté via
 * `/connexion` ⇒ connecté PARTOUT (avatar, espace, profil), et que l'espace
 * démo disparaît dès qu'un compte est ouvert. Déconnexion Better Auth ⇒
 * déconnexion locale.
 *
 * Monté une fois dans `__root.tsx`. Ne rend rien.
 */
export function SessionBridge() {
  const { data, isPending } = authClient.useSession();
  const baUserId = data?.user?.id ?? null;

  // Attendre que le store local soit réhydraté depuis localStorage, sinon on
  // recréerait un compte/espace alors qu'il en existe déjà un.
  const [hydrated, setHydrated] = useState(() => useSipr.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    if (useSipr.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useSipr.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    if (isPending || !hydrated) return;
    const st = useSipr.getState();
    const baUser = data?.user;

    if (baUser) {
      const email = (baUser.email ?? "").toLowerCase();
      const localId = `ba_${baUser.id}`;
      const target = st.users.find((u) => u.id === localId || (email && u.email === email));

      if (target) {
        if (st.sessionUserId !== target.id) st.signInUser(target.id);
        return;
      }

      // Premier passage pour ce compte : lui donner un espace personnel réel
      // (l'espace démo cesse alors d'être l'espace actif).
      const owned = st.workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID);
      const wsId = owned[0]?.id ?? st.createWorkspace({ kind: "independant", name: "Mon espace" }).id;
      st.addUser({
        id: localId,
        name: baUser.name || email || "Conseiller",
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
      return;
    }

    // Pas de session Better Auth : revenir à l'état invité si le profil / l'espace
    // actif reflète encore un compte issu du pont (y compris après un rechargement
    // où `sessionUserId` est déjà nul mais le profil est resté celui du compte).
    const bridged = st.users.find((u) => u.id.startsWith("ba_"));
    const stale =
      st.sessionUserId?.startsWith("ba_") ||
      (bridged &&
        (st.profile.name === bridged.name || st.activeWorkspaceId === bridged.workspaceId));
    if (stale) {
      st.signOutUser();
      st.setProfile({ ...DEFAULT_PROFILE });
      if (st.workspaces.some((w) => w.id === DEMO_WORKSPACE_ID)) {
        st.switchWorkspace(DEMO_WORKSPACE_ID);
      }
    }
  }, [baUserId, isPending, hydrated]);

  return null;
}
