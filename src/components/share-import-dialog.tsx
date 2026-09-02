import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { MergePlanEditor, Pick } from "./merge-plan-editor";
import { computeSharedPlan, type SharedImportPlan } from "@/lib/share-merge";
import type { SharePayloadV1 } from "@/lib/share-payload";
import type { ShareRow } from "@/lib/share-db";
import { useSipr } from "@/lib/store";

/**
 * Écran de tri à l'acceptation d'un partage. Deux voies quand le dossier
 * existe déjà chez le destinataire :
 *   - « Importer à côté » (défaut) : nouveau dossier séparé, rien n'est touché ;
 *   - « Intégrer » : rapprochement élément par élément dans le dossier existant.
 * Tant que rien n'est validé, la proposition reste en attente.
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
  const canMerge = Boolean(initial.isMerge && initial.targetVisitId);
  const [mode, setMode] = useState<"separate" | "merge">("separate");

  function confirm() {
    if (mode === "merge" && canMerge) {
      onConfirm(plan);
      return;
    }
    // Import à côté : dossier séparé, on ne touche à rien d'existant.
    onConfirm({
      ...plan,
      isMerge: false,
      targetVisitId: null,
      visitChanged: false,
      updateVisitInfo: false,
      removals: [],
      incoming: plan.incoming.map((r) => ({
        ...r,
        state: "new",
        choice: r.choice === "skip" ? "skip" : "add",
      })),
    });
  }

  const added = plan.incoming.filter((r) => r.choice !== "skip").length;
  const taken = plan.incoming.filter((r) => r.choice === "take").length;
  const removed = plan.removals.filter((r) => r.choice === "delete").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
        title={offer.reply_to ? "Retour de dossier reçu" : "Partage reçu"}
        description={`De ${from}.`}
      >
        <div className="space-y-4">
          {canMerge ? (
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted">
                Vous avez déjà ce dossier
              </p>
              <div className="flex flex-wrap gap-2">
                <Pick active={mode === "separate"} onClick={() => setMode("separate")}>
                  Importer à côté (garder les deux)
                </Pick>
                <Pick active={mode === "merge"} onClick={() => setMode("merge")}>
                  Intégrer dans mon dossier
                </Pick>
              </div>
              <p className="text-xs text-subtle">
                {mode === "separate"
                  ? "Un nouveau dossier est créé. Votre dossier actuel n'est pas modifié — vous pourrez l'y reporter plus tard, après relecture."
                  : "Votre dossier existant est mis à jour selon vos choix ci-dessous."}
              </p>
            </div>
          ) : null}

          <MergePlanEditor
            plan={plan}
            setPlan={setPlan}
            fromLabel={from}
            mode={canMerge && mode === "merge" ? "merge" : "separate"}
          />

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button onClick={confirm}>
              {canMerge && mode === "merge" ? "Intégrer" : "Importer à côté"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          </div>
          <p className="text-xs text-subtle">
            {canMerge && mode === "merge"
              ? `${taken} repris · ${added - taken} ajouté(s) · ${removed} supprimé(s).`
              : `${added} constat(s) sur ${plan.incoming.length} importé(s) dans un nouveau dossier.`}{" "}
            La proposition reste en attente tant que vous n'avez pas validé.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
