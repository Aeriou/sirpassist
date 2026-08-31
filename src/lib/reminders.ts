import { addDays, isoDay } from "./format";
import type { AdvisorLevel, Anomaly, PaaLine, PgpPlan } from "./types";

export type ReminderKind = "approche" | "depassee";

export type Reminder = {
  id: string;
  paaLineId: string;
  title: string;
  measure: string;
  owner: string;
  dueDate: string;
  level: AdvisorLevel;
  kind: ReminderKind;
};

export function lineLevel(line: PaaLine, anomalies: Anomaly[]): AdvisorLevel {
  if (line.level) return line.level;
  const a = anomalies.find((x) => x.id === line.anomalyId);
  if (!a) return 2;
  if (a.kinney.level === "extreme" || a.kinney.level === "tres_eleve" || a.urgency === "critique") {
    return 1;
  }
  if (a.kinney.level === "eleve" || a.urgency === "haute") return 2;
  return 3;
}

export function buildReminders(plan: PgpPlan, anomalies: Anomaly[], today = isoDay()): Reminder[] {
  const horizon = addDays(today, 7);
  const out: Reminder[] = [];
  for (const line of plan.lines) {
    if (!line.included || line.status === "realisee" || !line.dueDate) continue;
    const kind: ReminderKind | null =
      line.dueDate <= today ? "depassee" : line.dueDate <= horizon ? "approche" : null;
    if (!kind) continue;
    out.push({
      id: `${line.id}:${kind}`,
      paaLineId: line.id,
      title: line.title,
      measure: line.measure,
      owner: line.owner,
      dueDate: line.dueDate,
      level: lineLevel(line, anomalies),
      kind,
    });
  }
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "depassee" ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export const LEVEL_REMINDER: Record<AdvisorLevel, { tag: string; audience: string }> = {
  1: { tag: "N1", audience: "Chef de service SIPP / CPPT" },
  2: { tag: "N2", audience: "Gestionnaire des risques" },
  3: { tag: "N3", audience: "Conseiller terrain" },
};
