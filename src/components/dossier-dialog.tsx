import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PlaceEditor } from "@/components/place-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { isoDay } from "@/lib/format";
import { emptyPlace, formatPlace, placeToGeo } from "@/lib/place";
import { selectWorkspace, useSipr, useWorkspaceVisits } from "@/lib/store";
import { matchVisitByName, visitLabel } from "@/lib/workspace";
import type { Place } from "@/lib/types";

export function DossierDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const visits = useWorkspaceVisits();
  const workspace = useSipr(selectWorkspace);
  const addVisit = useSipr((s) => s.addVisit);
  const navigate = useNavigate();
  const independant = workspace?.kind === "independant";
  const [form, setForm] = useState({
    name: "",
    company: "",
    interlocutor: "",
    date: isoDay(),
  });
  const [place, setPlace] = useState<Place>(emptyPlace());

  function reset() {
    setForm({ name: "", company: "", interlocutor: "", date: isoDay() });
    setPlace(emptyPlace());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Indiquez le nom du dossier.");
      return;
    }
    const existing = matchVisitByName(visits, name);
    if (existing) {
      toast.message(`Dossier « ${visitLabel(existing)} » déjà ouvert.`);
      onOpenChange(false);
      navigate({ to: "/visite/$id", params: { id: existing.id } });
      return;
    }
    const company = independant
      ? form.company.trim() || name
      : workspace?.name || name;
    const geo = place.verified ? placeToGeo(place) : undefined;
    const id = addVisit({
      name,
      company,
      site: place.verified ? formatPlace(place) : "",
      interlocutor: form.interlocutor.trim(),
      date: form.date,
      geo,
      place: place.verified ? place : undefined,
    });
    reset();
    onOpenChange(false);
    toast.success(`Dossier « ${name} » ouvert — visite en cours.`);
    navigate({ to: "/visite/$id", params: { id } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent
        className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
        title={independant ? "Nouveau client / dossier" : "Nouvelle visite / dossier"}
        description={
          independant
            ? "Chaque client a son propre dossier (lieux, bâtiments, constats). Plusieurs visites peuvent rester ouvertes."
            : "Ouvrez un site ou un bâtiment. Plusieurs visites peuvent rester en cours en même temps."
        }
      >
        <form className="space-y-3" onSubmit={submit}>
          <Field label={independant ? "Nom du client / dossier" : "Nom de la visite"}>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={independant ? "Garage Toutvabien, Atelier 3…" : "Atelier 3, Quai nord…"}
            />
          </Field>
          {independant ? (
            <Field label="Entreprise visée">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Raison sociale (si différente du dossier)"
              />
            </Field>
          ) : null}
          <PlaceEditor value={place} onChange={setPlace} />
          <p className="text-xs text-muted">
            L'adresse peut être complétée plus tard sur la fiche visite. Un nom suffit pour
            ouvrir le dossier.
          </p>
          <Field label="Interlocuteur">
            <Input
              value={form.interlocutor}
              onChange={(e) => setForm({ ...form, interlocutor: e.target.value })}
              placeholder="Chef d'atelier, gérant…"
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Button type="submit" className="w-full">
            Ouvrir le dossier
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
