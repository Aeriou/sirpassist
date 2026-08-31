import { supabase, supabaseConfigured } from "./supabase";
import { DEMO_WORKSPACE_ID } from "./workspace";
import { isAdminEmail } from "./plan";
import type {
  Anomaly,
  DeletedIds,
  FdsNotice,
  PgpPlan,
  RpsSituation,
  SiprUser,
  Visit,
  Workspace,
  WorkspaceCloudSnapshot,
} from "./types";

export type CloudStatus = "off" | "setup" | "ok" | "error";

export function emptyDeleted(): DeletedIds {
  return { visits: [], anomalies: [], fds: [], rps: [], paa: [] };
}

export function rememberIds(list: string[], ids: string[]): string[] {
  if (!ids.length) return list;
  const next = new Set(list);
  for (const id of ids) next.add(id);
  const arr = [...next];
  return arr.length > 4000 ? arr.slice(arr.length - 4000) : arr;
}

export function mergeDeleted(a?: DeletedIds, b?: DeletedIds): DeletedIds {
  const base = emptyDeleted();
  (Object.keys(base) as (keyof DeletedIds)[]).forEach((k) => {
    base[k] = rememberIds(a?.[k] ?? [], b?.[k] ?? []);
  });
  return base;
}

function isMissingSchema(message: string) {
  return /PGRST202|PGRST205|could not find the function|could not find the table|schema cache/i.test(
    message,
  );
}

export function buildSnapshot(input: {
  workspace: Workspace;
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps: RpsSituation[];
  pgp: PgpPlan;
  users: SiprUser[];
  deleted?: DeletedIds;
}): WorkspaceCloudSnapshot {
  const id = input.workspace.id;
  const deleted = mergeDeleted(input.deleted, emptyDeleted());
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    workspace: input.workspace,
    visits: input.visits.filter((v) => v.workspaceId === id && !v.demo && !deleted.visits.includes(v.id)),
    anomalies: input.anomalies.filter(
      (a) => a.workspaceId === id && !a.demo && !deleted.anomalies.includes(a.id),
    ),
    fds: input.fds.filter((f) => f.workspaceId === id && !f.demo && !deleted.fds.includes(f.id)),
    rps: input.rps.filter((r) => r.workspaceId === id && !r.demo && !deleted.rps.includes(r.id)),
    pgp: {
      ...input.pgp,
      lines: input.pgp.lines.filter((l) => !l.demo && !deleted.paa.includes(l.id)),
    },
    users: input.users.filter((u) => u.workspaceId === id),
    deleted,
  };
}

export async function probeAccounts(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("sipr_account_salt", { p_email: "probe@sipr.invalid" });
  if (!error) return true;
  return !isMissingSchema(error.message);
}

export async function probeCloud(): Promise<{ status: CloudStatus; accounts: boolean; error?: string }> {
  if (!supabaseConfigured || !supabase) return { status: "off", accounts: false };
  const { error } = await supabase.rpc("sipr_pull", { p_code: "____" });
  const accounts = await probeAccounts();
  if (!error) return { status: accounts ? "ok" : "setup", accounts };
  if (isMissingSchema(error.message)) return { status: "setup", accounts };
  return { status: "error", accounts, error: error.message };
}

export async function pullSnapshot(
  code: string,
): Promise<
  | { ok: true; snapshot: WorkspaceCloudSnapshot }
  | { ok: false; reason: "empty" | "setup" | "error"; error?: string }
> {
  if (!supabase) return { ok: false, reason: "error", error: "Supabase non configuré" };
  const { data, error } = await supabase.rpc("sipr_pull", { p_code: code.trim() });
  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, reason: "setup", error: error.message };
    return { ok: false, reason: "error", error: error.message };
  }
  if (!data) return { ok: false, reason: "empty" };
  const row =
    typeof data === "string"
      ? (JSON.parse(data) as { snapshot?: WorkspaceCloudSnapshot })
      : (data as { snapshot?: WorkspaceCloudSnapshot; workspace?: WorkspaceCloudSnapshot["workspace"] });
  const snap = row.snapshot ?? (row as unknown as WorkspaceCloudSnapshot);
  if (!snap || snap.v !== 1 || !snap.workspace?.id) return { ok: false, reason: "empty" };
  return { ok: true, snapshot: snap };
}

export async function pushSnapshot(
  code: string,
  workspaceId: string,
  snapshot: WorkspaceCloudSnapshot,
): Promise<{ ok: true } | { ok: false; reason: "setup" | "error"; error?: string }> {
  if (!supabase) return { ok: false, reason: "error", error: "Supabase non configuré" };
  if (workspaceId === DEMO_WORKSPACE_ID) return { ok: true };
  const { error } = await supabase.rpc("sipr_push", {
    p_code: code.trim(),
    p_workspace_id: workspaceId,
    p_snapshot: snapshot,
  });
  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, reason: "setup", error: error.message };
    return { ok: false, reason: "error", error: error.message };
  }
  return { ok: true };
}

export function mergeById<T extends { id: string }>(local: T[], remote: T[], deleted: string[] = []): T[] {
  const skip = new Set(deleted);
  const map = new Map<string, T>();
  for (const row of local) {
    if (!skip.has(row.id)) map.set(row.id, row);
  }
  for (const row of remote) {
    if (skip.has(row.id)) continue;
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

export function shouldSyncWorkspace(ws?: Workspace | null) {
  return Boolean(ws && ws.id !== DEMO_WORKSPACE_ID && ws.code);
}

export async function accountSalt(email: string): Promise<{ ok: true; salt: string } | { ok: false; reason: "missing" | "setup" | "error"; error?: string }> {
  if (!supabase) return { ok: false, reason: "error", error: "Supabase non configuré" };
  const { data, error } = await supabase.rpc("sipr_account_salt", { p_email: email.trim().toLowerCase() });
  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, reason: "setup", error: error.message };
    return { ok: false, reason: "error", error: error.message };
  }
  const salt =
    data && typeof data === "object" && "salt" in data
      ? String((data as { salt?: string }).salt ?? "")
      : "";
  if (!salt) return { ok: false, reason: "missing" };
  return { ok: true, salt };
}

export async function accountLogin(
  email: string,
  passwordHash: string,
): Promise<
  | { ok: true; user: SiprUser; snapshot?: WorkspaceCloudSnapshot; joinCode: string }
  | { ok: false; reason: "auth" | "setup" | "error"; error?: string }
> {
  if (!supabase) return { ok: false, reason: "error", error: "Supabase non configuré" };
  const { data, error } = await supabase.rpc("sipr_account_login", {
    p_email: email.trim().toLowerCase(),
    p_hash: passwordHash,
  });
  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, reason: "setup", error: error.message };
    return { ok: false, reason: "error", error: error.message };
  }
  const row = data as {
    ok?: boolean;
    join_code?: string;
    user?: SiprUser;
    snapshot?: WorkspaceCloudSnapshot;
  } | null;
  if (!row?.ok || !row.user?.id) return { ok: false, reason: "auth" };
  return {
    ok: true,
    user: {
      ...row.user,
      email: row.user.email.toLowerCase(),
      plan: isAdminEmail(row.user.email) || row.user.plan === "pro" ? "pro" : row.user.plan === "basic" ? "basic" : "trial",
    },
    snapshot: row.snapshot?.v === 1 ? row.snapshot : undefined,
    joinCode: row.join_code ?? "",
  };
}

export async function accountUpsert(user: SiprUser, joinCode: string): Promise<{ ok: true } | { ok: false; reason: "setup" | "error"; error?: string }> {
  if (!supabase) return { ok: false, reason: "error", error: "Supabase non configuré" };
  const { error } = await supabase.rpc("sipr_account_upsert", {
    p_email: user.email,
    p_user_id: user.id,
    p_name: user.name,
    p_title: user.title,
    p_level: user.level,
    p_organisation: user.organisation,
    p_kind: user.kind,
    p_workspace_id: user.homeWorkspaceId ?? user.workspaceId,
    p_join_code: joinCode,
    p_salt: user.salt,
    p_hash: user.passwordHash,
    p_plan: user.plan ?? "trial",
    p_trial_ends_at: user.trialEndsAt ?? null,
  });
  if (error) {
    if (isMissingSchema(error.message)) return { ok: false, reason: "setup", error: error.message };
    return { ok: false, reason: "error", error: error.message };
  }
  return { ok: true };
}

export async function accountSetBilling(input: {
  email: string;
  plan: "trial" | "basic" | "pro";
  customerId?: string;
  subscriptionId?: string;
}): Promise<{ ok: true } | { ok: false }> {
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("sipr_account_set_billing", {
    p_email: input.email.trim().toLowerCase(),
    p_plan: input.plan,
    p_customer: input.customerId ?? null,
    p_subscription: input.subscriptionId ?? null,
  });
  if (error) return { ok: false };
  return { ok: true };
}

