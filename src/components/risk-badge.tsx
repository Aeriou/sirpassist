import { LEVEL_META, type RiskLevel } from "@/lib/kinney";
import { URGENCY_META, type ThemeId, themeById } from "@/lib/code-bien-etre";
import type { AnomalyStatus, Urgency } from "@/lib/types";
import { Badge } from "./ui/badge";

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const meta = LEVEL_META[level];
  return (
    <Badge tone={meta.tone}>
      {score !== undefined ? <span className="tabular">{score}</span> : null}
      {meta.label}
    </Badge>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const tone =
    urgency === "critique" || urgency === "haute"
      ? "high"
      : urgency === "moyenne"
        ? "mid"
        : "low";
  return <Badge tone={tone}>{URGENCY_META[urgency].label}</Badge>;
}

export function StatusBadge({ status }: { status: AnomalyStatus }) {
  const map: Record<AnomalyStatus, { label: string; tone: "neutral" | "accent" | "low" | "mid" | "high" }> = {
    brouillon: { label: "Brouillon", tone: "neutral" },
    ouverte: { label: "Ouverte", tone: "high" },
    validee: { label: "Validée", tone: "accent" },
    en_cours: { label: "En cours", tone: "mid" },
    cloturee: { label: "Clôturée", tone: "low" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ThemeChip({ id }: { id: ThemeId }) {
  const t = themeById(id);
  return (
    <Badge tone="neutral">
      Livre {t.livre} · {t.short}
    </Badge>
  );
}
