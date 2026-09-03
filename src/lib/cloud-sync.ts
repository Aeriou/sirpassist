/**
 * Helpers purs de fusion d'instantanés : tombstones (`deleted`) et union par id.
 * Utilisés par `store.ts` et `user-snapshot.ts`. Aucune dépendance Supabase.
 */
import type { DeletedIds } from "./types";

export function emptyDeleted(): DeletedIds {
  return { visits: [], anomalies: [], fds: [], rps: [], paa: [], classeurs: [] };
}

export function rememberIds(list: string[], ids: string[]): string[] {
  if (!ids.length) return list;
  const next = new Set(list);
  for (const id of ids) next.add(id);
  const arr = [...next];
  return arr.length > 4000 ? arr.slice(arr.length - 4000) : arr;
}

export function mergeDeleted(a?: DeletedIds, b?: DeletedIds): DeletedIds {
  const base = emptyDeleted();
  (Object.keys(base) as (keyof DeletedIds)[]).forEach((k) => {
    base[k] = rememberIds(a?.[k] ?? [], b?.[k] ?? []);
  });
  return base;
}

export function mergeById<T extends { id: string }>(
  local: T[],
  remote: T[],
  deleted: string[] = [],
): T[] {
  const skip = new Set(deleted);
  const map = new Map<string, T>();
  for (const row of local) {
    if (!skip.has(row.id)) map.set(row.id, row);
  }
  for (const row of remote) {
    if (skip.has(row.id)) continue;
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}
