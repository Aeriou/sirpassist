import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { THEMES, themeById } from "@/lib/code-bien-etre";
import { LEVEL_META, type RiskLevel } from "@/lib/kinney";
import { dueSoon, useSipr, useWorkspaceAnomalies, useWorkspaceVisits } from "@/lib/store";

export const Route = createFileRoute("/tableau")({ component: Tableau });

const LEVEL_ORDER: RiskLevel[] = ["extreme", "tres_eleve", "eleve", "moyen", "faible"];
const LEVEL_COLOR: Record<RiskLevel, string> = {
  extreme: "#c45c4a",
  tres_eleve: "#c46a3a",
  eleve: "#c4a04a",
  moyen: "#6a8eae",
  faible: "#5a9e72",
};

function Tableau() {
  const anomalies = useWorkspaceAnomalies();
  const visits = useWorkspaceVisits();
  const profile = useSipr((s) => s.profile);

  const byLevel = LEVEL_ORDER.map((level) => ({
    name: LEVEL_META[level].label,
    level,
    n: anomalies.filter((a) => a.kinney.level === level).length,
  }));

  const byTheme = THEMES.map((t) => ({
    name: t.short,
    n: anomalies.filter((a) => a.theme === t.id).length,
  })).filter((d) => d.n > 0);

  const open = anomalies.filter((a) => a.status !== "cloturee");
  const closed = anomalies.filter((a) => a.status === "cloturee");
  const overdue = open.filter((a) => dueSoon(a.dueDate));
  const high = anomalies.filter((a) => a.kinney.score > 200);
  const ready = overdue.length === 0 && high.every((a) => a.status === "en_cours" || a.status === "cloturee");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Tableau CPPT</h1>
        <p className="text-sm text-muted">
          Vue Chef de service SIPP — {profile.name}. Synthèse pour le CPPT et l'Inspection du
          bien-être au travail (CBE).
        </p>
      </header>

      <Card className={ready ? "bg-ok/10" : "bg-danger/10"}>
        <p className="text-xs font-medium tracking-wide text-muted">Préparation inspection CBE</p>
        <p className="mt-1 font-display text-lg font-semibold">
          {ready
            ? "Dossier défendable : priorités hautes engagées, pas d'échéance critique ouverte."
            : `${overdue.length} action(s) en retard · ${high.filter((a) => a.status === "ouverte").length} risque(s) très élevés encore ouverts.`}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{visits.length}</p>
          <p className="text-xs text-muted">Visites</p>
        </Card>
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{open.length}</p>
          <p className="text-xs text-muted">Ouvertes</p>
        </Card>
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{closed.length}</p>
          <p className="text-xs text-muted">Clôturées</p>
        </Card>
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{overdue.length}</p>
          <p className="text-xs text-muted">Retards</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display font-semibold">Répartition Kinney</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byLevel} dataKey="n" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                  {byLevel.map((d) => (
                    <Cell key={d.level} fill={LEVEL_COLOR[d.level]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#151c24",
                    border: "1px solid rgb(232 238 242 / 0.12)",
                    borderRadius: 12,
                    color: "#e8eef2",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
            {byLevel.map((d) => (
              <li key={d.level} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: LEVEL_COLOR[d.level] }} />
                {d.name} ({d.n})
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-display font-semibold">Thématiques du Code</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTheme} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgb(232 238 242 / 0.08)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8b97a4", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#8b97a4", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#151c24",
                    border: "1px solid rgb(232 238 242 / 0.12)",
                    borderRadius: 12,
                    color: "#e8eef2",
                  }}
                />
                <Bar dataKey="n" fill="#4a9e86" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-display font-semibold">Priorités à porter au CPPT</h2>
        <ul className="mt-3 divide-y divide-border">
          {anomalies
            .filter((a) => a.kinney.score > 70 && a.status !== "cloturee")
            .sort((a, b) => b.kinney.score - a.kinney.score)
            .map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link to="/anomalie/$id" params={{ id: a.id }} className="truncate font-medium hover:text-accent">
                    {a.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {themeById(a.theme).label} · score {a.kinney.score}
                  </p>
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
