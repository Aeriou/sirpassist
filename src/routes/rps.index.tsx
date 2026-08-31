import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArchiveMenu } from "@/components/archive-menu";
import { PlanBanner } from "@/components/plan-banner";
import { RpsCard } from "@/components/rps-card";
import { RpsScoreGrid } from "@/components/rps-scores";
import { VoiceCapture } from "@/components/voice-capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { VisitPicker } from "@/components/visit-picker";
import {
  RPS_ATTENTION_META,
  RPS_CHARTER,
  RPS_EXAMPLE,
  analyzeRps,
  emptyScores,
  scanSituation,
} from "@/lib/rps";
import { useSipr, useWorkspaceRps, useWorkspaceVisits } from "@/lib/store";
import { blockedMessage } from "@/lib/plan";
import { usePlan } from "@/lib/use-plan";
import { visitLabel } from "@/lib/workspace";
import type { RpsScores } from "@/lib/rps";
import { Route as RpsLayoutRoute } from "./rps";

export const Route = createFileRoute("/rps/")({ component: RpsPage });

function RpsPage() {
  const search = RpsLayoutRoute.useSearch();
  const items = useWorkspaceRps();
  const visits = useWorkspaceVisits();
  const addRps = useSipr((s) => s.addRps);
  const ensureVisitByName = useSipr((s) => s.ensureVisitByName);
  const navigate = useNavigate();
  const fromSearch = visits.find((v) => v.id === search.visitId);
  const { view: plan } = usePlan();

  const [charter, setCharter] = useState(false);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [facts, setFacts] = useState("");
  const [scores, setScores] = useState<RpsScores>(emptyScores());
  const [visitName, setVisitName] = useState(fromSearch ? visitLabel(fromSearch) : "");
  const [reading, setReading] = useState<ReturnType<typeof analyzeRps> | null>(null);

  useEffect(() => {
    if (!fromSearch) return;
    setVisitName(visitLabel(fromSearch));
  }, [fromSearch]);

  const identity = useMemo(() => scanSituation({ title, unit, facts }), [title, unit, facts]);

  function fillExample() {
    setTitle(RPS_EXAMPLE.title);
    setUnit(RPS_EXAMPLE.unit);
    setFacts(RPS_EXAMPLE.facts);
    setScores(RPS_EXAMPLE.scores);
    setCharter(true);
    setReading(analyzeRps({ facts: RPS_EXAMPLE.facts, scores: RPS_EXAMPLE.scores }));
    toast.message("Exemple collectif : charge et pauses, sans nommer personne.");
  }

  function readSituation() {
    if (!charter) {
      toast.error("Cochez la charte : organisation, pas personnes.");
      return;
    }
    if (identity.ok === false) {
      toast.error(identity.hint);
      return;
    }
    if (!title.trim() || !unit.trim() || facts.trim().length < 12) {
      toast.error("Titre, équipe / poste, et faits d'organisation sont requis.");
      return;
    }
    const next = analyzeRps({ facts, scores });
    setReading(next);
    toast.success("Lecture collective prête — vérifiez les mesures, puis enregistrez.");
  }

  function save() {
    if (!plan.canRps) {
      toast.error(blockedMessage(plan));
      navigate({ to: "/compte" });
      return;
    }
    if (!charter) {
      toast.error("Cochez la charte : organisation, pas personnes.");
      return;
    }
    if (identity.ok === false) {
      toast.error(identity.hint);
      return;
    }
    const analysis = reading ?? analyzeRps({ facts, scores });
    const name = visitName.trim();
    const visitId = name ? ensureVisitByName(name) : undefined;
    const id = addRps({
      title: title.trim(),
      unit: unit.trim(),
      facts: facts.trim(),
      scores,
      attention: analysis.attention,
      diagnosis: analysis.diagnosis,
      measures: analysis.measures,
      avoid: analysis.avoid,
      visitId: visitId || undefined,
      status: "ouverte",
      charterAccepted: true,
    });
    toast.success("Analyse RPS enregistrée — aucune identité n'est stockée.");
    navigate({ to: "/rps/$id", params: { id } });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">RPS collectif</h1>
        <p className="text-sm text-muted">
          Livre I, titre 3 : on lit une <span className="text-fg">organisation</span> (poste, équipe,
          ligne), jamais une personne. Pas de photo, pas de nom. La souffrance individuelle va à la
          personne de confiance — hors de cet outil.
        </p>
      </header>

      <ArchiveMenu />

      <PlanBanner view={plan} />

      <Card className="space-y-4">
        <h2 className="font-display font-semibold">Charte</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {RPS_CHARTER.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-current"
            checked={charter}
            onChange={(e) => setCharter(e.target.checked)}
          />
          <span>J'analyse un poste / une équipe, pas des travailleurs identifiés.</span>
        </label>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display font-semibold">Nouvelle lecture</h2>
        <Field label="Intitulé (situation, pas personne)">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Répartition de charge — ligne / pauses"
          />
        </Field>
        <Field label="Unité collective">
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Atelier 3 — équipe de jour"
          />
        </Field>
        <div>
          <VoiceCapture value={facts} onChange={setFacts} />
          <p className="mt-1 text-xs text-subtle">
            Faits d'organisation : poste non relayé, charge concentrée, travail non visible. Pas de
            prénom, pas de « X à la cafétéria ».
          </p>
        </div>
        {identity.ok === false ? (
          <p className="rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">
            {identity.hits.join(" · ")}. {identity.hint}
          </p>
        ) : null}

        <RpsScoreGrid scores={scores} onChange={setScores} />

        <VisitPicker visits={visits} name={visitName} onNameChange={setVisitName} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="flex-1" onClick={readSituation}>
            Lire la situation
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={fillExample}>
            Exemple charge / pauses
          </Button>
        </div>
      </Card>

      {reading ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-semibold">Lecture collective</h2>
            <Badge
              tone={
                reading.attention === "urgence"
                  ? "crit"
                  : reading.attention === "intervention"
                    ? "high"
                    : reading.attention === "attention"
                      ? "mid"
                      : "low"
              }
            >
              {RPS_ATTENTION_META[reading.attention].label}
            </Badge>
          </div>
          <p className="text-sm">{reading.diagnosis}</p>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-muted">Mesures d'organisation</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {reading.measures.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-muted">À ne pas faire</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {reading.avoid.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <Button type="button" className="w-full" disabled={identity.ok === false || !plan.canRps} onClick={save}>
            Enregistrer l'analyse
          </Button>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Situations ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Aucune analyse pour cet espace.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((s) => {
              const visit = s.visitId ? visits.find((v) => v.id === s.visitId) : undefined;
              return (
                <RpsCard
                  key={s.id}
                  situation={s}
                  visitName={visit ? visitLabel(visit) : undefined}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
