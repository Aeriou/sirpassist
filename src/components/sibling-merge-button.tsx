import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { MergePlanEditor } from "./merge-plan-editor";
import { buildVisitPayload } from "@/lib/share-payload";
import { computeSharedPlan, type SharedImportPlan } from "@/lib/share-merge";
import { useSipr } from "@/lib/store";
import type { Visit } from "@/lib/types";

/**
 * Quand un dossier a une « version sœur » issue du même partage (import à côté),
 * ce panneau permet, APRÈS relecture, de reporter les modifications de l'autre
 * version dans celui-ci — élément par élément, sans rien d'automatique.
 */
const SHARE_TAG_RE = /\s+—\s+(?:partagé par|retour de)\s+.+$/u;
export const stripShareTag = (s: string): string => s.replace(SHARE_TAG_RE, "").trim();

export function SiblingMergeButton({ visitId }: { visitId: string }) {
  const cur = useSipr((s) => s.visits.find((v) => v.id === visitId));
  const visits = useSipr((s) => s.visits);
  const anomalies = useSipr((s) => s.anomalies);
  const updateVisit = useSipr((s) => s.updateVisit);
  const updateAnomaly = useSipr((s) => s.updateAnomaly);
  const removeVisit = useSipr((s) => s.removeVisit);
  const [target, setTarget] = useState<Visit | null>(null);
  const [confirmKeep, setConfirmKeep] = useState(false);

  const siblings = useMemo(() => {
    if (!cur) return [];
    return visits.filter(
      (v) =>
        v.id !== cur.id &&
        ((v.sharedThreadId && cur.sharedThreadId && v.sharedThreadId === cur.sharedThreadId) ||
          (v.shareOriginId && cur.shareOriginId && v.shareOriginId === cur.shareOriginId)),
    );
  }, [visits, cur]);

  if (!cur || siblings.length === 0) return null;

  function keepOnlyThis() {
    if (!cur) return;
    for (const s of siblings) removeVisit(s.id);
    // Nettoyer le nom : ce dossier devient la version de référence.
    if (SHARE_TAG_RE.test(cur.name)) updateVisit(cur.id, { name: stripShareTag(cur.name) });
    for (const a of anomalies) {
      if (a.visitId === cur.id && SHARE_TAG_RE.test(a.title)) {
        updateAnomaly(a.id, { title: stripShareTag(a.title) });
      }
    }
    setConfirmKeep(false);
    toast.success(
      siblings.length > 1
        ? `${siblings.length} autres versions supprimées.`
        : "Autre version supprimée.",
    );
  }

  return (
    <section className="space-y-2 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <ArrowLeftRight className="size-4 text-accent" />
        Autre version de ce dossier
      </h2>
      <p className="text-sm text-muted">
        {siblings.length === 1
          ? `« ${siblings[0]!.name} » vient du même partage.`
          : `${siblings.length} versions viennent du même partage.`}{" "}
        Après relecture, reportez-y les modifications utiles.
      </p>
      <div className="flex flex-wrap gap-2">
        {siblings.map((s) => (
          <Button key={s.id} variant="outline" size="sm" onClick={() => setTarget(s)}>
            Comparer avec « {shorten(s.name)} »
          </Button>
        ))}
      </div>

      {confirmKeep ? (
        <div className="rounded-xl bg-warn/15 p-3 text-sm">
          <p className="text-warn">
            Supprimer {siblings.length > 1 ? `les ${siblings.length} autres versions` : "l'autre version"} et
            garder uniquement ce dossier
            {SHARE_TAG_RE.test(cur.name) ? " (le nom est nettoyé de l'étiquette de partage)" : ""} ?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="text-danger" variant="outline" onClick={keepOnlyThis}>
              Oui, ne garder que celui-ci
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmKeep(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirmKeep(true)}>
          Ne garder que ce dossier-ci
        </Button>
      )}

      {target && cur ? (
        <SiblingMergeDialog
          key={target.id}
          current={cur}
          sibling={target}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

function SiblingMergeDialog({
  current,
  sibling,
  onClose,
}: {
  current: Visit;
  sibling: Visit;
  onClose: () => void;
}) {
  const anomalies = useSipr((s) => s.anomalies);
  const visits = useSipr((s) => s.visits);
  const importSharedPayload = useSipr((s) => s.importSharedPayload);
  const removeVisit = useSipr((s) => s.removeVisit);
  const [dropSibling, setDropSibling] = useState(false);

  const payload = useMemo(
    () =>
      buildVisitPayload({
        visit: sibling,
        anomalies,
        by: { name: sibling.sharedFrom || "l'autre version", email: "" },
        originId: () => crypto.randomUUID(),
      }).payload,
    [sibling, anomalies],
  );
  const [plan, setPlan] = useState<SharedImportPlan>(() =>
    computeSharedPlan({ visits, anomalies }, payload, current.sharedThreadId ?? "", current.id),
  );

  function report() {
    const threadId = current.sharedThreadId ?? current.shareOriginId ?? `local_${current.id}`;
    importSharedPayload(payload, {
      threadId,
      plan: { ...plan, isMerge: true, targetVisitId: current.id },
    });
    if (dropSibling) removeVisit(sibling.id);
    toast.success("Modifications reportées dans ce dossier.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent
        className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
        title="Reporter dans ce dossier"
        description={`Comparaison avec « ${sibling.name} ». Vos choix sont appliqués à CE dossier.`}
      >
        <div className="space-y-4">
          <MergePlanEditor
            plan={plan}
            setPlan={setPlan}
            fromLabel={sibling.sharedFrom || "l'autre version"}
            mode="merge"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={dropSibling}
              onChange={(e) => setDropSibling(e.target.checked)}
            />
            Supprimer « {shorten(sibling.name)} » après le report
          </label>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button onClick={report}>Reporter</Button>
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function shorten(s: string, n = 32): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
