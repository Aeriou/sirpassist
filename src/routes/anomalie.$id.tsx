import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { KinneyCalculator } from "@/components/kinney-calculator";
import { RiskBadge, StatusBadge, ThemeChip, UrgencyBadge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LEVEL_META, buildKinney } from "@/lib/kinney";
import { useSipr } from "@/lib/store";
import type { AnomalyStatus } from "@/lib/types";
import { formatShortDate, formatStamp } from "@/lib/format";

export const Route = createFileRoute("/anomalie/$id")({ component: AnomalyPage });

const STATUSES: { id: AnomalyStatus; label: string }[] = [
  { id: "ouverte", label: "Ouverte" },
  { id: "validee", label: "Validée → PGP" },
  { id: "en_cours", label: "En cours" },
  { id: "cloturee", label: "Clôturée" },
];

function AnomalyPage() {
  const { id } = Route.useParams();
  const anomaly = useSipr((s) => s.anomalies.find((a) => a.id === id));
  const visit = useSipr((s) => s.visits.find((v) => v.id === anomaly?.visitId));
  const update = useSipr((s) => s.updateAnomaly);
  const removeAnomaly = useSipr((s) => s.removeAnomaly);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!anomaly) return <p className="text-muted">Constat introuvable.</p>;

  const meta = LEVEL_META[anomaly.kinney.level];

  return (
    <div className="space-y-5">
      {anomaly.photo ? (
        <img
          src={anomaly.photo}
          alt=""
          className="h-56 w-full rounded-2xl object-cover md:h-72"
        />
      ) : null}

      <header className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <RiskBadge level={anomaly.kinney.level} score={anomaly.kinney.score} />
          <UrgencyBadge urgency={anomaly.urgency} />
          <StatusBadge status={anomaly.status} />
          <ThemeChip id={anomaly.theme} />
        </div>
        <h1 className="font-display text-2xl font-semibold">{anomaly.title}</h1>
        <p className="text-sm text-muted">
          {anomaly.location}
          {visit ? (
            <>
              {" · "}
              <Link to="/visite/$id" params={{ id: visit.id }} className="text-accent">
                {visit.company}
              </Link>
            </>
          ) : null}
        </p>
        {anomaly.capturedAt ? (
          <p className="font-mono text-xs text-subtle">
            Horodatage CBE · {formatStamp(new Date(anomaly.capturedAt))}
            {anomaly.geo
              ? ` · ${anomaly.geo.address ?? `${anomaly.geo.lat.toFixed(5)}, ${anomaly.geo.lng.toFixed(5)}`}`
              : ""}
          </p>
        ) : null}
        <p className="text-sm">
          Constat rédigé par{" "}
          <strong>
            {anomaly.author?.name ?? "CP non identifié"}
          </strong>
          {anomaly.author
            ? `, ${anomaly.author.title} · N${anomaly.author.level}`
            : ""}
        </p>
      </header>

      <Card>
        <p className="text-sm leading-relaxed">{anomaly.description}</p>
        {anomaly.voice ? (
          <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Danger</dt>
              <dd>{anomaly.voice.danger || anomaly.description}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Mesure</dt>
              <dd>{anomaly.voice.measure || anomaly.correctiveAction}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Zone / matériel</dt>
              <dd>{anomaly.voice.zone || anomaly.location}</dd>
            </div>
          </dl>
        ) : null}
        {anomaly.transcription ? (
          <p className="mt-3 border-t border-border pt-3 text-sm italic text-muted">
            « {anomaly.transcription} »
          </p>
        ) : null}
        {anomaly.legalRef ? (
          <p className="mt-3 text-xs text-subtle">{anomaly.legalRef}</p>
        ) : null}
      </Card>

      <Card>
        <p className="text-xs font-medium tracking-wide text-muted">Statut (alimente le PGP dès validation)</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update(anomaly.id, { status: s.id })}
              className={
                anomaly.status === s.id
                  ? "min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg"
                  : "min-h-11 rounded-lg bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)]"
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Calculateur Kinney</h2>
        <p className="mb-3 text-sm text-muted">{meta.action}</p>
        <KinneyCalculator
          P={anomaly.kinney.P}
          E={anomaly.kinney.E}
          G={anomaly.kinney.G}
          justification={anomaly.kinneyWhy}
          onChange={({ P, E, G }) => update(anomaly.id, { kinney: buildKinney(P, E, G) })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Action corrective</h2>
        <Field label="Mesure">
          <Textarea
            value={anomaly.correctiveAction}
            onChange={(e) => update(anomaly.id, { correctiveAction: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Responsable">
            <Input
              value={anomaly.assignedTo ?? ""}
              onChange={(e) => update(anomaly.id, { assignedTo: e.target.value })}
            />
          </Field>
          <Field label="Échéance">
            <Input
              type="date"
              value={anomaly.dueDate ?? ""}
              onChange={(e) => update(anomaly.id, { dueDate: e.target.value })}
            />
          </Field>
        </div>
        {anomaly.dueDate ? (
          <p className="text-xs text-muted">Échéance : {formatShortDate(anomaly.dueDate)}</p>
        ) : null}
      </section>

      <Button variant="secondary" asChild className="w-full">
        <Link to="/pgp">Voir dans le PGP</Link>
      </Button>
      <Button
        variant="outline"
        className="w-full text-danger"
        onClick={() => setDeleteOpen(true)}
      >
        Supprimer le constat
      </Button>
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer ce constat ?"
        description="Le constat et sa ligne PAA, le cas échéant, sont retirés. Cette action est définitive sur la tablette."
        confirmLabel="Supprimer le constat"
        onConfirm={() => {
          removeAnomaly(anomaly.id);
          toast.message("Constat supprimé.");
          navigate({ to: "/terrain" });
        }}
      />
    </div>
  );
}
