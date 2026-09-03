import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiListWorkspaces } from "@/lib/workspace-api";
import {
  apiShareClasseurToGroup,
  apiUnshareClasseurFromGroup,
} from "@/lib/group-classeur-api";
import { buildGroupClasseurPayload } from "@/lib/group-classeur-payload";
import { useSipr } from "@/lib/store";
import { cn } from "@/lib/utils";

type Grp = { id: string; name: string; isOwner: boolean };

/** Panneau « Partage avec un groupe » d'un classeur : chaque membre publie SES
 *  classeurs, les autres les voient en lecture seule. Le contenu est re-poussé
 *  automatiquement quand le classeur change. */
export function ClasseurGroupShare({ classeurId }: { classeurId: string }) {
  const classeur = useSipr((s) => s.classeurs.find((c) => c.id === classeurId));
  const visits = useSipr((s) => s.visits);
  const anomalies = useSipr((s) => s.anomalies);
  const setClasseurGroups = useSipr((s) => s.setClasseurGroups);

  const [groups, setGroups] = useState<Grp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const pushedRef = useRef<string>("");

  useEffect(() => {
    let alive = true;
    apiListWorkspaces()
      .then((r) => {
        if (!alive || !r.ok) return;
        setGroups(
          r.workspaces
            .filter((w) => w.status === "active")
            .map((w) => ({ id: w.id, name: w.name, isOwner: w.isOwner })),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const shared = useMemo(() => new Set(classeur?.sharedGroupIds ?? []), [classeur?.sharedGroupIds]);

  const payload = useMemo(
    () => (classeur ? buildGroupClasseurPayload(classeur, visits, anomalies) : null),
    [classeur, visits, anomalies],
  );

  // Re-pousse le contenu vers les groupes déjà destinataires quand il change.
  useEffect(() => {
    if (!classeur || !payload || shared.size === 0) return;
    const key = JSON.stringify({ n: classeur.name, p: payload, g: [...shared].sort() });
    if (key === pushedRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        await Promise.all(
          [...shared].map((gid) =>
            apiShareClasseurToGroup({
              data: {
                workspaceId: gid,
                classeurId: classeur.id,
                name: classeur.name,
                payload: payload as unknown as Record<string, unknown>,
              },
            }),
          ),
        );
        pushedRef.current = key;
      } catch {
        /* réseau : prochaine modif re-tentera */
      }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [classeur, payload, shared]);

  if (!classeur) return null;

  async function toggle(gid: string, on: boolean) {
    if (!classeur || !payload) return;
    setBusy(gid);
    try {
      if (on) {
        const res = await apiShareClasseurToGroup({
          data: {
            workspaceId: gid,
            classeurId: classeur.id,
            name: classeur.name,
            payload: payload as unknown as Record<string, unknown>,
          },
        });
        if (!res.ok) {
          toast.error(
            res.reason === "rate_limited"
              ? "Trop d'envois — réessayez dans un instant."
              : "Partage impossible (droits du groupe ?).",
          );
          return;
        }
        setClasseurGroups(classeur.id, [...shared, gid]);
        pushedRef.current = "";
        toast.success("Classeur partagé avec le groupe.");
      } else {
        const res = await apiUnshareClasseurFromGroup({
          data: { workspaceId: gid, classeurId: classeur.id },
        });
        if (!res.ok && res.reason === "forbidden") {
          toast.error("Seul l'auteur ou le propriétaire du groupe peut retirer ce partage.");
          return;
        }
        setClasseurGroups(
          classeur.id,
          [...shared].filter((x) => x !== gid),
        );
        toast.message("Partage retiré.");
      }
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Users className="size-4 text-accent" />
        Partage avec un groupe
      </h2>
      {groups.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
          Vous n'êtes membre actif d'aucun groupe.{" "}
          <Link to="/compte" className="text-accent">
            Créer ou rejoindre un groupe
          </Link>
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Les membres du groupe voient ce classeur en lecture seule. Il se met à jour tout
            seul quand vous le modifiez.
          </p>
          <ul className="space-y-2">
            {groups.map((g) => {
              const on = shared.has(g.id);
              return (
                <li key={g.id}>
                  <Card className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{g.name}</p>
                      <p className="text-xs text-subtle">
                        {on ? "Partagé" : "Non partagé"}
                        {g.isOwner ? " · vous êtes propriétaire" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy === g.id}
                      onClick={() => void toggle(g.id, !on)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-border)] disabled:opacity-50",
                        on ? "bg-accent-dim text-accent" : "bg-surface text-muted",
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                      {on ? "Partagé" : "Partager"}
                    </button>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
