import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { DEFAULT_PROFILE, SEED_ANOMALIES, SEED_FDS, SEED_PGP, SEED_RPS, SEED_VISITS, SEED_WORKSPACES } from "./seed";
import type {
  AccountKind,
  Anomaly,
  AnomalyStatus,
  Classeur,
  DeletedIds,
  FdsNotice,
  PaaLine,
  PgpObjective,
  PgpPlan,
  Profile,
  RecordAuthor,
  RpsSituation,
  ShareNote,
  SiprUser,
  SupportTicket,
  Visit,
  Workspace,
} from "./types";
import { emptyDeleted, mergeById, mergeDeleted, rememberIds } from "./cloud-sync";
import type { SharePayloadV1 } from "./share-payload";
import { mergeShareNotes, type SharedImportPlan } from "./share-merge";
import {
  applyUserSnapshot as applyUserSnapshotPure,
  type UserSnapshot,
} from "./user-snapshot";
import { uid } from "./utils";
import { isoDate, isoDay } from "./format";
import { planView, trialEndFrom } from "./plan";
import { emptyPgp, lineFromAnomaly, lineFromRps } from "./pgp";
import {
  mergePicks,
  patchFromPicks,
  seedConflicts,
  type DataConflict,
} from "./conflicts";
import {
  DEMO_WORKSPACE_ID,
  genOrgCode,
  matchVisitByName,
  visitLabel,
  visitWorkspaceId,
} from "./workspace";

type State = {
  profile: Profile;
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps: RpsSituation[];
  pgp: PgpPlan;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  pgpByWorkspace: Record<string, PgpPlan>;
  setProfile: (p: Partial<Profile>) => void;
  addVisit: (v: Omit<Visit, "id" | "status" | "workspaceId" | "name"> & { status?: Visit["status"]; workspaceId?: string; name?: string }) => string;
  updateVisit: (id: string, patch: Partial<Visit>) => void;
  closeVisit: (id: string) => void;
  addAnomaly: (a: Omit<Anomaly, "id" | "createdAt" | "status" | "workspaceId"> & { status?: AnomalyStatus; workspaceId?: string }) => string;
  updateAnomaly: (id: string, patch: Partial<Anomaly>) => void;
  setAnomalyStatus: (id: string, status: AnomalyStatus) => void;
  addFds: (n: Omit<FdsNotice, "id" | "createdAt" | "workspaceId"> & { workspaceId?: string }) => string;
  updateFds: (id: string, patch: Partial<FdsNotice>) => void;
  addRps: (n: Omit<RpsSituation, "id" | "createdAt" | "workspaceId"> & { workspaceId?: string }) => string;
  updateRps: (id: string, patch: Partial<RpsSituation>) => void;
  removeRps: (id: string) => void;
  updatePgp: (patch: Partial<PgpPlan>) => void;
  updatePaaLine: (id: string, patch: Partial<PaaLine>) => void;
  addPaaLine: (line: Omit<PaaLine, "id">) => string;
  removePaaLine: (id: string) => void;
  updateObjective: (theme: PgpObjective["theme"], patch: Partial<PgpObjective>) => void;
  importValidated: () => string[];
  ackedReminders: string[];
  ackReminder: (id: string) => void;
  conflicts: DataConflict[];
  resolveConflict: (
    id: string,
    mode: "terrain" | "bureau" | "fusion",
    picks?: Record<string, "local" | "remote">,
    by?: string,
  ) => void;
  reopenConflicts: () => void;
  resetDemo: () => void;
  users: SiprUser[];
  sessionUserId: string | null;
  addUser: (u: SiprUser, opts?: { session?: boolean }) => void;
  upsertUser: (u: SiprUser) => void;
  signInUser: (id: string) => void;
  signOutUser: () => void;
  removeVisit: (id: string) => void;
  removeAnomaly: (id: string) => void;
  removeFds: (id: string) => void;
  clearExamples: () => number;
  createWorkspace: (input: { kind: AccountKind; name: string }) => Workspace;
  joinWorkspace: (code: string) => Workspace | null;
  switchWorkspace: (id: string) => void;
  removeWorkspace: (id: string) => boolean;
  activatePro: (billing?: { stripeCustomerId?: string; stripeSubscriptionId?: string }) => void;
  activatePlan: (plan: "basic" | "pro", billing?: { stripeCustomerId?: string; stripeSubscriptionId?: string }) => void;
  patchSessionUser: (patch: Partial<SiprUser>) => void;
  applyUserSnapshot: (snap: UserSnapshot) => void;
  importSharedPayload: (
    payload: SharePayloadV1,
    opts: { threadId: string; isReturn?: boolean; plan?: SharedImportPlan },
  ) => { visitId: string };
  addShareNote: (scope: "visit" | "anomaly", id: string, text: string) => void;
  ensureVisitByName: (name: string) => string;
  tickets: SupportTicket[];
  deleted: DeletedIds;
  addTicket: (t: SupportTicket) => void;
  patchTicket: (id: string, patch: Partial<SupportTicket>) => void;
  classeurs: Classeur[];
  addClasseur: (input: { name: string; note?: string }) => string;
  updateClasseur: (id: string, patch: Partial<Pick<Classeur, "name" | "note">>) => void;
  removeClasseur: (id: string) => void;
  setClasseurItem: (
    id: string,
    kind: "visit" | "anomaly",
    itemId: string,
    on: boolean,
  ) => void;
  setClasseurGroups: (id: string, groupIds: string[]) => void;
  importGroupClasseur: (input: {
    name: string;
    note?: string;
    visits: Visit[];
    anomalies: Anomaly[];
    from?: string;
  }) => { classeurId: string };
};

const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const DEMO_IDS = new Set([
  "visit-vdb",
  "visit-lambert",
  "ano-cable",
  "ano-issue",
  "ano-manutention",
  "ano-solvant",
  "ano-epi",
  "fds-solvex",
  "fds-peinture",
  "paa-cable",
  "paa-issue",
  "paa-manutention",
  "paa-solvant",
  "paa-epi",
  "paa-ba4",
  "paa-evac",
  "paa-rps",
  "rps-charge",
]);

export function isExample(id: string, demo?: boolean) {
  return demo === true || DEMO_IDS.has(id);
}

/** Étiquette « — partagé par X » / « — retour de X » / « — repris de X » en
 *  fin de nom, à retirer avant d'en réappliquer une (pas d'empilement). */
const SHARE_TAG_RE = /\s+—\s+(?:partagé par|retour de|repris de|repris du groupe).*$/u;

function demoAuthor(): RecordAuthor {
  return {
    name: DEFAULT_PROFILE.name,
    title: DEFAULT_PROFILE.title,
    level: DEFAULT_PROFILE.level,
  };
}

function demo() {
  return {
    profile: { ...DEFAULT_PROFILE },
    visits: SEED_VISITS.map((v) => ({ ...v, demo: true, workspaceId: v.workspaceId || DEMO_WORKSPACE_ID })),
    anomalies: SEED_ANOMALIES.map((a) => ({
      ...a,
      demo: true,
      author: a.author ?? demoAuthor(),
      workspaceId: a.workspaceId || DEMO_WORKSPACE_ID,
    })),
    fds: SEED_FDS.map((f) => ({ ...f, demo: true, workspaceId: f.workspaceId || DEMO_WORKSPACE_ID })),
    rps: SEED_RPS.map((r) => ({ ...r, demo: true, workspaceId: r.workspaceId || DEMO_WORKSPACE_ID })),
    pgp: {
      ...SEED_PGP,
      objectives: SEED_PGP.objectives.map((o) => ({ ...o })),
      lines: SEED_PGP.lines.map((l) => ({ ...l, demo: true })),
    },
    workspaces: SEED_WORKSPACES.map((w) => ({ ...w })),
    activeWorkspaceId: DEMO_WORKSPACE_ID,
    pgpByWorkspace: { [DEMO_WORKSPACE_ID]: {
      ...SEED_PGP,
      objectives: SEED_PGP.objectives.map((o) => ({ ...o })),
      lines: SEED_PGP.lines.map((l) => ({ ...l, demo: true })),
    } },
    ackedReminders: [] as string[],
    conflicts: seedConflicts(),
    users: [] as SiprUser[],
    sessionUserId: null as string | null,
    tickets: [] as SupportTicket[],
    deleted: emptyDeleted(),
    classeurs: [] as Classeur[],
  };
}

function persistPgp(get: () => State, set: (p: Partial<State>) => void, next: PgpPlan) {
  const id = get().activeWorkspaceId;
  set({
    pgp: next,
    pgpByWorkspace: { ...get().pgpByWorkspace, [id]: next },
  });
}

export const useSipr = create<State>()(
  persist(
    (set, get) => ({
      ...demo(),
      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      addVisit: (v) => {
        const id = uid("visit");
        const workspaceId = v.workspaceId || get().activeWorkspaceId;
        const name = (v.name || v.company).trim();
        set({
          visits: [
            {
              ...v,
              id,
              name,
              status: v.status ?? "en_cours",
              workspaceId,
            },
            ...get().visits,
          ],
        });
        return id;
      },
      updateVisit: (id, patch) =>
        set({
          visits: get().visits.map((v) => (v.id === id ? { ...v, ...patch } : v)),
        }),
      closeVisit: (id) =>
        set({
          visits: get().visits.map((v) =>
            v.id === id ? { ...v, status: "terminee" } : v,
          ),
        }),
      addAnomaly: (a) => {
        const id = uid("ano");
        const workspaceId = a.workspaceId || get().activeWorkspaceId;
        set({
          anomalies: [
            {
              ...a,
              id,
              createdAt: isoDate(),
              status: a.status ?? "ouverte",
              workspaceId,
            },
            ...get().anomalies,
          ],
        });
        return id;
      },
      updateAnomaly: (id, patch) =>
        set({
          anomalies: get().anomalies.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }),
      setAnomalyStatus: (id, status) =>
        set({
          anomalies: get().anomalies.map((a) => (a.id === id ? { ...a, status } : a)),
        }),
      addFds: (n) => {
        const id = uid("fds");
        set({
          fds: [
            {
              ...n,
              id,
              createdAt: isoDate(),
              workspaceId: n.workspaceId || get().activeWorkspaceId,
            },
            ...get().fds,
          ],
        });
        return id;
      },
      updateFds: (id, patch) =>
        set({
          fds: get().fds.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        }),
      addRps: (n) => {
        const id = uid("rps");
        set({
          rps: [
            {
              ...n,
              id,
              createdAt: isoDate(),
              workspaceId: n.workspaceId || get().activeWorkspaceId,
            },
            ...get().rps,
          ],
        });
        return id;
      },
      updateRps: (id, patch) =>
        set({
          rps: get().rps.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }),
      removeRps: (id) => {
        const pgp = get().pgp;
        const gonePaa = pgp.lines.filter((l) => l.rpsId === id).map((l) => l.id);
        persistPgp(get, set, {
          ...pgp,
          lines: pgp.lines.filter((l) => l.rpsId !== id),
        });
        const deleted = get().deleted;
        set({
          rps: get().rps.filter((r) => r.id !== id),
          deleted: {
            ...deleted,
            rps: isExample(id) ? deleted.rps : rememberIds(deleted.rps, [id]),
            paa: rememberIds(deleted.paa, gonePaa.filter((pid) => !isExample(pid))),
          },
        });
      },
      updatePgp: (patch) => persistPgp(get, set, { ...get().pgp, ...patch }),
      updatePaaLine: (id, patch) =>
        persistPgp(get, set, {
          ...get().pgp,
          lines: get().pgp.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }),
      addPaaLine: (line) => {
        const id = uid("paa");
        persistPgp(get, set, { ...get().pgp, lines: [{ ...line, id }, ...get().pgp.lines] });
        return id;
      },
      removePaaLine: (id) => {
        const deleted = get().deleted;
        persistPgp(get, set, {
          ...get().pgp,
          lines: get().pgp.lines.filter((l) => l.id !== id),
        });
        set({ deleted: { ...deleted, paa: rememberIds(deleted.paa, [id]) } });
      },
      updateObjective: (theme, patch) =>
        persistPgp(get, set, {
          ...get().pgp,
          objectives: get().pgp.objectives.map((o) =>
            o.theme === theme ? { ...o, ...patch } : o,
          ),
        }),
      importValidated: () => {
        const { anomalies, rps, pgp, activeWorkspaceId } = get();
        const linkedA = new Set(pgp.lines.map((l) => l.anomalyId).filter(Boolean));
        const linkedR = new Set(pgp.lines.map((l) => l.rpsId).filter(Boolean));
        const incomingA = anomalies
          .filter(
            (a) =>
              visitWorkspaceId(a) === activeWorkspaceId &&
              a.status !== "brouillon" &&
              !linkedA.has(a.id),
          )
          .map((a) => lineFromAnomaly(a, pgp.paaYear));
        const incomingR = rps
          .filter(
            (s) =>
              visitWorkspaceId(s) === activeWorkspaceId &&
              s.status !== "cloturee" &&
              !linkedR.has(s.id),
          )
          .map((s) => lineFromRps(s, pgp.paaYear));
        const incoming = [...incomingR, ...incomingA];
        if (incoming.length) {
          persistPgp(get, set, {
            ...pgp,
            lines: [...incoming, ...pgp.lines],
            objectives: incomingR.length
              ? pgp.objectives.map((o) =>
                  o.theme === "psychosociaux" ? { ...o, enabled: true } : o,
                )
              : pgp.objectives,
          });
        }
        return incoming.map((l) => l.id);
      },
      ackedReminders: [],
      ackReminder: (id) =>
        set({
          ackedReminders: get().ackedReminders.includes(id)
            ? get().ackedReminders
            : [...get().ackedReminders, id],
        }),
      resolveConflict: (id, mode, picks, by = "Prudence Ducasque") => {
        const c = get().conflicts.find((x) => x.id === id);
        if (!c || c.status === "resolu") return;
        const chosen = mergePicks(c, mode, picks);
        const patch = patchFromPicks(c, chosen);
        if (c.entity === "anomaly") {
          set({
            anomalies: get().anomalies.map((a) =>
              a.id === c.entityId ? { ...a, ...(patch as Partial<Anomaly>) } : a,
            ),
          });
        } else {
          persistPgp(get, set, {
            ...get().pgp,
            lines: get().pgp.lines.map((l) =>
              l.id === c.entityId ? { ...l, ...(patch as Partial<PaaLine>) } : l,
            ),
          });
        }
        set({
          conflicts: get().conflicts.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "resolu" as const,
                  resolution: mode,
                  picks: chosen,
                  resolvedAt: isoDate(),
                  resolvedBy: by,
                }
              : x,
          ),
        });
      },
      reopenConflicts: () => set({ conflicts: seedConflicts() }),
      resetDemo: () => {
        const {
          users,
          sessionUserId,
          profile,
          workspaces,
          pgpByWorkspace,
          visits,
          anomalies,
          fds,
          rps,
          activeWorkspaceId,
        } = get();
        const d = demo();
        const keptWs = workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID);
        const keptPgp: Record<string, PgpPlan> = { ...pgpByWorkspace, [DEMO_WORKSPACE_ID]: d.pgp };
        const nextActive =
          sessionUserId && keptWs.some((w) => w.id === activeWorkspaceId)
            ? activeWorkspaceId
            : DEMO_WORKSPACE_ID;
        set({
          ...d,
          users,
          sessionUserId,
          workspaces: [...d.workspaces, ...keptWs],
          pgpByWorkspace: keptPgp,
          visits: [...d.visits, ...visits.filter((v) => visitWorkspaceId(v) !== DEMO_WORKSPACE_ID)],
          anomalies: [
            ...d.anomalies,
            ...anomalies.filter((a) => visitWorkspaceId(a) !== DEMO_WORKSPACE_ID),
          ],
          fds: [...d.fds, ...fds.filter((f) => visitWorkspaceId(f) !== DEMO_WORKSPACE_ID)],
          rps: [...d.rps, ...rps.filter((r) => visitWorkspaceId(r) !== DEMO_WORKSPACE_ID)],
          profile: sessionUserId ? profile : d.profile,
          activeWorkspaceId: nextActive,
          pgp: keptPgp[nextActive] ?? d.pgp,
          tickets: get().tickets,
          deleted: get().deleted,
          classeurs: get().classeurs.filter((c) => !c.demo),
        });
      },
      addUser: (u, opts) => {
        const createdAt = u.createdAt || isoDate();
        // Le forfait est décidé par le serveur (allowlist propriétaire +
        // sipr_billing) et poussé par SessionBridge — ici on met juste un défaut.
        const user: SiprUser = {
          ...u,
          createdAt,
          plan: u.plan ?? "trial",
          trialEndsAt: u.trialEndsAt ?? trialEndFrom(createdAt.slice(0, 10)),
          homeWorkspaceId: u.homeWorkspaceId ?? u.workspaceId,
        };
        const users = get().users.some((x) => x.id === user.id || x.email === user.email)
          ? get().users.map((x) =>
              x.id === user.id || x.email === user.email
                ? {
                    ...x,
                    ...user,
                    totpSecret: user.totpSecret ?? x.totpSecret,
                    totpEnabled: user.totpEnabled ?? x.totpEnabled,
                    totpBackupHashes: user.totpBackupHashes ?? x.totpBackupHashes,
                  }
                : x,
            )
          : [...get().users, user];
        if (opts?.session === false) {
          set({ users });
          return;
        }
        set({
          users,
          sessionUserId: user.id,
          profile: {
            name: user.name,
            title: user.title,
            level: user.level,
            organisation: user.organisation,
            kind: user.kind,
            workspaceId: user.workspaceId,
          },
        });
        if (user.workspaceId) get().switchWorkspace(user.workspaceId);
      },
      upsertUser: (u) => get().addUser(u, { session: false }),
      signInUser: (id) => {
        const next = get().users.find((x) => x.id === id);
        if (!next) return;
        set({
          sessionUserId: next.id,
          profile: {
            name: next.name,
            title: next.title,
            level: next.level,
            organisation: next.organisation,
            kind: next.kind,
            workspaceId: next.workspaceId,
          },
        });
        if (next.workspaceId) get().switchWorkspace(next.workspaceId);
      },
      signOutUser: () => set({ sessionUserId: null }),
      patchSessionUser: (patch) => {
        const id = get().sessionUserId;
        if (!id) return;
        set({
          users: get().users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        });
      },
      removeVisit: (id) => {
        const visit = get().visits.find((v) => v.id === id);
        const goneAnomalies = get().anomalies.filter((a) => a.visitId === id);
        const goneAnomalyIds = goneAnomalies.map((a) => a.id);
        const pgp = get().pgp;
        const gonePaa = pgp.lines.filter((l) => goneAnomalyIds.includes(l.anomalyId ?? "")).map((l) => l.id);
        persistPgp(get, set, {
          ...pgp,
          lines: pgp.lines.filter((l) => !goneAnomalyIds.includes(l.anomalyId ?? "")),
        });
        const deleted = get().deleted;
        const skipVisit = isExample(id, visit?.demo);
        set({
          visits: get().visits.filter((v) => v.id !== id),
          anomalies: get().anomalies.filter((a) => a.visitId !== id),
          fds: get().fds.map((f) => (f.visitId === id ? { ...f, visitId: undefined } : f)),
          rps: get().rps.map((r) => (r.visitId === id ? { ...r, visitId: undefined } : r)),
          deleted: {
            ...deleted,
            visits: skipVisit ? deleted.visits : rememberIds(deleted.visits, [id]),
            anomalies: rememberIds(
              deleted.anomalies,
              goneAnomalies.filter((a) => !isExample(a.id, a.demo)).map((a) => a.id),
            ),
            paa: rememberIds(deleted.paa, gonePaa.filter((pid) => !isExample(pid))),
          },
        });
      },
      removeAnomaly: (id) => {
        const row = get().anomalies.find((a) => a.id === id);
        const pgp = get().pgp;
        const gonePaa = pgp.lines.filter((l) => l.anomalyId === id).map((l) => l.id);
        persistPgp(get, set, {
          ...pgp,
          lines: pgp.lines.filter((l) => l.anomalyId !== id),
        });
        const deleted = get().deleted;
        set({
          anomalies: get().anomalies.filter((a) => a.id !== id),
          deleted: {
            ...deleted,
            anomalies: isExample(id, row?.demo) ? deleted.anomalies : rememberIds(deleted.anomalies, [id]),
            paa: rememberIds(deleted.paa, gonePaa.filter((pid) => !isExample(pid))),
          },
        });
      },
      removeFds: (id) => {
        const row = get().fds.find((f) => f.id === id);
        const deleted = get().deleted;
        set({
          fds: get().fds.filter((f) => f.id !== id),
          deleted: {
            ...deleted,
            fds: isExample(id, row?.demo) ? deleted.fds : rememberIds(deleted.fds, [id]),
          },
        });
      },
      clearExamples: () => {
        const visits = get().visits.filter((v) => !isExample(v.id, v.demo));
        const anomalies = get().anomalies.filter((a) => !isExample(a.id, a.demo));
        const fds = get().fds.filter((f) => !isExample(f.id, f.demo));
        const rps = get().rps.filter((r) => !isExample(r.id, r.demo));
        const lines = get().pgp.lines.filter((l) => !isExample(l.id, l.demo));
        const n =
          get().visits.length -
          visits.length +
          (get().anomalies.length - anomalies.length) +
          (get().fds.length - fds.length) +
          (get().rps.length - rps.length) +
          (get().pgp.lines.length - lines.length);
        persistPgp(get, set, { ...get().pgp, lines });
        set({
          visits,
          anomalies,
          fds,
          rps,
          conflicts: get().activeWorkspaceId === DEMO_WORKSPACE_ID ? [] : get().conflicts,
        });
        return n;
      },
      createWorkspace: (input) => {
        const session = get().users.find((u) => u.id === get().sessionUserId);
        const view = planView(session, 0);
        const owned = get().workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID);
        if (session && !view.canMulti && owned.length >= 1) {
          get().switchWorkspace(owned[0]!.id);
          return owned[0]!;
        }
        const id = uid("ws");
        const ws: Workspace = {
          id,
          kind: input.kind,
          name: input.name.trim(),
          code: genOrgCode(),
          createdAt: isoDate(),
        };
        const plan = emptyPgp(ws.name, get().profile.name);
        set({
          workspaces: [...get().workspaces, ws],
          pgpByWorkspace: { ...get().pgpByWorkspace, [id]: plan },
        });
        get().switchWorkspace(id);
        return ws;
      },
      joinWorkspace: (code) => {
        const needle = code.trim().toUpperCase();
        const ws = get().workspaces.find((w) => w.code.toUpperCase() === needle);
        if (!ws) return null;
        get().switchWorkspace(ws.id);
        return ws;
      },
      switchWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id);
        if (!ws) return;
        const plan = get().pgpByWorkspace[id] ?? emptyPgp(ws.name, get().profile.name);
        set({
          activeWorkspaceId: id,
          pgp: plan,
          pgpByWorkspace: { ...get().pgpByWorkspace, [id]: plan },
          profile: {
            ...get().profile,
            workspaceId: id,
            kind: ws.kind,
            organisation: ws.kind === "entreprise" ? ws.name : get().profile.organisation,
          },
        });
        const sessionId = get().sessionUserId;
        if (sessionId) {
          set({
            users: get().users.map((u) =>
              u.id === sessionId ? { ...u, kind: ws.kind } : u,
            ),
          });
        }
      },
      removeWorkspace: (id) => {
        const { sessionUserId, users, workspaces, visits, anomalies, fds, rps, activeWorkspaceId } =
          get();
        const nextWs = workspaces.filter((w) => w.id !== id);
        const session = users.find((u) => u.id === sessionUserId);
        set({
          workspaces: nextWs,
          visits: visits.filter((v) => visitWorkspaceId(v) !== id),
          anomalies: anomalies.filter((a) => visitWorkspaceId(a) !== id),
          fds: fds.filter((f) => visitWorkspaceId(f) !== id),
          rps: rps.filter((r) => visitWorkspaceId(r) !== id),
          classeurs: get()
            .classeurs.filter((c) => c.workspaceId !== id)
            .map((c) =>
              c.sharedGroupIds?.includes(id)
                ? {
                    ...c,
                    sharedGroupIds:
                      c.sharedGroupIds.filter((g) => g !== id).length > 0
                        ? c.sharedGroupIds.filter((g) => g !== id)
                        : undefined,
                  }
                : c,
            ),
        });
        if (!nextWs.length) {
          // Dernier espace supprimé : on crée un espace VIDE plutôt que de
          // ressusciter la démo (l'espace supprimé + ses données de démo).
          const wsId = uid("ws");
          const fresh: Workspace = {
            id: wsId,
            kind: "independant",
            name: "Mon espace",
            code: genOrgCode(),
            createdAt: isoDate(),
          };
          const plan = emptyPgp(fresh.name, get().profile.name);
          set({
            workspaces: [fresh],
            pgp: plan,
            pgpByWorkspace: { ...get().pgpByWorkspace, [wsId]: plan },
            activeWorkspaceId: wsId,
          });
          get().switchWorkspace(wsId);
          return true;
        }
        const fallback =
          (session?.homeWorkspaceId && nextWs.some((w) => w.id === session.homeWorkspaceId)
            ? session.homeWorkspaceId
            : nextWs[0]?.id) ?? DEMO_WORKSPACE_ID;
        const nextActive = activeWorkspaceId === id ? fallback : get().activeWorkspaceId;
        if (session && (session.homeWorkspaceId === id || session.workspaceId === id)) {
          set({
            users: get().users.map((u) =>
              u.id === session.id ? { ...u, homeWorkspaceId: fallback, workspaceId: fallback } : u,
            ),
          });
        }
        if (nextActive !== get().activeWorkspaceId) get().switchWorkspace(nextActive);
        return true;
      },
      activatePlan: (plan, billing) => {
        const id = get().sessionUserId;
        if (!id) return;
        set({
          users: get().users.map((u) =>
            u.id === id
              ? {
                  ...u,
                  plan,
                  proSince: isoDate(),
                  stripeCustomerId: billing?.stripeCustomerId ?? u.stripeCustomerId,
                  stripeSubscriptionId: billing?.stripeSubscriptionId ?? u.stripeSubscriptionId,
                }
              : u,
          ),
        });
      },
      activatePro: (billing) => get().activatePlan("pro", billing),
      applyUserSnapshot: (snap) => {
        const s = get();
        set(
          applyUserSnapshotPure(
            {
              profile: s.profile,
              workspaces: s.workspaces,
              visits: s.visits,
              anomalies: s.anomalies,
              fds: s.fds,
              rps: s.rps,
              classeurs: s.classeurs,
              pgpByWorkspace: s.pgpByWorkspace,
              ackedReminders: s.ackedReminders,
              tickets: s.tickets,
              deleted: s.deleted,
              activeWorkspaceId: s.activeWorkspaceId,
              pgp: s.pgp,
            },
            snap,
            DEFAULT_PROFILE,
          ),
        );
      },
      importSharedPayload: (payload, opts) => {
        const st = get();
        const now = isoDate();
        const sv = payload.visit;
        const from = payload.byName || payload.byEmail || "Partage";
        const plan = opts.plan;

        // Champs "de fond" d'un constat, repris quand on prend la version reçue.
        const takeAnomalyFields = (sa: (typeof payload.anomalies)[number]) => ({
          title: sa.title,
          location: sa.location,
          description: sa.description,
          theme: sa.theme,
          urgency: sa.urgency,
          kinney: sa.kinney,
          kinneyWhy: sa.kinneyWhy,
          voice: sa.voice,
          correctiveAction: sa.correctiveAction,
          legalRef: sa.legalRef,
          dueDate: sa.dueDate,
        });

        // ---------- Fusion dans un dossier déjà présent (aller-retour) ----------
        const target =
          plan?.isMerge && plan.targetVisitId
            ? st.visits.find((v) => v.id === plan.targetVisitId)
            : undefined;

        if (plan?.isMerge && target) {
          const targetId = target.id;
          const wsId = target.workspaceId;
          const incomingByOrigin = new Map(
            payload.anomalies.map((a) => [a.shareOriginId, a]),
          );

          const visits = st.visits.map((v) => {
            if (v.id !== targetId) return v;
            const base =
              plan.updateVisitInfo && plan.visitChanged
                ? {
                    ...v,
                    company: sv.company,
                    interlocutor: sv.interlocutor,
                    date: sv.date,
                    site: sv.site,
                    notes: sv.notes,
                    geo: sv.geo ?? v.geo,
                    place: sv.place ?? v.place,
                  }
                : v;
            return {
              ...base,
              // Un retour / une mise à jour ré-ouvre le dossier : il doit
              // ré-apparaître sur l'Accueil pour être traité.
              status: "en_cours" as const,
              sharedFrom: v.sharedFrom ?? from,
              sharedThreadId: v.sharedThreadId ?? opts.threadId,
              shareNotes: mergeShareNotes(v.shareNotes, sv.shareNotes),
            };
          });

          let anomalies = [...st.anomalies];
          for (const row of plan.incoming) {
            const sa = incomingByOrigin.get(row.shareOriginId);
            if (!sa) continue;
            if (row.choice === "add") {
              anomalies = [
                {
                  ...sa,
                  id: uid("ano"),
                  visitId: targetId,
                  workspaceId: wsId,
                  createdAt: sa.createdAt || now,
                  status: sa.status ?? "ouverte",
                  sharedFrom: from,
                  sharedThreadId: opts.threadId,
                  shareNotes: mergeShareNotes(undefined, sa.shareNotes),
                },
                ...anomalies,
              ];
            } else if (row.localId) {
              anomalies = anomalies.map((a) => {
                if (a.id !== row.localId) return a;
                const shareNotes = mergeShareNotes(a.shareNotes, sa.shareNotes);
                return row.choice === "take"
                  ? {
                      ...a,
                      ...takeAnomalyFields(sa),
                      photo: sa.photo ?? a.photo,
                      transcription: sa.transcription ?? a.transcription,
                      geo: sa.geo ?? a.geo,
                      shareNotes,
                    }
                  : { ...a, shareNotes }; // keep / skip : version locale gardée
              });
            }
          }
          const toDelete = new Set(
            plan.removals.filter((r) => r.choice === "delete").map((r) => r.localId),
          );
          if (toDelete.size) anomalies = anomalies.filter((a) => !toDelete.has(a.id));

          set({ visits, anomalies });
          if (get().activeWorkspaceId !== wsId) get().switchWorkspace(wsId);
          return { visitId: targetId };
        }

        // ---------- Import neuf ----------
        let wsId = st.activeWorkspaceId;
        if (wsId === DEMO_WORKSPACE_ID) {
          const owned = st.workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID);
          wsId =
            owned[0]?.id ??
            get().createWorkspace({ kind: "independant", name: "Mon espace" }).id;
        }
        const visitId = uid("visit");
        // Étiquette pour distinguer une copie partagée d'un dossier à soi (et un
        // retour d'un premier envoi). On retire d'abord une étiquette existante
        // pour ne pas les empiler au fil des allers-retours.
        const suffix = opts.isReturn ? ` — retour de ${from}` : ` — partagé par ${from}`;
        const label = (raw: string, fallback: string) =>
          `${(raw || fallback).replace(SHARE_TAG_RE, "").trim()}${suffix}`;
        const visit: Visit = {
          id: visitId,
          name: label(sv.name, sv.company || "Dossier partagé"),
          company: sv.company,
          site: sv.site,
          interlocutor: sv.interlocutor,
          date: sv.date,
          // On reçoit une copie à relire / retravailler : elle doit apparaître
          // sur l'Accueil (qui ne liste que « en cours »), même si l'émetteur
          // avait clôturé la sienne.
          status: "en_cours",
          coverPhoto: sv.coverPhoto,
          notes: sv.notes,
          geo: sv.geo,
          place: sv.place,
          workspaceId: wsId,
          shareOriginId: sv.shareOriginId,
          sharedFrom: from,
          sharedThreadId: opts.threadId,
          shareNotes: mergeShareNotes(undefined, sv.shareNotes),
        };
        const skip = new Set(
          (plan?.incoming ?? [])
            .filter((r) => r.choice === "skip")
            .map((r) => r.shareOriginId),
        );
        const anomalies: Anomaly[] = payload.anomalies
          .filter((sa) => !skip.has(sa.shareOriginId))
          .map((sa) => ({
            ...sa,
            id: uid("ano"),
            visitId,
            workspaceId: wsId,
            // Constat partagé seul : on étiquette aussi son titre (c'est lui qui
            // apparaît dans les listes). Dans un dossier complet, le titre reste
            // net — l'étiquette est déjà portée par le nom du dossier.
            title:
              payload.kind === "anomaly" ? label(sa.title, "Constat") : sa.title,
            createdAt: sa.createdAt || now,
            status: sa.status ?? "ouverte",
            sharedFrom: from,
            sharedThreadId: opts.threadId,
            shareNotes: mergeShareNotes(undefined, sa.shareNotes),
          }));
        set({
          visits: [visit, ...st.visits],
          anomalies: [...anomalies, ...st.anomalies],
        });
        if (get().activeWorkspaceId !== wsId) get().switchWorkspace(wsId);
        return { visitId };
      },
      addShareNote: (scope, id, text) => {
        const t = text.trim();
        if (!t) return;
        const note: ShareNote = {
          id: uid("note"),
          author: currentAuthor(get()).name || "Conseiller",
          at: isoDate(),
          text: t,
        };
        if (scope === "visit") {
          set({
            visits: get().visits.map((v) =>
              v.id === id ? { ...v, shareNotes: [...(v.shareNotes ?? []), note] } : v,
            ),
          });
        } else {
          set({
            anomalies: get().anomalies.map((a) =>
              a.id === id ? { ...a, shareNotes: [...(a.shareNotes ?? []), note] } : a,
            ),
          });
        }
      },
      ensureVisitByName: (raw) => {
        const name = raw.trim();
        if (!name) return "";
        const scoped = get().visits.filter(
          (v) => visitWorkspaceId(v) === get().activeWorkspaceId,
        );
        const found = matchVisitByName(scoped, name);
        if (found) return found.id;
        const ws = get().workspaces.find((w) => w.id === get().activeWorkspaceId);
        const company = ws?.kind === "entreprise" ? ws.name : name;
        return get().addVisit({
          name,
          company,
          site: "",
          interlocutor: "",
          date: isoDay(),
        });
      },
      addTicket: (t) => set({ tickets: [t, ...get().tickets] }),
      patchTicket: (id, patch) =>
        set({
          tickets: get().tickets.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        }),
      addClasseur: (input) => {
        const id = uid("classeur");
        const now = isoDate();
        const c: Classeur = {
          id,
          workspaceId: get().activeWorkspaceId,
          name: input.name.trim() || "Classeur",
          note: input.note?.trim() || undefined,
          visitIds: [],
          anomalyIds: [],
          createdAt: now,
          updatedAt: now,
        };
        set({ classeurs: [c, ...get().classeurs] });
        return id;
      },
      updateClasseur: (id, patch) =>
        set({
          classeurs: get().classeurs.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...("name" in patch ? { name: patch.name?.trim() || c.name } : {}),
                  ...("note" in patch ? { note: patch.note?.trim() || undefined } : {}),
                  updatedAt: isoDate(),
                }
              : c,
          ),
        }),
      removeClasseur: (id) =>
        set({
          classeurs: get().classeurs.filter((c) => c.id !== id),
          deleted: {
            ...get().deleted,
            classeurs: rememberIds(get().deleted.classeurs, [id]),
          },
        }),
      setClasseurItem: (id, kind, itemId, on) =>
        set({
          classeurs: get().classeurs.map((c) => {
            if (c.id !== id) return c;
            const key = kind === "visit" ? "visitIds" : "anomalyIds";
            const cur = c[key];
            const next = on
              ? cur.includes(itemId)
                ? cur
                : [...cur, itemId]
              : cur.filter((x) => x !== itemId);
            if (next === cur) return c;
            return { ...c, [key]: next, updatedAt: isoDate() };
          }),
        }),
      setClasseurGroups: (id, groupIds) =>
        set({
          classeurs: get().classeurs.map((c) =>
            c.id === id
              ? { ...c, sharedGroupIds: groupIds.length ? groupIds : undefined, updatedAt: isoDate() }
              : c,
          ),
        }),
      importGroupClasseur: (input) => {
        const st = get();
        let wsId = st.activeWorkspaceId;
        if (wsId === DEMO_WORKSPACE_ID) {
          const owned = st.workspaces.filter((w) => w.id !== DEMO_WORKSPACE_ID);
          wsId =
            owned[0]?.id ??
            get().createWorkspace({ kind: "independant", name: "Mon espace" }).id;
        }
        const now = isoDate();
        const tag = input.from ? ` — repris de ${input.from}` : " — repris du groupe";

        const idMap = new Map<string, string>();
        const newVisits: Visit[] = input.visits.map((v) => {
          const nid = uid("visit");
          idMap.set(v.id, nid);
          return {
            ...v,
            id: nid,
            workspaceId: wsId,
            status: "en_cours",
            demo: undefined,
            signatures: undefined,
            shareOriginId: undefined,
            sharedThreadId: undefined,
            sharedFrom: input.from,
          };
        });

        // Constats rattachés à une visite non reprise (piochés hors visite) :
        // on les regroupe dans une visite « Constats repris ».
        const orphans = input.anomalies.filter((a) => !idMap.has(a.visitId));
        let orphanVisitId: string | null = null;
        if (orphans.length) {
          orphanVisitId = uid("visit");
          newVisits.push({
            id: orphanVisitId,
            name: `Constats repris${tag}`,
            company: "",
            site: "",
            interlocutor: "",
            date: now.slice(0, 10),
            status: "en_cours",
            workspaceId: wsId,
            sharedFrom: input.from,
          });
        }

        const newAnomalies: Anomaly[] = input.anomalies.map((a) => ({
          ...a,
          id: uid("ano"),
          visitId: idMap.get(a.visitId) ?? orphanVisitId ?? newVisits[0]!.id,
          workspaceId: wsId,
          createdAt: a.createdAt || now,
          status: a.status ?? "ouverte",
          demo: undefined,
          shareOriginId: undefined,
          sharedThreadId: undefined,
          sharedFrom: input.from,
        }));

        const classeurId = uid("classeur");
        const classeur: Classeur = {
          id: classeurId,
          workspaceId: wsId,
          name: `${(input.name || "Classeur").trim().replace(SHARE_TAG_RE, "")}${tag}`,
          note: input.note?.trim() || undefined,
          visitIds: newVisits.map((v) => v.id),
          anomalyIds: [],
          createdAt: now,
          updatedAt: now,
        };

        set({
          visits: [...newVisits, ...st.visits],
          anomalies: [...newAnomalies, ...st.anomalies],
          classeurs: [classeur, ...st.classeurs],
        });
        if (get().activeWorkspaceId !== wsId) get().switchWorkspace(wsId);
        return { classeurId };
      },
    }),
    {
      name: "siprassist-v5",
      skipHydration: true,
      merge: (persisted, current) => {
        // Base = un état démo neuf, jamais l'état en mémoire du compte
        // précédent : au changement de compte (clé localStorage différente),
        // une clé vide doit donner un espace vierge, pas les données de l'autre.
        const fresh = demo();
        const p = (persisted ?? {}) as Partial<ReturnType<typeof demo>> & {
          pgpByWorkspace?: Record<string, PgpPlan>;
          workspaces?: Workspace[];
          activeWorkspaceId?: string;
        };
        const visits = (p.visits ?? fresh.visits).map((v) =>
          ({
            ...v,
            demo: isExample(v.id, v.demo) || v.demo,
            workspaceId: v.workspaceId || DEMO_WORKSPACE_ID,
            name: v.name || v.company,
          }),
        );
        const anomalies = (p.anomalies ?? fresh.anomalies).map((a) => {
          const demoFlag = isExample(a.id, a.demo);
          return {
            ...a,
            demo: demoFlag || a.demo,
            author: a.author ?? (demoFlag ? demoAuthor() : undefined),
            workspaceId: a.workspaceId || DEMO_WORKSPACE_ID,
          };
        });
        const fds = (p.fds ?? fresh.fds).map((f) => ({
          ...f,
          demo: isExample(f.id, f.demo) ? true : f.demo,
          workspaceId: f.workspaceId || DEMO_WORKSPACE_ID,
        }));
        const rps = ((p as { rps?: RpsSituation[] }).rps ?? fresh.rps ?? []).map((r) => ({
          ...r,
          demo: isExample(r.id, r.demo) ? true : r.demo,
          workspaceId: r.workspaceId || DEMO_WORKSPACE_ID,
        }));
        const workspaces = p.workspaces?.length
          ? p.workspaces
          : fresh.workspaces;
        const activeWorkspaceId = p.activeWorkspaceId ?? fresh.activeWorkspaceId;
        const pgp = p.pgp
          ? {
              ...p.pgp,
              lines: p.pgp.lines.map((l) =>
                isExample(l.id, l.demo) ? { ...l, demo: true } : l,
              ),
            }
          : fresh.pgp;
        const pgpByWorkspace: Record<string, PgpPlan> = {
          ...fresh.pgpByWorkspace,
          ...(p.pgpByWorkspace ?? {}),
        };
        pgpByWorkspace[activeWorkspaceId] = pgp;
        if (!pgpByWorkspace[DEMO_WORKSPACE_ID]) {
          pgpByWorkspace[DEMO_WORKSPACE_ID] = fresh.pgp;
        }
        const users = (p.users ?? []).map((u) => {
          const createdAt = u.createdAt || isoDate();
          const plan =
            u.plan === "pro"
              ? ("pro" as const)
              : u.plan === "basic"
                ? ("basic" as const)
                : ("trial" as const);
          return {
            ...u,
            kind: u.kind ?? "entreprise",
            workspaceId: u.workspaceId || DEMO_WORKSPACE_ID,
            homeWorkspaceId: u.homeWorkspaceId ?? u.workspaceId ?? DEMO_WORKSPACE_ID,
            plan,
            trialEndsAt: u.trialEndsAt ?? trialEndFrom(createdAt.slice(0, 10), isoDay()),
            createdAt,
            totpSecret: u.totpSecret,
            totpEnabled: u.totpEnabled,
            totpBackupHashes: u.totpBackupHashes,
          };
        });
        const classeurs = ((p as { classeurs?: Classeur[] }).classeurs ?? fresh.classeurs).map(
          (c) => ({
            ...c,
            visitIds: Array.isArray(c.visitIds) ? c.visitIds : [],
            anomalyIds: Array.isArray(c.anomalyIds) ? c.anomalyIds : [],
            workspaceId: c.workspaceId || activeWorkspaceId,
          }),
        );
        return {
          ...current, // méthodes du store
          ...fresh, // valeurs par défaut propres (remet à zéro les tranches non persistées pour cette clé)
          ...p,
          visits,
          anomalies,
          fds,
          rps,
          pgp,
          workspaces,
          activeWorkspaceId,
          pgpByWorkspace,
          users,
          sessionUserId: p.sessionUserId ?? null,
          tickets: p.tickets ?? fresh.tickets ?? [],
          deleted: mergeDeleted(fresh.deleted, (p as { deleted?: DeletedIds }).deleted),
          classeurs,
        };
      },
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : localStorage,
      ),
      partialize: (s) => ({
        profile: s.profile,
        visits: s.visits,
        anomalies: s.anomalies,
        fds: s.fds,
        rps: s.rps,
        pgp: s.pgp,
        workspaces: s.workspaces,
        activeWorkspaceId: s.activeWorkspaceId,
        pgpByWorkspace: s.pgpByWorkspace,
        ackedReminders: s.ackedReminders,
        conflicts: s.conflicts,
        users: s.users,
        sessionUserId: s.sessionUserId,
        tickets: s.tickets,
        deleted: s.deleted,
        classeurs: s.classeurs,
      }),
    },
  ),
);

export function selectWorkspace(s: { workspaces: Workspace[]; activeWorkspaceId: string }) {
  return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? s.workspaces[0];
}

export function useWorkspaceVisits() {
  const visits = useSipr((s) => s.visits);
  const id = useSipr((s) => s.activeWorkspaceId);
  return visits.filter((v) => visitWorkspaceId(v) === id);
}

export function useWorkspaceAnomalies() {
  const anomalies = useSipr((s) => s.anomalies);
  const id = useSipr((s) => s.activeWorkspaceId);
  return anomalies.filter((a) => visitWorkspaceId(a) === id);
}

export function useWorkspaceFds() {
  const fds = useSipr((s) => s.fds);
  const id = useSipr((s) => s.activeWorkspaceId);
  return fds.filter((f) => visitWorkspaceId(f) === id);
}

export function useWorkspaceRps() {
  const rps = useSipr((s) => s.rps);
  const id = useSipr((s) => s.activeWorkspaceId);
  return rps.filter((r) => visitWorkspaceId(r) === id);
}

export function useWorkspaceClasseurs() {
  const classeurs = useSipr((s) => s.classeurs);
  const id = useSipr((s) => s.activeWorkspaceId);
  return classeurs.filter((c) => (c.workspaceId || id) === id);
}

export function useActiveVisit() {
  const visits = useWorkspaceVisits();
  return visits.find((v) => v.status === "en_cours") ?? visits[0];
}

export function currentAuthor(state: {
  profile: Profile;
  users: SiprUser[];
  sessionUserId: string | null;
}): RecordAuthor {
  const u = state.users.find((x) => x.id === state.sessionUserId);
  if (u) {
    return { userId: u.id, name: u.name, title: u.title, level: u.level };
  }
  return {
    name: state.profile.name,
    title: state.profile.title,
    level: state.profile.level,
  };
}

export function dueSoon(iso?: string): boolean {
  if (!iso) return false;
  return iso <= isoDay();
}

export { visitLabel };
