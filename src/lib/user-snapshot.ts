/**
 * Instantané des dossiers d'un compte, sérialisé dans `user_store.data`.
 *
 * Contenu : profil, espaces (hors démo), visites / constats / notices FDS / RPS
 * non-démo, plans PGP par espace, rappels acquittés, tickets, corbeille.
 * EXCLUS : `photo` / `coverPhoto` (base64 — restent dans le cache local de
 * l'appareil), `users` et `sessionUserId` (identité serveur), `conflicts` (démo).
 *
 * Fusion : `mergeById` (union, priorité au local) + tombstones `deleted`. But =
 * ne rien perdre au vidage de cache / changement d'appareil ; l'édition
 * concurrente multi-appareils reste "le dernier qui résout gagne".
 */
import { DEMO_WORKSPACE_ID } from "./workspace";
import { mergeById, mergeDeleted } from "./cloud-sync";
import type {
  Anomaly,
  Classeur,
  DeletedIds,
  FdsNotice,
  PgpPlan,
  Profile,
  RpsSituation,
  SupportTicket,
  Visit,
  Workspace,
} from "./types";

export type UserSnapshot = {
  v: 1;
  savedAt: string;
  profile: Profile;
  workspaces: Workspace[];
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps: RpsSituation[];
  classeurs: Classeur[];
  pgpByWorkspace: Record<string, PgpPlan>;
  ackedReminders: string[];
  tickets: SupportTicket[];
  deleted: DeletedIds;
};

type BuildState = {
  profile: Profile;
  workspaces: Workspace[];
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps: RpsSituation[];
  classeurs: Classeur[];
  pgpByWorkspace: Record<string, PgpPlan>;
  ackedReminders: string[];
  tickets: SupportTicket[];
  deleted: DeletedIds;
};

const realOnly = <T extends { demo?: boolean; workspaceId?: string }>(rows: T[]): T[] =>
  rows.filter((r) => !r.demo && r.workspaceId !== DEMO_WORKSPACE_ID);

export function buildUserSnapshot(state: BuildState): UserSnapshot {
  const pgpByWorkspace: Record<string, PgpPlan> = {};
  for (const [k, v] of Object.entries(state.pgpByWorkspace)) {
    if (k !== DEMO_WORKSPACE_ID) pgpByWorkspace[k] = v;
  }
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    profile: state.profile,
    workspaces: state.workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID),
    // Sans les photos : elles gonflent le blob et restent volontairement locales.
    visits: realOnly(state.visits).map(({ coverPhoto: _c, ...v }) => {
      void _c;
      return v as Visit;
    }),
    anomalies: realOnly(state.anomalies).map(({ photo: _p, ...a }) => {
      void _p;
      return a as Anomaly;
    }),
    fds: realOnly(state.fds),
    rps: realOnly(state.rps),
    classeurs: realOnly(state.classeurs),
    pgpByWorkspace,
    ackedReminders: state.ackedReminders,
    tickets: state.tickets,
    deleted: state.deleted,
  };
}

/** Clé stable (hors `savedAt`) pour ne pousser que si le contenu a changé. */
export function snapshotKey(snap: UserSnapshot): string {
  return JSON.stringify({ ...snap, savedAt: "" });
}

export type ApplyState = BuildState & { activeWorkspaceId: string; pgp: PgpPlan };
export type ApplyPatch = Partial<
  Pick<
    ApplyState,
    | "profile"
    | "workspaces"
    | "visits"
    | "anomalies"
    | "fds"
    | "rps"
    | "classeurs"
    | "pgpByWorkspace"
    | "pgp"
    | "ackedReminders"
    | "tickets"
    | "deleted"
  >
>;

/**
 * Fusionne un instantané serveur dans l'état local. Priorité au local pour les
 * enregistrements déjà présents ; les manquants sont ajoutés ; les tombstones
 * `deleted` sont respectés des deux côtés. Une photo locale n'est jamais
 * effacée par un enregistrement serveur qui n'en a pas.
 */
export function applyUserSnapshot(
  state: ApplyState,
  snap: UserSnapshot,
  defaultProfile: Profile,
): ApplyPatch {
  const deleted = mergeDeleted(state.deleted, snap.deleted ?? undefined);

  const visits = mergeById(state.visits, snap.visits ?? [], deleted.visits);
  const anomalies = mergeById(state.anomalies, snap.anomalies ?? [], deleted.anomalies);
  const fds = mergeById(state.fds, snap.fds ?? [], deleted.fds);
  const rps = mergeById(state.rps, snap.rps ?? [], deleted.rps);
  const classeurs = mergeById(state.classeurs, snap.classeurs ?? [], deleted.classeurs);
  const workspaces = mergeById(state.workspaces, snap.workspaces ?? []);
  const tickets = mergeById(state.tickets, snap.tickets ?? []);

  const pgpByWorkspace: Record<string, PgpPlan> = { ...(snap.pgpByWorkspace ?? {}) };
  for (const [k, v] of Object.entries(state.pgpByWorkspace)) pgpByWorkspace[k] = v; // local gagne
  const pgp = pgpByWorkspace[state.activeWorkspaceId] ?? state.pgp;

  const ackedReminders = [...new Set([...state.ackedReminders, ...(snap.ackedReminders ?? [])])];

  // Profil : ne prendre celui du serveur que si le local est encore le défaut.
  const localIsDefault =
    state.profile.name === defaultProfile.name &&
    state.profile.organisation === defaultProfile.organisation;
  const profile = localIsDefault && snap.profile ? snap.profile : state.profile;

  return {
    profile,
    workspaces,
    visits,
    anomalies,
    fds,
    rps,
    classeurs,
    pgpByWorkspace,
    pgp,
    ackedReminders,
    tickets,
    deleted,
  };
}
