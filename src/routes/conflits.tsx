import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { GitMerge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatStamp } from "@/lib/format";
import { defaultPicks, type DataConflict } from "@/lib/conflicts";
import { useSipr } from "@/lib/store";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conflits")({ component: ConflitsPage });

function ConflitsPage() {
  const allConflicts = useSipr((s) => s.conflicts);
  const resolve = useSipr((s) => s.resolveConflict);
  const reopen = useSipr((s) => s.reopenConflicts);
  const profile = useSipr((s) => s.profile);
  const activeWorkspaceId = useSipr((s) => s.activeWorkspaceId);
  const demoSpace = activeWorkspaceId === DEMO_WORKSPACE_ID;
  // Les conflits sont des données de démonstration : hors espace démo, il n'y
  // en a pas (aucun mécanisme réel ne les génère encore).
  const conflicts = demoSpace ? allConflicts : [];
  const open = conflicts.filter((c) => c.status === "ouvert");
  const done = conflicts.filter((c) => c.status === "resolu");
  const [activeId, setActiveId] = useState(open[0]?.id ?? conflicts[0]?.id);
  const active = conflicts.find((c) => c.id === activeId) ?? open[0];

  if (!demoSpace) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold md:hidden">Conflits</h1>
          <p className="text-sm text-muted">
            Écarts entre une saisie terrain et un suivi bureau sur le même constat. Les preuves
            (photo, GPS, horodatage) ne sont jamais écrasées.
          </p>
        </header>
        <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm text-ok">
          Aucun conflit. Le dossier SIPP est aligné.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:hidden">Conflits</h1>
          <p className="text-sm text-muted">
            Synchro terrain / bureau. Les preuves CBE (photo, GPS, horodatage) ne sont jamais
            écrasées. Vous tranchez mesure, statut et PAA.
          </p>
        </div>
        <Button variant="outline" onClick={() => { reopen(); toast.message("3 conflits de démo rétablis."); }}>
          Simuler une synchro
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-3">
          <p className={cn("font-display text-2xl font-semibold tabular", open.length > 0 && "text-warn")}>
            {open.length}
          </p>
          <p className="text-xs text-muted">À trancher</p>
        </Card>
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{done.length}</p>
          <p className="text-xs text-muted">Résolus</p>
        </Card>
        <Card className="col-span-2 p-3 md:col-span-1">
          <p className="text-xs text-muted">Règle</p>
          <p className="text-sm">Preuve terrain + suivi bureau, champ par champ.</p>
        </Card>
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm text-ok">
          Aucun conflit ouvert. Le dossier SIPP est aligné.
        </p>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="space-y-2">
          {conflicts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "w-full rounded-xl px-3 py-3 text-left shadow-[var(--shadow-border)]",
                  c.id === active?.id ? "bg-accent-dim" : "bg-surface",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Badge tone={c.status === "ouvert" ? "mid" : "low"}>
                    {c.status === "ouvert" ? "Ouvert" : "Résolu"}
                  </Badge>
                  <Badge tone="neutral">{c.entity === "paa" ? "PAA" : "Constat"}</Badge>
                </span>
                <span className="mt-1 block text-sm font-medium">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>

        {active ? (
          <ConflictCard
            key={active.id}
            conflict={active}
            actor={`${profile.name} · N${profile.level}`}
            onResolve={(mode, picks) => {
              resolve(active.id, mode, picks, `${profile.name} · N${profile.level}`);
              toast.success(
                mode === "fusion"
                  ? "Fusion enregistrée."
                  : mode === "terrain"
                    ? "Version terrain conservée."
                    : "Version bureau conservée.",
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ConflictCard({
  conflict,
  onResolve,
  actor,
}: {
  conflict: DataConflict;
  actor: string;
  onResolve: (mode: "terrain" | "bureau" | "fusion", picks: Record<string, "local" | "remote">) => void;
}) {
  const [picks, setPicks] = useState(() => defaultPicks(conflict));
  const frozen = conflict.status === "resolu";
  const shown = frozen && conflict.picks ? conflict.picks : picks;

  return (
    <Card className="min-w-0 space-y-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-accent">{conflict.subtitle}</p>
        <h2 className="mt-1 font-display text-xl font-semibold">{conflict.title}</h2>
        <p className="mt-2 text-sm text-muted">
          Terrain · {conflict.localBy}
          {conflict.localAt ? ` · ${safeStamp(conflict.localAt)}` : ""}
        </p>
        <p className="text-sm text-muted">
          Bureau · {conflict.remoteBy}
          {conflict.remoteAt ? ` · ${safeStamp(conflict.remoteAt)}` : ""}
        </p>
      </div>

      <div className="overflow-x-auto hidden min-w-0 rounded-xl bg-surface-2 shadow-[var(--shadow-border)] md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">Champ</th>
              <th className="px-3 py-2 font-medium">Terrain</th>
              <th className="px-3 py-2 font-medium">Bureau</th>
            </tr>
          </thead>
          <tbody>
            {conflict.fields.map((f) => {
              const pick = shown[f.key] ?? f.recommend;
              return (
                <tr key={f.key} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{f.label}</p>
                    <p className="text-xs text-subtle">{f.reason}</p>
                  </td>
                  <td className="px-3 py-3">
                    <FieldPick
                      active={pick === "local"}
                      disabled={frozen}
                      onSelect={() => setPicks({ ...picks, [f.key]: "local" })}
                      text={f.local}
                      tag={f.recommend === "local" ? "conseillé" : undefined}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <FieldPick
                      active={pick === "remote"}
                      disabled={frozen}
                      onSelect={() => setPicks({ ...picks, [f.key]: "remote" })}
                      text={f.remote}
                      tag={f.recommend === "remote" ? "conseillé" : undefined}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {conflict.fields.map((f) => {
          const pick = shown[f.key] ?? f.recommend;
          return (
            <li key={f.key} className="rounded-xl bg-surface-2 p-3">
              <p className="font-medium">{f.label}</p>
              <p className="mb-2 text-xs text-subtle">{f.reason}</p>
              <div className="grid gap-2">
                <FieldPick
                  active={pick === "local"}
                  disabled={frozen}
                  onSelect={() => setPicks({ ...picks, [f.key]: "local" })}
                  text={`Terrain · ${f.local}`}
                  tag={f.recommend === "local" ? "conseillé" : undefined}
                />
                <FieldPick
                  active={pick === "remote"}
                  disabled={frozen}
                  onSelect={() => setPicks({ ...picks, [f.key]: "remote" })}
                  text={`Bureau · ${f.remote}`}
                  tag={f.recommend === "remote" ? "conseillé" : undefined}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {frozen ? (
        <p className="text-sm text-muted">
          Tranché · {conflict.resolution === "fusion" ? "fusion" : conflict.resolution} ·{" "}
          {conflict.resolvedBy}
          {conflict.resolvedAt ? ` · ${safeStamp(conflict.resolvedAt)}` : ""}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onResolve("fusion", picks)}>
            <GitMerge />
            Fusionner
          </Button>
          <Button variant="secondary" onClick={() => onResolve("terrain", picks)}>
            Tout terrain
          </Button>
          <Button variant="outline" onClick={() => onResolve("bureau", picks)}>
            Tout bureau
          </Button>
          {conflict.entity === "anomaly" ? (
            <Button variant="ghost" asChild>
              <Link to="/anomalie/$id" params={{ id: conflict.entityId }}>
                Voir le constat
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link to="/pgp">Voir le PAA</Link>
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-subtle">Décision : {actor}. Journal conservé pour le CPPT / CBE.</p>
    </Card>
  );
}

function FieldPick({
  active,
  disabled,
  onSelect,
  text,
  tag,
}: {
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  text: string;
  tag?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full min-h-11 rounded-lg px-2.5 py-2 text-left text-sm",
        active ? "bg-accent text-accent-fg" : "bg-surface text-fg shadow-[var(--shadow-border)]",
        disabled && "cursor-default",
      )}
    >
      {tag ? <span className="mb-1 block text-xs opacity-80">{tag}</span> : null}
      {text}
    </button>
  );
}

function safeStamp(iso: string) {
  try {
    return formatStamp(new Date(iso));
  } catch {
    return iso;
  }
}
