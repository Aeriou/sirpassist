import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Check, FolderOpen, Pencil, Plus, X } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatShortDate } from "@/lib/format";
import { useSipr, useWorkspaceAnomalies, useWorkspaceVisits } from "@/lib/store";
import { visitLabel } from "@/lib/workspace";

export const Route = createFileRoute("/classeur/$id")({ component: ClasseurDetail });

function ClasseurDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const classeur = useSipr((s) => s.classeurs.find((c) => c.id === id));
  const updateClasseur = useSipr((s) => s.updateClasseur);
  const removeClasseur = useSipr((s) => s.removeClasseur);
  const setClasseurItem = useSipr((s) => s.setClasseurItem);
  const visits = useWorkspaceVisits();
  const anomalies = useWorkspaceAnomalies();

  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({ name: classeur?.name ?? "", note: classeur?.note ?? "" });
  const [addVisitsOpen, setAddVisitsOpen] = useState(false);
  const [addConstatsOpen, setAddConstatsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const inVisitIds = useMemo(() => new Set(classeur?.visitIds ?? []), [classeur?.visitIds]);
  const inAnomalyIds = useMemo(() => new Set(classeur?.anomalyIds ?? []), [classeur?.anomalyIds]);

  if (!classeur) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Ce classeur n'existe plus.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft /> Accueil
        </Button>
      </div>
    );
  }

  const memberVisits = visits.filter((v) => inVisitIds.has(v.id));
  // Constats "portés" par une visite déjà incluse — affichés pour info, pas en double.
  const coveredAnomalyIds = new Set(
    anomalies.filter((a) => inVisitIds.has(a.visitId)).map((a) => a.id),
  );
  const pickedAnomalies = anomalies.filter(
    (a) => inAnomalyIds.has(a.id) && !coveredAnomalyIds.has(a.id),
  );
  const candidateVisits = visits.filter((v) => !inVisitIds.has(v.id));
  const candidateAnomalies = anomalies.filter(
    (a) => !inAnomalyIds.has(a.id) && !coveredAnomalyIds.has(a.id),
  );

  const totalConstats = coveredAnomalyIds.size + pickedAnomalies.length;

  function saveEdit() {
    if (!draft.name.trim()) {
      toast.error("Donnez un nom au classeur.");
      return;
    }
    updateClasseur(classeur!.id, { name: draft.name, note: draft.note });
    setEdit(false);
    toast.success("Classeur mis à jour.");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-accent">
          <ArrowLeft className="size-4" /> Accueil
        </Link>
      </div>

      <header className="space-y-2">
        {edit ? (
          <div className="space-y-3">
            <Field label="Nom du classeur">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Visites privatives 2026…"
              />
            </Field>
            <Field label="Note (facultatif)">
              <Textarea
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                rows={2}
              />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>
                <Check /> Enregistrer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft({ name: classeur.name, note: classeur.note ?? "" });
                  setEdit(false);
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <FolderOpen className="size-5 text-accent" />
              <h1 className="font-display text-2xl font-semibold">{classeur.name}</h1>
              <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
                <Pencil className="size-4" /> Renommer
              </Button>
            </div>
            <p className="text-sm text-muted">
              {memberVisits.length} visite{memberVisits.length > 1 ? "s" : ""} · {totalConstats}{" "}
              constat{totalConstats > 1 ? "s" : ""}
            </p>
            {classeur.note ? <p className="text-sm text-muted">{classeur.note}</p> : null}
          </>
        )}
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Visites du classeur</h2>
          <Button size="sm" variant="outline" onClick={() => setAddVisitsOpen((v) => !v)}>
            <Plus /> Ajouter
          </Button>
        </div>

        {addVisitsOpen ? (
          <Card className="space-y-1 p-2">
            {candidateVisits.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted">Toutes les visites sont déjà rangées.</p>
            ) : (
              candidateVisits.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    setClasseurItem(classeur.id, "visit", v.id, true);
                    toast.message(`« ${visitLabel(v)} » ajoutée.`);
                  }}
                >
                  <span className="min-w-0 truncate">{visitLabel(v)}</span>
                  <Plus className="size-4 shrink-0 text-accent" />
                </button>
              ))
            )}
          </Card>
        ) : null}

        {memberVisits.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
            Aucune visite. Ajoutez « Visite privative pépinière 26 », « … source 21 »…
          </p>
        ) : (
          <ul className="space-y-2">
            {memberVisits.map((v) => {
              const n = anomalies.filter((a) => a.visitId === v.id).length;
              return (
                <li key={v.id}>
                  <Card className="flex items-center justify-between gap-3 p-3">
                    <Link to="/visite/$id" params={{ id: v.id }} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{visitLabel(v)}</p>
                      <p className="truncate text-sm text-muted">
                        {v.site || "Adresse à préciser"} · {formatShortDate(v.date)} · {n} constat
                        {n > 1 ? "s" : ""}
                      </p>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Retirer du classeur"
                      onClick={() => setClasseurItem(classeur.id, "visit", v.id, false)}
                    >
                      <X className="size-4" />
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Constats ajoutés seuls</h2>
          <Button size="sm" variant="outline" onClick={() => setAddConstatsOpen((v) => !v)}>
            <Plus /> Ajouter
          </Button>
        </div>
        <p className="text-sm text-muted">
          Un constat pris hors de sa visite — utile quand un seul point d'une visite concerne ce
          classeur.
        </p>

        {addConstatsOpen ? (
          <Card className="max-h-72 space-y-1 overflow-y-auto p-2">
            {candidateAnomalies.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted">Aucun autre constat à ajouter.</p>
            ) : (
              candidateAnomalies.map((a) => {
                const v = visits.find((x) => x.id === a.visitId);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    onClick={() => {
                      setClasseurItem(classeur.id, "anomaly", a.id, true);
                      toast.message("Constat ajouté.");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{a.title}</span>
                      {v ? (
                        <span className="block truncate text-xs text-subtle">{visitLabel(v)}</span>
                      ) : null}
                    </span>
                    <Plus className="size-4 shrink-0 text-accent" />
                  </button>
                );
              })
            )}
          </Card>
        ) : null}

        {pickedAnomalies.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
            Aucun constat ajouté seul.
          </p>
        ) : (
          <ul className="space-y-2">
            {pickedAnomalies.map((a) => {
              const v = visits.find((x) => x.id === a.visitId);
              return (
                <li key={a.id}>
                  <Card className="flex items-center justify-between gap-3 p-3">
                    <Link to="/anomalie/$id" params={{ id: a.id }} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title}</p>
                      {v ? (
                        <p className="truncate text-sm text-muted">{visitLabel(v)}</p>
                      ) : null}
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Retirer du classeur"
                      onClick={() => setClasseurItem(classeur.id, "anomaly", a.id, false)}
                    >
                      <X className="size-4" />
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Partage avec un groupe</h2>
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
          Bientôt : mettre ce classeur en commun avec un groupe (les membres le voient en lecture
          seule).
        </p>
      </section>

      <div>
        <Button variant="outline" className="text-danger" onClick={() => setDeleteOpen(true)}>
          Supprimer le classeur
        </Button>
      </div>
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer ce classeur ?"
        description="Le regroupement disparaît. Les visites et les constats, eux, restent en place."
        confirmLabel="Supprimer"
        onConfirm={() => {
          removeClasseur(classeur.id);
          toast.message("Classeur supprimé.");
          navigate({ to: "/" });
        }}
      />
    </div>
  );
}
