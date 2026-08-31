import { THEMES, type ThemeId } from "./code-bien-etre";
import { buildKinney, nearestOption, PROBABILITY, EXPOSURE, GRAVITY } from "./kinney";
import type { Anomaly, KinneyJustification, Urgency } from "./types";

export type AnomalyDraft = Pick<
  Anomaly,
  | "title"
  | "location"
  | "description"
  | "theme"
  | "urgency"
  | "kinney"
  | "kinneyWhy"
  | "legalRef"
  | "correctiveAction"
>;

const THEME_KEYWORDS: Record<ThemeId, string[]> = {
  electricite: [
    "électr",
    "electr",
    "câble",
    "cable",
    "dénud",
    "denud",
    "prise",
    "armoire",
    "tension",
    "électrocution",
    "electrocution",
    "disjoncteur",
  ],
  incendie: [
    "incendie",
    "feu",
    "issue",
    "secours",
    "extincteur",
    "évacuation",
    "evacuation",
    "bloquée",
    "bloquee",
    "flamme",
  ],
  chimie: [
    "chim",
    "solvant",
    "produit",
    "fds",
    "vapeur",
    "cmr",
    "acide",
    "peinture",
    "dégraiss",
    "degraiss",
  ],
  epi: ["epi", "gant", "lunette", "casque", "harnais", "chaussure de sécurité"],
  ergonomie: [
    "manutention",
    "charge",
    "sac",
    "kg",
    "dos",
    "port de",
    "TMS",
    "posture",
    "levage",
  ],
  physiques: ["bruit", "vibration", "chaleur", "froid", "rayonnement"],
  psychosociaux: ["harcèlement", "harcelement", "stress", "charge de travail", "violence"],
  circulation: ["chariot", "circulation", "allée", "allee", "piéton", "pieton", "quai"],
  equipements: ["machine", "protecteur", "carter", "consignation", "outil"],
  lieux: ["éclairage", "eclairage", "sol", "glissant", "sanitaire", "signalisation"],
};

const URGENCY_WORDS: Array<[Urgency, string[]]> = [
  ["critique", ["critique", "immédiat", "immediat", "arrêt", "arret", "mortel"]],
  ["haute", ["urgence haute", "haute", "urgent", "grave", "danger"]],
  ["moyenne", ["moyenne", "modéré", "modere"]],
  ["basse", ["basse", "faible", "mineur"]],
];

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

export function detectTheme(text: string): ThemeId {
  const t = text.toLowerCase();
  let best: ThemeId = "lieux";
  let score = 0;
  for (const theme of THEMES) {
    const hits = THEME_KEYWORDS[theme.id].filter((k) => t.includes(k)).length;
    if (hits > score) {
      score = hits;
      best = theme.id;
    }
  }
  return best;
}

export function detectUrgency(text: string): Urgency {
  const t = text.toLowerCase();
  for (const [level, words] of URGENCY_WORDS) {
    if (includesAny(t, words)) return level;
  }
  return "moyenne";
}

export function detectLocation(text: string): string {
  const atelier = text.match(/atelier\s*\d+/i);
  if (atelier) return atelier[0].replace(/\s+/, " ");
  const zone = text.match(/\b(quai|hall|bureau|parking|magasin|ligne)\s*\d*/i);
  if (zone) return zone[0];
  return "Non précisé";
}

function titleFrom(text: string, theme: ThemeId): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length > 12 && compact.length < 80) {
    const first = compact.split(/[.,]/)[0]?.trim() ?? compact;
    if (first.length >= 8) return first.charAt(0).toUpperCase() + first.slice(1);
  }
  const labels: Record<ThemeId, string> = {
    electricite: "Risque électrique",
    incendie: "Issue ou risque incendie",
    chimie: "Risque chimique",
    epi: "Défaut d'EPI",
    ergonomie: "Manutention / TMS",
    physiques: "Agent physique",
    psychosociaux: "Risque psychosocial",
    circulation: "Circulation interne",
    equipements: "Équipement de travail",
    lieux: "Anomalie des lieux de travail",
  };
  return labels[theme];
}

function defaultKinney(theme: ThemeId, urgency: Urgency) {
  const P = urgency === "critique" || urgency === "haute" ? 6 : urgency === "moyenne" ? 3 : 1;
  const E = 6;
  const GByTheme: Record<ThemeId, number> = {
    electricite: 15,
    incendie: 15,
    chimie: 15,
    epi: 7,
    ergonomie: 7,
    physiques: 7,
    psychosociaux: 7,
    circulation: 15,
    equipements: 15,
    lieux: 7,
  };
  const G = urgency === "critique" ? 40 : GByTheme[theme];
  return buildKinney(
    nearestOption(PROBABILITY, P),
    nearestOption(EXPOSURE, E),
    nearestOption(GRAVITY, G),
  );
}

export function defaultKinneyWhy(theme: ThemeId, urgency: Urgency): KinneyJustification {
  const t = THEMES.find((x) => x.id === theme)!;
  const Pwhy =
    urgency === "critique" || urgency === "haute"
      ? "P = 6 — l'événement est possible dans les conditions observées (déjà vu ou configuration actuelle)."
      : urgency === "moyenne"
        ? "P = 3 — occurrence inhabituelle, mais le défaut est en place."
        : "P = 1 — improbable si le poste n'est pas sollicité en continu.";
  const Ewhy = "E = 6 — exposition quotidienne du personnel de production au poste concerné.";
  const Gwhy =
    theme === "electricite" || theme === "incendie" || theme === "chimie"
      ? "G = 15 — lésion grave / invalidité possible (Code du bien-être, prévention à la source)."
      : "G = 7 — arrêt de travail plausible (TMS, projection, chute).";
  return {
    Pwhy,
    Ewhy,
    Gwhy,
    legal: `Code du bien-être au travail — Livre ${t.livre} (${t.label}). Suggestion IA / heuristique, à valider par le conseiller.`,
  };
}

function defaultAction(theme: ThemeId): string {
  const map: Record<ThemeId, string> = {
    electricite:
      "Consigner l'installation, isoler le conducteur, faire intervenir un électricien BA4/BA5, rétablir les protecteurs.",
    incendie:
      "Libérer immédiatement le dégagement, signaler l'issue, vérifier le balisage et former le personnel à l'évacuation.",
    chimie:
      "Retirer le produit non étiqueté, obtenir la FDS, stocker en armoire ventilée, fournir les EPI adaptés.",
    epi: "Fournir les EPI manquants, afficher l'obligation de port, contrôler le respect en atelier.",
    ergonomie:
      "Limiter le poids unitaire, mettre à disposition un aide à la manutention, former aux gestes et postures.",
    physiques: "Mesurer l'exposition, réduire à la source, fournir protection individuelle si nécessaire.",
    psychosociaux:
      "Ouvrir une analyse RPS collective (situation, pas personnes) : charge, relais de poste, reconnaissance. Informer le CPPT. Souffrance individuelle → personne de confiance.",
    circulation: "Séparer flux piétons / engins, marquer les allées, former les conducteurs.",
    equipements: "Arrêter la machine, rétablir le protecteur, consigner avant intervention.",
    lieux: "Corriger le défaut, signaler la zone, planifier la remise en conformité.",
  };
  return map[theme];
}

function legalRef(theme: ThemeId): string {
  const t = THEMES.find((x) => x.id === theme)!;
  return `Code du bien-être au travail — Livre ${t.livre} (${t.label})`;
}

export function parseObservation(text: string): AnomalyDraft {
  const theme = detectTheme(text);
  const urgency = detectUrgency(text);
  const location = detectLocation(text);
  const title = titleFrom(text, theme);
  return {
    title,
    location,
    description: text.trim() || title,
    theme,
    urgency,
    kinney: defaultKinney(theme, urgency),
    kinneyWhy: defaultKinneyWhy(theme, urgency),
    legalRef: legalRef(theme),
    correctiveAction: defaultAction(theme),
  };
}
