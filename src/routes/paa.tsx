import { createFileRoute, Link } from "@tanstack/react-router";
import { THEMES, themeById } from "@/lib/code-bien-etre";
import { formatDate, formatEuro, formatShortDate } from "@/lib/format";
import { LINE_STATUS, PLAN_STATUS, budgetCommitted, includedLines } from "@/lib/pgp";
import { useSipr } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaaRecap } from "@/components/paa-recap";

export const Route = createFileRoute("/paa")({ component: PaaDocument });

function PaaDocument() {
  const pgp = useSipr((s) => s.pgp);
  const profile = useSipr((s) => s.profile);
  const lines = includedLines(pgp);
  const committed = budgetCommitted(pgp);
  const byTheme = THEMES.map((t) => ({
    theme: t,
    items: lines.filter((l) => l.theme === t.id),
    goal: pgp.objectives.find((o) => o.theme === t.id),
  })).filter((g) => g.items.length > 0 || g.goal?.enabled);
  const status = PLAN_STATUS.find((s) => s.id === pgp.status)?.label ?? pgp.status;

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent">
            Plan annuel d'action {pgp.paaYear}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold">{pgp.company}</h1>
          <p className="text-sm text-muted">
            Issu du PGP {pgp.pgpStart}–{pgp.pgpEnd} · {status}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/pgp" search={{ vue: "actions" }}>Retour au plan</Link>
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimer / PDF
          </Button>
        </div>
      </header>

      <Card className="grid gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted">Employeur · </span>
          {pgp.employer}
        </p>
        <p>
          <span className="text-muted">Travailleurs · </span>
          {pgp.workers}
        </p>
        <p>
          <span className="text-muted">SIPP · </span>
          {pgp.sipp}
        </p>
        <p>
          <span className="text-muted">Médecine du travail · </span>
          {pgp.physician}
        </p>
        <p>
          <span className="text-muted">CPPT · </span>
          {formatDate(pgp.cpptDate)}
        </p>
        <p>
          <span className="text-muted">Enveloppe · </span>
          {formatEuro(committed)} / {formatEuro(pgp.budget)}
        </p>
        <p className="sm:col-span-2">
          <span className="text-muted">Rédigé par · </span>
          {profile.name}, {profile.title}
        </p>
      </Card>

      {pgp.notes ? <p className="text-sm text-muted">{pgp.notes}</p> : null}

      <PaaRecap lines={lines} />

      {byTheme.map(({ theme, items, goal }) => (
        <section key={theme.id} className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{theme.label}</h2>
            <p className="text-xs text-subtle">Code du bien-être — Livre {theme.livre}</p>
            {goal?.enabled ? (
              <p className="mt-2 text-sm">
                <span className="text-muted">Objectif · </span>
                {goal.goal}
                <span className="mt-1 block text-muted">Indicateur · {goal.indicator}</span>
              </p>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted">Aucune action retenue cette année.</p>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-3xl text-left text-sm">
                <thead className="text-xs tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Mesure</th>
                    <th className="px-3 py-2 font-medium">Resp.</th>
                    <th className="px-3 py-2 font-medium">T.</th>
                    <th className="px-3 py-2 font-medium">Budget</th>
                    <th className="px-3 py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium">{l.title}</p>
                        <p className="text-xs text-subtle">
                          {l.origin === "visite" ? "Visite" : "PGP"}
                          {l.dueDate ? ` · ${formatShortDate(l.dueDate)}` : ""}
                        </p>
                      </td>
                      <td className="max-w-xs px-3 py-3 align-top text-muted">{l.measure}</td>
                      <td className="px-3 py-3 align-top">{l.owner || "—"}</td>
                      <td className="px-3 py-3 align-top tabular">{l.quarter.replace("Q", "T")}</td>
                      <td className="px-3 py-3 align-top tabular">{formatEuro(l.budget)}</td>
                      <td className="px-3 py-3 align-top">
                        <Badge tone={l.status === "realisee" ? "low" : "accent"}>
                          {LINE_STATUS.find((s) => s.id === l.status)?.label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      ))}

      <p className="text-xs text-subtle">
        Document destiné au CPPT et au dossier SIPP. Les actions reportées n'apparaissent pas dans
        ce PAA. Thématiques :{" "}
        {pgp.objectives
          .filter((o) => o.enabled)
          .map((o) => themeById(o.theme).short)
          .join(", ")}
        .
      </p>
    </article>
  );
}
