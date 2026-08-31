/** Risques psychosociaux — analyse collective (Code du bien-être, Livre I, Titre 3). */

export const RPS_DIMENSIONS = [
  {
    id: "charge",
    label: "Charge de travail",
    question: "La charge est-elle tenable et répartie sur le collectif ?",
    hint: "Volume, délais, concentration sur une partie des postes — pas « qui travaille plus ».",
  },
  {
    id: "relais",
    label: "Relais et pauses",
    question: "Les pauses et absences du poste sont-elles relayées ?",
    hint: "Le poste reste-t-il tenu ? Un relais de fonction existe-t-il ?",
  },
  {
    id: "roles",
    label: "Rôles et priorités",
    question: "Les responsabilités et priorités sont-elles claires pour l'équipe ?",
    hint: "Qui fait quoi au poste, pas qui est « sérieux ».",
  },
  {
    id: "reconnaissance",
    label: "Reconnaissance",
    question: "Le travail accompli est-il visible et reconnu ?",
    hint: "Brief, indicateurs de flux, CPPT — pas un jugement de mérite individuel.",
  },
  {
    id: "climat",
    label: "Climat collectif",
    question: "Peut-on parler des tensions d'organisation sans viser quelqu'un ?",
    hint: "Climat d'équipe, pas un conflit nommé.",
  },
  {
    id: "moyens",
    label: "Moyens et effectif",
    question: "Les effectifs et moyens suffisent-ils pour le volume ?",
    hint: "Polyvalence, remplacement, outils — pas le rythme personnel.",
  },
] as const;

export type RpsDimensionId = (typeof RPS_DIMENSIONS)[number]["id"];

export const RPS_SCALE = [
  { value: 0, label: "OK", hint: "Non observé ou tenable" },
  { value: 1, label: "Veille", hint: "À surveiller" },
  { value: 2, label: "Tension", hint: "Le collectif craque" },
  { value: 3, label: "Critique", hint: "Intervention" },
] as const;

export type RpsScore = 0 | 1 | 2 | 3;
export type RpsAttention = "veille" | "attention" | "intervention" | "urgence";
export type RpsStatus = "ouverte" | "en_cours" | "reevaluee" | "cloturee";

export type RpsScores = Record<RpsDimensionId, RpsScore>;

export function emptyScores(): RpsScores {
  return { charge: 0, relais: 0, roles: 0, reconnaissance: 0, climat: 0, moyens: 0 };
}

export const RPS_ATTENTION_META: Record<
  RpsAttention,
  { label: string; tone: "low" | "mid" | "high" | "crit" }
> = {
  veille: { label: "Veille", tone: "low" },
  attention: { label: "Attention", tone: "mid" },
  intervention: { label: "Intervention", tone: "high" },
  urgence: { label: "Urgence collective", tone: "crit" },
};

export const RPS_STATUS_LABEL: Record<RpsStatus, string> = {
  ouverte: "Ouverte",
  en_cours: "En cours",
  reevaluee: "Réévaluée",
  cloturee: "Clôturée",
};

const ALWAYS_AVOID = [
  "Nommer, ficher ou photographier des travailleurs.",
  "Contrôler les pauses ou la cafétéria de personnes identifiées.",
  "Transformer le SIPP en outil disciplinaire ou de surveillance.",
  "Traiter une souffrance individuelle dans cet outil — personne de confiance / CP aspects psychosociaux, sous secret.",
];

const FIRST_NAMES = new Set(
  [
    "marc", "luc", "sophie", "jean", "pierre", "marie", "ahmed", "mohamed", "fatima",
    "kevin", "thomas", "laura", "emma", "lucas", "louis", "julie", "nicolas", "francois",
    "françois", "philippe", "michel", "patrick", "isabelle", "nathalie", "christophe",
    "david", "sarah", "ali", "youssef", "jan", "piet", "els", "koen", "bart", "lies",
    "anne", "paul", "lucie", "hugo", "lea", "léa", "chloe", "chloé", "maxime", "vincent",
    "olivier", "caroline", "elodie", "élodie", "karim", "amina", "yasmine", "noah", "liam",
    "camille", "alexandre", "antoine", "guillaume", "stephanie", "stéphanie", "laurent",
  ].map((s) => s.normalize("NFD").replace(/\p{M}/gu, "")),
);

const ROLE_OK = /\b(atelier|production|equipe|équipe|poste|pause|cafeteria|cafétéria|chef|ligne|shift|cppt|sipp|pgp|paa|fds|cbe|conseiller|prevention|prévention|travailleur|travailleurs|collectif|direction|rh|belgique|charleroi|liege|liège|bruxelles|sprl|sa|nv|code|livre)\b/i;

export function scanIdentity(text: string): { ok: true } | { ok: false; hits: string[]; hint: string } {
  const raw = text.trim();
  if (!raw) return { ok: true };
  const hits = new Set<string>();

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)) hits.add("adresse e-mail");
  if (/\b\d{2}[.\s-]?\d{2}[.\s-]?\d{2}[.\s-]?\d{3}[.\s-]?\d{2}\b/.test(raw)) hits.add("numéro d'identification");
  if (/\b(monsieur|madame|mademoiselle|m\.|mme|mr|mevrouw|meneer)\s+[A-ZÉÈÀÂÙÛÎÏÇ]/i.test(raw)) {
    hits.add("civilité + nom");
  }
  if (/\b(s['']appelle|nommé[e]?|prénom|le nommé|la nommée|collègue\s+[A-ZÉÈ])/i.test(raw)) {
    hits.add("identification nominative");
  }

  const tokens = raw.split(/[^\p{L}'-]+/u).filter(Boolean);
  for (const tok of tokens) {
    const key = tok.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (FIRST_NAMES.has(key) && !ROLE_OK.test(tok)) hits.add(`prénom « ${tok} »`);
  }

  if (hits.size === 0) return { ok: true };
  return {
    ok: false,
    hits: [...hits],
    hint: "Décrivez le poste, l'équipe ou la ligne — jamais une personne. Ex. : « le poste n'est pas relayé pendant les pauses » plutôt que « Luc reste à la cafétéria ».",
  };
}

export function scanSituation(parts: { title?: string; unit?: string; facts?: string }) {
  return scanIdentity([parts.title, parts.unit, parts.facts].filter(Boolean).join("\n"));
}

export function attentionFrom(scores: RpsScores): RpsAttention {
  const values = Object.values(scores);
  const max = Math.max(...values);
  const hot = values.filter((n) => n >= 3).length;
  const mean = values.reduce<number>((a, b) => a + b, 0) / values.length;
  if (hot >= 2 || (max >= 3 && mean >= 1.8)) return "urgence";
  if (max >= 3 || mean >= 1.6) return "intervention";
  if (max >= 2) return "attention";
  return "veille";
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

export function analyzeRps(input: { facts: string; scores: RpsScores }): {
  attention: RpsAttention;
  diagnosis: string;
  measures: string[];
  avoid: string[];
} {
  const { scores } = input;
  const attention = attentionFrom(scores);
  const parts: string[] = [];
  const measures: string[] = [];

  if (scores.charge >= 2 && scores.relais >= 2) {
    parts.push(
      "Déséquilibre de charge : le poste n'est pas absorbé quand une partie du collectif n'est pas au poste (pauses, cafétéria, absences). Ce n'est pas un jugement sur des personnes — c'est un défaut d'organisation du relais.",
    );
    measures.push(
      "Formaliser un planning de pauses avec relais de fonction : le poste n'est jamais découvert (titulaire de relais = rôle, pas un nom à surveiller).",
    );
    measures.push(
      "Objectiver la charge par poste et par shift (unités, dossiers, appels) — jamais par travailleur nommé.",
    );
  } else if (scores.charge >= 2) {
    parts.push("La charge quantitative n'est plus tenable pour le collectif sur ce périmètre.");
    measures.push("Cartographier la charge par poste (volume / shift) et la présenter au CPPT.");
  } else if (scores.relais >= 2) {
    parts.push("Les temps de pause ou d'absence ne sont pas relayés : le flux repose sur qui reste au poste.");
    measures.push("Organiser un relais de poste pendant les pauses (polyvalence, remplacement de fonction).");
  }

  if (scores.reconnaissance >= 2) {
    parts.push(
      "Le travail livré n'est pas rendu visible. Le risque n'est pas le « mérite » d'une personne, c'est l'absence d'un rituel collectif de reconnaissance.",
    );
    measures.push(
      "Point d'équipe court (hebdo) : priorités du shift + ce qui a été livré. Compte-rendu anonyme au CPPT si besoin.",
    );
  }

  if (scores.roles >= 2) {
    parts.push("Les rôles et priorités ne sont pas assez clairs : la charge se pose par défaut sur qui « prend ».");
    measures.push("Afficher au poste les 3 priorités du shift et le qui-fait-quoi de fonction (pas nominatif).");
  }

  if (scores.climat >= 2) {
    parts.push("Le climat ne permet pas de parler de l'organisation sans que cela devienne personnel.");
    measures.push("Cadre d'échange collectif (équipe / CPPT) centré sur les faits d'organisation, pas sur des personnes.");
  }

  if (scores.moyens >= 2) {
    parts.push("L'effectif ou les moyens ne couvrent pas le volume : la surcharge est structurelle.");
    measures.push("Réviser l'effectif / la polyvalence avec l'employeur (obligation de moyens, Livre I Titre 3).");
  }

  if (parts.length === 0) {
    parts.push(
      "Aucun levier critique pour l'instant. Conserver une veille collective (charge, relais, reconnaissance) et documenter au CPPT si la situation évolue.",
    );
    measures.push("Maintenir un indicateur simple de charge par poste, revu trimestriellement.");
  }

  parts.push(
    "Si une personne souffre : l'orienter vers la personne de confiance ou le conseiller en prévention aspects psychosociaux — hors de cet outil, sous secret professionnel.",
  );

  return {
    attention,
    diagnosis: parts.join(" "),
    measures: unique(measures).slice(0, 6),
    avoid: ALWAYS_AVOID,
  };
}

export const RPS_EXAMPLE = {
  title: "Répartition de charge — ligne / pauses",
  unit: "Atelier 3 — équipe de jour",
  facts:
    "Sur une ligne, le poste reste tenu pendant les pauses et les passages en cafétéria. La charge se concentre sur qui reste. Peu de feedback collectif sur le travail livré. Signes de surcharge (heures, tensions d'équipe) sans qu'un relais de fonction soit organisé.",
  scores: {
    charge: 3,
    relais: 3,
    roles: 1,
    reconnaissance: 2,
    climat: 1,
    moyens: 1,
  } satisfies RpsScores,
};

export const RPS_CHARTER = [
  "On décrit une organisation (poste, équipe, ligne), jamais une personne.",
  "Pas de nom, photo de visage, e-mail, ni numéro d'identification.",
  "Les mesures visent le relais, la charge et la reconnaissance — pas la discipline.",
  "Souffrance individuelle → personne de confiance / CP aspects psychosociaux, hors outil.",
] as const;
