import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Badge } from "./ui/badge";
import type { SharedImportPlan } from "@/lib/share-merge";
import { cn } from "@/lib/utils";

/**
 * Corps du tri d'un rapprochement de partage. Partagé entre l'acceptation
 * d'une proposition (`ShareImportDialog`) et la comparaison de deux dossiers
 * frères d'un même fil (`SiblingMergeButton`).
 *
 * - mode "separate" : chaque constat entrant = une simple case « importer ».
 * - mode "merge"    : prendre / garder par constat, retraits, infos du dossier.
 */
export function MergePlanEditor({
  plan,
  setPlan,
  fromLabel,
  mode,
}: {
  plan: SharedImportPlan;
  setPlan: Dispatch<SetStateAction<SharedImportPlan>>;
  fromLabel: string;
  mode: "separate" | "merge";
}) {
  const setIncoming = (
    originId: string,
    choice: SharedImportPlan["incoming"][number]["choice"],
  ) =>
    setPlan((p) => ({
      ...p,
      incoming: p.incoming.map((r) =>
        r.shareOriginId === originId ? { ...r, choice } : r,
      ),
    }));

  const setRemoval = (localId: string, choice: "keep" | "delete") =>
    setPlan((p) => ({
      ...p,
      removals: p.removals.map((r) => (r.localId === localId ? { ...r, choice } : r)),
    }));

  if (mode === "separate") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted">
          Constats à importer ({plan.incoming.length})
        </p>
        {plan.incoming.map((row) => (
          <label
            key={row.shareOriginId}
            className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm shadow-[var(--shadow-border)]"
          >
            <input
              type="checkbox"
              className="size-4"
              checked={row.choice !== "skip"}
              onChange={(e) => setIncoming(row.shareOriginId, e.target.checked ? "add" : "skip")}
            />
            <span className="font-medium">{row.title}</span>
          </label>
        ))}
        {plan.incomingNoteCount > 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
            {plan.incomingNoteCount} note{plan.incomingNoteCount > 1 ? "s" : ""} de partage
            {plan.incomingNoteCount > 1 ? " incluses" : " incluse"}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {plan.visitChanged ? (
        <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={plan.updateVisitInfo}
            onChange={(e) => setPlan((p) => ({ ...p, updateVisitInfo: e.target.checked }))}
          />
          <span>
            Mettre à jour les infos du dossier (entreprise, interlocuteur, date, lieu, notes) avec
            la version de {fromLabel}.
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
              <Badge tone={row.state === "new" ? "low" : row.state === "changed" ? "mid" : "neutral"}>
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
                Ajouter ce constat
              </label>
            ) : row.state === "changed" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Pick active={row.choice === "take"} onClick={() => setIncoming(row.shareOriginId, "take")}>
                  Prendre la version de {fromLabel}
                </Pick>
                <Pick active={row.choice === "keep"} onClick={() => setIncoming(row.shareOriginId, "keep")}>
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
            Constats que {fromLabel} a retirés ({plan.removals.length})
          </p>
          {plan.removals.map((row) => (
            <div key={row.localId} className="rounded-xl bg-surface-2 p-3 shadow-[var(--shadow-border)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="high">Retiré par {fromLabel}</Badge>
                <span className="text-sm font-medium">{row.title}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pick active={row.choice === "keep"} onClick={() => setRemoval(row.localId, "keep")}>
                  Garder chez moi
                </Pick>
                <Pick active={row.choice === "delete"} onClick={() => setRemoval(row.localId, "delete")}>
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
          {fromLabel} {plan.incomingNoteCount > 1 ? "seront ajoutées" : "sera ajoutée"} — vos notes
          sont conservées.
        </p>
      ) : null}
    </div>
  );
}

export function Pick({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
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
