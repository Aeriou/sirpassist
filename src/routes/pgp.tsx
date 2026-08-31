import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Plus, Settings2, Download } from "lucide-react";
import { toast } from "sonner";
import { THEMES, themeById, type ThemeId } from "@/lib/code-bien-etre";
import { formatEuro, formatShortDate } from "@/lib/format";
import { LINE_STATUS, PLAN_STATUS, QUARTERS, budgetCommitted, includedLines } from "@/lib/pgp";
import { dueSoon, selectWorkspace, useSipr } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, NumberInput, Textarea } from "@/components/ui/input";
import { PaaRecap } from "@/components/paa-recap";
import { PgpTabs, rememberPgpVue } from "@/components/pgp-tabs";
import { PlanBanner } from "@/components/plan-banner";
import { cn } from "@/lib/utils";
import { usePlan } from "@/lib/use-plan";
import type { PaaLine, PaaLineStatus, Quarter } from "@/lib/types";

export const Route = createFileRoute("/pgp")({
  validateSearch: (s: Record<string, unknown>): { vue?: "recap" | "actions"; ligne?: string } => ({
    vue: s.vue === "actions" ? "actions" : s.vue === "recap" ? "recap" : undefined,
    ligne: typeof s.ligne === "string" ? s.ligne : undefined,
  }),
  component: PgpPage,
});

function PgpPage() {
  const search = Route.useSearch();
  const vue = search.vue ?? "recap";
  const ligne = search.ligne;
  const navigate = useNavigate({ from: "/pgp" });
  const pgp = useSipr((s) => s.pgp);
  const workspace = useSipr(selectWorkspace);
  const updatePgp = useSipr((s) => s.updatePgp);
  const updatePaaLine = useSipr((s) => s.updatePaaLine);
  const removePaaLine = useSipr((s) => s.removePaaLine);
  const updateObjective = useSipr((s) => s.updateObjective);
  const importValidated = useSipr((s) => s.importValidated);
  const [configOpen, setConfigOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { view: plan } = usePlan();
  const [reviewIds, setReviewIds] = useState<string[]>([]);

  const committed = budgetCommitted(pgp);
  const active = includedLines(pgp);
  const done = pgp.lines.filter((l) => l.included && l.status === "realisee");
  const overdue = pgp.lines.filter(
    (l) => l.included && l.status !== "realisee" && dueSoon(l.dueDate),
  );
  const byTheme = THEMES.map((t) => ({
    theme: t,
    items: pgp.lines.filter((l) => l.theme === t.id),
  })).filter((g) => g.items.length > 0);
  const enabledGoals = pgp.objectives.filter((o) => o.enabled);

  useEffect(() => {
    rememberPgpVue(vue);
  }, [vue]);

  useEffect(() => {
    if (vue !== "actions" || !ligne) return;
    const el = document.getElementById(`paa-${ligne}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [vue, ligne]);

  function importLines() {
    const ids = importValidated();
    const review =
      ids.length > 0
        ? ids
        : pgp.lines.filter((l) => l.anomalyId || l.rpsId).map((l) => l.id);
    if (review.length === 0) {
      toast.message("Aucun constat ni analyse RPS à importer dans cet espace.");
      return;
    }
    setReviewIds(review);
    navigate({ to: "/pgp", search: { vue: "actions", ligne: review[0] }, resetScroll: false });
    if (ids.length > 0) {
      toast.success(`${ids.length} ligne(s) importée(s) — constats et RPS collectifs. Complétez budget et responsable.`);
    } else {
      toast.message("Déjà au plan — un clic ouvre la fiche, le budget se complète ici.");
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:hidden">Plan annuel</h1>
          <p className="text-sm text-muted">
            PGP {pgp.pgpStart}–{pgp.pgpEnd} · PAA {pgp.paaYear} · espace{" "}
            {workspace?.kind === "independant" ? "indépendant" : "groupe"} « {workspace?.name} ».
            Seuls les constats de cet espace alimentent ce plan — pas les remarques des autres
            groupes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!plan.canPgp} onClick={() => setConfigOpen(true)}>
            <Settings2 />
            Configurer
          </Button>
          <Button variant="outline" disabled={!plan.canPgp} onClick={importLines}>
            <Download />
            Importer constats / RPS
          </Button>
          <Button variant="outline" disabled={!plan.canPgp} onClick={() => setAddOpen(true)}>
            <Plus />
            Action PGP
          </Button>
          <Button asChild>
            <Link to="/paa">
              <FileText />
              Document PAA
            </Link>
          </Button>
        </div>
      </header>

      {!plan.canPgp ? <PlanBanner view={plan} /> : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-accent">
              Plan annuel d'action {pgp.paaYear}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">{pgp.company}</h2>
            <p className="text-sm text-muted">
              Employeur {pgp.employer} · {pgp.workers} travailleurs · SIPP {pgp.sipp}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLAN_STATUS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => updatePgp({ status: s.id })}
                className={cn(
                  "min-h-11 rounded-full px-3 text-sm font-medium",
                  pgp.status === s.id
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-2 text-muted shadow-[var(--shadow-border)]",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Présentation CPPT</dt>
            <dd className="font-medium">{formatShortDate(pgp.cpptDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Médecine du travail</dt>
            <dd className="font-medium">{pgp.physician}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Enveloppe PAA</dt>
            <dd className="font-medium tabular">
              {formatEuro(committed)} / {formatEuro(pgp.budget)}
            </dd>
          </div>
        </dl>
        {pgp.notes ? <p className="text-sm text-muted">{pgp.notes}</p> : null}
      </Card>

      <PgpTabs vue={vue} ligne={ligne} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={active.length} label="Actions retenues" />
        <Stat value={done.length} label="Réalisées" />
        <Stat value={overdue.length} label="Échéances dépassées" warn={overdue.length > 0} />
        <Stat value={enabledGoals.length} label="Objectifs PGP actifs" />
      </div>

      {vue === "recap" ? (
        <div role="tabpanel" id="pgp-panel-recap" aria-labelledby="pgp-tab-recap">
        <PaaRecap
          lines={pgp.lines}
          filterable
          onOpenLine={(id) =>
            navigate({ to: "/pgp", search: { vue: "actions", ligne: id }, resetScroll: false })
          }
        />
        </div>
      ) : (
        <div role="tabpanel" id="pgp-panel-actions" aria-labelledby="pgp-tab-actions" className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Actions du PAA {pgp.paaYear}</h2>
        <p className="text-sm text-muted">
          Un clic sur le titre ouvre le constat. Budget, responsable et statut se complètent ici.
        </p>
        {byTheme.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-5 text-sm text-muted shadow-[var(--shadow-border)]">
            Aucune action. Importez les constats ou ajoutez une action PGP.
          </p>
        ) : null}
        {byTheme.map(({ theme, items }) => (
          <div key={theme.id}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="font-display font-semibold">{theme.label}</h3>
              <span className="text-xs text-subtle">Livre {theme.livre}</span>
            </div>
            <ul className="space-y-2">
              {items.map((line) => (
                <PaaRow
                  key={line.id}
                  line={line}
                  highlight={ligne === line.id || reviewIds.includes(line.id)}
                  onChange={(patch) => updatePaaLine(line.id, patch)}
                  onRemove={() => removePaaLine(line.id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Objectifs du PGP</h2>
        <ul className="space-y-2">
          {pgp.objectives.map((o) => {
            const t = themeById(o.theme);
            return (
              <li
                key={o.theme}
                className={cn(
                  "rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]",
                  !o.enabled && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => updateObjective(o.theme, { enabled: !o.enabled })}
                    className={cn(
                      "min-h-11 rounded-full px-3 text-sm font-medium",
                      o.enabled ? "bg-accent-dim text-accent" : "bg-surface-2 text-muted",
                    )}
                  >
                    Livre {t.livre} · {t.short}
                  </button>
                  <Badge tone={o.enabled ? "accent" : "neutral"}>
                    {o.enabled ? "Dans le PAA" : "Hors exercice"}
                  </Badge>
                </div>
                {o.enabled ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Objectif">
                      <Input
                        value={o.goal}
                        onChange={(e) => updateObjective(o.theme, { goal: e.target.value })}
                      />
                    </Field>
                    <Field label="Indicateur">
                      <Input
                        value={o.indicator}
                        onChange={(e) => updateObjective(o.theme, { indicator: e.target.value })}
                      />
                    </Field>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
        <PgpTabs vue={vue} ligne={ligne} sticky={false} />
        </div>
      )}

      <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
      <AddActionDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportReviewDialog ids={reviewIds} onClose={() => setReviewIds([])} />
    </div>
  );
}

function Stat({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <Card className="p-3">
      <p className={cn("font-display text-2xl font-semibold tabular", warn && "text-danger")}>
        {value}
      </p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

function PaaRow({
  line,
  highlight,
  onChange,
  onRemove,
}: {
  line: PaaLine;
  highlight?: boolean;
  onChange: (patch: Partial<PaaLine>) => void;
  onRemove: () => void;
}) {
  return (
    <li
      id={`paa-${line.id}`}
      className={cn(
        "rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]",
        highlight && "ring-2 ring-accent",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={line.origin === "visite" ? "accent" : "neutral"}>
              {line.origin === "visite" ? "Visite" : "PGP"}
            </Badge>
            {line.anomalyId ? (
              <Link
                to="/anomalie/$id"
                params={{ id: line.anomalyId }}
                className="inline-flex min-h-11 items-center rounded-full bg-accent-dim px-3 text-xs font-medium text-accent"
              >
                Ouvrir le constat
              </Link>
            ) : null}
          </div>
          {line.anomalyId ? (
            <Link
              to="/anomalie/$id"
              params={{ id: line.anomalyId }}
              className="mt-1 block min-h-11 font-medium hover:text-accent"
            >
              {line.title}
            </Link>
          ) : (
            <Input
              className="mt-1 h-9 font-medium"
              value={line.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange({ included: !line.included })}
          className={cn(
            "min-h-11 shrink-0 rounded-full px-3 text-sm font-medium",
            line.included ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
          )}
        >
          {line.included ? "Au PAA" : "Hors PAA"}
        </button>
      </div>
      <Field label="Mesure" className="mt-3">
        <Textarea
          className="min-h-20"
          value={line.measure}
          onChange={(e) => onChange({ measure: e.target.value })}
        />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 [&>*]:min-w-0">
        <Field label="Trimestre">
          <NativeSelect
            className="h-9"
            value={line.quarter}
            onChange={(e) => onChange({ quarter: e.target.value as Quarter })}
          >
            {QUARTERS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Budget (€)">
          <NumberInput
            className="h-9"
            value={line.budget}
            onValueChange={(n) => onChange({ budget: n })}
          />
        </Field>
        <Field label="Responsable">
          <Input
            className="h-9"
            value={line.owner}
            onChange={(e) => onChange({ owner: e.target.value })}
          />
        </Field>
        <Field label="Statut">
          <NativeSelect
            className="h-9"
            value={line.status}
            onChange={(e) => onChange({ status: e.target.value as PaaLineStatus })}
          >
            {LINE_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Échéance">
          <Input
            className="h-9"
            type="date"
            value={line.dueDate ?? ""}
            onChange={(e) => onChange({ dueDate: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Retirer
        </Button>
      </div>
    </li>
  );
}

function ConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pgp = useSipr((s) => s.pgp);
  const updatePgp = useSipr((s) => s.updatePgp);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-svh w-full max-w-2xl overflow-y-auto"
        title="Configurer le plan annuel"
        description="Identité du PGP quinquennal et du PAA de l'exercice."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entreprise">
            <Input value={pgp.company} onChange={(e) => updatePgp({ company: e.target.value })} />
          </Field>
          <Field label="Employeur">
            <Input value={pgp.employer} onChange={(e) => updatePgp({ employer: e.target.value })} />
          </Field>
          <Field label="Travailleurs">
            <NumberInput
              value={pgp.workers}
              onValueChange={(n) => updatePgp({ workers: n })}
            />
          </Field>
          <Field label="Année du PAA">
            <Input
              type="number"
              min={2020}
              max={2040}
              value={pgp.paaYear}
              onChange={(e) => updatePgp({ paaYear: Number(e.target.value) || pgp.paaYear })}
            />
          </Field>
          <Field label="Début PGP">
            <Input
              type="number"
              value={pgp.pgpStart}
              onChange={(e) => updatePgp({ pgpStart: Number(e.target.value) || pgp.pgpStart })}
            />
          </Field>
          <Field label="Fin PGP">
            <Input
              type="number"
              value={pgp.pgpEnd}
              onChange={(e) => updatePgp({ pgpEnd: Number(e.target.value) || pgp.pgpEnd })}
            />
          </Field>
          <Field label="SIPP">
            <Input value={pgp.sipp} onChange={(e) => updatePgp({ sipp: e.target.value })} />
          </Field>
          <Field label="Médecine du travail">
            <Input value={pgp.physician} onChange={(e) => updatePgp({ physician: e.target.value })} />
          </Field>
          <Field label="Date CPPT">
            <Input
              type="date"
              value={pgp.cpptDate}
              onChange={(e) => updatePgp({ cpptDate: e.target.value })}
            />
          </Field>
          <Field label="Enveloppe (€)">
            <NumberInput
              value={pgp.budget}
              onValueChange={(n) => updatePgp({ budget: n })}
            />
          </Field>
        </div>
        <Field label="Note de présentation" className="mt-3">
          <Textarea value={pgp.notes} onChange={(e) => updatePgp({ notes: e.target.value })} />
        </Field>
        <Button className="mt-4 w-full" onClick={() => onOpenChange(false)}>
          Enregistrer le plan
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AddActionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const addPaaLine = useSipr((s) => s.addPaaLine);
  const year = useSipr((s) => s.pgp.paaYear);
  const navigate = useNavigate({ from: "/pgp" });
  const [form, setForm] = useState({
    title: "",
    theme: "electricite" as ThemeId,
    measure: "",
    owner: "",
    quarter: "Q2" as Quarter,
    budget: 0,
    dueDate: `${year}-06-30`,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const id = addPaaLine({
      title: form.title.trim(),
      theme: form.theme,
      measure: form.measure.trim(),
      owner: form.owner.trim(),
      quarter: form.quarter,
      budget: form.budget,
      dueDate: form.dueDate,
      included: true,
      status: "retenue",
      origin: "pgp",
      level: 2,
    });
    toast.success("Action ajoutée au PAA.");
    onOpenChange(false);
    navigate({ to: "/pgp", search: { vue: "actions", ligne: id }, resetScroll: false });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Nouvelle action planifiée"
        description="Action issue du PGP, pas d'une visite de terrain."
      >
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Intitulé">
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Formation, audit, exercice…"
            />
          </Field>
          <Field label="Thématique">
            <NativeSelect
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value as ThemeId })}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  Livre {t.livre} — {t.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Mesure">
            <Textarea
              value={form.measure}
              onChange={(e) => setForm({ ...form, measure: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Responsable">
              <Input
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </Field>
            <Field label="Trimestre">
              <NativeSelect
                value={form.quarter}
                onChange={(e) => setForm({ ...form, quarter: e.target.value as Quarter })}
              >
                {QUARTERS.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Budget (€)">
              <NumberInput
                value={form.budget}
                onValueChange={(n) => setForm({ ...form, budget: n })}
              />
            </Field>
            <Field label="Échéance">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
          </div>
          <Button type="submit" className="w-full">
            Ajouter au PAA
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportReviewDialog({
  ids,
  onClose,
}: {
  ids: string[];
  onClose: () => void;
}) {
  const pgp = useSipr((s) => s.pgp);
  const updatePaaLine = useSipr((s) => s.updatePaaLine);
  const lines = pgp.lines.filter((l) => ids.includes(l.id));
  if (lines.length === 0) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
        title={`${lines.length} constat${lines.length > 1 ? "s" : ""} du plan`}
        description="Un clic ouvre la fiche. Budget et responsable se saisissent ici sans quitter le PGP."
      >
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="space-y-2 rounded-xl bg-surface-2 p-3">
              {line.anomalyId ? (
                <Link
                  to="/anomalie/$id"
                  params={{ id: line.anomalyId }}
                  className="block min-h-11 font-medium text-accent"
                  onClick={onClose}
                >
                  {line.title}
                </Link>
              ) : (
                <p className="font-medium">{line.title}</p>
              )}
              <p className="line-clamp-2 text-xs text-muted">{line.measure}</p>
              <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                <Field label="Budget (€)">
                  <NumberInput
                    className="h-9"
                    value={line.budget}
                    onValueChange={(n) => updatePaaLine(line.id, { budget: n })}
                  />
                </Field>
                <Field label="Responsable">
                  <Input
                    className="h-9"
                    value={line.owner}
                    onChange={(e) => updatePaaLine(line.id, { owner: e.target.value })}
                  />
                </Field>
              </div>
              {line.anomalyId ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to="/anomalie/$id" params={{ id: line.anomalyId }} onClick={onClose}>
                    Afficher / modifier le constat
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Button className="mt-4 w-full" onClick={onClose}>
          Continuer vers les actions
        </Button>
      </DialogContent>
    </Dialog>
  );
}
