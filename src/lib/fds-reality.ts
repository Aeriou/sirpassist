import type { FdsNotice, FdsReality, FdsRealityTheme } from "./types";

export const FDS_REALITY_THEME_IDS: FdsRealityTheme[] = [
  "fds",
  "etiquettes_clp",
  "ventilation",
  "epi",
  "protection_collective",
];

export const FDS_REALITY_QUESTIONS: {
  key: keyof Omit<FdsReality, "themes">;
  label: string;
  hint: string;
}[] = [
  {
    key: "products",
    label: "Quels produits sont utilisés ?",
    hint: "Nom commercial, usage, quantité approximative sur le poste",
  },
  {
    key: "hazards",
    label: "Quels sont les dangers ?",
    hint: "Mentions H, vapeurs, contact cutané, incendie…",
  },
  {
    key: "exposed",
    label: "Qui est exposé ?",
    hint: "Opérateurs, intérimaires, maintenance, riverains du poste",
  },
  {
    key: "duration",
    label: "Combien de temps ?",
    hint: "Durée par poste, fréquence dans la semaine",
  },
  {
    key: "prevention",
    label: "Quelles mesures de prévention ?",
    hint: "FDS, étiquette CLP, ventilation, EPI, protection collective",
  },
];

export const FDS_REALITY_THEMES: {
  id: FdsRealityTheme;
  label: string;
  hint: string;
}[] = [
  { id: "fds", label: "FDS", hint: "Fiche de données de sécurité à jour" },
  { id: "etiquettes_clp", label: "Étiquettes CLP", hint: "Pictogrammes et mentions de danger" },
  { id: "ventilation", label: "Ventilation", hint: "Aspiration, cabine, air libre" },
  { id: "epi", label: "EPI", hint: "Gants, lunettes, masque, tablier" },
  { id: "protection_collective", label: "Protection collective", hint: "Capotage, confinement, procédures" },
];

export function emptyReality(): FdsReality {
  return {
    products: "",
    hazards: "",
    exposed: "",
    duration: "",
    prevention: "",
    themes: [],
  };
}

export function compactReality(r?: FdsReality): FdsReality | undefined {
  if (!r) return undefined;
  const products = r.products?.trim() || undefined;
  const hazards = r.hazards?.trim() || undefined;
  const exposed = r.exposed?.trim() || undefined;
  const duration = r.duration?.trim() || undefined;
  const prevention = r.prevention?.trim() || undefined;
  const themes = r.themes?.filter((t) => FDS_REALITY_THEME_IDS.includes(t));
  const unique = themes?.length ? [...new Set(themes)] : undefined;
  if (!products && !hazards && !exposed && !duration && !prevention && !unique?.length) {
    return undefined;
  }
  return { products, hazards, exposed, duration, prevention, themes: unique };
}

export function hasReality(r?: FdsReality): boolean {
  return Boolean(compactReality(r));
}

export function parseReality(raw: unknown): FdsReality | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const themes = Array.isArray(o.themes)
    ? o.themes.filter((t): t is FdsRealityTheme =>
        FDS_REALITY_THEME_IDS.includes(t as FdsRealityTheme),
      )
    : [];
  return compactReality({
    products: o.products != null ? String(o.products) : "",
    hazards: o.hazards != null ? String(o.hazards) : "",
    exposed: o.exposed != null ? String(o.exposed) : "",
    duration: o.duration != null ? String(o.duration) : "",
    prevention: o.prevention != null ? String(o.prevention) : "",
    themes,
  });
}

export function suggestThemes(notice: Pick<FdsNotice, "pictograms" | "ppe" | "notice" | "hazards">): FdsRealityTheme[] {
  const blob = [...notice.ppe, ...notice.notice, ...notice.hazards].join(" ").toLocaleLowerCase("fr");
  const themes: FdsRealityTheme[] = ["fds", "etiquettes_clp"];
  if (notice.ppe.length || /gant|lunette|masque|casque|epi|tablier/.test(blob)) themes.push("epi");
  if (/ventil|aspir|cabine|air libre|extraction/.test(blob)) themes.push("ventilation");
  if (/collectiv|capot|confin|armoire|procédure|procedure/.test(blob)) {
    themes.push("protection_collective");
  }
  return [...new Set(themes)];
}

export function filledQuestionCount(r?: FdsReality): number {
  if (!r) return 0;
  return FDS_REALITY_QUESTIONS.filter((q) => (r[q.key] ?? "").trim()).length;
}
