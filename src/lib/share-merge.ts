/**
 * Plan de rapprochement à l'acceptation d'un partage — logique pure, testée
 * dans `scripts/dryrun-share.mts`.
 *
 * Quand une proposition arrive et que le destinataire possède DÉJÀ le dossier
 * du même fil (premier envoi ou retour d'un aller-retour), on ne réimporte pas
 * en double : on présente un tri élément par élément (garder / prendre / ajouter
 * / supprimer). Sinon c'est un premier import, mais on montre quand même la
 * liste pour pouvoir écarter des constats.
 */
import type { Anomaly, ShareNote, Visit } from "./types";
import type { SharePayloadV1 } from "./share-payload";

export type IncomingState = "new" | "changed" | "same";
export type AnomalyChoice = "add" | "take" | "keep" | "skip";
export type RemovalChoice = "keep" | "delete";

export type IncomingRow = {
  shareOriginId: string;
  title: string;
  state: IncomingState;
  localId: string | null;
  choice: AnomalyChoice;
};

export type RemovalRow = {
  localId: string;
  title: string;
  choice: RemovalChoice;
};

export type SharedImportPlan = {
  isMerge: boolean;
  targetVisitId: string | null;
  visitChanged: boolean;
  updateVisitInfo: boolean;
  incoming: IncomingRow[];
  removals: RemovalRow[];
  incomingNoteCount: number;
};

type StoreSlice = { visits: Visit[]; anomalies: Anomaly[] };

/** Champs comparés pour décider "modifié" vs "inchangé". */
function anomalyFingerprint(a: {
  title?: string;
  location?: string;
  description?: string;
  theme?: string;
  urgency?: string;
  correctiveAction?: string;
  legalRef?: string;
  dueDate?: string;
  photo?: string;
  transcription?: string;
  kinney?: { score?: number };
  voice?: { danger?: string; measure?: string; zone?: string };
}): string {
  return JSON.stringify([
    a.title ?? "",
    a.location ?? "",
    a.description ?? "",
    a.theme ?? "",
    a.urgency ?? "",
    a.correctiveAction ?? "",
    a.legalRef ?? "",
    a.dueDate ?? "",
    a.photo ?? "",
    a.transcription ?? "",
    a.kinney?.score ?? "",
    a.voice?.danger ?? "",
    a.voice?.measure ?? "",
    a.voice?.zone ?? "",
  ]);
}

function visitChangedFrom(local: Visit, incoming: SharePayloadV1["visit"]): boolean {
  const pick = (v: { company?: string; interlocutor?: string; date?: string; site?: string; notes?: string }) =>
    JSON.stringify([v.company ?? "", v.interlocutor ?? "", v.date ?? "", v.site ?? "", v.notes ?? ""]);
  return pick(local) !== pick(incoming);
}

/** Union des notes de partage par id (rien n'est écrasé, tri par date). */
export function mergeShareNotes(local: ShareNote[] | undefined, incoming: ShareNote[] | undefined): ShareNote[] {
  const out = new Map<string, ShareNote>();
  for (const n of local ?? []) out.set(n.id, n);
  for (const n of incoming ?? []) if (!out.has(n.id)) out.set(n.id, n);
  return [...out.values()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Nombre de notes entrantes absentes en local (pour l'aperçu). */
function countNewNotes(local: ShareNote[] | undefined, incoming: ShareNote[] | undefined): number {
  const have = new Set((local ?? []).map((n) => n.id));
  return (incoming ?? []).filter((n) => !have.has(n.id)).length;
}

export function computeSharedPlan(
  store: StoreSlice,
  payload: SharePayloadV1,
  threadId: string,
): SharedImportPlan {
  const target = store.visits.find(
    (v) =>
      (v.sharedThreadId && v.sharedThreadId === threadId) ||
      (v.shareOriginId && payload.visit.shareOriginId && v.shareOriginId === payload.visit.shareOriginId),
  );

  const localAnoms = target
    ? store.anomalies.filter((a) => a.visitId === target.id)
    : [];
  const byOrigin = new Map<string, Anomaly>();
  for (const a of localAnoms) if (a.shareOriginId) byOrigin.set(a.shareOriginId, a);

  const incomingOriginIds = new Set(payload.anomalies.map((a) => a.shareOriginId));

  const incoming: IncomingRow[] = payload.anomalies.map((sa) => {
    const match = byOrigin.get(sa.shareOriginId);
    if (!match) {
      return { shareOriginId: sa.shareOriginId, title: sa.title, state: "new", localId: null, choice: "add" };
    }
    const changed = anomalyFingerprint(match) !== anomalyFingerprint(sa);
    return {
      shareOriginId: sa.shareOriginId,
      title: sa.title,
      state: changed ? "changed" : "same",
      localId: match.id,
      choice: changed ? "take" : "skip",
    };
  });

  const removals: RemovalRow[] = target
    ? localAnoms
        .filter((a) => a.shareOriginId && !incomingOriginIds.has(a.shareOriginId))
        .map((a) => ({ localId: a.id, title: a.title, choice: "keep" as RemovalChoice }))
    : [];

  let incomingNoteCount = countNewNotes(target?.shareNotes, payload.visit.shareNotes);
  for (const sa of payload.anomalies) {
    const match = byOrigin.get(sa.shareOriginId);
    incomingNoteCount += countNewNotes(match?.shareNotes, sa.shareNotes);
  }

  const visitChanged = target ? visitChangedFrom(target, payload.visit) : false;

  return {
    isMerge: Boolean(target),
    targetVisitId: target?.id ?? null,
    visitChanged,
    updateVisitInfo: visitChanged,
    incoming,
    removals,
    incomingNoteCount,
  };
}
