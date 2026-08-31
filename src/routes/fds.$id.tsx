import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { GhsRow } from "@/components/pictograms";
import { FdsRealityForm } from "@/components/fds-reality";
import { FdsScope, type FdsScopeMode } from "@/components/fds-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { compactReality, emptyReality } from "@/lib/fds-reality";
import { selectWorkspace, useSipr, useWorkspaceVisits } from "@/lib/store";
import { visitLabel } from "@/lib/workspace";
import type { FdsReality } from "@/lib/types";

export const Route = createFileRoute("/fds/$id")({ component: FdsDetail });

function FdsDetail() {
  const { id } = Route.useParams();
  const notice = useSipr((s) => s.fds.find((f) => f.id === id));
  const visits = useWorkspaceVisits();
  const workspace = useSipr(selectWorkspace);
  const removeFds = useSipr((s) => s.removeFds);
  const updateFds = useSipr((s) => s.updateFds);
  const ensureVisitByName = useSipr((s) => s.ensureVisitByName);
  const navigate = useNavigate();
  const independant = workspace?.kind === "independant";
  const dossierLabel = independant ? "un client / dossier" : "une visite / dossier";
  const linkLabel = independant ? "Lier à un client / dossier" : "Lier à une visite / dossier";
  const linked = useSipr((s) =>
    notice?.visitId ? s.visits.find((v) => v.id === notice.visitId) : undefined,
  );

  const [reality, setReality] = useState<FdsReality>(emptyReality());
  const [scope, setScope] = useState<FdsScopeMode>("info");
  const [visitName, setVisitName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setReality({ ...emptyReality(), ...notice.reality });
    setScope(notice.visitId ? "dossier" : "info");
    setVisitName(linked ? visitLabel(linked) : "");
  }, [notice?.id, notice?.visitId, linked]);

  if (!notice) return <p className="text-muted">Notice introuvable.</p>;

  const current = notice;

  function saveReality() {
    updateFds(current.id, { reality: compactReality(reality) });
    toast.success("Analyse de poste enregistrée.");
  }

  function saveScope() {
    if (scope === "info") {
      updateFds(current.id, { visitId: undefined });
      toast.success("Notice informative — détachée du dossier.");
      return;
    }
    const name = visitName.trim();
    if (!name) {
      toast.error("Indiquez le nom du dossier.");
      return;
    }
    const visitId = ensureVisitByName(name);
    if (!visitId) {
      toast.error("Indiquez le nom du dossier.");
      return;
    }
    updateFds(current.id, { visitId });
    toast.success(`Notice liée à « ${name} ».`);
  }

  return (
    <div className="space-y-5">
      {notice.photo ? (
        <img src={notice.photo} alt="" className="h-56 w-full rounded-2xl object-cover" />
      ) : null}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={notice.signalWord === "DANGER" ? "crit" : "mid"}>{notice.signalWord}</Badge>
          {notice.visitId ? (
            <Badge tone="accent">{linked ? visitLabel(linked) : "Dossier"}</Badge>
          ) : (
            <Badge tone="neutral">Informative</Badge>
          )}
        </div>
        <h1 className="font-display text-2xl font-semibold">{notice.productName}</h1>
        {notice.manufacturer ? <p className="text-sm text-muted">{notice.manufacturer}</p> : null}
        {linked ? (
          <p className="text-sm">
            <Link to="/visite/$id" params={{ id: linked.id }} className="text-accent">
              Ouvrir le {independant ? "client" : "dossier"} « {visitLabel(linked)} »
            </Link>
          </p>
        ) : null}
      </header>

      <Card>
        <p className="mb-3 text-xs font-medium tracking-wide text-muted">Pictogrammes CLP</p>
        <GhsRow codes={notice.pictograms} />
      </Card>

      <Card>
        <h2 className="font-display font-semibold">Notice de poste — 5 lignes</h2>
        <ol className="mt-3 space-y-2">
          {notice.notice.filter(Boolean).map((line, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="font-mono text-accent tabular">{i + 1}.</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="font-display font-semibold">EPI obligatoires</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {notice.ppe.map((p) => (
            <Badge key={p} tone="accent">
              {p}
            </Badge>
          ))}
        </ul>
      </Card>

      {notice.hazards.length > 0 ? (
        <Card>
          <h2 className="font-display font-semibold">Mentions de danger</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {notice.hazards.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {notice.firstAid ? (
        <Card>
          <h2 className="font-display font-semibold">Premiers secours</h2>
          <p className="mt-2 text-sm text-muted">{notice.firstAid}</p>
        </Card>
      ) : null}

      <FdsRealityForm value={reality} onChange={setReality} />
      <Button className="w-full" onClick={saveReality}>
        Enregistrer l'analyse de poste
      </Button>

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
      <Button variant="secondary" className="w-full" onClick={saveScope}>
        {scope === "info" ? "Garder en notice informative" : "Enregistrer le rattachement"}
      </Button>

      <Button variant="secondary" asChild className="w-full">
        <Link to="/fds">Retour à la bibliothèque</Link>
      </Button>
      <Button
        variant="outline"
        className="w-full text-danger"
        onClick={() => setDeleteOpen(true)}
      >
        Supprimer la notice
      </Button>
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer cette notice FDS ?"
        description="La fiche disparaît de la bibliothèque. Le dossier client, s'il existe, n'est pas touché."
        confirmLabel="Supprimer la notice"
        onConfirm={() => {
          removeFds(notice.id);
          toast.message("Notice supprimée.");
          navigate({ to: "/fds" });
        }}
      />
    </div>
  );
}
