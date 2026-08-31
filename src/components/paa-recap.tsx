import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { themeById } from "@/lib/code-bien-etre";
import { formatEuro, formatShortDate } from "@/lib/format";
import { LINE_STATUS, QUARTERS, quarterBudgets, sortPaaLines } from "@/lib/pgp";
import { dueSoon } from "@/lib/store";
import type { PaaLine } from "@/lib/types";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

type Filter = "toutes" | "paa" | "reportee" | "realisee";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "toutes", label: "Toutes" },
  { id: "paa", label: "Au PAA" },
  { id: "reportee", label: "Reportées" },
  { id: "realisee", label: "Réalisées" },
];

function matches(line: PaaLine, filter: Filter) {
  if (filter === "paa") return line.included && line.status !== "reportee";
  if (filter === "reportee") return !line.included || line.status === "reportee";
  if (filter === "realisee") return line.status === "realisee";
  return true;
}

function statusTone(status: PaaLine["status"]) {
  if (status === "realisee") return "low" as const;
  if (status === "reportee") return "mid" as const;
  return "accent" as const;
}

export function PaaRecap({
  lines,
  filterable = false,
  onOpenLine,
}: {
  lines: PaaLine[];
  filterable?: boolean;
  onOpenLine?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("paa");
  const shown = sortPaaLines(filterable ? lines.filter((l) => matches(l, filter)) : lines);
  const quarters = quarterBudgets(shown);
  const total = shown
    .filter((l) => l.included && l.status !== "reportee")
    .reduce((sum, l) => sum + (l.budget || 0), 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Tableau récapitulatif</h2>
          <p className="text-sm text-muted">
            {shown.length} action{shown.length > 1 ? "s" : ""} · {formatEuro(total)} engagés
            {onOpenLine
              ? " · clic sur le titre = constat, clic sur la ligne = modifier l'action"
              : ""}
          </p>
        </div>
        {filterable ? (
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-sm font-medium",
                  filter === f.id
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-2 text-muted shadow-[var(--shadow-border)]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quarters.map((q) => (
          <div key={q.id} className="rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
            <p className="text-xs text-muted">{q.label}</p>
            <p className="font-display text-lg font-semibold tabular">{formatEuro(q.budget)}</p>
            <p className="text-xs text-subtle">
              {q.count} action{q.count > 1 ? "s" : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full min-w-3xl text-left text-sm">
          <thead className="text-xs tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">N°</th>
              <th className="px-3 py-2 font-medium">Thème</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Resp.</th>
              <th className="px-3 py-2 font-medium">T.</th>
              <th className="px-3 py-2 font-medium">Échéance</th>
              <th className="px-3 py-2 font-medium">Budget</th>
              <th className="px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted">
                  Aucune action dans ce filtre.
                </td>
              </tr>
            ) : (
              shown.map((l, i) => {
                const theme = themeById(l.theme);
                const late = l.status !== "realisee" && dueSoon(l.dueDate);
                return (
                  <tr
                    key={l.id}
                    tabIndex={onOpenLine ? 0 : undefined}
                    onClick={onOpenLine ? () => onOpenLine(l.id) : undefined}
                    onKeyDown={
                      onOpenLine
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenLine(l.id);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "border-b border-border last:border-0",
                      !l.included && "text-muted",
                      onOpenLine && "cursor-pointer hover:bg-surface-2 focus-visible:bg-accent-dim",
                    )}
                  >
                    <td className="px-3 py-3 align-top tabular text-subtle">{i + 1}</td>
                    <td className="px-3 py-3 align-top">
                      <span className="text-xs text-subtle">Livre {theme.livre}</span>
                      <p>{theme.short}</p>
                    </td>
                    <td className="max-w-xs px-3 py-3 align-top">
                      {l.anomalyId ? (
                        <Link
                          to="/anomalie/$id"
                          params={{ id: l.anomalyId }}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-accent hover:underline"
                        >
                          {l.title}
                        </Link>
                      ) : l.rpsId ? (
                        <Link
                          to="/rps/$id"
                          params={{ id: l.rpsId }}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-accent hover:underline"
                        >
                          {l.title}
                        </Link>
                      ) : (
                        <p className="font-medium text-fg">{l.title}</p>
                      )}
                      <p className="text-xs text-muted">{l.measure}</p>
                    </td>
                    <td className="px-3 py-3 align-top">{l.owner || "—"}</td>
                    <td className="px-3 py-3 align-top tabular">
                      {QUARTERS.find((q) => q.id === l.quarter)?.label}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 align-top tabular",
                        late && "text-danger",
                      )}
                    >
                      {l.dueDate ? formatShortDate(l.dueDate) : "—"}
                    </td>
                    <td className="px-3 py-3 align-top tabular">{formatEuro(l.budget)}</td>
                    <td className="px-3 py-3 align-top">
                      <Badge tone={statusTone(l.status)}>
                        {LINE_STATUS.find((s) => s.id === l.status)?.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-sm font-medium">
              <td className="px-3 py-3" colSpan={6}>
                Total {filterable && filter !== "paa" ? "affiché" : "PAA"}
              </td>
              <td className="px-3 py-3 tabular">{formatEuro(total)}</td>
              <td className="px-3 py-3 text-muted">{shown.length} lignes</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
