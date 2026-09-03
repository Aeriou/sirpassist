import { Link } from "@tanstack/react-router";
import { Check, Layers } from "lucide-react";
import { useSipr, useWorkspaceClasseurs } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Petit sélecteur « Classeurs » sur une fiche visite : cocher / décocher les
 *  classeurs qui contiennent cette visite. */
export function ClasseurPicker({ visitId }: { visitId: string }) {
  const classeurs = useWorkspaceClasseurs();
  const setClasseurItem = useSipr((s) => s.setClasseurItem);

  if (classeurs.length === 0) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Layers className="size-3.5" />
        Aucun classeur.{" "}
        <Link to="/" className="text-accent">
          En créer un sur l'Accueil
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Layers className="size-3.5" />
        Classeurs :
      </span>
      {classeurs.map((c) => {
        const on = c.visitIds.includes(visitId);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => setClasseurItem(c.id, "visit", visitId, !on)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-[var(--shadow-border)]",
              on ? "bg-accent-dim text-accent" : "bg-surface text-muted",
            )}
          >
            {on ? <Check className="size-3" /> : null}
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
