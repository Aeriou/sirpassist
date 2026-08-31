import { createServerFn } from "@tanstack/react-start";
import { formatGrokPrompt, SUPPORT_INBOX, supportKindLabel } from "./support";
import type { AdvisorLevel, SupportKind, SupportStatus, SupportTicket } from "./types";

const MAX_PHOTOS = 3;
const MAX_PHOTO_CHARS = 350_000;

export type SupportSubmitInput = {
  origin: string;
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
};

type TicketRow = {
  id: string;
  kind: string;
  title: string;
  description: string;
  page: string | null;
  photos_json: string;
  author_name: string;
  author_email: string;
  author_title: string;
  author_level: string;
  organisation: string;
  workspace_name: string;
  created_at: string;
  status: string;
  review_token: string;
  reviewed_at: string | null;
  grok_prompt: string | null;
};

function asTicket(row: TicketRow): SupportTicket {
  let photos: string[] = [];
  try {
    const parsed = JSON.parse(row.photos_json) as unknown;
    if (Array.isArray(parsed)) photos = parsed.filter((p) => typeof p === "string");
  } catch {
    photos = [];
  }
  return {
    id: row.id,
    kind: row.kind === "amelioration" ? "amelioration" : "bug",
    title: row.title,
    description: row.description,
    page: row.page || undefined,
    photos,
    authorName: row.author_name,
    authorEmail: row.author_email,
    authorTitle: row.author_title,
    authorLevel: (Number(row.author_level) as AdvisorLevel) || 3,
    organisation: row.organisation,
    workspaceName: row.workspace_name,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    status: (row.status as SupportStatus) || "envoye",
    reviewedAt: row.reviewed_at || undefined,
  };
}

function sanitizeOrigin(origin: string) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

function clipPhotos(photos: string[]) {
  return photos
    .filter((p) => typeof p === "string" && p.startsWith("data:image/"))
    .slice(0, MAX_PHOTOS)
    .map((p) => (p.length > MAX_PHOTO_CHARS ? p.slice(0, MAX_PHOTO_CHARS) : p));
}

async function sendPublisherMail(input: {
  subject: string;
  replyTo: string;
  text: string;
}) {
  const res = await fetch(`https://formsubmit.co/ajax/${SUPPORT_INBOX}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      _subject: input.subject,
      _template: "box",
      _captcha: "false",
      name: "SiprAssist",
      email: input.replyTo,
      message: input.text,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 180) || `Envoi mail ${res.status}`);
  }
}

export const submitSupportTicket = createServerFn({ method: "POST" })
  .validator((input: SupportSubmitInput) => input)
  .handler(async ({ data }): Promise<{ ok: true; id: string; mailed: boolean } | { ok: false; error: string }> => {
    const title = data.title.trim().slice(0, 160);
    const description = data.description.trim().slice(0, 8000);
    const email = data.authorEmail.trim().toLowerCase();
    if (!title || !description) return { ok: false, error: "Titre et description obligatoires." };
    if (!email.includes("@")) return { ok: false, error: "E-mail du compte invalide." };
    if (data.kind !== "bug" && data.kind !== "amelioration") {
      return { ok: false, error: "Type de demande inconnu." };
    }
    const origin = sanitizeOrigin(data.origin);
    const photos = clipPhotos(data.photos ?? []);
    const id = `sup_${crypto.randomUUID().slice(0, 8)}`;
    const token = crypto.randomUUID().replace(/-/g, "");
    const prompt = formatGrokPrompt({
      id,
      kind: data.kind,
      title,
      description,
      page: data.page?.trim(),
      photos,
      authorName: data.authorName.trim(),
      authorEmail: email,
      authorTitle: data.authorTitle.trim(),
      authorLevel: data.authorLevel,
      organisation: data.organisation.trim(),
      workspaceName: data.workspaceName.trim(),
    });

    try {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      await sql`
        insert into support_tickets (
          id, kind, title, description, page, photos_json,
          author_name, author_email, author_title, author_level,
          organisation, workspace_name, status, review_token, grok_prompt
        ) values (
          ${id}, ${data.kind}, ${title}, ${description}, ${data.page?.trim() || null},
          ${JSON.stringify(photos)}, ${data.authorName.trim()}, ${email},
          ${data.authorTitle.trim()}, ${String(data.authorLevel)},
          ${data.organisation.trim()}, ${data.workspaceName.trim()},
          ${"envoye"}, ${token}, ${prompt}
        )
      `;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Enregistrement impossible.",
      };
    }

    const revue = origin ? `${origin}/support/revue?id=${id}&token=${token}` : "";
    const text = [
      `Nouvelle demande SiprAssist — ${supportKindLabel(data.kind)}`,
      "",
      `Titre: ${title}`,
      `Page: ${data.page?.trim() || "—"}`,
      `Captures: ${photos.length}`,
      "",
      description,
      "",
      "Auteur",
      `${data.authorName.trim()} <${email}>`,
      `${data.authorTitle.trim()} · N${data.authorLevel}`,
      `${data.organisation.trim()} · ${data.workspaceName.trim()}`,
      "",
      revue
        ? [
            "Valider (envoie la tâche à Grok, lien d'aperçu ensuite, serveur officiel seulement après votre OK):",
            `${revue}&action=valider`,
            "",
            "Refuser:",
            `${revue}&action=refuser`,
            "",
            "Voir la demande (captures):",
            revue,
          ].join("\n")
        : "Ouvrez Support dans SiprAssist pour valider ou refuser.",
      "",
      "Premier e-mail FormSubmit: confirmez l'activation dans Hotmail si demandé.",
    ].join("\n");

    let mailed = false;
    try {
      await sendPublisherMail({
        subject: `[SiprAssist ${supportKindLabel(data.kind)}] ${title}`,
        replyTo: email,
        text,
      });
      mailed = true;
    } catch {
      mailed = false;
    }

    return { ok: true, id, mailed };
  });

export const reviewSupportTicket = createServerFn({ method: "POST" })
  .validator((input: { id: string; token: string; action?: "valider" | "refuser" | "lire" }) => input)
  .handler(async ({ data }): Promise<
    | { ok: true; ticket: SupportTicket; prompt: string; status: SupportStatus }
    | { ok: false; error: string }
  > => {
    const id = data.id.trim();
    const token = data.token.trim();
    if (!id || !token) return { ok: false, error: "Lien incomplet." };
    try {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql<TicketRow>`
        select * from support_tickets where id = ${id} and review_token = ${token} limit 1
      `;
      const row = rows[0];
      if (!row) return { ok: false, error: "Lien invalide ou demande introuvable." };
      const action = data.action ?? "lire";
      if (action === "lire") {
        return {
          ok: true,
          ticket: asTicket(row),
          prompt: row.grok_prompt || formatGrokPrompt(asTicket(row)),
          status: (row.status as SupportStatus) || "envoye",
        };
      }
      if (row.status === "valide" || row.status === "refuse") {
        return {
          ok: true,
          ticket: asTicket(row),
          prompt: row.grok_prompt || formatGrokPrompt(asTicket(row)),
          status: row.status,
        };
      }
      const next: SupportStatus = action === "valider" ? "valide" : "refuse";
      const ticket = asTicket({ ...row, status: next });
      const prompt = row.grok_prompt || formatGrokPrompt(ticket);
      await sql`
        update support_tickets
        set status = ${next}, reviewed_at = now()
        where id = ${id} and review_token = ${token}
      `;
      const text =
        next === "valide"
          ? [
              `Demande ${id} VALIDÉE.`,
              "",
              "Collez le bloc suivant dans votre conversation SiprAssist sur Grok.",
              "Grok réalise la tâche et vous renvoie le lien d'aperçu.",
              "Le serveur officiel n'est mis à jour qu'après votre validation de ce lien.",
              "",
              "-----",
              prompt,
              "-----",
            ].join("\n")
          : [
              `Demande ${id} REFUSÉE.`,
              `Titre: ${ticket.title}`,
              `Auteur: ${ticket.authorName} <${ticket.authorEmail}>`,
              "Aucune tâche n'est envoyée à Grok.",
            ].join("\n");
      try {
        await sendPublisherMail({
          subject:
            next === "valide"
              ? `[SiprAssist] Validée — coller dans Grok · ${ticket.title}`
              : `[SiprAssist] Refusée · ${ticket.title}`,
          replyTo: ticket.authorEmail,
          text,
        });
      } catch {
        /* confirmation mail is best-effort */
      }
      return { ok: true, ticket: { ...ticket, status: next }, prompt, status: next };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Revue impossible.",
      };
    }
  });
