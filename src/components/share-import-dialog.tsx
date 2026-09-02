import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent } from "./ui/dialog";
import { computeSharedPlan, type SharedImportPlan } from "@/lib/share-merge";
import type { SharePayloadV1 } from "@/lib/share-payload";
import type { ShareRow } from "@/lib/share-db";
import { useSipr } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Écran de tri à l'acceptation d'un partage. Le destinataire choisit, élément
 * par élément, ce qui entre dans ses données. Tant qu'il n'a pas validé, la
 * proposition reste en attente (rien n'est consommé).
 */
export function ShareImportDialog({
  open,
  onOpenChange,
  offer,
  payload,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer: ShareRow;
  payload: SharePayloadV1;
  onConfirm: (plan: SharedImportPlan) => void;
}) {
  const from = offer.from_name || offer.from_email;
  const initial = useMemo(
    () => computeSharedPlan(useSipr.getState(), payload, offer.thread_id),
    [payload, offer.thread_id],
  );
  const [plan, setPlan] = useState<SharedImportPlan>(initial);

  function setIncoming(originId: string, choice: SharedImportPlan["incoming"][number]["choice"]) {
    setPlan((p) => ({
      ...p,
      incoming: p.incoming.map((r) => (r.shareOriginId === originId ? { ...r, choice } : r)),
    }));
  }
  function setRemoval(localId: string, choice: "keep" | "delete") {
    setPlan((p) => ({
      ...p,
      removals: p.removals.map((r) => (r.localId === localId ? { ...r, choice } : r)),
    }));
  }

  const added = plan.incoming.filter((r) => r.choice === "add").length;
  const taken = plan.incoming.filter((r) => r.choice === "take").length;
  const deleted = plan.removals.filter((r) => r.choice === "delete").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
        title={offer.reply_to ? "Retour de dossier — à intégrer" : "Partage reçu — à intégrer"}
        description={
          plan.isMerge
            ? `De ${from}. Ce dossier existe déjà chez vous : choisissez ce que vous reprenez.`
            : `De ${from}. Décochez les constats que vous ne voulez pas importer.`
        }
      >
        <div className="space-y-4">
          {plan.isMerge && plan.visitChanged ? (
            <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={plan.updateVisitInfo}
                onChange={(e) => setPlan((p) => ({ ...p, updateVisitInfo: e.target.checked }))}
              />
              <span>
                Mettre à jour les infos du dossier (entreprise, interlocuteur, date, lieu, notes)
                avec la version de {from}.
              </span>
            </label>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted">
              Constats ({plan.incoming.length})
            </p>
            {plan.incoming.map((row) => (
              <div
                key={row.shareOriginId}
                className="rounded-xl bg-surface-2 p-3 shadow-[var(--shadow-border)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={row.state === "new" ? "low" : row.state === "changed" ? "mid" : "neutral"}
                  >
                    {row.state === "new" ? "Nouveau" : row.state === "changed" ? "Modifié" : "Inchangé"}
                  </Badge>
                  <span className="text-sm font-medium">{row.title}</span>
                </div>

                {row.state === "new" ? (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={row.choice === "add"}
                      onChange={(e) => setIncoming(row.shareOriginId, e.target.checked ? "add" : "skip")}
                    />
                    Importer ce constat
                  </label>
                ) : row.state === "changed" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pick
                      active={row.choice === "take"}
                      onClick={() => setIncoming(row.shareOriginId, "take")}
                    >
                      Prendre la version de {from}
                    </Pick>
                    <Pick
                      active={row.choice === "keep"}
                      onClick={() => setIncoming(row.shareOriginId, "keep")}
                    >
                      Garder la mienne
                    </Pick>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-subtle">Identique à votre version — rien à faire.</p>
                )}
              </div>
            ))}
          </div>

          {plan.removals.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted">
                Constats que {from} a retirés ({plan.removals.length})
              </p>
              {plan.removals.map((row) => (
                <div
                  key={row.localId}
                  className="rounded-xl bg-surface-2 p-3 shadow-[var(--shadow-border)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="high">Retiré par {from}</Badge>
                    <span className="text-sm font-medium">{row.title}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pick active={row.choice === "keep"} onClick={() => setRemoval(row.localId, "keep")}>
                      Garder chez moi
                    </Pick>
                    <Pick
                      active={row.choice === "delete"}
                      onClick={() => setRemoval(row.localId, "delete")}
                    >
                      Supprimer aussi
                    </Pick>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {plan.incomingNoteCount > 0 ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
              {plan.incomingNoteCount} note{plan.incomingNoteCount > 1 ? "s" : ""} de partage de{" "}
              {from} {plan.incomingNoteCount > 1 ? "seront ajoutées" : "sera ajoutée"} — vos notes
              sont conservées.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button onClick={() => onConfirm(plan)}>
              {plan.isMerge ? "Intégrer" : "Importer"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          </div>
          <p className="text-xs text-subtle">
            {plan.isMerge
              ? `${taken} repris · ${added} ajouté${added > 1 ? "s" : ""} · ${deleted} supprimé${deleted > 1 ? "s" : ""}`
              : `${added} constat${added > 1 ? "s" : ""} sur ${plan.incoming.length} importé${added > 1 ? "s" : ""}`}
            . La proposition reste en attente tant que vous n'avez pas validé.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pick({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-lg px-3 py-1.5 text-sm shadow-[var(--shadow-border)]",
        active ? "bg-accent text-accent-fg" : "bg-surface text-fg",
      )}
    >
      {children}
    </button>
  );
}
