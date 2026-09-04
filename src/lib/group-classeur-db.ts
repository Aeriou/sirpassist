/**
 * Classeurs partagés dans un groupe — logique SQL pure (voir
 * `group-classeur-api.ts` pour les wrappers `createServerFn`, et
 * `scripts/dryrun-group-classeur.mts` pour les tests).
 *
 * `userId` est TOUJOURS l'id de session Better Auth vérifié. Le client ne
 * choisit qu'un `workspaceId` de groupe et un `classeurId` à lui.
 *
 * Règle : tout membre ACTIF d'un groupe peut publier / mettre à jour un de ses
 * classeurs ; seul l'auteur (ou le propriétaire du groupe) peut le retirer ;
 * tout membre actif peut lire. Aucune écriture croisée.
 */
import type { Sql } from "./db";

export type GroupClasseurRow = {
  workspace_id: string;
  classeur_id: string;
  shared_by: string;
  shared_by_name: string;
  name: string;
  payload: Record<string, unknown>;
  updated_at: string;
};

type Fail = { ok: false; reason: "forbidden" | "not_found" };

/** Membre actif du groupe ? (copie locale — module sans import de valeur). */
async function activeMember(sql: Sql, workspaceId: string, userId: string): Promise<boolean> {
  const rows = await sql<{ status: string }>`
    select status from workspace_member
    where workspace_id = ${workspaceId} and user_id = ${userId}
    limit 1
  `;
  return rows[0]?.status === "active";
}

async function isGroupOwner(sql: Sql, workspaceId: string, userId: string): Promise<boolean> {
  const rows = await sql<{ owner_user_id: string }>`
    select owner_user_id from workspace where id = ${workspaceId} limit 1
  `;
  return rows[0]?.owner_user_id === userId;
}

export async function shareClasseur(
  sql: Sql,
  input: {
    workspaceId: string;
    userId: string;
    userName: string;
    classeurId: string;
    name: string;
    payload: unknown;
  },
): Promise<{ ok: true } | Fail> {
  if (!(await activeMember(sql, input.workspaceId, input.userId))) {
    return { ok: false, reason: "forbidden" };
  }
  // L'id de classeur est visible de tout membre actif (retourné par
  // listGroupClasseurs) : sans ce contrôle, n'importe quel membre pourrait
  // écraser (défigurer) le classeur publié par un autre en réutilisant son id.
  const existing = await sql<{ shared_by: string }>`
    select shared_by from group_classeur
    where workspace_id = ${input.workspaceId} and classeur_id = ${input.classeurId}
    limit 1
  `;
  if (existing[0] && existing[0].shared_by !== input.userId) {
    return { ok: false, reason: "forbidden" };
  }
  const payloadText = JSON.stringify(input.payload ?? {});
  await sql`
    insert into group_classeur
      (workspace_id, classeur_id, shared_by, shared_by_name, name, payload, updated_at)
    values
      (${input.workspaceId}, ${input.classeurId}, ${input.userId}, ${input.userName},
       ${input.name}, ${payloadText}::jsonb, now())
    on conflict (workspace_id, classeur_id) do update set
      shared_by = excluded.shared_by,
      shared_by_name = excluded.shared_by_name,
      name = excluded.name,
      payload = excluded.payload,
      updated_at = now()
  `;
  return { ok: true };
}

export async function unshareClasseur(
  sql: Sql,
  input: { workspaceId: string; userId: string; classeurId: string },
): Promise<{ ok: true } | Fail> {
  const rows = await sql<{ shared_by: string }>`
    select shared_by from group_classeur
    where workspace_id = ${input.workspaceId} and classeur_id = ${input.classeurId}
    limit 1
  `;
  if (!rows[0]) return { ok: false, reason: "not_found" };
  const mine = rows[0].shared_by === input.userId;
  const owner = mine ? false : await isGroupOwner(sql, input.workspaceId, input.userId);
  if (!mine && !owner) return { ok: false, reason: "forbidden" };
  await sql`
    delete from group_classeur
    where workspace_id = ${input.workspaceId} and classeur_id = ${input.classeurId}
  `;
  return { ok: true };
}

export async function listGroupClasseurs(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true; classeurs: GroupClasseurRow[] } | Fail> {
  if (!(await activeMember(sql, workspaceId, userId))) {
    return { ok: false, reason: "forbidden" };
  }
  const rows = await sql<GroupClasseurRow>`
    select workspace_id, classeur_id, shared_by, shared_by_name, name, payload, updated_at
    from group_classeur
    where workspace_id = ${workspaceId}
    order by updated_at desc
  `;
  return { ok: true, classeurs: rows };
}

/** Ids des classeurs de l'utilisateur déjà publiés dans un groupe donné. */
export async function mySharedClasseurIds(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<string[]> {
  const rows = await sql<{ classeur_id: string }>`
    select classeur_id from group_classeur
    where workspace_id = ${workspaceId} and shared_by = ${userId}
  `;
  return rows.map((r) => r.classeur_id);
}
