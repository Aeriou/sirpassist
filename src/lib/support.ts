import type { AdvisorLevel, SupportKind, SupportStatus } from "./types";

export const SUPPORT_KINDS: { id: SupportKind; label: string; hint: string }[] = [
  {
    id: "bug",
    label: "Signaler un bug",
    hint: "Quelque chose ne fonctionne pas, se bloque ou affiche une erreur.",
  },
  {
    id: "amelioration",
    label: "Suggérer une amélioration",
    hint: "Une idée, un écran manquant, un raccourci, une exportation…",
  },
];

export function supportKindLabel(kind: SupportKind) {
  return kind === "bug" ? "Bug" : "Amélioration";
}

export function supportStatusLabel(status: SupportStatus) {
  if (status === "valide") return "Validée";
  if (status === "refuse") return "Refusée";
  if (status === "traite") return "Traitée";
  return "Envoyée";
}

export function formatGrokPrompt(t: {
  id: string;
  kind: SupportKind;
  title: string;
  description: string;
  page?: string;
  photos: string[];
  authorName: string;
  authorEmail: string;
  authorTitle: string;
  authorLevel: AdvisorLevel;
  organisation: string;
  workspaceName: string;
}) {
  return [
    `TÂCHE SIPRASSIST VALIDÉE (${t.kind === "bug" ? "bug" : "amélioration"})`,
    `id: ${t.id}`,
    `titre: ${t.title}`,
    `page: ${t.page || "(non indiquée)"}`,
    `auteur: ${t.authorName} <${t.authorEmail}> — ${t.authorTitle}, N${t.authorLevel}`,
    `espace: ${t.organisation} · ${t.workspaceName}`,
    `captures: ${t.photos.length}`,
    "",
    t.description.trim(),
    "",
    "Consignes: réalise cette tâche dans SiprAssist, vérifie dans l'aperçu, renvoie-moi le lien de la version modifiée. Ne mets pas à jour le serveur officiel tant que je n'ai pas validé ce lien.",
  ].join("\n");
}

