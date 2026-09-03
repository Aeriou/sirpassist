/**
 * Helpers purs de fusion d'instantanés (tombstones, union par id) + construction
 * d'un `WorkspaceCloudSnapshot`.
 *
 * NOTE : plus aucune dépendance Supabase ici. L'ancienne synchro Supabase
 * (`sipr_pull`/`sipr_push`, comptes SHA-256) a été retirée — l'auth et le
 * stockage passent par Better Auth + Neon (`user_store`, `user_asset`,
 * `workspace_*`). Ces helpers restent utilisés par `store.ts` et
 * `user-snapshot.ts`.
 */
import type {
  Anomaly,
  DeletedIds,
  FdsNotice,
  PgpPlan,
  RpsSituation,
  SiprUser,
  Visit,
  Workspace,
  WorkspaceCloudSnapshot,
} from "./types";

export function emptyDeleted(): DeletedIds {
  return { visits: [], anomalies: [], fds: [], rps: [], paa: [] };
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

export function buildSnapshot(input: {
  workspace: Workspace;
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps: RpsSituation[];
  pgp: PgpPlan;
  users: SiprUser[];
  deleted?: DeletedIds;
}): WorkspaceCloudSnapshot {
  const id = input.workspace.id;
  const deleted = mergeDeleted(input.deleted, emptyDeleted());
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    workspace: input.workspace,
    visits: input.visits.filter(
      (v) => v.workspaceId === id && !v.demo && !deleted.visits.includes(v.id),
    ),
    anomalies: input.anomalies.filter(
      (a) => a.workspaceId === id && !a.demo && !deleted.anomalies.includes(a.id),
    ),
    fds: input.fds.filter((f) => f.workspaceId === id && !f.demo && !deleted.fds.includes(f.id)),
    rps: input.rps.filter((r) => r.workspaceId === id && !r.demo && !deleted.rps.includes(r.id)),
    pgp: {
      ...input.pgp,
      lines: input.pgp.lines.filter((l) => !l.demo && !deleted.paa.includes(l.id)),
    },
    users: input.users.filter((u) => u.workspaceId === id),
    deleted,
  };
}
