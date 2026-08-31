import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RpsScoreGrid } from "@/components/rps-scores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { VisitPicker } from "@/components/visit-picker";
import {
  RPS_ATTENTION_META,
  RPS_STATUS_LABEL,
  analyzeRps,
  scanSituation,
} from "@/lib/rps";
import { lineFromRps } from "@/lib/pgp";
import { useSipr, useWorkspaceVisits } from "@/lib/store";
import { visitLabel } from "@/lib/workspace";
import type { RpsScores, RpsStatus } from "@/lib/rps";

export const Route = createFileRoute("/rps/$id")({ component: RpsDetail });

function RpsDetail() {
  const { id } = Route.useParams();
  const situation = useSipr((s) => s.rps.find((r) => r.id === id));
  const visits = useWorkspaceVisits();
  const pgp = useSipr((s) => s.pgp);
  const updateRps = useSipr((s) => s.updateRps);
  const removeRps = useSipr((s) => s.removeRps);
  const addPaaLine = useSipr((s) => s.addPaaLine);
  const updateObjective = useSipr((s) => s.updateObjective);
  const ensureVisitByName = useSipr((s) => s.ensureVisitByName);
  const navigate = useNavigate();
  const linked = useSipr((s) =>
    situation?.visitId ? s.visits.find((v) => v.id === situation.visitId) : undefined,
  );
  const alreadyInPlan = pgp.lines.some((l) => l.rpsId === id);

  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [facts, setFacts] = useState("");
  const [scores, setScores] = useState<RpsScores | null>(null);
  const [visitName, setVisitName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!situation) return;
    setTitle(situation.title);
    setUnit(situation.unit);
    setFacts(situation.facts);
    setScores(situation.scores);
    setVisitName(linked ? visitLabel(linked) : "");
  }, [situation?.id, linked]);

  const identity = useMemo(() => scanSituation({ title, unit, facts }), [title, unit, facts]);

  if (!situation || !scores) return <p className="text-muted">Analyse introuvable.</p>;
  const current = situation;
  const meta = RPS_ATTENTION_META[current.attention];

  function recompute() {
    if (identity.ok === false) {
      toast.error(identity.hint);
      return;
    }
    if (!scores) return;
    const next = analyzeRps({ facts, scores });
    const name = visitName.trim();
    updateRps(current.id, {
      title: title.trim(),
      unit: unit.trim(),
      facts: facts.trim(),
      scores,
      attention: next.attention,
      diagnosis: next.diagnosis,
      measures: next.measures,
      avoid: next.avoid,
      visitId: name ? ensureVisitByName(name) : undefined,
      reviewedAt: new Date().toISOString(),
    });
    toast.success("Lecture mise à jour.");
  }

  function toPgp() {
    if (alreadyInPlan) {
      toast.message("Déjà au plan — ouvrez les actions PAA.");
      navigate({ to: "/pgp", search: { vue: "actions" } });
      return;
    }
    const line = lineFromRps(current, pgp.paaYear);
    addPaaLine(line);
    updateObjective("psychosociaux", { enabled: true });
    toast.success("Mesure collective ajoutée au PAA (thème RPS).");
    navigate({ to: "/pgp", search: { vue: "actions", ligne: line.id } });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone === "crit" ? "crit" : meta.tone === "high" ? "high" : meta.tone === "mid" ? "mid" : "low"}>
            {meta.label}
          </Badge>
          <Badge tone="neutral">{RPS_STATUS_LABEL[current.status]}</Badge>
          {linked ? (
            <Link to="/visite/$id" params={{ id: linked.id }} className="text-sm text-accent">
              {visitLabel(linked)}
            </Link>
          ) : null}
        </div>
        <h1 className="font-display text-2xl font-semibold">{current.title}</h1>
        <p className="text-sm text-muted">{current.unit}</p>
      </header>

      <Card className="space-y-3">
        <p className="text-sm">{current.diagnosis}</p>
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted">Mesures</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {current.measures.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted">À ne pas faire</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {current.avoid.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="flex-1" onClick={toPgp}>
            {alreadyInPlan ? "Voir au PAA" : "Vers le PAA"}
          </Button>
          <Button type="button" variant="outline" className="flex-1" asChild>
            <Link to="/rps">Toutes les analyses</Link>
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display font-semibold">Compléter / réévaluer</h2>
        <Field label="Intitulé">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Unité collective">
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Faits d'organisation">
          <Textarea value={facts} onChange={(e) => setFacts(e.target.value)} />
        </Field>
        {identity.ok === false ? (
          <p className="rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">
            {identity.hits.join(" · ")}. {identity.hint}
          </p>
        ) : null}
        <RpsScoreGrid scores={scores} onChange={setScores} />
        <VisitPicker visits={visits} name={visitName} onNameChange={setVisitName} />
        <Field label="Statut">
          <NativeSelect
            value={current.status}
            onChange={(e) => updateRps(current.id, { status: e.target.value as RpsStatus })}
          >
            {(Object.keys(RPS_STATUS_LABEL) as RpsStatus[]).map((s) => (
              <option key={s} value={s}>
                {RPS_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="button" className="w-full" disabled={identity.ok === false} onClick={recompute}>
          Recalculer la lecture
        </Button>
      </Card>

      <Button
        type="button"
        variant="outline"
        className="w-full text-danger"
        onClick={() => setDeleteOpen(true)}
      >
        Supprimer cette analyse
      </Button>
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer cette analyse RPS ?"
        description="L'analyse collective et sa ligne PAA, le cas échéant, sont retirées. Aucune identité n'est enregistrée."
        confirmLabel="Supprimer l'analyse"
        onConfirm={() => {
          removeRps(current.id);
          toast.message("Analyse RPS supprimée.");
          navigate({ to: "/rps" });
        }}
      />
    </div>
  );
}
