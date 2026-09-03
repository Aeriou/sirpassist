/**
 * Construction du contenu d'un classeur partagé à un groupe. Lecture seule
 * côté membres : on copie les visites et constats tels quels, SANS les photos
 * base64 (elles restent locales — comme pour le partage ciblé).
 */
import type { Anomaly, Classeur, Visit } from "./types";

export type GroupClasseurPayload = {
  v: 1;
  note?: string;
  visits: Visit[];
  anomalies: Anomaly[];
};

function stripVisit(v: Visit): Visit {
  const { coverPhoto: _c, ...rest } = v;
  void _c;
  return rest as Visit;
}

function stripAnomaly(a: Anomaly): Anomaly {
  const { photo: _p, ...rest } = a;
  void _p;
  return rest as Anomaly;
}

export function buildGroupClasseurPayload(
  classeur: Classeur,
  allVisits: Visit[],
  allAnomalies: Anomaly[],
): GroupClasseurPayload {
  const vids = new Set(classeur.visitIds);
  const visits = allVisits.filter((v) => vids.has(v.id));
  const covered = allAnomalies.filter((a) => vids.has(a.visitId));
  const picked = allAnomalies.filter(
    (a) => classeur.anomalyIds.includes(a.id) && !vids.has(a.visitId),
  );
  return {
    v: 1,
    note: classeur.note,
    visits: visits.map(stripVisit),
    anomalies: [...covered, ...picked].map(stripAnomaly),
  };
}

export function isGroupClasseurPayload(x: unknown): x is GroupClasseurPayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<GroupClasseurPayload>;
  return Array.isArray(p.visits) && Array.isArray(p.anomalies);
}
