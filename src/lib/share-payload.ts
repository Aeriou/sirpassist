/**
 * Charge utile d'un partage ciblé (visite ou constat). Sérialisée telle quelle
 * dans `share_offer.payload` (jsonb). Le serveur ne l'inspecte pas — il ne fait
 * que la transporter. Construction et import : côté client.
 *
 * Modèle COPIE : à l'acceptation, on recrée des enregistrements LOCAUX (nouveaux
 * ids) chez le destinataire. `shareOriginId` reste stable d'un bout à l'autre et
 * survit aux allers-retours — il servira à l'étape 2 (tri fin / rapprochement).
 */
import type { Anomaly, Visit } from "./types";

export const SHARE_PAYLOAD_VERSION = 1 as const;

/** Champs de visite transportés (sans id/espace/démo, sans signatures). */
export type SharedVisit = Omit<
  Visit,
  "id" | "workspaceId" | "demo" | "signatures"
> & { shareOriginId: string };

export type SharedAnomaly = Omit<
  Anomaly,
  "id" | "visitId" | "workspaceId" | "demo"
> & { shareOriginId: string };

export type SharePayloadV1 = {
  v: typeof SHARE_PAYLOAD_VERSION;
  kind: "visit" | "anomaly";
  sharedAt: string;
  byName: string;
  byEmail: string;
  visit: SharedVisit;
  anomalies: SharedAnomaly[];
};

export function isSharePayloadV1(x: unknown): x is SharePayloadV1 {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<SharePayloadV1>;
  return (
    p.v === SHARE_PAYLOAD_VERSION &&
    (p.kind === "visit" || p.kind === "anomaly") &&
    typeof p.visit === "object" &&
    Array.isArray(p.anomalies)
  );
}

function stripVisit(v: Visit, shareOriginId: string): SharedVisit {
  const {
    id: _id,
    workspaceId: _ws,
    demo: _demo,
    signatures: _sig,
    sharedFrom: _sf,
    sharedThreadId: _st,
    ...rest
  } = v;
  void _id;
  void _ws;
  void _demo;
  void _sig;
  void _sf;
  void _st;
  // `shareNotes` passe via `...rest` (signé, fusionné à l'import).
  return { ...rest, shareOriginId };
}

function stripAnomaly(a: Anomaly, shareOriginId: string): SharedAnomaly {
  const {
    id: _id,
    visitId: _vid,
    workspaceId: _ws,
    demo: _demo,
    sharedFrom: _sf,
    sharedThreadId: _st,
    ...rest
  } = a;
  void _id;
  void _vid;
  void _ws;
  void _demo;
  void _sf;
  void _st;
  return { ...rest, shareOriginId };
}

/** Résumé court affiché dans la boîte de réception. */
export function summarize(payload: SharePayloadV1): string {
  if (payload.kind === "visit") {
    const n = payload.anomalies.length;
    return `Dossier « ${payload.visit.name || payload.visit.company} » — ${n} constat${n > 1 ? "s" : ""}`;
  }
  const a = payload.anomalies[0];
  return `Constat « ${a?.title ?? "sans titre"} » — dossier « ${payload.visit.name || payload.visit.company} »`;
}

export type BuildInput = {
  visit: Visit;
  anomalies: Anomaly[]; // toutes les anomalies de la visite (le builder filtre)
  by: { name: string; email: string };
  originId: () => string; // fabrique d'id stable (crypto.randomUUID côté appelant)
};

/**
 * Construit la charge utile. Renvoie aussi les `shareOriginId` attribués pour
 * que l'appelant les persiste sur ses enregistrements locaux (idempotent : si
 * un enregistrement en a déjà un, on le garde).
 */
export function buildVisitPayload(input: BuildInput): {
  payload: SharePayloadV1;
  assigned: { visitOriginId: string; anomalyOriginIds: Record<string, string> };
} {
  const visitOriginId = input.visit.shareOriginId ?? input.originId();
  const anomalyOriginIds: Record<string, string> = {};
  const anomalies = input.anomalies
    .filter((a) => a.visitId === input.visit.id)
    .map((a) => {
      const oid = a.shareOriginId ?? input.originId();
      anomalyOriginIds[a.id] = oid;
      return stripAnomaly(a, oid);
    });
  return {
    payload: {
      v: SHARE_PAYLOAD_VERSION,
      kind: "visit",
      sharedAt: new Date().toISOString(),
      byName: input.by.name,
      byEmail: input.by.email,
      visit: stripVisit(input.visit, visitOriginId),
      anomalies,
    },
    assigned: { visitOriginId, anomalyOriginIds },
  };
}

export function buildAnomalyPayload(
  input: BuildInput & { anomalyId: string },
): {
  payload: SharePayloadV1;
  assigned: { visitOriginId: string; anomalyOriginIds: Record<string, string> };
} {
  const anomaly = input.anomalies.find((a) => a.id === input.anomalyId);
  if (!anomaly) throw new Error("Constat introuvable.");
  const visitOriginId = input.visit.shareOriginId ?? input.originId();
  const oid = anomaly.shareOriginId ?? input.originId();
  return {
    payload: {
      v: SHARE_PAYLOAD_VERSION,
      kind: "anomaly",
      sharedAt: new Date().toISOString(),
      byName: input.by.name,
      byEmail: input.by.email,
      visit: stripVisit(input.visit, visitOriginId),
      anomalies: [stripAnomaly(anomaly, oid)],
    },
    assigned: { visitOriginId, anomalyOriginIds: { [anomaly.id]: oid } },
  };
}
