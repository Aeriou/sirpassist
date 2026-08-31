import { addDays, isoDay } from "./format";

export type SyncOrigin = "terrain" | "bureau";

export type ConflictField = {
  key: string;
  label: string;
  local: string;
  remote: string;
  recommend: "local" | "remote";
  reason: string;
};

export type DataConflict = {
  id: string;
  entity: "anomaly" | "paa";
  entityId: string;
  title: string;
  subtitle: string;
  localBy: string;
  localAt: string;
  remoteBy: string;
  remoteAt: string;
  fields: ConflictField[];
  status: "ouvert" | "resolu";
  resolution?: "terrain" | "bureau" | "fusion";
  picks?: Record<string, "local" | "remote">;
  resolvedAt?: string;
  resolvedBy?: string;
};

export function seedConflicts(): DataConflict[] {
  const today = isoDay();
  return [
    {
      id: "cf-cable",
      entity: "anomaly",
      entityId: "ano-cable",
      title: "Câble dénudé — prise atelier 3",
      subtitle: "Constat terrain vs mise à jour bureau (Kinney + suivi PGP)",
      localBy: "Camille Dubois · N3 terrain",
      localAt: addDays(today, 0) + "T07:52:00.000Z",
      remoteBy: "Jean Van den Berg · N1 bureau",
      remoteAt: addDays(today, 0) + "T10:18:00.000Z",
      status: "ouvert",
      fields: [
        {
          key: "status",
          label: "Statut",
          local: "validée → PGP",
          remote: "en cours",
          recommend: "remote",
          reason: "Le bureau a ouvert le suivi ; la preuve terrain est déjà dans le dossier.",
        },
        {
          key: "correctiveAction",
          label: "Mesure",
          local:
            "Consigner immédiatement, isoler le conducteur, intervention électricien BA4/BA5, rétablir le protecteur et tester.",
          remote: "Devis électricien externe, intervention planifiée semaine 36.",
          recommend: "local",
          reason: "La consignation immédiate vient du terrain — ne pas l'écraser par un devis.",
        },
        {
          key: "assignedTo",
          label: "Responsable",
          local: "Marc Lemoine",
          remote: "Service électricité externe",
          recommend: "remote",
          reason: "Le N1 a attribué l'intervenant habilité.",
        },
        {
          key: "dueDate",
          label: "Échéance",
          local: addDays(today, 2),
          remote: addDays(today, 14),
          recommend: "local",
          reason: "Risque extrême : garder l'échéance courte du terrain.",
        },
      ],
    },
    {
      id: "cf-issue",
      entity: "anomaly",
      entityId: "ano-issue",
      title: "Issue de secours obstruée",
      subtitle: "Photo CBE encore bloquée vs clôture bureau",
      localBy: "Camille Dubois · N3 terrain",
      localAt: addDays(today, 0) + "T08:04:00.000Z",
      remoteBy: "Marc Lemoine · chef d'atelier",
      remoteAt: addDays(today, 0) + "T09:40:00.000Z",
      status: "ouvert",
      fields: [
        {
          key: "status",
          label: "Statut",
          local: "ouverte",
          remote: "clôturée",
          recommend: "local",
          reason: "La photo horodatée montre encore les palettes. Une clôture bureau n'annule pas la preuve CBE.",
        },
        {
          key: "description",
          label: "Description",
          local:
            "Palettes et cartons stockés devant la porte de sortie de secours. Dégagement d'évacuation non garanti.",
          remote: "Dégagement libéré ce matin. Constat clôturé par le chef d'atelier.",
          recommend: "local",
          reason: "Conserver l'observation terrain jusqu'à une nouvelle photo de conformité.",
        },
        {
          key: "correctiveAction",
          label: "Mesure",
          local:
            "Libérer le dégagement immédiatement, interdire le stockage, marquer au sol la zone de dégagement, briefing équipe.",
          remote: "Rappel oral à l'équipe. Pas de marquage au sol.",
          recommend: "local",
          reason: "Le marquage au sol est la mesure durable ; le rappel oral ne suffit pas.",
        },
      ],
    },
    {
      id: "cf-solvant",
      entity: "paa",
      entityId: "paa-solvant",
      title: "Fût de solvant sans extraction",
      subtitle: "Ligne PAA : budget et trimestre divergents",
      localBy: "Camille Dubois · N2 terrain",
      localAt: addDays(today, -1) + "T16:20:00.000Z",
      remoteBy: "Jean Van den Berg · employeur",
      remoteAt: addDays(today, 0) + "T08:10:00.000Z",
      status: "ouvert",
      fields: [
        {
          key: "budget",
          label: "Budget",
          local: "2200",
          remote: "1800",
          recommend: "local",
          reason: "Le devis aspiration + armoire du terrain est plus réaliste que l'enveloppe rabotée.",
        },
        {
          key: "owner",
          label: "Responsable",
          local: "Sophie Lambert",
          remote: "SIPP interne",
          recommend: "local",
          reason: "La gérante du site reste l'exécutant ; le SIPP assure le suivi.",
        },
        {
          key: "quarter",
          label: "Trimestre",
          local: "T3",
          remote: "T4",
          recommend: "local",
          reason: "Agents chimiques — ne pas reporter un risque incendie / vapeurs.",
        },
      ],
    },
  ];
}

export function defaultPicks(c: DataConflict): Record<string, "local" | "remote"> {
  return Object.fromEntries(c.fields.map((f) => [f.key, f.recommend]));
}

export function mergePicks(
  c: DataConflict,
  mode: "terrain" | "bureau" | "fusion",
  overrides?: Record<string, "local" | "remote">,
): Record<string, "local" | "remote"> {
  if (mode === "terrain") {
    return Object.fromEntries(c.fields.map((f) => [f.key, "local" as const]));
  }
  if (mode === "bureau") {
    return Object.fromEntries(c.fields.map((f) => [f.key, "remote" as const]));
  }
  return { ...defaultPicks(c), ...overrides };
}

const STATUS_TO_ANOMALY: Record<string, string> = {
  "validée → PGP": "validee",
  "en cours": "en_cours",
  ouverte: "ouverte",
  clôturée: "cloturee",
  brouillon: "brouillon",
};

const QUARTER: Record<string, string> = { T1: "Q1", T2: "Q2", T3: "Q3", T4: "Q4" };

export function patchFromPicks(
  c: DataConflict,
  picks: Record<string, "local" | "remote">,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of c.fields) {
    const raw = picks[f.key] === "remote" ? f.remote : f.local;
    if (c.entity === "anomaly") {
      if (f.key === "status") patch.status = STATUS_TO_ANOMALY[raw] ?? raw;
      else if (f.key === "correctiveAction") patch.correctiveAction = raw;
      else if (f.key === "assignedTo") patch.assignedTo = raw;
      else if (f.key === "dueDate") patch.dueDate = raw;
      else if (f.key === "description") patch.description = raw;
      else if (f.key === "title") patch.title = raw;
    } else {
      if (f.key === "budget") patch.budget = Number(raw) || 0;
      else if (f.key === "owner") patch.owner = raw;
      else if (f.key === "quarter") patch.quarter = QUARTER[raw] ?? raw;
      else if (f.key === "measure") patch.measure = raw;
      else if (f.key === "status") patch.status = raw === "réalisée" ? "realisee" : raw === "reportée" ? "reportee" : "retenue";
    }
  }
  return patch;
}
