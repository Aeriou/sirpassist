import type { AdvisorLevel, SupportKind, SupportStatus, SupportTicket } from "./types";

export const SUPPORT_INBOX = "phpiheyns@hotmail.com";

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

export function mailtoDraft(t: Pick<SupportTicket, "kind" | "title" | "description" | "page" | "authorName" | "authorEmail" | "authorTitle" | "authorLevel" | "organisation" | "workspaceName">) {
  const subject = `[SiprAssist ${supportKindLabel(t.kind)}] ${t.title}`;
  const body = [
    `Type: ${supportKindLabel(t.kind)}`,
    `Titre: ${t.title}`,
    `Page: ${t.page || "—"}`,
    "",
    t.description,
    "",
    "—",
    `${t.authorName} <${t.authorEmail}>`,
    `${t.authorTitle} · N${t.authorLevel}`,
    `${t.organisation} · ${t.workspaceName}`,
    "",
    "(Joindre les captures depuis la messagerie si besoin.)",
  ].join("\n");
  return `mailto:${SUPPORT_INBOX}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
