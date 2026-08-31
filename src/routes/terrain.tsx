import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ArchiveMenu } from "@/components/archive-menu";
import { DeleteIconButton } from "@/components/confirm-delete";
import { PlaceEditor } from "@/components/place-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatShortDate, isoDay } from "@/lib/format";
import { emptyPlace, formatPlace, placeToGeo } from "@/lib/place";
import { selectWorkspace, useSipr, useWorkspaceAnomalies, useWorkspaceVisits } from "@/lib/store";
import { matchVisitByName, visitLabel } from "@/lib/workspace";
import type { Place } from "@/lib/types";

export const Route = createFileRoute("/terrain")({ component: Terrain });

function Terrain() {
  const visits = useWorkspaceVisits();
  const anomalies = useWorkspaceAnomalies();
  const workspace = useSipr(selectWorkspace);
  const addVisit = useSipr((s) => s.addVisit);
  const removeVisit = useSipr((s) => s.removeVisit);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    interlocutor: "",
    date: isoDay(),
  });
  const [place, setPlace] = useState<Place>(emptyPlace());

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (!place.verified || place.lat == null || place.lng == null) {
      toast.error("Vérifiez une adresse belge réelle (recherche, GPS ou carte) avant d'ouvrir la visite.");
      return;
    }
    const existing = matchVisitByName(visits, name);
    if (existing) {
      toast.message(`Visite « ${visitLabel(existing)} » déjà ouverte — les constats y sont regroupés.`);
      setOpen(false);
      navigate({ to: "/visite/$id", params: { id: existing.id } });
      return;
    }
    const geo = placeToGeo(place);
    const company = workspace?.kind === "entreprise" ? workspace.name : name;
    const id = addVisit({
      name,
      company,
      site: formatPlace(place),
      interlocutor: form.interlocutor,
      date: form.date,
      coverPhoto: "/seed/atelier.jpg",
      geo,
      place,
    });
    setOpen(false);
    setForm({ name: "", interlocutor: "", date: isoDay() });
    setPlace(emptyPlace());
    navigate({ to: "/visite/$id", params: { id } });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:hidden">Terrain</h1>
          <p className="text-sm text-muted">
            Visites de l'espace {workspace?.name ?? "démo"}. Un nom identique rejoint le même
            dossier et le même PGP.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setPlace(emptyPlace());
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Nouvelle visite
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
            title="Nouvelle visite"
            description="Adresse belge vérifiée + lieu précis (bâtiment, étage, pièce)."
          >
            <form className="space-y-3" onSubmit={submit}>
              <Field label="Nom de la visite">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Atelier 3, Garage Lambert…"
                />
              </Field>
              <PlaceEditor value={place} onChange={setPlace} />
              <Field label="Interlocuteur">
                <Input
                  value={form.interlocutor}
                  onChange={(e) => setForm({ ...form, interlocutor: e.target.value })}
                  placeholder="Chef d'atelier"
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={!place.verified}>
                Ouvrir la visite
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ArchiveMenu />

      {visits.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-6 text-sm text-muted shadow-[var(--shadow-border)]">
          Aucune visite. Ouvrez-en une, ou restaurez la démo depuis le profil.
        </p>
      ) : null}

      <ul className="space-y-3">
        {visits.map((v) => {
          const n = anomalies.filter((a) => a.visitId === v.id);
          return (
            <li key={v.id} className="flex overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
              <Link
                to="/visite/$id"
                params={{ id: v.id }}
                className="flex min-w-0 flex-1 overflow-hidden"
              >
                {v.coverPhoto ? (
                  <img src={v.coverPhoto} alt="" className="hidden h-28 w-36 object-cover sm:block" />
                ) : null}
                <div className="flex flex-1 items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display font-semibold">{visitLabel(v)}</h2>
                      <Badge tone={v.status === "en_cours" ? "accent" : "low"}>
                        {v.status === "en_cours" ? "En cours" : "Terminée"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {v.place ? formatPlace(v.place) : v.site} · {formatShortDate(v.date)}
                    </p>
                    <p className="text-xs text-subtle">
                      {n.length} constat{n.length > 1 ? "s" : ""} · {v.interlocutor}
                    </p>
                  </div>
                </div>
              </Link>
              <DeleteIconButton
                label="Supprimer la visite"
                title="Supprimer ce dossier ?"
                description="Les constats de cette visite sont retirés. Notices FDS et analyses RPS restent en bibliothèque, détachées."
                confirmLabel="Supprimer"
                onConfirm={() => {
                  removeVisit(v.id);
                  toast.message("Dossier supprimé.");
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
