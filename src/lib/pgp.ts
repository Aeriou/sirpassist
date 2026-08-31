import { THEMES, type ThemeId } from "./code-bien-etre";
import { uid } from "./utils";
import type { Anomaly, PaaLine, PaaLineStatus, PgpPlan, PgpStatus, Quarter, RpsSituation } from "./types";

export const QUARTERS: { id: Quarter; label: string }[] = [
  { id: "Q1", label: "T1" },
  { id: "Q2", label: "T2" },
  { id: "Q3", label: "T3" },
  { id: "Q4", label: "T4" },
];

export const PLAN_STATUS: { id: PgpStatus; label: string }[] = [
  { id: "brouillon", label: "Brouillon" },
  { id: "cppt", label: "Soumis au CPPT" },
  { id: "valide", label: "Validé" },
];

export const LINE_STATUS: { id: PaaLineStatus; label: string }[] = [
  { id: "retenue", label: "Retenue" },
  { id: "reportee", label: "Reportée" },
  { id: "realisee", label: "Réalisée" },
];

export function quarterFromDue(iso?: string, year = 2026): Quarter {
  if (!iso) return "Q2";
  const m = Number(iso.slice(5, 7));
  const y = Number(iso.slice(0, 4));
  if (y < year) return "Q1";
  if (y > year) return "Q4";
  if (m <= 3) return "Q1";
  if (m <= 6) return "Q2";
  if (m <= 9) return "Q3";
  return "Q4";
}

export function lineFromAnomaly(a: Anomaly, year: number): PaaLine {
  return {
    id: uid("paa"),
    anomalyId: a.id,
    title: a.title,
    theme: a.theme,
    measure: a.correctiveAction,
    owner: a.assignedTo ?? "",
    dueDate: a.dueDate,
    quarter: quarterFromDue(a.dueDate, year),
    budget: 0,
    included: a.status === "validee" || a.status === "en_cours" || a.status === "cloturee",
    status: a.status === "cloturee" ? "realisee" : "retenue",
    origin: "visite",
    level:
      a.kinney.level === "extreme" || a.kinney.level === "tres_eleve" || a.urgency === "critique"
        ? 1
        : a.kinney.level === "eleve" || a.urgency === "haute"
          ? 2
          : 3,
  };
}

export function lineFromRps(s: RpsSituation, year: number): PaaLine {
  const hot = s.attention === "urgence" || s.attention === "intervention";
  return {
    id: uid("paa"),
    rpsId: s.id,
    title: s.title,
    theme: "psychosociaux",
    measure: s.measures[0] ?? s.diagnosis,
    owner: "",
    quarter: quarterFromDue(undefined, year),
    budget: 0,
    included: true,
    status: "retenue",
    origin: "rps",
    level: hot ? 1 : 2,
  };
}

export function includedLines(plan: PgpPlan) {
  return plan.lines.filter((l) => l.included && l.status !== "reportee");
}

export function budgetCommitted(plan: PgpPlan) {
  return includedLines(plan).reduce((sum, l) => sum + (l.budget || 0), 0);
}

const QUARTER_ORDER: Record<Quarter, number> = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };

export function sortPaaLines(lines: PaaLine[]) {
  const themeOrder = Object.fromEntries(THEMES.map((t, i) => [t.id, i]));
  return [...lines].sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    const qd = QUARTER_ORDER[a.quarter] - QUARTER_ORDER[b.quarter];
    if (qd) return qd;
    const td = (themeOrder[a.theme] ?? 0) - (themeOrder[b.theme] ?? 0);
    if (td) return td;
    return a.title.localeCompare(b.title, "fr");
  });
}

export function quarterBudgets(lines: PaaLine[]) {
  return QUARTERS.map((q) => {
    const items = lines.filter((l) => l.quarter === q.id && l.included && l.status !== "reportee");
    return {
      id: q.id,
      label: q.label,
      count: items.length,
      budget: items.reduce((sum, l) => sum + (l.budget || 0), 0),
    };
  });
}

export function defaultObjectives(): PgpPlan["objectives"] {
  const goals: Record<ThemeId, { goal: string; indicator: string; enabled: boolean }> = {
    electricite: {
      enabled: true,
      goal: "Mettre en conformité toutes les installations électriques signalées.",
      indicator: "0 non-conformité électrique ouverte en fin d'année",
    },
    incendie: {
      enabled: true,
      goal: "Garantir les dégagements d'évacuation et la maîtrise du risque incendie.",
      indicator: "2 exercices d'évacuation / an · 100 % des issues libres",
    },
    chimie: {
      enabled: true,
      goal: "Maîtriser les agents chimiques : stockage, FDS et notices de poste.",
      indicator: "100 % des produits avec FDS et notice 5 lignes",
    },
    ergonomie: {
      enabled: true,
      goal: "Réduire les TMS liés à la manutention manuelle.",
      indicator: "0 charge > 15 kg sans aide mécanique",
    },
    epi: {
      enabled: true,
      goal: "Assurer le port des EPI aux postes à risque.",
      indicator: "12 contrôles de port / an",
    },
    lieux: {
      enabled: false,
      goal: "Maintenir les lieux de travail en état de conformité.",
      indicator: "Visite SIPP trimestrielle",
    },
    equipements: {
      enabled: false,
      goal: "Protecteurs et consignation sur tous les équipements.",
      indicator: "0 machine en service sans protecteur",
    },
    physiques: {
      enabled: false,
      goal: "Maîtriser le bruit et les vibrations.",
      indicator: "Mesure d'exposition annuelle",
    },
    psychosociaux: {
      enabled: false,
      goal: "Prévenir les RPS par des mesures d'organisation (charge, relais, reconnaissance) — jamais nominatives.",
      indicator: "Analyses RPS collectives présentées au CPPT (0 fiche nominative)",
    },
    circulation: {
      enabled: false,
      goal: "Séparer flux piétons et engins.",
      indicator: "Marquage des allées sur l'ensemble du site",
    },
  };
  return THEMES.map((t) => ({
    theme: t.id,
    goal: goals[t.id].goal,
    indicator: goals[t.id].indicator,
    enabled: goals[t.id].enabled,
  }));
}

export function emptyPgp(company: string, sipp = ""): PgpPlan {
  return {
    company,
    employer: "",
    workers: 0,
    sipp,
    physician: "",
    pgpStart: 2026,
    pgpEnd: 2030,
    paaYear: 2026,
    cpptDate: "",
    budget: 0,
    status: "brouillon",
    notes: "",
    objectives: defaultObjectives(),
    lines: [],
  };
}
