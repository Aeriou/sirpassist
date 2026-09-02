import { useSipr } from "./store";

/**
 * Isolation des données locales par compte — sans jamais détruire de données.
 *
 * L'app stocke encore ses dossiers dans localStorage (zustand persist). Sans
 * cloisonnement, deux comptes ouverts tour à tour dans le même navigateur
 * partagent le même bloc. Ici chaque compte connecté reçoit sa propre clé
 * `siprassist-v5::<userId>` ; l'état déconnecté garde la clé historique
 * `siprassist-v5`.
 *
 * Règle d'or : on ne SUPPRIME et on ne DÉPLACE jamais un bloc. Un compte qui
 * n'a encore rien en local est AMORCÉ par une COPIE du bloc de données le plus
 * fourni trouvé sur cette machine (clé historique ou autre compte). Les blocs
 * d'origine restent intacts — une mise à jour de l'app ne peut donc pas faire
 * perdre son travail à un utilisateur.
 */

const BASE = "siprassist-v5";

function storeKeyFor(userId: string | null): string {
  return userId ? `${BASE}::${userId}` : BASE;
}

function parseState(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const outer = JSON.parse(raw) as { state?: Record<string, unknown> };
    return (outer?.state ?? outer) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Combien de « vrai » travail (non démo) contient ce bloc persistant ? */
function contentScore(raw: string | null): number {
  const s = parseState(raw);
  if (!s) return 0;
  const real = (arr: unknown): number =>
    Array.isArray(arr) ? arr.filter((x) => !(x as { demo?: boolean })?.demo).length : 0;
  return (
    real(s.anomalies) * 3 +
    real(s.visits) * 2 +
    real(s.fds) +
    real(s.rps) +
    (Array.isArray(s.users) ? s.users.length : 0)
  );
}

/** Le bloc SiprAssist le plus fourni présent sur la machine (hors `exceptKey`). */
function richestBlob(exceptKey: string): string | null {
  if (typeof localStorage === "undefined") return null;
  let best: { raw: string; score: number } | null = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === exceptKey) continue;
    if (k !== BASE && !k.startsWith(`${BASE}::`)) continue;
    if (k.endsWith("::claimed")) continue;
    const raw = localStorage.getItem(k);
    const score = contentScore(raw);
    if (raw && score > 0 && (!best || score > best.score)) best = { raw, score };
  }
  return best?.raw ?? null;
}

let currentKey: string | null = null;

/**
 * Pointe le store persistant sur la clé du compte donné et le réhydrate.
 * Amorce la clé (copie non destructive) si le compte n'a encore rien de réel.
 * Résout quand la réhydratation est terminée.
 */
export async function applyStoreScope(userId: string | null): Promise<void> {
  const key = storeKeyFor(userId);
  if (key === currentKey && useSipr.persist.hasHydrated()) return;
  currentKey = key;

  if (typeof localStorage !== "undefined") {
    try {
      const claimedKey = `${key}::claimed`;
      const claimed = localStorage.getItem(claimedKey) === "1";
      const own = localStorage.getItem(key);
      // Amorçage une seule fois : clé jamais utilisée, ou clé sans travail réel
      // et jamais « revendiquée ». On copie, on ne touche pas à la source.
      if (!claimed && (own == null || contentScore(own) === 0)) {
        const seed = richestBlob(key);
        if (seed) localStorage.setItem(key, seed);
      }
      localStorage.setItem(claimedKey, "1");
    } catch {
      /* mode privé / stockage indisponible */
    }
  }

  useSipr.persist.setOptions({ name: key });
  await useSipr.persist.rehydrate();
}
