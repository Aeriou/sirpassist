import { useEffect } from "react";

/**
 * Après un déploiement, un onglet resté ouvert référence encore des fichiers JS
 * dont le hash a changé → « Failed to fetch dynamically imported module » quand
 * l'utilisateur navigue. On recharge alors la page une fois pour récupérer la
 * nouvelle version. Garde-fous : au plus 2 rechargements automatiques, remis à
 * zéro dès qu'un chargement aboutit.
 */
const COUNT_KEY = "sipr-chunk-reload-count";
const MAX_RELOADS = 2;

function reloadOnce() {
  let n = 0;
  try {
    n = Number(sessionStorage.getItem(COUNT_KEY) || "0");
  } catch {
    /* stockage indisponible */
  }
  if (n >= MAX_RELOADS) return; // déploiement réellement cassé : ne pas boucler
  try {
    sessionStorage.setItem(COUNT_KEY, String(n + 1));
  } catch {
    /* stockage indisponible */
  }
  window.location.reload();
}

function looksLikeChunkError(message: string): boolean {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|ChunkLoadError/i.test(
    message,
  );
}

export function ChunkReloadGuard() {
  useEffect(() => {
    function onPreloadError(e: Event) {
      e.preventDefault();
      reloadOnce();
    }
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e?.reason as { message?: string } | string | undefined;
      const msg = typeof reason === "string" ? reason : (reason?.message ?? "");
      if (looksLikeChunkError(msg)) reloadOnce();
    }

    window.addEventListener("vite:preloadError", onPreloadError as EventListener);
    window.addEventListener("unhandledrejection", onRejection);

    // Ce composant est monté = l'app a chargé correctement : on efface le
    // compteur après un court délai pour ne pas gêner un futur déploiement.
    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(COUNT_KEY);
      } catch {
        /* stockage indisponible */
      }
    }, 4000);

    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError as EventListener);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(t);
    };
  }, []);

  return null;
}
