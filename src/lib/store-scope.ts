import { useSipr } from "./store";

/**
 * Isolation des données locales par compte.
 *
 * L'app stocke encore ses dossiers dans localStorage (zustand persist). Sans
 * cloisonnement, deux comptes ouverts tour à tour dans le même navigateur
 * partagent le même bloc : le 2e compte voit les données du 1er. Ici chaque
 * compte connecté reçoit sa propre clé `siprassist-v5::<userId>` ; l'état
 * déconnecté garde la clé historique `siprassist-v5`.
 */

const BASE = "siprassist-v5";
const MIGRATION_FLAG = "siprassist-scope-migrated";

let currentKey: string | null = null;

export function storeKeyFor(userId: string | null): string {
  return userId ? `${BASE}::${userId}` : BASE;
}

/**
 * Une seule fois : le premier compte qui se connecte après cette mise à jour
 * récupère les données mono-utilisateur déjà présentes sous la clé historique.
 * Les comptes suivants repartent d'un espace vierge.
 */
function migrateLegacyOnce(targetKey: string) {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const legacy = localStorage.getItem(BASE);
    localStorage.setItem(MIGRATION_FLAG, targetKey);
    if (legacy && !localStorage.getItem(targetKey)) {
      localStorage.setItem(targetKey, legacy);
      localStorage.removeItem(BASE);
    }
  } catch {
    /* mode privé / stockage indisponible */
  }
}

/**
 * Pointe le store persistant sur la clé du compte donné et le réhydrate.
 * Résout quand la réhydratation est terminée. Sans effet si on est déjà sur
 * la bonne clé et déjà hydraté.
 */
export async function applyStoreScope(userId: string | null): Promise<void> {
  const key = storeKeyFor(userId);
  if (key === currentKey && useSipr.persist.hasHydrated()) return;
  currentKey = key;
  if (userId) migrateLegacyOnce(key);
  useSipr.persist.setOptions({ name: key });
  await useSipr.persist.rehydrate();
}
