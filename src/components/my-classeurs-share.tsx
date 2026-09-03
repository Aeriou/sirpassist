import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FolderOpen, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClasseurGroupShare } from "@/components/classeur-group-share";
import { useWorkspaceClasseurs } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Liste « Mes classeurs à partager » : chaque ligne déplie le panneau de
 * partage de groupe (bascule par groupe). Évite d'avoir à ouvrir la fiche du
 * classeur pour lancer un partage.
 */
export function MyClasseursShare() {
  const classeurs = useWorkspaceClasseurs();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Layers className="size-4 text-accent" />
          Partager un classeur avec un groupe
          {classeurs.length > 0 ? ` (${classeurs.length})` : ""}
        </h2>
        <p className="text-sm text-muted">
          Dépliez un classeur pour le mettre en commun (lecture seule pour les membres). Le
          contenu se met à jour tout seul ensuite.
        </p>
      </div>
      {classeurs.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
          Aucun classeur pour l'instant. Créez-en un depuis l'
          <Link to="/" className="text-accent">
            Accueil
          </Link>{" "}
          (bloc « Classeurs ») — il regroupe plusieurs visites et se partage d'un coup.
        </p>
      ) : (
        <ul className="space-y-2">
          {classeurs.map((c) => {
            const open = openId === c.id;
            const sharedCount = c.sharedGroupIds?.length ?? 0;
            return (
              <li key={c.id}>
                <Card className="p-3">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => setOpenId(open ? null : c.id)}
                    aria-expanded={open}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
                      <FolderOpen className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display font-semibold">{c.name}</span>
                      <span className="block text-xs text-subtle">
                        {c.visitIds.length} visite{c.visitIds.length > 1 ? "s" : ""}
                        {sharedCount > 0
                          ? ` · partagé avec ${sharedCount} groupe${sharedCount > 1 ? "s" : ""}`
                          : " · non partagé"}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {open ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <ClasseurGroupShare classeurId={c.id} />
                      <p className="mt-2 text-xs text-subtle">
                        <Link to="/classeur/$id" params={{ id: c.id }} className="text-accent">
                          Ouvrir le classeur
                        </Link>{" "}
                        pour ajouter / retirer des visites et des constats.
                      </p>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
