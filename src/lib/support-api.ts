import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { vBool, vOneOf, vReqStr, vStr, vStrArr } from "@/lib/validate";
import { hitRateLimit } from "./rate-limit";
import { isOwnerEmail } from "./plan-server";
import { formatGrokPrompt } from "./support";
import type { Sql } from "./db";
import type { AdvisorLevel, SupportKind, SupportStatus, SupportTicket } from "./types";

const MAX_PHOTOS = 3;
const MAX_PHOTO_CHARS = 350_000;

export type SupportSubmitInput = {
  kind: SupportKind;
  title: string;
  description: string;
  page?: string;
  photos: string[];
  authorName: string;
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
  reviewed_at: string | null;
  grok_prompt: string | null;
};

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function emailOf(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return (rows[0]?.email ?? "").trim().toLowerCase();
}

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
    status: (["envoye", "valide", "refuse", "traite"].includes(row.status)
      ? row.status
      : "envoye") as SupportStatus,
    reviewedAt: row.reviewed_at || undefined,
  };
}

function clipPhotos(photos: string[]): string[] {
  return (photos ?? [])
    .filter((p) => typeof p === "string" && p.startsWith("data:image/"))
    .slice(0, MAX_PHOTOS)
    .map((p) => (p.length > MAX_PHOTO_CHARS ? p.slice(0, MAX_PHOTO_CHARS) : p));
}

/**
 * Dépôt d'une demande de support. Authentifié : l'e-mail auteur vient de la
 * session, jamais du client. Aucun e-mail sortant — la revue se fait dans
 * l'app (`apiListSupportTickets` / `apiReviewTicket`, propriétaire seul).
 */
export const submitSupportTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SupportSubmitInput) => ({
    kind: vOneOf(input.kind, ["bug", "amelioration"] as const, "bug"),
    title: vStr(input.title, 400),
    description: vStr(input.description, 20_000),
    page: vStr(input.page, 160),
    photos: vStrArr(input.photos, MAX_PHOTOS, MAX_PHOTO_CHARS + 10_000),
    authorName: vStr(input.authorName, 160),
    authorTitle: vStr(input.authorTitle, 160),
    authorLevel: ([1, 2, 3].includes(input.authorLevel as number)
      ? input.authorLevel
      : 3) as AdvisorLevel,
    organisation: vStr(input.organisation, 200),
    workspaceName: vStr(input.workspaceName, 200),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
    const title = data.title.trim().slice(0, 160);
    const description = data.description.trim().slice(0, 8000);
    if (!title || !description) return { ok: false, error: "Titre et description obligatoires." };
    if (data.kind !== "bug" && data.kind !== "amelioration") {
      return { ok: false, error: "Type de demande inconnu." };
    }
    const sql = await getSqlClient();
    const rl = await hitRateLimit(sql, {
      bucket: "support:submit",
      subject: context.userId,
      limit: 8,
      windowSec: 3600,
    });
    if (!rl.ok) {
      return { ok: false, error: "Trop de demandes d'affilée — réessayez plus tard." };
    }
    const email = await emailOf(sql, context.userId);
    const photos = clipPhotos(data.photos);
    const id = `sup_${crypto.randomUUID().slice(0, 8)}`;
    const token = crypto.randomUUID().replace(/-/g, "");
    const prompt = formatGrokPrompt({
      id,
      kind: data.kind,
      title,
      description,
      page: data.page?.trim(),
      photos,
      authorName: data.authorName.trim().slice(0, 120),
      authorEmail: email,
      authorTitle: data.authorTitle.trim().slice(0, 120),
      authorLevel: data.authorLevel,
      organisation: data.organisation.trim().slice(0, 160),
      workspaceName: data.workspaceName.trim().slice(0, 160),
    });

    try {
      await sql`
        insert into support_tickets (
          id, kind, title, description, page, photos_json,
          author_name, author_email, author_title, author_level,
          organisation, workspace_name, status, review_token, grok_prompt, author_user_id
        ) values (
          ${id}, ${data.kind}, ${title}, ${description}, ${data.page?.trim().slice(0, 120) || null},
          ${JSON.stringify(photos)}, ${data.authorName.trim().slice(0, 120)}, ${email},
          ${data.authorTitle.trim().slice(0, 120)}, ${String(data.authorLevel)},
          ${data.organisation.trim().slice(0, 160)}, ${data.workspaceName.trim().slice(0, 160)},
          ${"envoye"}, ${token}, ${prompt}, ${context.userId}
        )
      `;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Enregistrement impossible." };
    }
    return { ok: true, id };
  });

/** Vue propriétaire : toutes les demandes + le nombre d'« Envoyées » à traiter. */
export const apiListSupportTickets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<
      | { ok: false; reason: "forbidden" }
      | { ok: true; tickets: SupportTicket[]; unreviewed: number }
    > => {
      const sql = await getSqlClient();
      if (!isOwnerEmail(await emailOf(sql, context.userId))) {
        return { ok: false, reason: "forbidden" };
      }
      const rows = await sql<TicketRow>`
        select id, kind, title, description, page, photos_json, author_name, author_email,
               author_title, author_level, organisation, workspace_name,
               created_at::text as created_at, status, reviewed_at::text as reviewed_at, grok_prompt
        from support_tickets
        order by created_at desc
        limit 200
      `;
      const tickets = rows.map(asTicket);
      return { ok: true, tickets, unreviewed: tickets.filter((t) => t.status === "envoye").length };
    },
  );

/** Revue d'une demande par le propriétaire. `prompt` = bloc à coller dans Grok. */
export const apiReviewTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; action: "valider" | "refuser" | "traiter" }) => ({ id: vReqStr(input.id, 64), action: vOneOf(input.action, ["valider", "refuser", "traiter"] as const, "traiter") }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: false; reason: "forbidden" | "not_found" }
      | { ok: true; ticket: SupportTicket; prompt: string }
    > => {
      const sql = await getSqlClient();
      if (!isOwnerEmail(await emailOf(sql, context.userId))) {
        return { ok: false, reason: "forbidden" };
      }
      const rows = await sql<TicketRow>`
        select id, kind, title, description, page, photos_json, author_name, author_email,
               author_title, author_level, organisation, workspace_name,
               created_at::text as created_at, status, reviewed_at::text as reviewed_at, grok_prompt
        from support_tickets where id = ${data.id} limit 1
      `;
      const row = rows[0];
      if (!row) return { ok: false, reason: "not_found" };
      const next: SupportStatus =
        data.action === "valider" ? "valide" : data.action === "refuser" ? "refuse" : "traite";
      await sql`
        update support_tickets set status = ${next}, reviewed_at = now() where id = ${data.id}
      `;
      const ticket = asTicket({ ...row, status: next });
      return { ok: true, ticket, prompt: row.grok_prompt || formatGrokPrompt(ticket) };
    },
  );
