import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { apiPullUserStore, apiPushUserStore } from "@/lib/user-store-api";
import { apiListAssetIds, apiPutAsset } from "@/lib/asset-api";
import { assetIdOf, isDataUrl } from "@/lib/asset-id";
import { primeAsset } from "@/lib/asset-cache";
import { buildUserSnapshot, snapshotKey } from "@/lib/user-snapshot";
import { useOnline } from "@/lib/online";
import { useSipr } from "@/lib/store";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";

/**
 * Synchronise les dossiers du compte connecté avec le serveur (Neon), source de
 * vérité. Le localStorage par compte reste un cache hors-ligne / premier
 * affichage. Monté une fois dans `__root.tsx`. Ne rend rien.
 *
 * - Connexion prête + store réhydraté ⇒ un *pull*, fusionné dans le store.
 * - Toute modification ⇒ *push* débattu (~2,5 s). Conflit `rev` (autre onglet /
 *   appareil) ⇒ re-pull + fusion + re-push.
 */
export function UserStoreHost() {
  const { data: session, isPending } = authClient.useSession();
  const online = useOnline();
  const userId = session?.user?.id ?? null;

  const [hydrated, setHydrated] = useState(() => useSipr.persist.hasHydrated());
  const [pulledFor, setPulledFor] = useState<string | null>(null);
  const rev = useRef(0);
  const lastKey = useRef("");
  const timer = useRef<number>(0);
  const pushing = useRef(false);
  const serverAssetIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (hydrated) return;
    if (useSipr.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useSipr.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  // ---- pull une fois la session + l'hydratation prêtes ----
  useEffect(() => {
    if (isPending || !userId || !hydrated) {
      setPulledFor(null);
      rev.current = 0;
      lastKey.current = "";
      serverAssetIds.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiPullUserStore();
        if (cancelled) return;
        rev.current = res.rev;
        if (res.data) {
          useSipr.getState().applyUserSnapshot(res.data);
          // Après restauration (nouvel appareil / cache vidé), si l'espace actif
          // est vide mais qu'un autre espace synchronisé contient des dossiers,
          // s'y placer — sinon l'utilisateur voit un espace vide.
          const s = useSipr.getState();
          const activeHasContent = s.visits.some(
            (v) => v.workspaceId === s.activeWorkspaceId && !v.demo,
          );
          if (!activeHasContent) {
            const withContent = s.workspaces.find(
              (w) =>
                w.id !== DEMO_WORKSPACE_ID &&
                s.visits.some((v) => v.workspaceId === w.id && !v.demo),
            );
            if (withContent && withContent.id !== s.activeWorkspaceId) {
              s.switchWorkspace(withContent.id);
            }
          }
        }
      } catch {
        /* hors-ligne : on garde le cache local, push au retour du réseau */
      } finally {
        if (!cancelled) {
          lastKey.current = snapshotKey(buildUserSnapshot(useSipr.getState()));
          setPulledFor(userId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isPending, hydrated]);

  // ---- push débattu à chaque changement ----
  useEffect(() => {
    if (!userId || pulledFor !== userId) return;

    // Rapproche les photos avec le magasin d'images serveur : hash du contenu →
    // `photoAssetId` écrit dans le store, octets téléversés une seule fois.
    // Le blob `user_store` ne transporte QUE les ids (voir buildUserSnapshot).
    const reconcilePhotos = async () => {
      if (!online) return;
      const withPhoto = useSipr
        .getState()
        .anomalies.filter((a) => isDataUrl(a.photo));
      if (withPhoto.length === 0) return;

      const need: { id: string; data: string }[] = [];
      for (const a of withPhoto) {
        let id = a.photoAssetId;
        if (!id) {
          id = await assetIdOf(a.photo as string);
          useSipr.getState().updateAnomaly(a.id, { photoAssetId: id });
        }
        primeAsset(id, a.photo);
        need.push({ id, data: a.photo as string });
      }

      let known = serverAssetIds.current;
      if (!known) {
        try {
          known = new Set((await apiListAssetIds()).ids);
          serverAssetIds.current = known;
        } catch {
          return; // réessai au prochain flush
        }
      }
      for (const { id, data } of need) {
        if (known.has(id)) continue;
        try {
          const r = await apiPutAsset({ data: { assetId: id, mime: "image/jpeg", data } });
          if (r.ok) known.add(id);
        } catch {
          /* réseau : réessai au prochain flush */
        }
      }
    };

    const flush = async () => {
      if (pushing.current || !online) return;
      await reconcilePhotos();
      const snap = buildUserSnapshot(useSipr.getState());
      const key = snapshotKey(snap);
      if (key === lastKey.current) return;
      pushing.current = true;
      try {
        let res = await apiPushUserStore({ data: { data: snap, baseRev: rev.current } });
        if (!res.ok && res.reason === "stale") {
          rev.current = res.rev;
          if (res.data) useSipr.getState().applyUserSnapshot(res.data);
          const merged = buildUserSnapshot(useSipr.getState());
          res = await apiPushUserStore({ data: { data: merged, baseRev: rev.current } });
          if (res.ok) lastKey.current = snapshotKey(merged);
        } else if (res.ok) {
          lastKey.current = key;
        }
        if (res.ok) rev.current = res.rev;
      } catch {
        /* réseau : nouvel essai au prochain changement */
      } finally {
        pushing.current = false;
      }
    };

    // Tentative immédiate : couvre l'état déjà modifié et le retour en ligne.
    void flush();
    const unsub = useSipr.subscribe(() => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 2500);
    });
    return () => {
      unsub();
      window.clearTimeout(timer.current);
    };
  }, [userId, pulledFor, online]);

  return null;
}
