import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArchiveMenu } from "@/components/archive-menu";
import { FdsCard } from "@/components/fds-card";
import { FdsRealityForm } from "@/components/fds-reality";
import { FdsScope, type FdsScopeMode } from "@/components/fds-scope";
import { PhotoCapture } from "@/components/photo-capture";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GhsRow } from "@/components/pictograms";
import { Badge } from "@/components/ui/badge";
import { analyzeFds } from "@/lib/ai";
import { compactReality, emptyReality } from "@/lib/fds-reality";
import { selectWorkspace, useSipr, useWorkspaceFds, useWorkspaceVisits } from "@/lib/store";
import { visitLabel } from "@/lib/workspace";
import type { FdsNotice, FdsReality } from "@/lib/types";
import { Route as FdsLayoutRoute } from "./fds";

export const Route = createFileRoute("/fds/")({ component: FdsPage });

type Draft = Omit<FdsNotice, "id" | "createdAt" | "workspaceId">;

function FdsPage() {
  const search = FdsLayoutRoute.useSearch();
  const fds = useWorkspaceFds();
  const visits = useWorkspaceVisits();
  const workspace = useSipr(selectWorkspace);
  const addFds = useSipr((s) => s.addFds);
  const ensureVisitByName = useSipr((s) => s.ensureVisitByName);
  const navigate = useNavigate();
  const independant = workspace?.kind === "independant";
  const dossierLabel = independant ? "un client / dossier" : "une visite / dossier";
  const linkLabel = independant ? "Lier à un client / dossier" : "Lier à une visite / dossier";
  const fromSearch = visits.find((v) => v.id === search.visitId);

  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reality, setReality] = useState<FdsReality>(emptyReality());
  const [scope, setScope] = useState<FdsScopeMode>(fromSearch ? "dossier" : "info");
  const [visitName, setVisitName] = useState(fromSearch ? visitLabel(fromSearch) : "");

  useEffect(() => {
    if (!fromSearch) return;
    setScope("dossier");
    setVisitName(visitLabel(fromSearch));
  }, [fromSearch]);

  async function scan(src?: string) {
    const img = src ?? photo;
    if (!img) {
      toast.error("Photographiez l'étiquette.");
      return;
    }
    setBusy(true);
    try {
      const res = await analyzeFds({ data: { photo: img } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDraft(res.notice);
      setReality({ ...emptyReality(), ...res.notice.reality });
      toast.success("Étiquette lue. Complétez les questions si utile, puis enregistrez.");
    } catch {
      toast.error("Analyse impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  function useExample() {
    const example = fds.find((f) => f.id === "fds-solvex");
    if (example) {
      navigate({ to: "/fds/$id", params: { id: example.id } });
      return;
    }
    setPhoto("/seed/solvex-label.jpg");
    void scan("/seed/solvex-label.jpg");
  }

  function save() {
    if (!draft) return;
    let visitId: string | undefined;
    if (scope === "dossier") {
      const name = visitName.trim();
      if (!name) {
        toast.error("Indiquez le nom du dossier, ou passez en notice informative.");
        return;
      }
      visitId = ensureVisitByName(name) || undefined;
      if (!visitId) {
        toast.error("Indiquez le nom du dossier.");
        return;
      }
    }
    const id = addFds({
      ...draft,
      photo: draft.photo ?? photo,
      visitId,
      reality: compactReality(reality),
    });
    toast.success(
      visitId
        ? `Notice liée au ${independant ? "client" : "dossier"} « ${visitName.trim()} ».`
        : "Notice informative enregistrée dans la bibliothèque.",
    );
    navigate({ to: "/fds/$id", params: { id } });
  }

  const visitById = new Map(visits.map((v) => [v.id, visitLabel(v)]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">FDS</h1>
        <p className="text-sm text-muted">
          Photo de l'étiquette : notice de poste, puis questions facultatives « La réalité ».
          La notice peut rester informative ou être liée à {dossierLabel}.
        </p>
      </header>

      <ArchiveMenu />

      <FdsScope
        mode={scope}
        onModeChange={setScope}
        visits={visits}
        visitName={visitName}
        onVisitNameChange={setVisitName}
        workspaceName={workspace?.name}
        dossierLabel={dossierLabel}
        linkLabel={linkLabel}
      />

      {!draft ? (
        <>
          <PhotoCapture value={photo} onChange={setPhoto} label="Étiquette du produit" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" disabled={busy || !photo} onClick={() => scan()}>
              {busy ? "Lecture de l'étiquette…" : "Analyser l'étiquette"}
            </Button>
            {fds.some((f) => f.id === "fds-solvex") ? (
              <Button variant="secondary" className="flex-1" onClick={useExample} disabled={busy}>
                Exemple SOLVEX 300
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-5">
          {draft.photo ? (
            <img src={draft.photo} alt="" className="h-44 w-full rounded-2xl object-cover" />
          ) : null}
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={draft.signalWord === "DANGER" ? "crit" : "mid"}>{draft.signalWord}</Badge>
              {draft.manufacturer ? (
                <span className="text-xs text-muted">{draft.manufacturer}</span>
              ) : null}
            </div>
            <h2 className="font-display text-xl font-semibold">{draft.productName}</h2>
            <GhsRow codes={draft.pictograms} />
            <ol className="space-y-1.5 text-sm">
              {draft.notice.filter(Boolean).map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-accent tabular">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </Card>

          <FdsRealityForm value={reality} onChange={setReality} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" size="lg" onClick={save}>
              Enregistrer la notice
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setDraft(null);
                setReality(emptyReality());
              }}
            >
              Reprendre la photo
            </Button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Bibliothèque</h2>
        {fds.length === 0 ? (
          <p className="text-sm text-muted">Aucune notice. Photographiez une étiquette pour commencer.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {fds.map((f) => (
              <li key={f.id}>
                <FdsCard notice={f} visitName={f.visitId ? visitById.get(f.visitId) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
