import type { Visit, Workspace } from "./types";

export const DEMO_WORKSPACE_ID = "ws-demo";

export function normalizeVisitName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export function visitLabel(v: Pick<Visit, "name" | "company" | "site">): string {
  return (v.name || v.company).trim();
}

export function visitWorkspaceId(item: { workspaceId?: string }): string {
  return item.workspaceId || DEMO_WORKSPACE_ID;
}

export function matchVisitByName<T extends { name?: string; company: string }>(
  visits: T[],
  name: string,
): T | undefined {
  const key = normalizeVisitName(name);
  if (!key) return undefined;
  const exact = visits.find((v) => normalizeVisitName(v.name || v.company) === key);
  if (exact) return exact;
  return undefined;
}

export function genOrgCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]!).join("");
}

export function workspaceKindLabel(kind: Workspace["kind"]): string {
  return kind === "entreprise" ? "Entreprise / groupe" : "Indépendant";
}
