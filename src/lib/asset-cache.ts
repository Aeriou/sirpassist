/**
 * Résolution + cache des images serveur, côté client. Mémoire du process +
 * localStorage (best-effort, la photo est déjà légère). Utilisé par <Photo>.
 */
import { apiGetAsset } from "./asset-api";

const mem = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const LS_PREFIX = "siprasset:";

/** Renseigne le cache depuis une copie locale déjà connue (évite un aller serveur). */
export function primeAsset(assetId: string | undefined, dataUrl: string | undefined) {
  if (assetId && dataUrl) mem.set(assetId, dataUrl);
}

export async function resolveAsset(assetId: string): Promise<string | null> {
  if (!assetId) return null;

  const cached = mem.get(assetId);
  if (cached) return cached;

  try {
    const ls = localStorage.getItem(LS_PREFIX + assetId);
    if (ls) {
      mem.set(assetId, ls);
      return ls;
    }
  } catch {
    /* mode privé / indisponible */
  }

  let p = inflight.get(assetId);
  if (!p) {
    p = apiGetAsset({ data: { assetId } })
      .then((r) => {
        const d = r.data;
        if (d) {
          mem.set(assetId, d);
          try {
            localStorage.setItem(LS_PREFIX + assetId, d);
          } catch {
            /* quota : on garde au moins en mémoire */
          }
        }
        return d;
      })
      .catch(() => null)
      .finally(() => inflight.delete(assetId));
    inflight.set(assetId, p);
  }
  return p;
}
