export const THEMES = [
  {
    id: "lieux",
    livre: "III",
    label: "Lieux de travail",
    short: "Lieux",
    examples: "Issues, éclairage, signalisation, sanitaires",
  },
  {
    id: "electricite",
    livre: "III",
    label: "Installations électriques",
    short: "Électricité",
    examples: "Câbles, armoires, prises, mise à la terre",
  },
  {
    id: "equipements",
    livre: "IV",
    label: "Équipements de travail",
    short: "Machines",
    examples: "Machines, outils, protecteurs, consignation",
  },
  {
    id: "incendie",
    livre: "III",
    label: "Incendie et explosion",
    short: "Incendie",
    examples: "Extincteurs, issues, stockage inflammables",
  },
  {
    id: "chimie",
    livre: "VI",
    label: "Agents chimiques",
    short: "Chimie",
    examples: "FDS, CMR, vapeurs, stockage",
  },
  {
    id: "physiques",
    livre: "V",
    label: "Agents physiques",
    short: "Bruit",
    examples: "Bruit, vibrations, rayonnements, chaleur",
  },
  {
    id: "epi",
    livre: "IX",
    label: "Équipements de protection",
    short: "EPI",
    examples: "Gants, lunettes, casques, harnais",
  },
  {
    id: "ergonomie",
    livre: "VIII",
    label: "Ergonomie et manutention",
    short: "Ergonomie",
    examples: "Charges, postures, TMS",
  },
  {
    id: "psychosociaux",
    livre: "I",
    label: "Risques psychosociaux",
    short: "RPS",
    examples: "Charge collective, relais, reconnaissance",
  },
  {
    id: "circulation",
    livre: "III",
    label: "Circulation interne",
    short: "Circulation",
    examples: "Chariots, allées, piétons, quais",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function themeById(id: ThemeId) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export const URGENCY_META = {
  basse: { label: "Basse", rank: 1 },
  moyenne: { label: "Moyenne", rank: 2 },
  haute: { label: "Haute", rank: 3 },
  critique: { label: "Critique", rank: 4 },
} as const;
