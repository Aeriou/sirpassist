/**
 * Construction du contenu d'un classeur partagé à un groupe. Lecture seule
 * côté membres. Les photos SONT transportées (octets) : le magasin d'images est
 * par compte, un membre ne pourrait pas les résoudre autrement — même principe
 * que le partage ciblé. Si la copie locale a été déchargée (sync serveur), on
 * la ré-hydrate depuis MON magasin avant d'emballer. Les signatures sont
 * retirées (inutiles en lecture seule, elles alourdissent).
 */
import { resolveAsset } from "./asset-cache";
import { isDataUrl } from "./asset-id";
import type { Anomaly, Classeur, Visit } from "./types";

export type GroupClasseurPayload = {
  v: 1;
  note?: string;
  visits: Visit[];
  anomalies: Anomaly[];
};

export async function buildGroupClasseurPayload(
  classeur: Classeur,
  allVisits: Visit[],
  allAnomalies: Anomaly[],
): Promise<GroupClasseurPayload> {
  const vids = new Set(classeur.visitIds);
  const covered = allAnomalies.filter((a) => vids.has(a.visitId));
  const picked = allAnomalies.filter(
    (a) => classeur.anomalyIds.includes(a.id) && !vids.has(a.visitId),
  );

  const visits = await Promise.all(
    allVisits
      .filter((v) => vids.has(v.id))
      .map(async (v) => {
        const { signatures: _s, ...rest } = v;
        void _s;
        let cover = v.coverPhoto;
        if (!isDataUrl(cover) && v.coverPhotoAssetId) {
          const d = await resolveAsset(v.coverPhotoAssetId);
          if (d) cover = d;
        }
        return (cover ? { ...rest, coverPhoto: cover } : rest) as Visit;
      }),
  );

  const anomalies = await Promise.all(
    [...covered, ...picked].map(async (a) => {
      let photo = a.photo;
      if (!isDataUrl(photo) && a.photoAssetId) {
        const d = await resolveAsset(a.photoAssetId);
        if (d) photo = d;
      }
      return (photo ? { ...a, photo } : a) as Anomaly;
    }),
  );

  return { v: 1, note: classeur.note, visits, anomalies };
}

export function isGroupClasseurPayload(x: unknown): x is GroupClasseurPayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<GroupClasseurPayload>;
  return Array.isArray(p.visits) && Array.isArray(p.anomalies);
}
