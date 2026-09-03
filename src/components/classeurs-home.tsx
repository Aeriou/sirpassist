import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FolderOpen, FolderPlus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useSipr, useWorkspaceAnomalies, useWorkspaceClasseurs, useWorkspaceVisits } from "@/lib/store";

/** Bloc « Classeurs » de l'Accueil : regroupements de visites / constats,
 *  au-dessus de la liste des visites en cours. */
export function ClasseursHome() {
  const classeurs = useWorkspaceClasseurs();
  const visits = useWorkspaceVisits();
  const anomalies = useWorkspaceAnomalies();
  const addClasseur = useSipr((s) => s.addClasseur);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", note: "" });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Donnez un nom au classeur.");
      return;
    }
    const id = addClasseur({ name: form.name, note: form.note });
    setForm({ name: "", note: "" });
    setOpen(false);
    toast.success(`Classeur « ${form.name.trim()} » créé.`);
    navigate({ to: "/classeur/$id", params: { id } });
  }

  function counts(visitIds: string[], anomalyIds: string[]) {
    const vset = new Set(visitIds);
    const covered = new Set(anomalies.filter((a) => vset.has(a.visitId)).map((a) => a.id));
    for (const aid of anomalyIds) covered.add(aid);
    return { v: visitIds.filter((id) => visits.some((x) => x.id === id)).length, c: covered.size };
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Layers className="size-4 text-accent" />
          Classeurs
        </h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <FolderPlus /> Nouveau classeur
        </Button>
      </div>

      {classeurs.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
          Un classeur regroupe plusieurs visites (et des constats isolés) sous un même nom —
          pratique pour suivre un client ou partager un ensemble avec un groupe.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {classeurs.map((c) => {
            const { v, c: cc } = counts(c.visitIds, c.anomalyIds);
            return (
              <li key={c.id}>
                <Link
                  to="/classeur/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] transition-[box-shadow] hover:shadow-[var(--shadow-border-hover)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
                    <FolderOpen className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display font-semibold">{c.name}</span>
                    <span className="block text-sm text-muted">
                      {v} visite{v > 1 ? "s" : ""} · {cc} constat{cc > 1 ? "s" : ""}
                      {c.sharedGroupIds?.length ? " · partagé" : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setForm({ name: "", note: "" });
        }}
      >
        <DialogContent
          title="Nouveau classeur"
          description="Regroupez plusieurs visites et des constats sous un même nom. Vous choisirez leur contenu à l'étape suivante."
        >
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Nom du classeur">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Visites privatives 2026, Client Toutvabien…"
              />
            </Field>
            <Field label="Note (facultatif)">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="Contexte, périmètre…"
              />
            </Field>
            <Button type="submit" className="w-full">
              Créer le classeur
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
