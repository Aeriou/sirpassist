export const PROBABILITY = [
  { value: 10, label: "Très probable", hint: "Se produira presque certainement" },
  { value: 6, label: "Possible", hint: "Peut se produire" },
  { value: 3, label: "Inhabituelle", hint: "Rare, mais déjà observé" },
  { value: 1, label: "Improbable", hint: "Peu vraisemblable" },
  { value: 0.5, label: "Très improbable", hint: "Concevable, jamais vu" },
  { value: 0.2, label: "Quasi impossible", hint: "Pratiquement exclu" },
] as const;

export const EXPOSURE = [
  { value: 10, label: "Continue", hint: "Toute la journée" },
  { value: 6, label: "Fréquente", hint: "Quotidienne" },
  { value: 3, label: "Occasionnelle", hint: "Hebdomadaire" },
  { value: 2, label: "Peu fréquente", hint: "Mensuelle" },
  { value: 1, label: "Rare", hint: "Quelques fois / an" },
  { value: 0.5, label: "Très rare", hint: "Exceptionnelle" },
] as const;

export const GRAVITY = [
  { value: 100, label: "Catastrophe", hint: "Plusieurs décès" },
  { value: 40, label: "Mortelle", hint: "Un décès" },
  { value: 15, label: "Très grave", hint: "Invalidité permanente" },
  { value: 7, label: "Grave", hint: "Arrêt de travail" },
  { value: 3, label: "Importante", hint: "Soins, sans arrêt long" },
  { value: 1, label: "Légère", hint: "Premiers soins" },
] as const;

export type RiskLevel = "faible" | "moyen" | "eleve" | "tres_eleve" | "extreme";

export type Kinney = {
  P: number;
  E: number;
  G: number;
  score: number;
  level: RiskLevel;
};

export function kinneyScore(P: number, E: number, G: number): number {
  return Math.round(P * E * G * 10) / 10;
}

export function kinneyLevel(score: number): RiskLevel {
  if (score > 400) return "extreme";
  if (score > 200) return "tres_eleve";
  if (score > 70) return "eleve";
  if (score > 20) return "moyen";
  return "faible";
}

export function buildKinney(P: number, E: number, G: number): Kinney {
  const score = kinneyScore(P, E, G);
  return { P, E, G, score, level: kinneyLevel(score) };
}

export const LEVEL_META: Record<
  RiskLevel,
  { label: string; action: string; tone: "low" | "mid" | "high" | "crit" }
> = {
  faible: {
    label: "Faible",
    action: "Surveillance — risque acceptable",
    tone: "low",
  },
  moyen: {
    label: "Moyen",
    action: "Attention et suivi planifié",
    tone: "mid",
  },
  eleve: {
    label: "Élevé",
    action: "Planifier des mesures rapidement",
    tone: "high",
  },
  tres_eleve: {
    label: "Très élevé",
    action: "Mesures urgentes à engager",
    tone: "crit",
  },
  extreme: {
    label: "Extrême",
    action: "Arrêt immédiat / action prioritaire",
    tone: "crit",
  },
};

export function nearestOption(options: readonly { value: number }[], value: number): number {
  return options.reduce((best, o) =>
    Math.abs(o.value - value) < Math.abs(best - value) ? o.value : best,
  options[0]!.value);
}
